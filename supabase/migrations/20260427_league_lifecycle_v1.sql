-- 20260427_league_lifecycle_v1.sql
--
-- Module 12 (Slice 1) — League lifecycle + standings lock foundation.
--
-- Replaces today's three-status world (active / completed / archived,
-- where only active and archived are actually written) with the locked
-- five-status model from product:
--
--   active     — currently running, accepts league matches
--   completed  — finished properly, FINAL standings locked
--   archived   — old, kept for history; standings frozen but not "final"
--   cancelled  — stopped before completion; standings incomplete
--   voided     — wrong setup / test / integrity issue; hidden from
--                normal surfaces; matches stay in personal history
--
-- NO UI changes in this slice. Existing UI keeps rendering all leagues
-- (still legal — it just won't yet split Active vs Past). Slice 2
-- swaps the panel + adds the lifecycle menu + modals + docs.
--
-- Locked rules from product sign-off (incorporate before coding):
--
--   1. completed_at is ONLY set when status='completed'. archive /
--      cancel / void use status_changed_at instead. Existing archived
--      rows get their completed_at copied to status_changed_at and
--      then NULLed.
--
--   2. Standings freeze uses standings_locked_at (the recalc guard).
--      is_final + finalized_at are a separate "this is the FINAL
--      table" signal that only complete_league sets. Archive / cancel
--      / void freeze without claiming final.
--
--   3. void_league is owner-only AND only valid from status='active'.
--      Voiding a completed/archived/cancelled league is admin/support
--      only and deferred to a follow-up. Two-step confirm UX in Slice 2.
--
--   4. status_reason CHECK constrains the allowed enum.
--
--   5. league_status_events has RLS — members + creator can SELECT;
--      INSERT/UPDATE/DELETE blocked at the policy level (RPCs only,
--      SECURITY DEFINER bypasses).
--
--   6. recalc guard: if any standings row has standings_locked_at set,
--      recalculate_league_standings_inner returns immediately. Belt-
--      and-braces on top of validate_match_league's "active-only"
--      gate, since voided leagues pass the active gate at the moment
--      of insert and only become voided afterwards.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Status CHECK widening
-- ─────────────────────────────────────────────────────────────────────

alter table public.leagues drop constraint if exists leagues_status_check;
alter table public.leagues add constraint leagues_status_check
  check (status in ('active','completed','archived','cancelled','voided'));

-- ─────────────────────────────────────────────────────────────────────
-- 2. Lifecycle metadata columns on leagues
-- ─────────────────────────────────────────────────────────────────────

alter table public.leagues
  add column if not exists status_reason     text,
  add column if not exists status_note       text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references auth.users(id);

-- status_reason allowed enum (CHECK — easy + cheap; better than RPC-only validation)
alter table public.leagues drop constraint if exists leagues_status_reason_check;
alter table public.leagues add constraint leagues_status_reason_check check (
  status_reason is null
  or status_reason in (
    'season_finished','inactive','cancelled_by_creator',
    'created_by_mistake','wrong_rules','wrong_players',
    'integrity_issue','test_league','other'
  )
);

-- ─────────────────────────────────────────────────────────────────────
-- 3. Standings freeze + final-snapshot fields
-- ─────────────────────────────────────────────────────────────────────
--
--   standings_locked_at — recalc guard. Set on every transition out
--                         of active. Cleared by a future reopen RPC
--                         (out of V1 scope).
--   is_final            — true ONLY when complete_league fires.
--                         Distinct from standings_locked_at: archived
--                         and cancelled freeze without claiming the
--                         table is final.
--   finalized_at        — companion timestamp for is_final.

alter table public.league_standings
  add column if not exists standings_locked_at timestamptz,
  add column if not exists is_final            boolean not null default false,
  add column if not exists finalized_at        timestamptz;

-- ─────────────────────────────────────────────────────────────────────
-- 4. league_status_events audit table
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.league_status_events (
  id          uuid primary key default extensions.gen_random_uuid(),
  league_id   uuid not null references public.leagues(id) on delete cascade,
  from_status text not null,
  to_status   text not null,
  reason      text,
  note        text,
  changed_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_lse_league on public.league_status_events (league_id, created_at desc);

alter table public.league_status_events enable row level security;

-- SELECT: members of the league + the creator. Lifecycle history is
-- private to people who participated.
drop policy if exists lse_select_member on public.league_status_events;
create policy lse_select_member on public.league_status_events
  for select using (
    exists (
      select 1 from public.league_members lm
      where lm.league_id = league_status_events.league_id
        and lm.user_id   = auth.uid()
        and lm.status in ('invited','active')
    )
    or exists (
      select 1 from public.leagues l
      where l.id = league_status_events.league_id
        and l.created_by = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: BLOCKED at the policy layer. Only the
-- SECURITY DEFINER lifecycle RPCs write here, and service_role
-- bypass handles admin paths.

-- ─────────────────────────────────────────────────────────────────────
-- 5. Backfill: clean up existing 'archived' rows under the new model
-- ─────────────────────────────────────────────────────────────────────
--
-- Per product rule: completed_at means COMPLETED. Existing archived
-- rows have completed_at incorrectly set by the legacy archive_league
-- RPC. Move that timestamp to status_changed_at and NULL the legacy
-- column on those rows.

update public.leagues
set status_changed_at = completed_at,
    status_reason     = 'inactive',
    status_changed_by = created_by,
    completed_at      = null
where status = 'archived'
  and status_changed_at is null;

-- Insert historical league_status_events for those archived rows so
-- the audit table has a starting point. One row per league.
insert into public.league_status_events
  (league_id, from_status, to_status, reason, changed_by, created_at)
select id, 'active', 'archived', 'inactive', created_by, status_changed_at
from public.leagues l
where l.status = 'archived'
  and l.status_changed_at is not null
  and not exists (
    select 1 from public.league_status_events e
    where e.league_id = l.id
  );

-- Lock standings for any league that's already non-active. We don't
-- have the historical "moment of completion" for those rows — best
-- effort: stamp standings_locked_at with status_changed_at if known,
-- else now() so the recalc guard fires.
update public.league_standings ls
set standings_locked_at = coalesce(l.status_changed_at, now())
from public.leagues l
where ls.league_id = l.id
  and l.status <> 'active'
  and ls.standings_locked_at is null;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Recalc guard — early-return when standings are frozen
-- ─────────────────────────────────────────────────────────────────────
--
-- We extend recalculate_league_standings_inner with a single-line
-- guard at the top. Body otherwise unchanged from
-- 20260426_leagues_v1_foundation.sql.
--
-- Belt-and-braces: validate_match_league rejects new matches into
-- non-active leagues, but a future void_league call could fire after
-- a match was already pending recalc. The guard is the safe net.

create or replace function public.recalculate_league_standings_inner(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league public.leagues%rowtype;
begin
  select * into v_league from public.leagues where id = p_league_id;
  if not found then return; end if;

  -- ── Slice 1 lifecycle guard ───────────────────────────────────────
  -- If the standings have been frozen by any lifecycle transition,
  -- never recompute. This preserves completed leagues' final tables
  -- AND keeps cancelled / archived / voided leagues' standings stable
  -- so members can still view the snapshot at the moment the league
  -- left active state.
  if exists (
    select 1 from public.league_standings
    where league_id = p_league_id and standings_locked_at is not null
  ) then
    return;
  end if;

  delete from public.league_standings where league_id = p_league_id;

  with active_members as (
    select user_id
    from public.league_members
    where league_id = p_league_id and status = 'active'
  ),
  eligible_matches as (
    select m.*
    from public.match_history m
    where m.league_id = p_league_id
      and m.status = 'confirmed'
      and m.user_id     in (select user_id from active_members)
      and m.opponent_id in (select user_id from active_members)
  ),
  per_player as (
    -- Submitter side
    select
      m.user_id                                    as player_id,
      m.id                                         as match_id,
      m.confirmed_at                               as confirmed_at,
      case when m.result = 'win'  then 1 else 0 end as is_win,
      case when m.result = 'loss' then 1 else 0 end as is_loss,
      case when m.result = 'win'  then 'win'
           when m.result = 'loss' then 'loss'
           else null end                           as last_result_text,
      coalesce((select count(*) from jsonb_array_elements(m.sets) s
                 where nullif(s->>'you', '')::int > nullif(s->>'them', '')::int), 0) as sets_won,
      coalesce((select count(*) from jsonb_array_elements(m.sets) s
                 where nullif(s->>'you', '')::int < nullif(s->>'them', '')::int), 0) as sets_lost,
      coalesce((select sum(nullif(s->>'you', '')::int)  from jsonb_array_elements(m.sets) s), 0) as games_won,
      coalesce((select sum(nullif(s->>'them', '')::int) from jsonb_array_elements(m.sets) s), 0) as games_lost
    from eligible_matches m

    union all

    -- Opponent side (mirror)
    select
      m.opponent_id                                 as player_id,
      m.id                                          as match_id,
      m.confirmed_at                                as confirmed_at,
      case when m.result = 'loss' then 1 else 0 end as is_win,
      case when m.result = 'win'  then 1 else 0 end as is_loss,
      case when m.result = 'loss' then 'win'
           when m.result = 'win'  then 'loss'
           else null end                            as last_result_text,
      coalesce((select count(*) from jsonb_array_elements(m.sets) s
                 where nullif(s->>'them', '')::int > nullif(s->>'you', '')::int), 0) as sets_won,
      coalesce((select count(*) from jsonb_array_elements(m.sets) s
                 where nullif(s->>'them', '')::int < nullif(s->>'you', '')::int), 0) as sets_lost,
      coalesce((select sum(nullif(s->>'them', '')::int) from jsonb_array_elements(m.sets) s), 0) as games_won,
      coalesce((select sum(nullif(s->>'you', '')::int)  from jsonb_array_elements(m.sets) s), 0) as games_lost
    from eligible_matches m
  ),
  aggregated as (
    select
      p.player_id,
      count(*)                                                   as played,
      sum(p.is_win)                                              as wins,
      sum(p.is_loss)                                             as losses,
      sum(p.is_win)  * v_league.win_points
        + sum(p.is_loss) * v_league.loss_points                  as points,
      sum(p.sets_won)                                            as sets_won,
      sum(p.sets_lost)                                           as sets_lost,
      sum(p.games_won)                                           as games_won,
      sum(p.games_lost)                                          as games_lost,
      sum(p.sets_won)  - sum(p.sets_lost)                        as set_difference,
      sum(p.games_won) - sum(p.games_lost)                       as game_difference,
      (
        select p2.last_result_text
        from per_player p2
        where p2.player_id = p.player_id
        order by p2.confirmed_at desc nulls last, p2.match_id desc
        limit 1
      )                                                          as last_result
    from per_player p
    group by p.player_id
  ),
  all_members as (
    select am.user_id as player_id
    from active_members am
  ),
  filled as (
    select
      am.player_id,
      coalesce(a.played,         0)  as played,
      coalesce(a.wins,           0)  as wins,
      coalesce(a.losses,         0)  as losses,
      coalesce(a.points,         0)  as points,
      coalesce(a.sets_won,       0)  as sets_won,
      coalesce(a.sets_lost,      0)  as sets_lost,
      coalesce(a.games_won,      0)  as games_won,
      coalesce(a.games_lost,     0)  as games_lost,
      coalesce(a.set_difference, 0)  as set_difference,
      coalesce(a.game_difference,0)  as game_difference,
      a.last_result
    from all_members am
    left join aggregated a on a.player_id = am.player_id
  ),
  ranked as (
    select
      f.*,
      row_number() over (
        order by
          f.points          desc,
          f.set_difference  desc,
          f.game_difference desc,
          f.player_id       asc
      ) as rank
    from filled f
  )
  insert into public.league_standings (
    league_id, user_id,
    played, wins, losses, points,
    sets_won, sets_lost, games_won, games_lost,
    set_difference, game_difference,
    last_result, rank, updated_at
  )
  select
    p_league_id, r.player_id,
    r.played, r.wins, r.losses, r.points,
    r.sets_won, r.sets_lost, r.games_won, r.games_lost,
    r.set_difference, r.game_difference,
    r.last_result, r.rank, now()
  from ranked r;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Lifecycle RPCs
-- ─────────────────────────────────────────────────────────────────────
--
-- Common shape for every transition:
--   1. Auth check (auth.uid() not null; postgres bypass for service role)
--   2. Verify caller is the league owner
--   3. Verify source status is allowed for this transition
--   4. Lock standings (set standings_locked_at on every row)
--   5. Update leagues row: status, status_changed_at, status_changed_by,
--      status_reason, status_note. completed_at ONLY for complete_league.
--   6. Insert league_status_events row
--   7. Audit log (existing pattern from archive_league)

-- Helper: lock standings for a league. Idempotent — only stamps rows
-- that aren't already locked.
create or replace function public._lock_league_standings(p_league_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.league_standings
  set standings_locked_at = now()
  where league_id = p_league_id and standings_locked_at is null;
$$;
revoke all on function public._lock_league_standings(uuid) from public, anon, authenticated;

-- ── complete_league ──────────────────────────────────────────────────
-- Allowed source: 'active'. Sets completed_at + is_final + finalized_at.
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
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated' using errcode='42501'; end if;
  end if;

  select created_by, status into v_owner, v_status
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

  -- Audit log emit (mirrors existing archive_league pattern)
  begin
    insert into public.audit_log(actor_id, action, target_type, target_id, metadata)
    values (uid, 'league_completed', 'league', p_league_id,
            jsonb_build_object('owner', v_owner, 'reason', p_reason));
  exception when undefined_table then null; end;
end;
$$;
revoke execute on function public.complete_league(uuid, text, text) from public;
grant  execute on function public.complete_league(uuid, text, text) to authenticated;

-- ── archive_league (extended) ────────────────────────────────────────
-- Allowed source: 'active' OR 'completed'. NO completed_at write.
--
-- The legacy 1-arg signature (archive_league(uuid)) from
-- 20260423_audit_log_wire.sql is dropped here. The 3-arg version below
-- has defaults on every trailing arg, so existing 1-arg call sites
-- (`archive_league(v_id)`) resolve cleanly to the new function. Keeping
-- both signatures triggers a `function is not unique` overload-
-- ambiguity error at call time, so the 1-arg overload must be dropped
-- before recreating the function.
drop function if exists public.archive_league(uuid);

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
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated' using errcode='42501'; end if;
  end if;

  select created_by, status into v_owner, v_status
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
      -- IMPORTANT: do NOT set completed_at here. completed_at means
      -- COMPLETED. Archive can happen from either active or completed;
      -- if from completed, completed_at is already set. If from active,
      -- the league was never completed and completed_at must stay null.
  where id = p_league_id;

  insert into public.league_status_events
    (league_id, from_status, to_status, reason, note, changed_by)
  values (p_league_id, v_status, 'archived', coalesce(p_reason, 'inactive'), p_note, uid);

  begin
    insert into public.audit_log(actor_id, action, target_type, target_id, metadata)
    values (uid, 'league_archived', 'league', p_league_id,
            jsonb_build_object('owner', v_owner, 'reason', p_reason));
  exception when undefined_table then null; end;
end;
$$;
revoke execute on function public.archive_league(uuid, text, text) from public;
grant  execute on function public.archive_league(uuid, text, text) to authenticated;

-- ── cancel_league ────────────────────────────────────────────────────
-- Allowed source: 'active'. Standings frozen but NOT marked final.
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
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated' using errcode='42501'; end if;
  end if;

  select created_by, status into v_owner, v_status
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
end;
$$;
revoke execute on function public.cancel_league(uuid, text, text) from public;
grant  execute on function public.cancel_league(uuid, text, text) to authenticated;

-- ── void_league (active-only in V1) ──────────────────────────────────
-- Owner can ONLY void a league while it's still active. Voiding a
-- completed/archived/cancelled league requires admin/support and is
-- deferred to a follow-up (per product sign-off).
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
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated' using errcode='42501'; end if;
  end if;

  select created_by, status into v_owner, v_status
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
end;
$$;
revoke execute on function public.void_league(uuid, text, text) from public;
grant  execute on function public.void_league(uuid, text, text) to authenticated;

commit;
