-- 20260427_league_lifecycle_v2_notifications.sql
--
-- Module 12 (Slice 2) — League lifecycle notifications + invite cleanup.
--
-- Builds on Slice 1 (20260427_league_lifecycle_v1.sql). Adds:
--
--   1. _emit_league_lifecycle_notifs(league_id, type, actor, metadata)
--      helper. Inserts one row per active league_member EXCEPT the actor
--      themselves into public.notifications. Bypasses emit_notification
--      (we're already inside SECURITY DEFINER lifecycle RPCs that have
--      validated owner standing — no need to re-run the standing switch).
--      Mirrors the lifecycle column derivation that emit_notification
--      does for non-action notifications:
--        action_required = false
--        entity_type     = 'league'
--        entity_key      = league_id::text
--        expires_at      = null
--      from_user_id is set to the actor (the league owner doing the
--      transition).
--
--   2. _resolve_pending_league_invites(league_id) helper. When a league
--      leaves 'active' (any of complete / archive / cancel / void), any
--      pending `league_invite` notifications for that league are no
--      longer actionable — resolve them so they drop out of the active
--      tray. Uses the same resolved_at semantics as the existing
--      cleanup_league_invite_notifications trigger from Module 11.
--
--   3. REPLACES the 4 lifecycle RPCs (complete / archive / cancel /
--      void) so the body fans out notifications + cleans pending
--      invites after the status update. The contract (args, source-
--      status validation, standings lock, audit_log emit) is identical
--      to Slice 1; only the post-update side-effects are new.
--
-- The notification type strings used here MUST stay in sync with the
-- frontend registry at src/features/notifications/types.js. The four
-- new types:
--
--   league_completed  — owner marked the season finished
--   league_archived   — owner archived the league
--   league_cancelled  — owner cancelled the league before completion
--   league_voided     — owner voided the league (mistake / bad data)
--
-- All 4 are non-action (informational), entity_type='league', and live
-- in push category 'league_updates' (mirrors send-push Edge Function).

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Helper: fan out lifecycle notifications to active members
-- ─────────────────────────────────────────────────────────────────────

