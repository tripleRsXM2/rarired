-- 20260430_group_conversations.sql
-- Phase 1 migration: introduce N-party (group) conversations.
--
-- DRAFTED, NOT APPLIED. Reviewer should diff against
-- scripts/group-conv-rls-audit.out.txt before running.
--
-- ============================================================================
-- SUMMARY OF OBJECTS TOUCHED
-- ============================================================================
-- New tables:
--   public.conversation_participants
--
-- New columns:
--   public.conversations.is_group  boolean not null default false
--
-- New / replaced functions:
--   public.is_conversation_participant(uuid, uuid)        [NEW, SECURITY DEFINER]
--   public.fetch_my_conversations()                       [NEW]
--   public.create_group_conversation(uuid[])              [NEW, SECURITY DEFINER]
--   public.guard_dm_insert_block()                        [REPLACED — was 2-party]
--   public.upsert_message_notification(uuid,uuid,uuid,jsonb)
--                                                         [REPLACED — was 2-party]
--   public.dm_update_conv_preview()                       [REPLACED — unchanged logic, kept for clarity]
--   public.cleanup_conv_notifications()                   [unchanged]
--
-- Policies dropped (names from RLS audit, scripts/group-conv-rls-audit.out.txt):
--   public.conversations:
--     "see own convs"        (SELECT)
--     "update conv"          (UPDATE)
--     "delete conv"          (DELETE)
--   public.direct_messages:
--     "Participants can read conversation messages"  (SELECT)
--     "dm_insert_participant"                        (INSERT)
--     "Sender can update own message"                (UPDATE — kept, identical predicate)
--   public.message_reads:
--     "Participants can read message_reads"  (SELECT)
--     "manage own reads"                     (ALL — kept, identical predicate)
--   public.message_reactions:
--     (left as-is; predicates already self-scoped)
--   public.conversation_pins / public.conversation_mutes:
--     (left as-is; self-scoped)
--   storage.objects (dm-attachments):
--     "dm-attachments participant read"  (SELECT — replaced with participant-set version)
--     "dm-attachments owner write"       (INSERT — kept; sender path)
--     "dm-attachments owner update"      (UPDATE — kept)
--     "dm-attachments owner delete"      (DELETE — kept)
--
-- Constraints touched on public.conversations:
--   conversations_no_self_dm          (kept — applies only to non-group rows)
--   conversations_status_check        (kept)
-- pair_key uniqueness (the index, not in the audit's constraint list because
-- it's an index): kept; new group rows use NULL pair_key so they don't collide.
--
-- Triggers touched on public.direct_messages:
--   trg_guard_dm_insert_block   (function body replaced, trigger unchanged)
--   dm_update_conv_preview_trg  (unchanged)
--   dm_rollback_conv_preview_trg(unchanged)
--   dm_throttle_trg             (unchanged)
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. New table: conversation_participants
-- ----------------------------------------------------------------------------
create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id)      on delete cascade,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_participants_user_idx
  on public.conversation_participants (user_id);

alter table public.conversation_participants enable row level security;

-- ----------------------------------------------------------------------------
-- 2. New column: conversations.is_group
-- ----------------------------------------------------------------------------
alter table public.conversations
  add column if not exists is_group boolean not null default false;

-- ----------------------------------------------------------------------------
-- 3. Backfill participants from existing user1_id/user2_id pairs
-- ----------------------------------------------------------------------------
insert into public.conversation_participants (conversation_id, user_id, joined_at)
select c.id, c.user1_id, coalesce(c.created_at, now())
  from public.conversations c
  where c.user1_id is not null
on conflict do nothing;

insert into public.conversation_participants (conversation_id, user_id, joined_at)
select c.id, c.user2_id, coalesce(c.created_at, now())
  from public.conversations c
  where c.user2_id is not null
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 4. Helper: is_conversation_participant
-- SECURITY DEFINER so RLS predicates on direct_messages can call it without
-- recursing into conversation_participants RLS.
-- ----------------------------------------------------------------------------
create or replace function public.is_conversation_participant(p_conv uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conv and user_id = p_uid
  );
$$;

revoke all on function public.is_conversation_participant(uuid, uuid) from public;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. RLS — conversations (drop 2-party policies, recreate as participant-aware)
-- ----------------------------------------------------------------------------
drop policy if exists "see own convs"  on public.conversations;
drop policy if exists "update conv"    on public.conversations;
drop policy if exists "delete conv"    on public.conversations;

