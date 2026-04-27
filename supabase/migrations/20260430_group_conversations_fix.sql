-- 20260430_group_conversations_fix.sql
-- Forward-fix for 20260430_group_conversations.sql, found by Phase-3 RLS probe.
--
-- Bug: create_group_conversation INSERTed into public.conversations.pair_key
-- explicitly. pair_key is a GENERATED ALWAYS column on the existing schema,
-- so the insert errored:
--   "cannot insert a non-DEFAULT value into column "pair_key""
--
-- Fix:
--   1. Redefine pair_key so it returns NULL when is_group=true (groups don't
--      participate in pair-uniqueness; this prevents a group with 3 members
--      from forging a pair_key collision against a future 1:1 between
--      two of those members).
--   2. Rewrite create_group_conversation to NOT mention pair_key in the
--      INSERT column list (let the generated expression compute it,
--      yielding NULL for is_group=true).
--
-- Postgres generated columns can't be ALTERed in place — drop+re-add.
-- The unique index on pair_key (predicate already 'where pair_key is not null'
-- in the live schema; verified below) survives because it depends on the
-- column. We drop the index, drop the column, re-add the column with the new
-- expression, and recreate the index with the same predicate.

begin;

-- 0. Live index inspected pre-fix:
--   CREATE UNIQUE INDEX conversations_pair_key_uniq
--     ON public.conversations USING btree (pair_key);
-- (No WHERE predicate — but multiple NULLs are still allowed in a Postgres
-- btree unique index, so groups all having pair_key=NULL is fine.)

-- 1. Drop dependent unique index, then the generated column.
drop index if exists public.conversations_pair_key_uniq;

alter table public.conversations
  drop column if exists pair_key;

-- 2. Re-add as generated, NULL for groups.
alter table public.conversations
  add column pair_key text generated always as (
    case
      when is_group then null
      else least(user1_id::text, user2_id::text)
        || '::'
        || greatest(user1_id::text, user2_id::text)
    end
  ) stored;

-- 3. Recreate the unique index (same name + same definition as before).
create unique index conversations_pair_key_uniq
  on public.conversations (pair_key);

-- 4. Patch create_group_conversation: drop pair_key from the column list.
create or replace function public.create_group_conversation(other_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me        uuid := auth.uid();
  members   uuid[];
  v_conv_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if other_ids is null or array_length(other_ids, 1) is null then
    raise exception 'other_ids required';
  end if;

  -- Dedupe + drop self.
  select array_agg(distinct x) into members
    from unnest(other_ids) as x
   where x is not null and x <> me;

  if members is null or array_length(members,1) < 1 then
    raise exception 'at least one other participant required';
  end if;

  -- Block check: no member may have blocked any other member (either way).
  if exists (
    select 1
      from public.blocks b
     where (b.blocker_id = me           and b.blocked_id = any(members))
        or (b.blocker_id = any(members) and b.blocked_id = me)
        or (b.blocker_id = any(members) and b.blocked_id = any(members)
            and b.blocker_id <> b.blocked_id)
  ) then
    raise exception 'block_conflict' using errcode = 'P0001';
  end if;

  insert into public.conversations (
    user1_id, user2_id, requester_id, status, is_group, last_message_at
  ) values (
    me, members[1], me, 'accepted', true, now()
  )
  returning id into v_conv_id;

  insert into public.conversation_participants (conversation_id, user_id)
  select v_conv_id, m
    from unnest(array_append(members, me)) as m
  on conflict do nothing;

  return v_conv_id;
end;
$$;

commit;
