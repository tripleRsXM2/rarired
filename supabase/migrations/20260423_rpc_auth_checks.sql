-- 20260423_rpc_auth_checks.sql
--
-- C15 — add auth.uid() checks to pre-existing SECURITY DEFINER RPCs that
-- were callable by any authenticated user against any data. These RPCs
-- were trusted to only be called via a controlled internal flow, but the
-- Supabase REST API exposes every public function to anyone holding the
-- anon key with a valid JWT.
--
-- Critical (patched here):
--   upsert_message_notification — could spoof message notifs (undoes C1).
--   apply_match_outcome / bump_stats_for_match / confirm_match_and_update_stats
--     — could trigger Elo + win/loss updates on matches the caller isn't part of.
--   recalculate_league_standings — DoS via repeated heavy recompute.
--
-- Low-risk (tightened anyway):
--   expire_stale_challenges / expire_stale_matches — restrict to cron/admin.

begin;

-- =========================================================================
-- upsert_message_notification — sender must be the caller AND a participant
-- of the conversation referenced by p_entity_id.
-- =========================================================================

create or replace function public.upsert_message_notification(
  p_user_id uuid, p_from_user_id uuid, p_entity_id uuid, p_metadata jsonb
) returns void
language plpgsql security definer set search_path = public as $$
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
    -- Caller must be a participant of the referenced conversation, and
    -- p_user_id must be the OTHER participant.
    if p_entity_id is null or not exists (
      select 1 from public.conversations c
      where c.id = p_entity_id
        and (
          (c.user1_id = uid and c.user2_id = p_user_id) or
          (c.user2_id = uid and c.user1_id = p_user_id)
        )
    ) then
      raise exception 'not a valid message notification for this conversation';
    end if;
    -- Silent no-op if recipient has blocked the caller.
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
end; $$;

revoke execute on function public.upsert_message_notification(uuid, uuid, uuid, jsonb) from public;
grant  execute on function public.upsert_message_notification(uuid, uuid, uuid, jsonb) to authenticated;

-- =========================================================================
-- apply_match_outcome — caller must be a party to the match, OR this is
-- being called from another security-definer function (session_user=postgres,
-- e.g. confirm_match_and_update_stats, bump_stats_for_match).
-- =========================================================================

