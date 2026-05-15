-- 20260516_group_conversation_pair_key_fix.sql
--
-- Hot-fix for create_group_conversation: the live RPC was still
-- listing `pair_key` in its INSERT column list and passing NULL.
-- That column is GENERATED ALWAYS on the live DB (already correctly
-- defined to return NULL when is_group=true), so Postgres rejects any
-- explicit value (including NULL) with:
--   "cannot insert a non-DEFAULT value into column 'pair_key'"
--
-- An earlier fix migration (20260430_group_conversations_fix.sql) was
-- written but never applied. Applying it now would also revert the
-- group_added notification fan-out added by
-- 20260501_group_added_notification.sql. So this migration takes a
-- narrower path: leave the column definition alone (it already has
-- the CASE WHEN is_group THEN NULL branch) and only rewrite the RPC
-- body to drop `pair_key` from the INSERT column list while keeping
-- every other side-effect intact.
--
-- After this lands, the v2 NewMessageScreen "create group" flow
-- (two-or-more recipients selected) succeeds and the recipients
-- receive the group_added notification as designed.

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
  v_parts   uuid[];
  v_meta    jsonb;
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

  -- pair_key is intentionally OMITTED from the column list: it is a
  -- GENERATED ALWAYS column and Postgres forbids explicit values
  -- (including NULL) — the CASE WHEN is_group THEN NULL branch in the
  -- generation expression computes NULL automatically.
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

  -- ── Group-added notifications ─────────────────────────────────────
  -- Fan out one row per non-creator participant. Preserved verbatim
  -- from 20260501_group_added_notification.sql — that fix was applied
  -- to the live DB and would otherwise be reverted by a careless RPC
  -- rewrite.
  v_parts := array_append(members, me);
  v_meta  := jsonb_build_object(
    'participant_ids',   to_jsonb(v_parts),
    'participant_count', array_length(v_parts, 1)
  );

  insert into public.notifications (
    user_id, type, from_user_id, entity_id, metadata, read, created_at,
    action_required, entity_type, entity_key
  )
  select m, 'group_added', me, v_conv_id, v_meta, false, now(),
         false, 'conversation', v_conv_id::text
    from unnest(members) as m;

  return v_conv_id;
end;
$$;
