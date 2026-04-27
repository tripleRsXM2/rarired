-- 20260427_notification_lifecycle_v1.sql
--
-- Module 11 (Slice 1) — Notification lifecycle foundation.
--
-- Replaces the binary `read` boolean with a proper lifecycle model.
-- NO UI changes in this slice — the existing 3-section panel keeps
-- working off the legacy `read` boolean. Slice 2 swaps the UI to a
-- single newest-first list using the new columns.
--
-- Design principles (locked, see docs/notification-taxonomy.md):
--
--   1. Three new states are stored as nullable timestamps so every
--      lifecycle answer is "when did X happen, or NULL if it didn't":
--        read_at       — user opened it
--        resolved_at   — underlying action complete / no longer needed
--        dismissed_at  — user manually hid it
--      Plus an `expires_at` for time-based auto-resolution and an
--      `action_required` flag derived from the type registry.
--
--   2. Resolution is server-only. Cleanup triggers + RPCs flip
--      resolved_at; clients cannot set it. The notifications_update_
--      guard_trg now blocks resolved_at and expires_at writes from
--      authenticated callers.
--
--   3. Idempotent emission via partial unique index keyed on
--      (user_id, type, entity_type, entity_key) WHERE active. Re-firing
--      the same notification bumps created_at + clears read_at on the
--      existing active row instead of inserting a new one. Push
--      idempotency log already keyed on notification_id (Module 8) →
--      no push spam.
--
--   4. entity_key is the canonical entity reference, computed as
--      coalesce(entity_id::text, match_id, metadata->>'entityId').
--      Some legacy rows have entity_id NULL but match_id set;
--      indexing on entity_id alone would fail to dedupe them.
--
--   5. Cleanup triggers convert from HARD DELETE to
--      UPDATE resolved_at = now(). History is preserved (future
--      "View history" surface; never built in this slice). The
--      conv-deletion trigger stays as DELETE — a deleted conversation
--      has no useful history value for the notification.
--
--   6. Reconciliation function reconcile_my_notifications() is the
--      defensive sweep — checks linked entity state and resolves
--      stale rows. Caller-side: uses auth.uid() internally; no
--      p_user_id argument so one user cannot reconcile another's
--      notifications.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Schema additions
-- ─────────────────────────────────────────────────────────────────────

alter table public.notifications
  add column if not exists action_required boolean     not null default false,
  add column if not exists resolved_at     timestamptz,
  add column if not exists read_at         timestamptz,
  add column if not exists dismissed_at    timestamptz,
  add column if not exists entity_type     text,
  add column if not exists expires_at      timestamptz,
  -- Canonical entity reference. coalesce(entity_id::text, match_id,
  -- metadata->>'entityId') at backfill + emit time. Stable across the
  -- old match_id text column and the newer entity_id uuid.
  add column if not exists entity_key      text;

-- Indexes for the new lifecycle filter. Active-only main-list query
-- benefits from a partial index covering the common WHERE clause.
create index if not exists idx_notifications_user_active
  on public.notifications (user_id, created_at desc)
  where resolved_at is null and dismissed_at is null;

create index if not exists idx_notifications_entity_lookup
  on public.notifications (entity_type, entity_key)
  where resolved_at is null;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Backfill — explicit SQL CASE per type (type registry mirror)
-- ─────────────────────────────────────────────────────────────────────
--
-- The JS-side type registry (Slice 2) is the long-term source of truth,
-- but for backfill we lay out the mapping here so existing rows land
-- with correct action_required + entity_type without dragging a JS
-- runtime into the migration.

-- 2a. entity_key — robust to legacy match_id column
update public.notifications
set entity_key = coalesce(
  entity_id::text,
  match_id,
  metadata ->> 'entityId'
)
where entity_key is null;

-- 2b. action_required — covers every action-class type that has ever
-- existed in this codebase, including retired pact_proposed.
update public.notifications set action_required = true
where action_required = false  -- only flip from default
  and type in (
    'match_tag',
    'match_disputed',
    'match_correction_requested',
    'match_counter_proposed',
    'match_reminder',
    'friend_request',
    'message_request',
    'challenge_received',
    'pact_proposed'              -- retired but flag historical rows correctly
  );