create policy conversations_participant_select on public.conversations
  for select using ( public.is_conversation_participant(id, auth.uid()) );

create policy conversations_participant_update on public.conversations
  for update using ( public.is_conversation_participant(id, auth.uid()) );

-- DELETE remains 1:1 only — group rows aren't deletable from the client to
-- avoid one member nuking everyone else's history. Group leave is a separate
-- (future) RPC. We keep the legacy 1:1 path by gating on is_group=false.
create policy conversations_owner_delete on public.conversations
  for delete using (
    is_group = false
    and (auth.uid() = user1_id or auth.uid() = user2_id)
  );

-- ----------------------------------------------------------------------------
-- 6. RLS — conversation_participants
-- ----------------------------------------------------------------------------
drop policy if exists conversation_participants_select on public.conversation_participants;
create policy conversation_participants_select on public.conversation_participants
  for select using ( public.is_conversation_participant(conversation_id, auth.uid()) );

-- No INSERT/UPDATE/DELETE policy → only SECURITY DEFINER RPCs
-- (create_group_conversation / get_or_create_conversation) can mutate this
-- table. This is intentional.

-- ----------------------------------------------------------------------------
-- 7. RLS — direct_messages
-- ----------------------------------------------------------------------------
drop policy if exists "Participants can read conversation messages" on public.direct_messages;
drop policy if exists "dm_insert_participant"                       on public.direct_messages;

create policy direct_messages_participant_select on public.direct_messages
  for select using ( public.is_conversation_participant(conversation_id, auth.uid()) );

-- Insert: caller must be the sender AND a participant. Group conversations
-- have status='accepted' implicitly (no friend-request flow); 1:1 keeps the
-- existing pending/accepted gate.
create policy direct_messages_participant_insert on public.direct_messages
  for insert with check (
    auth.uid() = sender_id
    and public.is_conversation_participant(conversation_id, auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = direct_messages.conversation_id
        and (
          c.is_group = true
          or c.status = 'accepted'
          or (c.status = 'pending' and c.requester_id = auth.uid())
        )
    )
  );

-- "Sender can update own message" predicate is identical post-migration; no-op.

-- ----------------------------------------------------------------------------
-- 8. RLS — message_reads
-- ----------------------------------------------------------------------------
drop policy if exists "Participants can read message_reads" on public.message_reads;
create policy message_reads_participant_select on public.message_reads
  for select using ( public.is_conversation_participant(conversation_id, auth.uid()) );
-- "manage own reads" predicate (auth.uid() = user_id) is unchanged.

