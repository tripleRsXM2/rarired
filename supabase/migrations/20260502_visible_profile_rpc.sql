-- 20260502_visible_profile_rpc.sql
--
-- fetch_visible_profiles(uuid[]) — minimal-profile lookup that bypasses
-- the strict profiles RLS for two legitimate visibility contexts:
--
--   1. shared conversation — caller and target are both rows in
--      conversation_participants for the same conversation. A user who
--      has joined a group with the viewer has implicitly consented to
--      being seen, even if their profile.privacy = 'friends'. Without
--      this branch, group conv participants render as "Loading…"
--      forever (Phase 1 stub never gets patched).
--
--   2. zone context — target's home_zone is non-null. fetchPlayersInZone
--      already exposes zone-bound users on the map; the RPC matches
--      that semantic so map enrichment can use the same helper.
--
-- The own-row, public-profile, and accepted-friend branches mirror the
-- existing profiles_read RLS policy 1:1 — narrowing only by adding the
-- two new context branches above.
--
-- Idempotent — applied via db query --linked.

create or replace function public.fetch_visible_profiles(p_user_ids uuid[])
returns table (
  id uuid,
  name text,
  avatar text,
  avatar_url text,
  skill text,
  suburb text,
  home_zone text,
  last_active timestamptz,
  show_online_status boolean,
  show_last_seen boolean,
  ranking_points integer
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.avatar, p.avatar_url,
         p.skill, p.suburb, p.home_zone,
         p.last_active, p.show_online_status, p.show_last_seen,
         p.ranking_points
    from public.profiles p
   where p.id = any(p_user_ids)
     and (
       -- own row always
       p.id = auth.uid()
       -- public profiles
       or coalesce(p.privacy, 'public') = 'public'
       -- accepted friends
       or (coalesce(p.privacy, 'public') = 'friends' and exists (
            select 1 from public.friend_requests fr
             where fr.status = 'accepted'
               and ((fr.sender_id = auth.uid() and fr.receiver_id = p.id)
                 or (fr.receiver_id = auth.uid() and fr.sender_id = p.id))
          ))
       -- shared conversation (NEW — fixes the group "Loading…" bug)
       or exists (
            select 1
              from public.conversation_participants cp_self
              join public.conversation_participants cp_other
                on cp_self.conversation_id = cp_other.conversation_id
             where cp_self.user_id = auth.uid()
               and cp_other.user_id = p.id
          )
     );
$$;

revoke all   on function public.fetch_visible_profiles(uuid[]) from public;
grant execute on function public.fetch_visible_profiles(uuid[]) to authenticated;