-- 2c. entity_type — explicit map covering every type the migration
-- has ever shipped. New types added in Slice 2 should also update
-- this CASE if back-deployed via reconcile.
update public.notifications set entity_type = case type
  -- Match lifecycle (entity_id / match_id → match_history.id)
  when 'match_tag'                  then 'match'
  when 'match_disputed'             then 'match'
  when 'match_correction_requested' then 'match'
  when 'match_counter_proposed'     then 'match'
  when 'match_corrected'            then 'match'
  when 'match_confirmed'            then 'match'
  when 'match_voided'               then 'match'
  when 'match_expired'              then 'match'
  when 'match_deleted'              then 'match'
  when 'match_reminder'             then 'match'
  when 'casual_match_logged'        then 'match'
  when 'like'                       then 'match'
  when 'comment'                    then 'match'
  -- Match-invite flow (Module 9 — entity_id → match_invites.id)
  when 'match_invite_claimed'       then 'match_invite'
  when 'match_invite_declined'      then 'match_invite'
  -- Friend graph (entity_id → friend_requests.id)
  when 'friend_request'             then 'friend_request'
  when 'request_accepted'           then 'friend_request'
  -- Conversations / DMs (entity_id → conversations.id)
  when 'message_request'            then 'conversation'
  when 'message_request_accepted'   then 'conversation'
  when 'message'                    then 'conversation'
  -- Challenges (entity_id → challenges.id)
  when 'challenge_received'         then 'challenge'
  when 'challenge_accepted'         then 'challenge'
  when 'challenge_declined'         then 'challenge'
  when 'challenge_expired'          then 'challenge'
  -- Leagues (entity_id → leagues.id)
  when 'league_invite'              then 'league'
  when 'league_joined'              then 'league'
  -- Retired Tindis pact rows — kept here so they get entity_type for
  -- the resolve step below. Module 11 Slice 2 type registry won't
  -- include these.
  when 'pact_proposed'              then 'pact'
  when 'pact_confirmed'             then 'pact'
  when 'pact_booked'                then 'pact'
  when 'pact_cancelled'             then 'pact'
  when 'pact_claimed'               then 'pact'
  else null
end
where entity_type is null;

-- 2d. read_at backfill — preserve legacy `read` boolean meaning
update public.notifications set read_at = created_at
where read = true and read_at is null;

-- 2e. expires_at backfill — set defaults that match the existing
-- pg_cron sweep windows so the new query naturally hides rows that
-- the old client would have shown as "expired."
--
--   match_tag:         72h ranked-confirmation window
--   challenge_received: 7d challenge auto-expire window
--   pact_proposed:     48h (Tindis spec, retired but flagged)
--   match_reminder:    24h (sent in the last 24h before match expiry)
--
-- Other types don't have a natural time-based expiry — they're
-- resolved by entity-state changes instead.
update public.notifications set expires_at = created_at + interval '72 hours'
  where type = 'match_tag' and expires_at is null;

update public.notifications set expires_at = created_at + interval '7 days'
  where type = 'challenge_received' and expires_at is null;

update public.notifications set expires_at = created_at + interval '48 hours'
  where type = 'pact_proposed' and expires_at is null;

update public.notifications set expires_at = created_at + interval '24 hours'
  where type = 'match_reminder' and expires_at is null;

-- 2f. Resolve all retired pact_* rows. The Tindis feature was
-- removed pre-launch (drop_tindis migration); these rows reference
-- entities that no longer exist or no longer carry action.
update public.notifications set resolved_at = now()
where type like 'pact_%' and resolved_at is null;

-- 2g. Idempotency scrub for pre-existing duplicates.
-- Rule: keep newest active row per (user_id, type, entity_type, entity_key)
-- with entity_key NOT NULL; mark older duplicates resolved_at = now().
-- It is acceptable to drop unread state on these stale rows per the
-- product sign-off.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, type, entity_type, entity_key
           order by created_at desc, id desc
         ) as rn
  from public.notifications
  where resolved_at is null
    and dismissed_at is null
    and entity_key is not null
)
update public.notifications n
set resolved_at = now()
from ranked r
where n.id = r.id and r.rn > 1;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Partial unique index — active rows only, entity_key required
-- ─────────────────────────────────────────────────────────────────────
--
-- Rows with NULL entity_key (rare; most types have an entity) are
-- deliberately NOT deduped — collapsing unrelated entity-less
-- notifications into one would lose information. If you have a
-- type that should be deduped without an entity, set entity_key to
-- a stable per-recipient sentinel (e.g. user_id::text || ':' || type).

create unique index if not exists notifications_active_entity_uniq
  on public.notifications (user_id, type, entity_type, entity_key)
  where resolved_at is null
    and dismissed_at is null
    and entity_key is not null;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Update the row-update guard — allow new lifecycle writes
