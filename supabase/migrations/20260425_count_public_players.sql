-- 20260425_count_public_players.sql
--
-- Anonymous map preview: the zone side panel shows "X players in this
-- zone" with blurred avatars to nudge sign-up, without exposing any
-- profile data to a signed-out viewer.
--
-- The profiles_read RLS policy requires auth.role() = 'authenticated'
-- AND privacy = 'public' (or friend-of), so anonymous SELECT returns
-- 0 rows. We need just a single non-PII integer here, so a thin
-- SECURITY DEFINER RPC returns the count without leaking row data.
--
-- Counts only profiles where:
--   home_zone = p_zone_id
--   privacy   IS NULL OR 'public'   (respects user's own setting)
-- Anonymous-only path; authenticated clients keep using
-- fetchPlayersInZone for the real list.

begin;

create or replace function public.count_public_players_in_zone(p_zone_id text)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
    from public.profiles
   where home_zone = p_zone_id
     and (privacy is null or privacy = 'public');
$$;

revoke execute on function public.count_public_players_in_zone(text) from public;
grant  execute on function public.count_public_players_in_zone(text) to anon, authenticated;

commit;
