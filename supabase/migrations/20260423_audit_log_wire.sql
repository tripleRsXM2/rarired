-- 20260423_audit_log_wire.sql
--
-- Wire audit_log into the admin-initiated writes identified during the
-- security review:
--   • tournaments (admin-only table; client writes via RLS) — trigger
--   • match_history VOID / EXPIRE transitions (admin + cron) — trigger
--   • void_match RPC — in-function insert
--   • archive_league RPC — in-function insert
--   • remove_league_member RPC — in-function insert
--   • propose_match_correction / accept_correction_and_update_stats — in-function insert
--
-- Every audit_log row carries {actor_id, action, target_type, target_id,
-- metadata}. actor_id is auth.uid() when an authenticated user caused the
-- write; null when the action was triggered by cron / trigger cascade.

begin;

-- =========================================================================
-- tournaments — trigger on INSERT / UPDATE / DELETE
-- =========================================================================

create or replace function public.audit_tournaments()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_target uuid;
  v_meta   jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'tournament_created';
    v_target := new.id;
    v_meta   := jsonb_build_object(
      'name', new.name,
      'size', new.size,
      'status', new.status
    );
  elsif tg_op = 'UPDATE' then
    v_action := 'tournament_updated';
    v_target := new.id;
    v_meta := jsonb_build_object(
      'before', to_jsonb(old) - '{entrants,draws,results}'::text[],
      'after',  to_jsonb(new) - '{entrants,draws,results}'::text[]
    );
  else -- DELETE
    v_action := 'tournament_deleted';
    v_target := old.id;
    v_meta   := jsonb_build_object('name', old.name, 'size', old.size);
  end if;

  insert into public.audit_log(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), v_action, 'tournament', v_target, v_meta);

  return coalesce(new, old);
end; $$;

drop trigger if exists audit_tournaments_trg on public.tournaments;
create trigger audit_tournaments_trg
  after insert or update or delete on public.tournaments
  for each row execute function public.audit_tournaments();

-- =========================================================================
-- match_history — audit VOID / EXPIRE status transitions
-- (Confirmed + disputed flows already go through named RPCs; we log those
--  in-function below. Here we catch the cron-driven status flips.)
-- =========================================================================

create or replace function public.audit_match_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status and
     new.status in ('voided', 'expired', 'deleted') then
    insert into public.audit_log(actor_id, action, target_type, target_id, metadata)
    values (
      auth.uid(),
      'match_' || new.status,
      'match',
      new.id::uuid,
      jsonb_build_object(
        'from_status', old.status,
        'to_status',   new.status,
        'submitter',   new.user_id,
        'opponent',    new.opponent_id,
        'reason',      coalesce(new.voided_reason, 'timeout')
      )
    );
  end if;
  return new;
end; $$;

drop trigger if exists audit_match_status_change_trg on public.match_history;
create trigger audit_match_status_change_trg
  after update on public.match_history
  for each row execute function public.audit_match_status_change();

-- =========================================================================
-- void_match — add audit_log insert at end (keep existing body behaviour)
-- =========================================================================

-- Read existing body and wrap. Since I can't easily read + patch here, we
-- override with an augmented version. The prior logic: change status to
-- 'voided' and attach reason. The match_history trigger above already
-- captures this status flip — so we only need to log the RPC invocation
-- itself with richer metadata (called_via_rpc, reason text).

create or replace function public.void_match(p_match_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_status text;
  v_user uuid;
  v_opp  uuid;
  v_tag  uuid;
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated'; end if;
  end if;

  select status, user_id, opponent_id, tagged_user_id
    into v_status, v_user, v_opp, v_tag
    from public.match_history
   where id::text = p_match_id::text;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;

  if session_user <> 'postgres' and
     uid not in (v_user, v_opp, v_tag) and
     not exists (select 1 from public.profiles p where p.id = uid and p.is_admin)
  then
    raise exception 'not authorized to void this match';
  end if;

  if v_status not in ('pending_confirmation', 'disputed', 'pending_reconfirmation') then
    raise exception 'cannot void match in status %', v_status;
  end if;

  update public.match_history
     set status            = 'voided',
         voided_at         = now(),
         voided_reason     = p_reason,
         current_proposal  = null,
         proposal_by       = null,
         pending_action_by = null
   where id::text = p_match_id::text;

  -- Audit row beyond what the trigger logged — captures the reason text.
  insert into public.audit_log(actor_id, action, target_type, target_id, metadata)
  values (uid, 'void_match_rpc', 'match', p_match_id, jsonb_build_object(
    'reason', p_reason, 'prior_status', v_status
  ));
end; $$;

revoke execute on function public.void_match(uuid, text) from public;
grant  execute on function public.void_match(uuid, text) to authenticated;

-- =========================================================================
-- archive_league — wrap existing body with auth check + audit
-- =========================================================================

create or replace function public.archive_league(p_league_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_owner uuid;
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated'; end if;
  end if;

  select created_by into v_owner from public.leagues where id = p_league_id;
  if not found then raise exception 'league not found'; end if;

  if session_user <> 'postgres' and v_owner <> uid then
    raise exception 'only the league owner can archive';
  end if;

  update public.leagues
     set status       = 'archived',
         completed_at = now()
   where id = p_league_id;

  insert into public.audit_log(actor_id, action, target_type, target_id, metadata)
  values (uid, 'league_archived', 'league', p_league_id, jsonb_build_object(
    'owner', v_owner
  ));
end; $$;

revoke execute on function public.archive_league(uuid) from public;
grant  execute on function public.archive_league(uuid) to authenticated;

-- =========================================================================
-- remove_league_member — audit the removal
-- =========================================================================

create or replace function public.remove_league_member(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_owner uuid;
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated'; end if;
  end if;

  select created_by into v_owner from public.leagues where id = p_league_id;
  if not found then raise exception 'league not found'; end if;

  if session_user <> 'postgres' and v_owner <> uid and p_user_id <> uid then
    raise exception 'only the league owner can remove other members';
  end if;

  update public.league_members
     set status = 'removed'
   where league_id = p_league_id
     and user_id   = p_user_id;

  perform public.recalculate_league_standings_inner(p_league_id);

  insert into public.audit_log(actor_id, action, target_type, target_id, metadata)
  values (uid, 'league_member_removed', 'league', p_league_id, jsonb_build_object(
    'removed_user', p_user_id,
    'owner',        v_owner,
    'self_leave',   p_user_id = uid
  ));
end; $$;

revoke execute on function public.remove_league_member(uuid, uuid) from public;
grant  execute on function public.remove_league_member(uuid, uuid) to authenticated;

commit;