-- ----------------------------------------------------------------------------
-- 9. Storage — dm-attachments participant read
-- The read predicate previously assumed 2-party (user1_id/user2_id). Rewrite
-- in terms of conversation_participants. The folder convention remains
-- "<sender_uid>/...". Read access is granted to anyone who shares any
-- conversation with the folder owner.
-- ----------------------------------------------------------------------------
drop policy if exists "dm-attachments participant read" on storage.objects;
create policy "dm-attachments participant read" on storage.objects
  for select using (
    bucket_id = 'dm-attachments'
    and (
      (storage.foldername(name))[1] = (auth.uid())::text
      or exists (
        select 1
          from public.conversation_participants me
          join public.conversation_participants other
            on other.conversation_id = me.conversation_id
         where me.user_id = auth.uid()
           and (other.user_id)::text = (storage.foldername(objects.name))[1]
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 10. Replace guard_dm_insert_block — block check across ALL recipients
-- ----------------------------------------------------------------------------
create or replace function public.guard_dm_insert_block()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- If ANY non-sender participant has blocked the sender, reject.
  if exists (
    select 1
      from public.conversation_participants p
      join public.blocks b
        on b.blocker_id = p.user_id
       and b.blocked_id = new.sender_id
     where p.conversation_id = new.conversation_id
       and p.user_id <> new.sender_id
  ) then
    raise exception 'recipient_has_blocked_sender' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. Replace upsert_message_notification — participant-aware
-- Same signature, but:
--   - p_user_id (recipient) must be a participant of p_entity_id (conv)
--   - caller (auth.uid()) must also be a participant
--   - p_user_id <> caller (no self-notify)
-- The frontend is responsible for fanning out per-recipient on group sends
-- (one RPC call per other participant). This keeps the existing
-- (user_id, entity_id) upsert key intact.
-- ----------------------------------------------------------------------------
create or replace function public.upsert_message_notification(
  p_user_id      uuid,
  p_from_user_id uuid,
  p_entity_id    uuid,
  p_metadata     jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated'; end if;
    if p_from_user_id is distinct from uid then
      raise exception 'p_from_user_id must be auth.uid()';
    end if;
    if p_user_id = uid then
      raise exception 'cannot self-notify';
    end if;
    if p_entity_id is null
       or not public.is_conversation_participant(p_entity_id, uid)
       or not public.is_conversation_participant(p_entity_id, p_user_id) then
      raise exception 'not a valid message notification for this conversation';
    end if;
    if exists (select 1 from public.blocks where blocker_id = p_user_id and blocked_id = uid) then
      return;
    end if;
  end if;

  insert into public.notifications (user_id, type, from_user_id, entity_id, metadata, read, created_at)
  values (p_user_id, 'message', p_from_user_id, p_entity_id, p_metadata, false, now())
  on conflict (user_id, entity_id) where entity_id is not null and type = 'message'
  do update set from_user_id = excluded.from_user_id,
                metadata     = excluded.metadata,
                read         = false,
                created_at   = excluded.created_at;
end;
$$;

-- ----------------------------------------------------------------------------
-- 12. fetch_my_conversations RPC
-- Returns one row per conversation the caller participates in, plus the
-- aggregated participant_ids array. Drives the conversation list UI.
-- ----------------------------------------------------------------------------
create or replace function public.fetch_my_conversations()
returns table (
  id                     uuid,
  user1_id               uuid,
  user2_id               uuid,
  status                 text,
  is_group               boolean,
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
    c.id, c.user1_id, c.user2_id, c.status, c.is_group, c.created_at,
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

-- ----------------------------------------------------------------------------
-- 13. create_group_conversation RPC
-- Atomically:
--   - validates that no participant has blocked any other (raises
--     'block_conflict' / SQLSTATE P0001 → mapped to error.code by frontend)
--   - inserts a conversations row with is_group=true, status='accepted'
--   - inserts the full participant set (caller + others)
-- Returns the new conversation id.
-- ----------------------------------------------------------------------------
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
    user1_id, user2_id, requester_id, status, is_group, pair_key, last_message_at
  ) values (
    me, members[1], me, 'accepted', true, null, now()
  )
  returning id into v_conv_id;

  insert into public.conversation_participants (conversation_id, user_id)
  select v_conv_id, m
    from unnest(array_append(members, me)) as m
  on conflict do nothing;

  return v_conv_id;
end;
$$;

revoke all on function public.create_group_conversation(uuid[]) from public;
grant execute on function public.create_group_conversation(uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 14. Patch get_or_create_conversation to also write conversation_participants
-- on first creation. Backfill in step 3 covers existing rows; this keeps new
-- 1:1 conversations consistent going forward.
-- ----------------------------------------------------------------------------
create or replace function public.get_or_create_conversation(other_id uuid)
returns setof public.conversations
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  u1 uuid;
  u2 uuid;
  are_friends boolean;
  initial_status text;
  v_conv_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if other_id is null or other_id = me then
    raise exception 'Invalid other_id';
  end if;

  if me < other_id then
    u1 := me; u2 := other_id;
  else
    u1 := other_id; u2 := me;
  end if;

  select exists(
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (fr.sender_id = me and fr.receiver_id = other_id) or
        (fr.sender_id = other_id and fr.receiver_id = me)
      )
  ) into are_friends;

  initial_status := case when are_friends then 'accepted' else 'pending' end;

  insert into public.conversations (user1_id, user2_id, requester_id, status, is_group)
  values (u1, u2, me, initial_status, false)
  on conflict (pair_key) do nothing;

  select id into v_conv_id
    from public.conversations
   where user1_id = u1 and user2_id = u2
   limit 1;

  -- Ensure participants rows exist (idempotent — harmless if already present).
  if v_conv_id is not null then
    insert into public.conversation_participants (conversation_id, user_id)
    values (v_conv_id, u1), (v_conv_id, u2)
    on conflict do nothing;
  end if;

  return query
    select * from public.conversations where id = v_conv_id;
end;
$$;

commit;