-- ─────────────────────────────────────────────────────────────────────
--
-- Authenticated clients can now write read / read_at / dismissed_at
-- on their own rows. Server-only fields (resolved_at, expires_at,
-- entity_type, entity_key, action_required) stay locked. Service-
-- role / postgres callers (which is what trigger functions and
-- SECURITY DEFINER RPCs run as) bypass the lock.

create or replace function public.notifications_update_guard()
returns trigger
language plpgsql
as $$
begin
  -- Trigger functions, SECURITY DEFINER RPCs, and admin paths bypass.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  -- Immutable from the moment of insert (any role can't change these
  -- via authenticated path; service-role bypassed above):
  if new.user_id          is distinct from old.user_id          then raise exception 'user_id locked';          end if;
  if new.from_user_id     is distinct from old.from_user_id     then raise exception 'from_user_id locked';     end if;
  if new.type             is distinct from old.type             then raise exception 'type locked';             end if;
  if new.entity_id        is distinct from old.entity_id        then raise exception 'entity_id locked';        end if;
  if new.entity_type      is distinct from old.entity_type      then raise exception 'entity_type locked';      end if;
  if new.entity_key       is distinct from old.entity_key       then raise exception 'entity_key locked';       end if;
  if new.action_required  is distinct from old.action_required  then raise exception 'action_required locked'; end if;
  if new.metadata         is distinct from old.metadata         then raise exception 'metadata locked';         end if;
  if new.created_at       is distinct from old.created_at       then raise exception 'created_at locked';       end if;

  -- Server-only timestamps:
  if new.resolved_at      is distinct from old.resolved_at      then raise exception 'resolved_at is server-only'; end if;
  if new.expires_at       is distinct from old.expires_at       then raise exception 'expires_at is server-only';  end if;

  -- Allowed user writes (no checks needed — anything goes):
  --   read       → keep working for legacy code paths
  --   read_at    → user marks notification as read
  --   dismissed_at → user dismisses
  --   match_id   → legacy column, unmodified by current code

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Cleanup triggers — DELETE → UPDATE resolved_at
-- ─────────────────────────────────────────────────────────────────────

-- 5a. cleanup_match_notifications — fires on match_history terminal
-- transitions. Old behaviour: DELETE all related notification rows.
-- New behaviour: UPDATE resolved_at so they fall out of the main
-- list but stay as history. Realtime UPDATE event live-removes them
-- from the panel.
create or replace function public.cleanup_match_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id text;
  is_terminal boolean;
begin
  if (tg_op = 'DELETE') then
    target_id := old.id;
    is_terminal := true;
  else
    target_id := new.id;
    is_terminal := new.status in ('voided','expired','deleted','confirmed');
    if not is_terminal then
      return coalesce(new, old);
    end if;
  end if;

  -- Resolve all match-related notifications for this match. Module
  -- 9.1.5's casual_match_logged + Module 9's match_invite_* are both
  -- already in this list.
  update public.notifications
  set resolved_at = now()
  where match_id::text = target_id
    and resolved_at is null
    and type in (
      'match_tag',
      'match_confirmed',
      'match_disputed',
      'match_corrected',
      'match_correction_requested',
      'match_counter_proposed',
      'match_voided',
      'match_expired',
      'match_deleted',
      'match_reminder',
      'casual_match_logged'
    );

  -- Hard-delete pattern stays for these because the entity itself is
  -- gone — there's no useful history target anyway. Plus the like /
  -- comment notifications are activity-class and Module 11's lifecycle
  -- model treats them as informational; resolved_at would also work
  -- but DELETE here matches the original behaviour and keeps the
  -- table size in check.
  delete from public.notifications
  where match_id::text = target_id
    and type in ('like', 'comment');

  return coalesce(new, old);
end;
$$;

-- 5b. cleanup_challenge_notifications — fires on challenges row
-- transition into a terminal state (accepted / declined / cancelled /
-- completed / expired). Old: DELETE. New: UPDATE resolved_at.
--
-- The function may not exist on every branch (depends on what's been
-- merged). Guard with conditional create.
create or replace function public.cleanup_challenge_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  is_terminal boolean;
begin
  if (tg_op = 'DELETE') then
    target_id := old.id;
    is_terminal := true;
  else
    target_id := new.id;
    is_terminal := new.status in ('accepted','declined','cancelled','completed','expired');
    if not is_terminal then
      return coalesce(new, old);
    end if;
  end if;

  update public.notifications
  set resolved_at = now()
  where entity_id = target_id
    and resolved_at is null
    and type in (
      'challenge_received',
      'challenge_accepted',
      'challenge_declined',
      'challenge_expired'
    );

  return coalesce(new, old);