create or replace function public.apply_match_outcome(p_match_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_submitter_id   uuid;
  v_opponent_id    uuid;
  v_tagged_user_id uuid;
  v_result         text;
  v_sub_rating     int;
  v_opp_rating     int;
  v_sub_played     int;
  v_opp_played     int;
  v_k_sub          int;
  v_k_opp          int;
  v_expected_sub   numeric;
  v_expected_opp   numeric;
  v_score_sub      numeric;
  v_score_opp      numeric;
  v_new_sub        int;
  v_new_opp        int;
begin
  select user_id, opponent_id, tagged_user_id, result
    into v_submitter_id, v_opponent_id, v_tagged_user_id, v_result
    from public.match_history
   where id::text = p_match_id;

  if not found then raise exception 'Match % not found', p_match_id; end if;

  -- Authorization: called directly by a client, caller must be a participant.
  -- session_user='postgres' bypass means "invoked from another SECURITY
  -- DEFINER function, which itself has already checked authorization."
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated'; end if;
    if uid not in (v_submitter_id, v_opponent_id, v_tagged_user_id) then
      raise exception 'not a party to this match';
    end if;
  end if;

  if v_opponent_id is null then return; end if;

  perform 1 from public.profiles
    where id in (v_submitter_id, v_opponent_id) order by id for update;

  select coalesce(ranking_points, 1000), coalesce(matches_played, 0)
    into v_sub_rating, v_sub_played from public.profiles where id = v_submitter_id;
  select coalesce(ranking_points, 1000), coalesce(matches_played, 0)
    into v_opp_rating, v_opp_played from public.profiles where id = v_opponent_id;

  v_k_sub := case when v_sub_played < 20 then 32 else 16 end;
  v_k_opp := case when v_opp_played < 20 then 32 else 16 end;

  v_expected_sub := 1.0 / (1.0 + power(10.0, (v_opp_rating - v_sub_rating) / 400.0));
  v_expected_opp := 1.0 - v_expected_sub;

  v_score_sub := case when v_result = 'win' then 1.0 else 0.0 end;
  v_score_opp := 1.0 - v_score_sub;

  v_new_sub := greatest(0, v_sub_rating + round(v_k_sub * (v_score_sub - v_expected_sub))::int);
  v_new_opp := greatest(0, v_opp_rating + round(v_k_opp * (v_score_opp - v_expected_opp))::int);

  update public.profiles set
    wins           = wins   + case when v_result = 'win'  then 1 else 0 end,
    losses         = losses + case when v_result = 'loss' then 1 else 0 end,
    matches_played = matches_played + 1,
    ranking_points = v_new_sub
  where id = v_submitter_id;

  update public.profiles set
    wins           = wins   + case when v_result = 'loss' then 1 else 0 end,
    losses         = losses + case when v_result = 'win'  then 1 else 0 end,
    matches_played = matches_played + 1,
    ranking_points = v_new_opp
  where id = v_opponent_id;
end; $$;

-- =========================================================================
-- bump_stats_for_match — thin wrapper. Authorize at this layer too so
-- direct callers can't sidestep apply_match_outcome's check by jumping
-- to this function (it's the one the client actually calls).
-- =========================================================================

create or replace function public.bump_stats_for_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  is_party boolean;
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated'; end if;
    select exists(
      select 1 from public.match_history m
      where m.id = p_match_id
        and (m.user_id = uid or m.opponent_id = uid or m.tagged_user_id = uid)
    ) into is_party;
    if not is_party then raise exception 'not a party to this match'; end if;
  end if;
  perform public.apply_match_outcome(p_match_id::text);
end; $$;

-- =========================================================================
-- confirm_match_and_update_stats — caller must be tagged_user or opponent.
-- (The submitter doesn't confirm their own match.)
-- =========================================================================

create or replace function public.confirm_match_and_update_stats(p_match_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_status text;
  v_opp uuid;
  v_tagged uuid;
begin
  select status, opponent_id, tagged_user_id
    into v_status, v_opp, v_tagged
    from public.match_history where id::text = p_match_id;
  if not found then raise exception 'Match % not found', p_match_id; end if;

  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated'; end if;
    if uid not in (v_opp, v_tagged) then
      raise exception 'only the opponent or tagged user can confirm this match';
    end if;
  end if;

  if v_status <> 'pending_confirmation' then
    raise exception 'Match % is not pending confirmation (status=%)', p_match_id, v_status;
  end if;

  update public.match_history set status = 'confirmed' where id::text = p_match_id;
  perform public.apply_match_outcome(p_match_id);
end; $$;

-- =========================================================================
-- recalculate_league_standings — wrap existing body with a caller-must-be-
-- a-member check. Body is left intact (big CTE) by creating a guard
-- function that calls the original renamed function.
-- =========================================================================

-- Rename the existing (no-check) function to *_inner; keep it as the
-- authoritative implementation. Create a new top-level function with the
-- same name that does the auth check then delegates.
do $rename$
begin
  if exists (select 1 from pg_proc p
             join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='recalculate_league_standings'
             and pg_get_function_arguments(p.oid) = 'p_league_id uuid')
  then
    alter function public.recalculate_league_standings(uuid)
      rename to recalculate_league_standings_inner;
  end if;
end
$rename$;

create or replace function public.recalculate_league_standings(p_league_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated'; end if;
    if not public._is_league_member(p_league_id, uid) then
      raise exception 'not a league member';
    end if;
  end if;
  perform public.recalculate_league_standings_inner(p_league_id);
end; $$;

-- Lock down the inner: only trigger/cron (postgres) calls it directly.
revoke execute on function public.recalculate_league_standings_inner(uuid) from public;
revoke execute on function public.recalculate_league_standings_inner(uuid) from authenticated;

-- =========================================================================
-- expire_stale_challenges / expire_stale_matches — restrict to cron/admin.
-- These are meant to be run by pg_cron, not from the client.
-- =========================================================================

revoke execute on function public.expire_stale_challenges() from public;
revoke execute on function public.expire_stale_challenges() from authenticated;
revoke execute on function public.expire_stale_matches()    from public;
revoke execute on function public.expire_stale_matches()    from authenticated;

commit;
