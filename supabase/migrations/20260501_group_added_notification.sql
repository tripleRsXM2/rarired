-- 20260501_group_added_notification.sql
--
-- Gap fix: when user A creates a group with B + C via
-- create_group_conversation, B and C should see "Alex started a group with
-- you" in their notification tray immediately — today they only get a
-- notification once the first message arrives.
--
-- Approach: extend the SECURITY DEFINER create_group_conversation RPC to
-- insert one `group_added` notification row per non-creator participant
-- after the conversations + conversation_participants writes. The RPC
-- already runs as postgres → bypasses RLS and the notifications insert
-- self-only policy. The lifecycle update guard also bypasses for postgres
-- so columns set at insert (action_required / entity_type) stick.
--
-- We DELIBERATELY do NOT extend emit_notification: this notification has
-- no individual standing check (the RPC has already validated block-set
-- and participant-set as a unit), and routing through emit would force a
-- per-recipient round-trip from the client we don't want.
--
-- Idempotent: the migration replaces the function in place; no schema
-- changes outside the function body. Re-running is safe.

begin;

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

  insert into public.conversations (
    user1_id, user2_id, requester_id, status, is_group, pair_key, last_message_at
  ) values (
    me, members[1], me, 'accepted', true, null, now()
  )
  returning id into v_conv_id;

  insert into public.conversation_participants (conversation_id, user_id)
  select v_conv_id, m
    from unnest(array_append(members, me)) as m
  on conflict do nothing;

  -- ── Group-added notifications ─────────────────────────────────────
  -- Fan out one row per non-creator participant. Type 'group_added':
  --   • action_required = false (informational, user can't action it)
  --   • entity_type     = 'conversation' (matches lifecycle CASE for
  --                       message-family rows; deep-links via entity_id)
  --   • entity_key      = conversation id text (lifecycle idempotency
  --                       key — re-running create on the same conv id
  --                       upserts in place, though in practice that
  --                       can't happen because the conv is fresh).
  -- 'message' rows for the same conv use a different (user_id, entity_id)
  -- partial index path; group_added doesn't collide with them because
  -- type differs.
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

revoke all on function public.create_group_conversation(uuid[]) from public;
grant execute on function public.create_group_conversation(uuid[]) to authenticated;

commit;