end;
$$;

-- 5c. cleanup_league_invite_notifications — fires when a
-- league_members row transitions out of 'invited'.
create or replace function public.cleanup_league_invite_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only fire on transitions away from 'invited'.
  if tg_op = 'UPDATE' and old.status = 'invited' and new.status is distinct from 'invited' then
    update public.notifications
    set resolved_at = now()
    where entity_id = new.league_id
      and user_id = new.user_id
      and resolved_at is null
      and type = 'league_invite';
  elsif tg_op = 'DELETE' and old.status = 'invited' then
    update public.notifications
    set resolved_at = now()
    where entity_id = old.league_id
      and user_id = old.user_id
      and resolved_at is null
      and type = 'league_invite';
  end if;
  return coalesce(new, old);
end;
$$;

-- 5d. cleanup_conv_notifications — DELETED conversation has no
-- history value. Keep the existing hard-delete behaviour. (Trigger
-- not modified by this migration.)

-- ─────────────────────────────────────────────────────────────────────
-- 6. emit_notification — upsert + populate new columns
-- ─────────────────────────────────────────────────────────────────────
--
-- Behaviour change: re-emitting the same (user_id, type, entity_type,
-- entity_key) for an active row UPDATEs in place — bumps created_at,
-- clears read_at, refreshes from_user_id + metadata. Returns the same
-- id (so push idempotency log works). The standing-check switch case
-- and per-type validation are PRESERVED verbatim from the prior
-- migration.
--
-- Push-spam note: dispatchPush is fired client-side from the returned
-- id. Re-firing send-push for an already-pushed notification_id is
-- idempotent at the notification_push_log layer (Module 8). A future
-- registry flag `renotify_on_update` would let specific types
-- intentionally re-push on bump; not implemented in this slice.