create or replace function public._emit_league_lifecycle_notifs(
  p_league_id uuid,
  p_type      text,
  p_actor     uuid,
  p_metadata  jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- One INSERT per active member that isn't the actor. We INSERT
  -- directly (not via emit_notification) because:
  --   (a) the calling lifecycle RPC has already validated owner
  --       standing — no need to re-validate per-recipient;
  --   (b) emit_notification's switch doesn't know about the new
  --       lifecycle types, and extending it would re-litigate the
  --       SQL/registry mirror surface for every type;
  --   (c) lifecycle is one-shot per (league, type) and not subject to
  --       idempotency dedup the way match notifications are — every
  --       member gets exactly one row, written once.
  insert into public.notifications (
    user_id, type, from_user_id, entity_id, metadata,
    action_required, entity_type, entity_key, expires_at
  )
  select
    lm.user_id,
    p_type,
    p_actor,
    p_league_id,
    p_metadata,
    false,                  -- lifecycle is informational, no action required
    'league',
    p_league_id::text,
    null::timestamptz       -- lifecycle notifs don't expire
  from public.league_members lm
  where lm.league_id = p_league_id
    and lm.status    = 'active'
    and lm.user_id  <> p_actor;
end;
$$;
revoke all on function public._emit_league_lifecycle_notifs(uuid, text, uuid, jsonb)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Helper: resolve pending league_invite notifications for a league
-- ─────────────────────────────────────────────────────────────────────
--
-- When a league exits 'active' (complete / archive / cancel / void),
-- any pending `league_invite` notifications for that league become
-- stale. Mark them resolved so they drop out of the active tray for
-- recipients who hadn't yet responded. Mirrors the pattern of the
-- existing cleanup_league_invite_notifications trigger.

create or replace function public._resolve_pending_league_invites(
  p_league_id uuid
) returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set resolved_at = now()
  where type        = 'league_invite'
    and entity_type = 'league'
    and entity_key  = p_league_id::text
    and resolved_at is null
    and dismissed_at is null;
$$;
revoke all on function public._resolve_pending_league_invites(uuid)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 3. REPLACE the 4 lifecycle RPCs (Slice 1 contract + Slice 2 fan-out)
-- ─────────────────────────────────────────────────────────────────────
--
-- Each RPC body is identical to Slice 1 EXCEPT for two new lines at
-- the end (after the audit_log emit):
--
--   perform public._emit_league_lifecycle_notifs(p_league_id, '<type>', uid,
--     jsonb_build_object('reason', p_reason, 'note', p_note,
--                        'league_name', v_name));
--   perform public._resolve_pending_league_invites(p_league_id);
--
-- The notif metadata carries enough that the recipient's tray copy
-- can name the league + show the reason without a follow-up roundtrip.
-- v_name is read off the leagues row at the start of the RPC.

-- ── complete_league ──────────────────────────────────────────────────
create or replace function public.complete_league(
  p_league_id uuid,
  p_reason    text default 'season_finished',
  p_note      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_owner   uuid;
  v_status  text;
  v_name    text;
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated' using errcode='42501'; end if;
  end if;

  select created_by, status, name into v_owner, v_status, v_name
  from public.leagues where id = p_league_id;
  if not found then raise exception 'league not found'; end if;

  if session_user <> 'postgres' and v_owner <> uid then
    raise exception 'only the league owner can complete it' using errcode='42501';
  end if;

  if v_status <> 'active' then
    raise exception 'cannot complete a % league (must be active)', v_status using errcode='check_violation';
  end if;

  perform public._lock_league_standings(p_league_id);

  update public.league_standings
  set is_final = true, finalized_at = now()
  where league_id = p_league_id;

  update public.leagues
  set status            = 'completed',
      completed_at      = now(),
      status_changed_at = now(),
      status_changed_by = uid,
      status_reason     = coalesce(p_reason, 'season_finished'),
      status_note       = p_note
  where id = p_league_id;

  insert into public.league_status_events
    (league_id, from_status, to_status, reason, note, changed_by)
  values (p_league_id, v_status, 'completed', coalesce(p_reason, 'season_finished'), p_note, uid);

  -- Audit log emit (best-effort)
  begin
    insert into public.audit_log(actor_id, action, target_type, target_id, metadata)
    values (uid, 'league_completed', 'league', p_league_id,
            jsonb_build_object('owner', v_owner, 'reason', p_reason));
  exception when undefined_table then null; end;

  -- Slice 2: notify active members + resolve pending invites
  perform public._emit_league_lifecycle_notifs(
    p_league_id, 'league_completed', uid,
    jsonb_build_object(
      'reason',      coalesce(p_reason, 'season_finished'),
      'note',        p_note,
      'league_name', v_name
    )
  );
  perform public._resolve_pending_league_invites(p_league_id);
end;
$$;
revoke execute on function public.complete_league(uuid, text, text) from public;
grant  execute on function public.complete_league(uuid, text, text) to authenticated;

-- ── archive_league ──────────────────────────────────────────────────
create or replace function public.archive_league(
  p_league_id uuid,
  p_reason    text default 'inactive',
  p_note      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_owner  uuid;
  v_status text;
  v_name   text;
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated' using errcode='42501'; end if;
  end if;

  select created_by, status, name into v_owner, v_status, v_name
  from public.leagues where id = p_league_id;
  if not found then raise exception 'league not found'; end if;

  if session_user <> 'postgres' and v_owner <> uid then
    raise exception 'only the league owner can archive it' using errcode='42501';
  end if;

  if v_status not in ('active','completed') then
    raise exception 'cannot archive a % league (must be active or completed)', v_status using errcode='check_violation';
  end if;

  perform public._lock_league_standings(p_league_id);

  update public.leagues
  set status            = 'archived',
      status_changed_at = now(),
      status_changed_by = uid,
      status_reason     = coalesce(p_reason, 'inactive'),
      status_note       = p_note
      -- completed_at intentionally NOT touched: archive can come from
      -- either active (completed_at stays null) or completed (already set).
  where id = p_league_id;

  insert into public.league_status_events
    (league_id, from_status, to_status, reason, note, changed_by)
  values (p_league_id, v_status, 'archived', coalesce(p_reason, 'inactive'), p_note, uid);

  begin
    insert into public.audit_log(actor_id, action, target_type, target_id, metadata)
    values (uid, 'league_archived', 'league', p_league_id,
            jsonb_build_object('owner', v_owner, 'reason', p_reason));
  exception when undefined_table then null; end;

  -- Slice 2: notify active members + resolve pending invites.
  -- We send the notif even on completed→archived because members care
  -- that the league has gone read-only; the prior 'completed' notif
  -- was about the standings being final, this one is about the league
  -- moving off their active list.
  perform public._emit_league_lifecycle_notifs(
    p_league_id, 'league_archived', uid,
    jsonb_build_object(
      'reason',      coalesce(p_reason, 'inactive'),
      'note',        p_note,
      'league_name', v_name,
      'from_status', v_status
    )
  );
  perform public._resolve_pending_league_invites(p_league_id);
end;
$$;
revoke execute on function public.archive_league(uuid, text, text) from public;
grant  execute on function public.archive_league(uuid, text, text) to authenticated;

-- ── cancel_league ────────────────────────────────────────────────────
create or replace function public.cancel_league(
  p_league_id uuid,
  p_reason    text default 'cancelled_by_creator',
  p_note      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_owner  uuid;
  v_status text;
  v_name   text;
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated' using errcode='42501'; end if;
  end if;

  select created_by, status, name into v_owner, v_status, v_name
  from public.leagues where id = p_league_id;
  if not found then raise exception 'league not found'; end if;

  if session_user <> 'postgres' and v_owner <> uid then
    raise exception 'only the league owner can cancel it' using errcode='42501';
  end if;

  if v_status <> 'active' then
    raise exception 'cannot cancel a % league (must be active)', v_status using errcode='check_violation';
  end if;

  perform public._lock_league_standings(p_league_id);

  update public.leagues
  set status            = 'cancelled',
      status_changed_at = now(),
      status_changed_by = uid,
      status_reason     = coalesce(p_reason, 'cancelled_by_creator'),
      status_note       = p_note
  where id = p_league_id;

  insert into public.league_status_events
    (league_id, from_status, to_status, reason, note, changed_by)
  values (p_league_id, v_status, 'cancelled', coalesce(p_reason, 'cancelled_by_creator'), p_note, uid);

  begin
    insert into public.audit_log(actor_id, action, target_type, target_id, metadata)
    values (uid, 'league_cancelled', 'league', p_league_id,
            jsonb_build_object('owner', v_owner, 'reason', p_reason));
  exception when undefined_table then null; end;

  perform public._emit_league_lifecycle_notifs(
    p_league_id, 'league_cancelled', uid,
    jsonb_build_object(
      'reason',      coalesce(p_reason, 'cancelled_by_creator'),
      'note',        p_note,
      'league_name', v_name
    )
  );
  perform public._resolve_pending_league_invites(p_league_id);
end;
$$;
revoke execute on function public.cancel_league(uuid, text, text) from public;
grant  execute on function public.cancel_league(uuid, text, text) to authenticated;

-- ── void_league ──────────────────────────────────────────────────────
create or replace function public.void_league(
  p_league_id uuid,
  p_reason    text default 'created_by_mistake',
  p_note      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_owner  uuid;
  v_status text;
  v_name   text;
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated' using errcode='42501'; end if;
  end if;

  select created_by, status, name into v_owner, v_status, v_name
  from public.leagues where id = p_league_id;
  if not found then raise exception 'league not found'; end if;

  if session_user <> 'postgres' and v_owner <> uid then
    raise exception 'only the league owner can void it' using errcode='42501';
  end if;

  if v_status <> 'active' then
    raise exception 'cannot void a % league in V1 (only active leagues; contact support to void completed/archived/cancelled)', v_status
      using errcode='check_violation';
  end if;

  perform public._lock_league_standings(p_league_id);

  update public.leagues
  set status            = 'voided',
      status_changed_at = now(),
      status_changed_by = uid,
      status_reason     = coalesce(p_reason, 'created_by_mistake'),
      status_note       = p_note
  where id = p_league_id;

  insert into public.league_status_events
    (league_id, from_status, to_status, reason, note, changed_by)
  values (p_league_id, v_status, 'voided', coalesce(p_reason, 'created_by_mistake'), p_note, uid);

  begin
    insert into public.audit_log(actor_id, action, target_type, target_id, metadata)
    values (uid, 'league_voided', 'league', p_league_id,
            jsonb_build_object('owner', v_owner, 'reason', p_reason));
  exception when undefined_table then null; end;

  -- Voided leagues vanish from the recipient's normal surfaces (UI
  -- filter), but we still send the lifecycle notif so members know
  -- something happened — otherwise a silent disappear is confusing
  -- ("where did our league go?").
  perform public._emit_league_lifecycle_notifs(
    p_league_id, 'league_voided', uid,
    jsonb_build_object(
      'reason',      coalesce(p_reason, 'created_by_mistake'),
      'note',        p_note,
      'league_name', v_name
    )
  );
  perform public._resolve_pending_league_invites(p_league_id);
end;
$$;
revoke execute on function public.void_league(uuid, text, text) from public;
grant  execute on function public.void_league(uuid, text, text) to authenticated;

commit;
