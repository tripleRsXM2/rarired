-- 20260516_fetch_my_conversations_with_name.sql
--
-- Follow-up to 20260516_group_dedupe_and_rename.sql: extends the
-- fetch_my_conversations() RPC to surface the new `name` column so
-- the v2 inbox + thread header can read the group display name. We
-- can't ALTER the return signature of a Postgres function in place —
-- DROP + recreate.

drop function if exists public.fetch_my_conversations();

create or replace function public.fetch_my_conversations()
returns table (
  id                     uuid,
  user1_id               uuid,
  user2_id               uuid,
  status                 text,
  is_group               boolean,
  name                   text,
  created_at             timestamptz,
  last_message_at        timestamptz,
  last_message_preview   text,
  last_message_sender_id uuid,
  declined_at            timestamptz,
  request_cooldown_until timestamptz,
  requester_id           uuid,
  pair_key               text,
  participant_ids        uuid[]
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with mine as (
    select cp.conversation_id
      from public.conversation_participants cp
     where cp.user_id = auth.uid()
  )
  select
    c.id, c.user1_id, c.user2_id, c.status, c.is_group, c.name, c.created_at,
    c.last_message_at, c.last_message_preview, c.last_message_sender_id,
    c.declined_at, c.request_cooldown_until, c.requester_id, c.pair_key,
    coalesce(
      (select array_agg(cp2.user_id order by cp2.joined_at)
         from public.conversation_participants cp2
        where cp2.conversation_id = c.id),
      array[]::uuid[]
    ) as participant_ids
  from public.conversations c
  where c.id in (select conversation_id from mine)
    and c.status <> 'declined'
  order by c.last_message_at desc nulls last;
$$;

revoke all on function public.fetch_my_conversations() from public;
grant execute on function public.fetch_my_conversations() to authenticated;
