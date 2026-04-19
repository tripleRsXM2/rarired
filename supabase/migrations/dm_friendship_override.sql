-- dm_friendship_override.sql
--
-- Friendship overrides the DM request gate. Two users who are already friends
-- must share a normal, immediately-accepted conversation — they should never
-- be routed through the "message request / accept / decline" flow.
--
-- This migration does two things:
--   1. Replaces get_or_create_conversation so new rows are created with
--      status='accepted' when a friendship (friend_requests.status='accepted')
--      already exists between the two users.
--   2. One-shot collapse: any existing pending conversation whose participants
--      are currently friends is upgraded to 'accepted' so legacy rows stop
--      showing the request UI.
--
-- Idempotent — safe to re-run.

begin;

-- ── 1. Updated RPC ──────────────────────────────────────────────────────────

create or replace function public.get_or_create_conversation(other_id uuid)
returns setof public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  u1 uuid;
  u2 uuid;
  are_friends boolean;
  initial_status text;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if other_id is null or other_id = me then
    raise exception 'Invalid other_id';
  end if;

  -- Canonical pair order: user1_id < user2_id by uuid.
  if me < other_id then
    u1 := me; u2 := other_id;
  else
    u1 := other_id; u2 := me;
  end if;

  -- Friendship check — accepted friend_request row between the two users,
  -- in either direction.
  select exists(
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (fr.sender_id = me   and fr.receiver_id = other_id) or
        (fr.sender_id = other_id and fr.receiver_id = me)
      )
  ) into are_friends;

  initial_status := case when are_friends then 'accepted' else 'pending' end;

  -- Atomic insert (unique index on pair_key dedups races) then select.
  insert into public.conversations (user1_id, user2_id, requester_id, status)
  values (u1, u2, me, initial_status)
  on conflict (pair_key) do nothing;

  return query
    select * from public.conversations
    where user1_id = u1 and user2_id = u2
    limit 1;
end;
$$;

grant execute on function public.get_or_create_conversation(uuid) to authenticated;

-- ── 2. Collapse legacy pending-between-friends ──────────────────────────────

update public.conversations c
set status = 'accepted'
where c.status = 'pending'
  and exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (fr.sender_id = c.user1_id and fr.receiver_id = c.user2_id) or
        (fr.sender_id = c.user2_id and fr.receiver_id = c.user1_id)
      )
  );

commit;
