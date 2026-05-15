-- 20260516_group_dedupe_and_rename.sql
--
-- Bug-fix + feature, called out by user testing of the v2
-- NewMessageScreen group flow:
--   • Picking the same N members twice currently creates two distinct
--     groups. The user expects the second pick to reuse the existing
--     un-named "ad hoc" group.
--   • There is no way to rename a group thread.
--   • Renamed groups should "graduate" out of the dedupe pool —
--     picking the same members after rename creates a fresh un-named
--     group, so the "A team" group stays a distinct entity.
--
-- Three changes:
--   1. Add `name text` column to `public.conversations` (nullable).
--      Used for group display name when set; ignored for 1:1.
--   2. Rewrite `create_group_conversation` to find-or-create by exact
--      participant set on un-named groups. Returns the existing conv
--      id when a match is found; otherwise inserts as before. Block
--      check + group_added notification fan-out preserved.
--   3. New `rename_conversation(p_conv_id uuid, p_name text)` RPC.
--      Permission: caller must be a participant. Group only — raises
--      on 1:1. Empty / whitespace name clears the rename (set to NULL,
--      conv re-enters the dedupe pool). Max length 80 chars.

-- ── 1. name column ────────────────────────────────────────────────────────────

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS name text;

COMMENT ON COLUMN public.conversations.name IS
  'Group display name set by a participant via rename_conversation. NULL for 1:1 and for un-renamed groups. Un-renamed groups dedupe by participant set; renamed groups become distinct entities.';

-- ── 2. create_group_conversation: find-or-create on exact members ────────────

CREATE OR REPLACE FUNCTION public.create_group_conversation(other_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  me        uuid := auth.uid();
  members   uuid[];
  full_set  uuid[];        -- all participants including caller, sorted
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

  -- Dedupe + drop self from the input.
  select array_agg(distinct x) into members
    from unnest(other_ids) as x
   where x is not null and x <> me;

  if members is null or array_length(members,1) < 1 then
    raise exception 'at least one other participant required';
  end if;

  -- Sorted full participant set (caller + others) for the exact-match
  -- comparison below. Sorting normalises ordering — {A,B,C} matches
  -- {C,B,A}.
  select array_agg(p order by p) into full_set
    from unnest(array_append(members, me)) as p;

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

  -- ── Dedupe lookup ──────────────────────────────────────────────────
  -- Find an existing un-named group conv whose participant set matches
  -- exactly (same members, no extras, no missing). Caller must already
  -- be a participant — RLS-wise we'd only see convs we're in via the
  -- conversation_participants membership row.
  select c.id into v_conv_id
    from public.conversations c
   where c.is_group = true
     and c.name is null
     and exists (
       select 1 from public.conversation_participants cp
        where cp.conversation_id = c.id and cp.user_id = me
     )
     and (
       select array_agg(cp.user_id order by cp.user_id)
         from public.conversation_participants cp
        where cp.conversation_id = c.id
     ) = full_set
   limit 1;

  if v_conv_id is not null then
    -- Reuse the existing group — touch last_message_at so it sorts to
    -- the top of the inbox just like a freshly-created group would,
    -- and skip the group_added re-notification (members were already
    -- told the first time).
    update public.conversations
       set last_message_at = now()
     where id = v_conv_id;
    return v_conv_id;
  end if;

  -- ── Create path ────────────────────────────────────────────────────
  -- pair_key is intentionally OMITTED — it's a GENERATED ALWAYS column.
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

  -- group_added notifications — fan out to non-creator participants.
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

-- ── 3. rename_conversation RPC ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rename_conversation(p_conv_id uuid, p_name text)
RETURNS public.conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  me      uuid := auth.uid();
  v_row   public.conversations;
  v_name  text;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  -- Read-and-lock the conv. Verify it exists, is a group, and that
  -- caller is a participant.
  select * into v_row from public.conversations where id = p_conv_id for update;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0001';
  end if;
  if v_row.is_group is not true then
    raise exception 'Cannot rename a 1:1 conversation' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.conversation_participants cp
     where cp.conversation_id = p_conv_id and cp.user_id = me
  ) then
    raise exception 'Not a participant of this conversation' using errcode = 'P0001';
  end if;

  -- Normalise: trim whitespace; empty → NULL (clears rename, group
  -- re-enters dedupe pool). Cap at 80 chars.
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is not null and length(v_name) > 80 then
    v_name := substring(v_name from 1 for 80);
  end if;

  update public.conversations
     set name = v_name
   where id = p_conv_id
   returning * into v_row;

  return v_row;
end;
$$;

GRANT EXECUTE ON FUNCTION public.rename_conversation(uuid, text) TO authenticated;
