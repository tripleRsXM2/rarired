-- Enforces ONE canonical conversation per unordered pair of users.
--
-- Problem: previous schema had no constraint preventing two pending rows for
-- the same (userA, userB) pair, so a race between two clients ("John messages
-- Mdawg" + "Mdawg messages John" within the same RTT) produced duplicate
-- conversation rows. Each user then sent into a different conversation_id
-- and never saw each other's messages.
--
-- Fix:
--   1. Add explicit `requester_id` so we can canonicalize user1/user2 by
--      uuid order without losing "who initiated this request".
--   2. Collapse any existing duplicate pairs into the oldest row, re-pointing
--      messages and reads.
--   3. Normalize: user1_id < user2_id always.
--   4. Add a generated `pair_key` column with a UNIQUE index so duplicates
--      become impossible at the DB level.
--   5. Add an RPC `get_or_create_conversation(other_id)` that performs an
--      atomic INSERT ... ON CONFLICT DO NOTHING + fallback SELECT, returning
--      the canonical row regardless of who calls it first.
--
-- Run in the Supabase SQL editor.

------------------------------------------------------------
-- 1. Add requester_id (who initiated this conversation)
------------------------------------------------------------
alter table public.conversations
  add column if not exists requester_id uuid references public.profiles(id);

-- Backfill: existing rows used user1_id as the requester.
update public.conversations
   set requester_id = user1_id
 where requester_id is null;

alter table public.conversations
  alter column requester_id set not null;

------------------------------------------------------------
-- 2. Collapse duplicate (userA, userB) pairs
--    Keep the oldest row; re-point messages & reads to it; delete the rest.
------------------------------------------------------------
do $$
declare
  dup record;
  keeper uuid;
  losers uuid[];
begin
  for dup in
    select least(user1_id, user2_id)    as a,
           greatest(user1_id, user2_id) as b,
           array_agg(id order by created_at) as ids
      from public.conversations
     group by least(user1_id, user2_id), greatest(user1_id, user2_id)
    having count(*) > 1
  loop
    keeper := dup.ids[1];
    losers := dup.ids[2:array_length(dup.ids, 1)];

    update public.direct_messages
       set conversation_id = keeper
     where conversation_id = any(losers);

    -- message_reads has unique(user_id, conversation_id); merge by keeping
    -- the latest last_read_at per user, then re-point or drop dups.
    update public.message_reads mr
       set conversation_id = keeper
     where mr.conversation_id = any(losers)
       and not exists (
         select 1 from public.message_reads mr2
          where mr2.user_id = mr.user_id
            and mr2.conversation_id = keeper
       );
    delete from public.message_reads where conversation_id = any(losers);

    delete from public.conversations where id = any(losers);
  end loop;
end $$;

------------------------------------------------------------
-- 3. Canonicalize ordering: user1_id < user2_id
------------------------------------------------------------
update public.conversations c
   set user1_id = sub.lo,
       user2_id = sub.hi
  from (
    select id,
           least(user1_id, user2_id)    as lo,
           greatest(user1_id, user2_id) as hi
      from public.conversations
  ) sub
 where c.id = sub.id
   and c.user1_id > c.user2_id;

------------------------------------------------------------
-- 4. Block self-DMs and add the unique pair_key
------------------------------------------------------------
alter table public.conversations
  drop constraint if exists conversations_no_self_dm;
alter table public.conversations
  add constraint conversations_no_self_dm check (user1_id <> user2_id);

alter table public.conversations
  drop column if exists pair_key;
alter table public.conversations
  add column pair_key text
  generated always as (
    least(user1_id::text, user2_id::text) || '::' || greatest(user1_id::text, user2_id::text)
  ) stored;

create unique index if not exists conversations_pair_key_uniq
  on public.conversations (pair_key);

------------------------------------------------------------
-- 5. RPC: atomic get-or-create
--    Always returns the canonical conversation row for (auth.uid(), other_id).
--    Concurrency-safe because the unique index on pair_key serializes the
--    INSERT race; the DO NOTHING + SELECT fallback returns the winner's row.
------------------------------------------------------------
create or replace function public.get_or_create_conversation(other_id uuid)
returns setof public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  lo  uuid;
  hi  uuid;
  key text;
  found_id uuid;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if other_id is null or other_id = me then
    raise exception 'invalid other user';
  end if;

  if me < other_id then
    lo := me;       hi := other_id;
  else
    lo := other_id; hi := me;
  end if;
  key := lo::text || '::' || hi::text;

  insert into public.conversations (user1_id, user2_id, requester_id, status)
       values (lo, hi, me, 'pending')
  on conflict (pair_key) do nothing
  returning id into found_id;

  if found_id is null then
    select id into found_id
      from public.conversations
     where pair_key = key;
  end if;

  return query select * from public.conversations where id = found_id;
end;
$$;

revoke all on function public.get_or_create_conversation(uuid) from public;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;
