-- Module 5 — replace the linear placeholder formula with real ELO.
--
-- Old: ranking_points = max(0, 1000 + wins*15 - losses*10)
-- New: standard ELO with K-factor that drops from 32 (provisional, first
--      20 confirmed matches) to 16 (settled). Opponent strength matters.
--
-- Both functions that updated stats are rewritten to delegate to a single
-- source of truth: apply_match_outcome(p_match_id). bump_stats_for_match
-- and confirm_match_and_update_stats both call it. This guarantees the
-- formula lives in exactly one place.
--
-- Idempotent. No schema additions — uses existing profiles columns.

create or replace function public.apply_match_outcome(p_match_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submitter_id   uuid;
  v_opponent_id    uuid;
  v_result         text;            -- result in submitter's frame: 'win' | 'loss'
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
  -- Read the match. Casual matches (no opponent_id) are no-ops here.
  select user_id, opponent_id, result
    into v_submitter_id, v_opponent_id, v_result
    from match_history
   where id = p_match_id;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;
  if v_opponent_id is null then
    return;  -- casual, no rating impact ever
  end if;

  -- Lock both profile rows for the duration of the update so concurrent
  -- match confirmations on the same player can't race each other.
  -- ORDER BY id to avoid deadlocks when two matches involving the same
  -- two players resolve simultaneously.
  perform 1
    from profiles
   where id in (v_submitter_id, v_opponent_id)
   order by id
   for update;

  select coalesce(ranking_points, 1000), coalesce(matches_played, 0)
    into v_sub_rating, v_sub_played
    from profiles where id = v_submitter_id;

  select coalesce(ranking_points, 1000), coalesce(matches_played, 0)
    into v_opp_rating, v_opp_played
    from profiles where id = v_opponent_id;

  -- Provisional K-factor: 32 for first 20 matches, then 16. Each player's
  -- K is independent — a settled vet vs a brand-new player both move at
  -- their own appropriate pace.
  v_k_sub := case when v_sub_played < 20 then 32 else 16 end;
  v_k_opp := case when v_opp_played < 20 then 32 else 16 end;

  -- Expected score for each side based on rating diff.
  v_expected_sub := 1.0 / (1.0 + power(10.0, (v_opp_rating - v_sub_rating) / 400.0));
  v_expected_opp := 1.0 - v_expected_sub;

  -- Actual score: 1 for win, 0 for loss. Result is in submitter's frame.
  v_score_sub := case when v_result = 'win' then 1.0 else 0.0 end;
  v_score_opp := 1.0 - v_score_sub;

  v_new_sub := greatest(0, v_sub_rating + round(v_k_sub * (v_score_sub - v_expected_sub))::int);
  v_new_opp := greatest(0, v_opp_rating + round(v_k_opp * (v_score_opp - v_expected_opp))::int);

  -- Submitter row
  update profiles set
    wins           = wins   + case when v_result = 'win'  then 1 else 0 end,
    losses         = losses + case when v_result = 'loss' then 1 else 0 end,
    matches_played = matches_played + 1,
    ranking_points = v_new_sub
  where id = v_submitter_id;

  -- Opponent row (result inverted)
  update profiles set
    wins           = wins   + case when v_result = 'loss' then 1 else 0 end,
    losses         = losses + case when v_result = 'win'  then 1 else 0 end,
    matches_played = matches_played + 1,
    ranking_points = v_new_opp
  where id = v_opponent_id;
end;
$$;

grant execute on function public.apply_match_outcome(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Wrappers — keep prior call signatures so existing client code keeps working.
-- ─────────────────────────────────────────────────────────────────────────

-- bump_stats_for_match(uuid): legacy uuid-param wrapper used by
-- accept_correction_and_update_stats.
create or replace function public.bump_stats_for_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_match_outcome(p_match_id::text);
end;
$$;

grant execute on function public.bump_stats_for_match(uuid) to authenticated;

-- confirm_match_and_update_stats(text): direct-confirm path. Re-create
-- preserving its existing responsibilities (status flip + stats), but
-- delegate the math to apply_match_outcome.
create or replace function public.confirm_match_and_update_stats(p_match_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from match_history where id = p_match_id;
  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;
  if v_status <> 'pending_confirmation' then
    raise exception 'Match % is not pending confirmation (status=%)', p_match_id, v_status;
  end if;

  update match_history
     set status = 'confirmed'
   where id = p_match_id;

  perform public.apply_match_outcome(p_match_id);
end;
$$;

grant execute on function public.confirm_match_and_update_stats(text) to authenticated;