create or replace function public.emit_notification(
  p_user_id   uuid,
  p_type      text,
  p_entity_id uuid default null,
  p_metadata  jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid             uuid := auth.uid();
  new_id          uuid;
  fill_match_id   uuid;
  entity_text     text := p_entity_id::text;
  v_action_req    boolean;
  v_entity_type   text;
  v_entity_key    text;
  v_expires_at    timestamptz;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_user_id = uid then raise exception 'cannot self-notify via emit_notification'; end if;

  if exists (select 1 from public.blocks where blocker_id = p_user_id and blocked_id = uid) then
    return null;
  end if;

  -- ── Per-type standing checks (UNCHANGED from prior migration) ─────
  case p_type
    when 'friend_request' then
      if not exists (
        select 1 from public.friend_requests fr
        where fr.sender_id = uid and fr.receiver_id = p_user_id and fr.status = 'pending'
      ) then raise exception 'no pending friend_request for this pair'; end if;

    when 'friend_request_accepted', 'request_accepted' then
      if not exists (
        select 1 from public.friend_requests fr
        where fr.receiver_id = uid and fr.sender_id = p_user_id and fr.status = 'accepted'
      ) then raise exception 'no accepted friend_request'; end if;

    when 'message_request' then
      if not exists (
        select 1 from public.conversations c
        where c.id = p_entity_id
          and c.requester_id = uid
          and ((c.user1_id = p_user_id) or (c.user2_id = p_user_id))
      ) then raise exception 'not a valid message_request'; end if;

    when 'message_request_accepted' then
      if not exists (
        select 1 from public.conversations c
        where c.id = p_entity_id
          and c.status = 'accepted'
          and (
            (c.user1_id = uid and c.user2_id = p_user_id) or
            (c.user2_id = uid and c.user1_id = p_user_id)
          )
      ) then raise exception 'not a valid message_request_accepted'; end if;

    when 'challenge_received', 'challenge_accepted', 'challenge_declined', 'challenge_expired' then
      if not exists (
        select 1 from public.challenges ch
        where ch.id = p_entity_id
          and (
            (ch.challenger_id = uid and ch.challenged_id = p_user_id) or
            (ch.challenged_id = uid and ch.challenger_id = p_user_id)
          )
      ) then raise exception 'not a party to this challenge'; end if;

    when 'match_tag', 'match_confirmed', 'match_disputed', 'match_corrected',
         'match_correction_requested', 'match_counter_proposed', 'match_voided',
         'match_expired', 'match_reminder' then
      if not exists (
        select 1 from public.match_history m
        where m.id = entity_text
          and (
            (m.user_id = uid and (m.opponent_id = p_user_id or m.tagged_user_id = p_user_id)) or
            (m.opponent_id = uid and m.user_id = p_user_id) or
            (m.tagged_user_id = uid and m.user_id = p_user_id)
          )
      ) then raise exception 'not a party to this match'; end if;
      fill_match_id := p_entity_id;

    when 'casual_match_logged' then
      if not exists (
        select 1 from public.match_history m
        where m.id = entity_text
          and m.user_id = uid
          and m.opponent_id = p_user_id
          and m.match_type = 'casual'
      ) then raise exception 'not a casual match between the caller (submitter) and recipient (opponent)'; end if;
      fill_match_id := p_entity_id;

    when 'match_deleted' then
      fill_match_id := p_entity_id;

    when 'match_invite_claimed', 'match_invite_declined' then
      if not exists (
        select 1 from public.match_invites mi
        where mi.id = p_entity_id
          and mi.invited_by = p_user_id
          and (mi.claimed_by = uid or mi.declined_by = uid)
      ) then raise exception 'not a party to this invite'; end if;

    when 'pact_proposed', 'pact_confirmed', 'pact_booked',
         'pact_cancelled', 'pact_claimed' then
      -- Tindis retired pre-launch; reject new emissions.
      raise exception 'pact_* notification types are retired';

    when 'league_invite', 'league_joined' then
      null;

    else
      raise exception 'unknown notification type: %', p_type;
  end case;

  -- ── Lifecycle column derivation ──────────────────────────────────
  v_action_req := p_type in (
    'match_tag', 'match_disputed', 'match_correction_requested',
    'match_counter_proposed', 'match_reminder',
    'friend_request', 'message_request', 'challenge_received'
  );
  v_entity_type := case p_type
    when 'match_tag'                  then 'match'
    when 'match_disputed'             then 'match'
    when 'match_correction_requested' then 'match'
    when 'match_counter_proposed'     then 'match'
    when 'match_corrected'            then 'match'
    when 'match_confirmed'            then 'match'
    when 'match_voided'               then 'match'
    when 'match_expired'              then 'match'
    when 'match_deleted'              then 'match'
    when 'match_reminder'             then 'match'
    when 'casual_match_logged'        then 'match'
    when 'like'                       then 'match'
    when 'comment'                    then 'match'
    when 'match_invite_claimed'       then 'match_invite'
    when 'match_invite_declined'      then 'match_invite'
    when 'friend_request'             then 'friend_request'
    when 'request_accepted'           then 'friend_request'
    when 'friend_request_accepted'    then 'friend_request'
    when 'message_request'            then 'conversation'
    when 'message_request_accepted'   then 'conversation'
    when 'message'                    then 'conversation'
    when 'challenge_received'         then 'challenge'
    when 'challenge_accepted'         then 'challenge'
    when 'challenge_declined'         then 'challenge'
    when 'challenge_expired'          then 'challenge'
    when 'league_invite'              then 'league'
    when 'league_joined'              then 'league'
    else null
  end;
  v_entity_key := coalesce(p_entity_id::text, fill_match_id::text);
  v_expires_at := case p_type
    when 'match_tag'         then now() + interval '72 hours'
    when 'challenge_received' then now() + interval '7 days'
    when 'match_reminder'    then now() + interval '24 hours'
    else null
  end;

  -- ── Idempotent upsert ────────────────────────────────────────────
  -- ON CONFLICT keys on the partial unique index (user_id, type,
  -- entity_type, entity_key) WHERE active. If a matching active row
  -- exists, UPDATE it in place — bump created_at, clear read_at,
  -- refresh actor + metadata. Returns the same id either way so
  -- push-side idempotency log keeps working.
  --
  -- Rows without entity_key (rare — type without entity) cannot
  -- conflict and always insert fresh.
  if v_entity_key is null then
    insert into public.notifications (
      user_id, type, from_user_id, match_id, entity_id, metadata,
      action_required, entity_type, entity_key, expires_at
    )
    values (
      p_user_id, p_type, uid, fill_match_id::text, p_entity_id, p_metadata,
      v_action_req, v_entity_type, v_entity_key, v_expires_at
    )
    returning id into new_id;
  else
    insert into public.notifications (
      user_id, type, from_user_id, match_id, entity_id, metadata,
      action_required, entity_type, entity_key, expires_at
    )
    values (
      p_user_id, p_type, uid, fill_match_id::text, p_entity_id, p_metadata,
      v_action_req, v_entity_type, v_entity_key, v_expires_at
    )
    on conflict (user_id, type, entity_type, entity_key)
    where resolved_at is null and dismissed_at is null and entity_key is not null
    do update set
      created_at   = now(),
      read_at      = null,
      read         = false,                    -- legacy mirror
      from_user_id = excluded.from_user_id,
      metadata     = excluded.metadata,
      expires_at   = excluded.expires_at
    returning id into new_id;
  end if;

  return new_id;
end;
$$;

revoke execute on function public.emit_notification(uuid, text, uuid, jsonb) from public;
grant  execute on function public.emit_notification(uuid, text, uuid, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 7. reconcile_my_notifications — defensive sweep for the caller
-- ─────────────────────────────────────────────────────────────────────
--
-- Walks every active notification owned by the caller, checks the
-- linked entity's current state, and resolves rows that the cleanup
-- triggers missed (race on initial subscribe, dropped trigger event,
-- mid-deploy state, etc.). Idempotent. Returns count of rows resolved.
--
-- Caller-only by design: NO p_user_id argument. auth.uid() is the
-- only writable target. Service-role / admin can bypass via direct
-- UPDATE if needed.

create or replace function public.reconcile_my_notifications()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  v_resolved int := 0;
begin
  if uid is null then return 0; end if;

  -- 7a. Match-tagged notifications: resolve when the underlying match
  -- has left pending_confirmation / pending_reconfirmation / disputed.
  with resolved as (
    update public.notifications n
    set resolved_at = now()
    from public.match_history m
    where n.user_id = uid
      and n.resolved_at is null
      and n.match_id is not null
      and m.id = n.match_id::text
      and n.type in (
        'match_tag', 'match_disputed', 'match_correction_requested',
        'match_counter_proposed', 'match_reminder'
      )
      and m.status not in ('pending_confirmation', 'pending_reconfirmation', 'disputed')
    returning n.id
  )
  select v_resolved + count(*) into v_resolved from resolved;

  -- 7b. Challenge-received notifications: resolve when challenge has
  -- left pending state.
  with resolved as (
    update public.notifications n
    set resolved_at = now()
    from public.challenges c
    where n.user_id = uid
      and n.resolved_at is null
      and n.entity_id is not null
      and c.id = n.entity_id
      and n.type = 'challenge_received'
      and c.status <> 'pending'
    returning n.id
  )
  select v_resolved + count(*) into v_resolved from resolved;

  -- 7c. League-invite notifications: resolve when membership row has
  -- left 'invited'.
  with resolved as (
    update public.notifications n
    set resolved_at = now()
    from public.league_members lm
    where n.user_id = uid
      and n.resolved_at is null
      and n.type = 'league_invite'
      and lm.league_id = n.entity_id
      and lm.user_id = n.user_id
      and lm.status <> 'invited'
    returning n.id
  )
  select v_resolved + count(*) into v_resolved from resolved;

  -- 7d. Match-invite (Module 9) notifications: resolve when the
  -- referenced invite is no longer pending.
  with resolved as (
    update public.notifications n
    set resolved_at = now()
    from public.match_invites mi
    where n.user_id = uid
      and n.resolved_at is null
      and n.entity_id is not null
      and mi.id = n.entity_id
      and n.type in ('match_invite_claimed', 'match_invite_declined')
      and mi.status <> 'pending'
    returning n.id
  )
  select v_resolved + count(*) into v_resolved from resolved;

  -- 7e. Time-based expiry: any active row whose expires_at is past.
  with resolved as (
    update public.notifications n
    set resolved_at = now()
    where n.user_id = uid
      and n.resolved_at is null
      and n.expires_at is not null
      and n.expires_at < now()
    returning n.id
  )
  select v_resolved + count(*) into v_resolved from resolved;

  return v_resolved;
end;
$$;

revoke execute on function public.reconcile_my_notifications() from public;
grant  execute on function public.reconcile_my_notifications() to authenticated;

comment on function public.reconcile_my_notifications() is
  'Defensive lifecycle sweep for the calling user. Resolves notifications '
  'whose linked entity has gone terminal since they were created. Idempotent. '
  'NO p_user_id argument — only the caller''s own rows are touched.';

commit;
