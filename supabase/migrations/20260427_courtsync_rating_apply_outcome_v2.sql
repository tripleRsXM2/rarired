-- 20260427_courtsync_rating_apply_outcome_v2.sql
--
-- Module 7.7 — rewrite apply_match_outcome to use the new
-- CourtSync Rating rules.
--
-- Changes vs the v1 ELO migration (20260424_real_elo.sql):
--
-- 1. K-factor table:
--      old: matches_played < 20 → 32, else 16
--      new: confirmed_ranked_match_count
--             0–2 → 40 (provisional, calibrating fast)
--             3–4 → 32 (provisional, calibrating slow)
--             5+  → 24 (established)
--    Each player applies their own K (asymmetric movement preserved
--    so a provisional winner moves more than an established loser).
--
-- 2. Increments confirmed_ranked_match_count + sets rating_status
--    based on the new threshold (5 confirmed → established).
--
-- 3. Auto-locks skill_level on first confirmed ranked match per player
--    (the user's chosen self-rating freezes once they've actually
--    started playing matches the system can rate).
--
-- 4. Derives the displayed `skill` column from the new
--    ranking_points using the rating-band table, with hysteresis on
--    demotion (50-point buffer below the current band's floor).
--    Promotion is immediate.
--
-- The opponent-strength formula itself is unchanged — already standard
-- Elo expected score — but K is now opponent-strength-asymmetric for
-- free because each player's K is computed independently.
--
-- Casual matches still short-circuit (no opponent_id). Mirrors the JS
-- isRatingEligibleMatch + getKFactor + getDisplayedSkillLevelFromRating
-- helpers in src/features/rating/utils/ratingSystem.js.

create or replace function public.apply_match_outcome(p_match_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submitter_id    uuid;
  v_opponent_id     uuid;
  v_result          text;
  v_match_type      text;

  v_sub_rating      int;
  v_opp_rating      int;
  v_sub_count       int;
  v_opp_count       int;
  v_sub_skill       text;
  v_opp_skill       text;
  v_sub_locked      boolean;
  v_opp_locked      boolean;

  v_k_sub           int;
  v_k_opp           int;
  v_expected_sub    numeric;
  v_expected_opp    numeric;
  v_score_sub       numeric;
  v_score_opp       numeric;
  v_new_sub         int;
  v_new_opp         int;
  v_sub_count_new   int;
  v_opp_count_new   int;
  v_sub_skill_new   text;
  v_opp_skill_new   text;
  v_sub_status_new  text;
  v_opp_status_new  text;
begin
  -- Read the match. Casual matches (no opponent_id) are no-ops here.
  select user_id, opponent_id, result, match_type
    into v_submitter_id, v_opponent_id, v_result, v_match_type
    from match_history
   where id = p_match_id;

  if not found then
    raise exception 'apply_match_outcome: match % not found', p_match_id;
  end if;

  -- Eligibility short-circuits. Mirrors isRatingEligibleMatch in the JS
  -- utility. completion_type is best-effort (column may not exist on
  -- legacy rows yet — Slice E left it as a client-side construct
  -- for now, so we don't reference it here. If/when it lands as a
  -- DB column, exclude time_limited / retired here too).
  if v_opponent_id is null then
    return;  -- casual, no rating impact
  end if;
  if v_match_type is not null and v_match_type <> 'ranked' then
    return;
  end if;

  -- Lock both profile rows in id-order to avoid deadlocks on
  -- simultaneous match confirmations involving the same pair.
  perform 1
    from profiles
   where id in (v_submitter_id, v_opponent_id)
   order by id
   for update;

  -- Pull the current values for both players. coalesce() everything
  -- so a fresh profile (rating_status default = 'provisional',
  -- count default = 0) doesn't trip null arithmetic.
  select coalesce(ranking_points, 1000),
         coalesce(confirmed_ranked_match_count, 0),
         coalesce(skill, ''),
         coalesce(skill_level_locked, false)
    into v_sub_rating, v_sub_count, v_sub_skill, v_sub_locked
    from profiles where id = v_submitter_id;

  select coalesce(ranking_points, 1000),
         coalesce(confirmed_ranked_match_count, 0),
         coalesce(skill, ''),
         coalesce(skill_level_locked, false)
    into v_opp_rating, v_opp_count, v_opp_skill, v_opp_locked
    from profiles where id = v_opponent_id;

  -- New K table (mirrors getKFactor in ratingSystem.js).
  v_k_sub := case
    when v_sub_count >= 5 then 24
    when v_sub_count >= 3 then 32
    else                       40
  end;
  v_k_opp := case
    when v_opp_count >= 5 then 24
    when v_opp_count >= 3 then 32
    else                       40
  end;

  -- Standard Elo expected-score (opponent-strength weighted). Each
  -- player's K applied to their own (actual - expected) delta gives the
  -- asymmetric provisional/established movement.
  v_expected_sub := 1.0 / (1.0 + power(10.0, (v_opp_rating - v_sub_rating) / 400.0));
  v_expected_opp := 1.0 - v_expected_sub;

  v_score_sub := case when v_result = 'win' then 1.0 else 0.0 end;
  v_score_opp := 1.0 - v_score_sub;

  v_new_sub := greatest(0, v_sub_rating + round(v_k_sub * (v_score_sub - v_expected_sub))::int);
  v_new_opp := greatest(0, v_opp_rating + round(v_k_opp * (v_score_opp - v_expected_opp))::int);

  -- Counter increments + rating-status transition.
  v_sub_count_new := v_sub_count + 1;
  v_opp_count_new := v_opp_count + 1;
  v_sub_status_new := case when v_sub_count_new >= 5 then 'established' else 'provisional' end;
  v_opp_status_new := case when v_opp_count_new >= 5 then 'established' else 'provisional' end;

  -- Derived displayed skill, with hysteresis on demotion only.
  -- Mirrors getDisplayedSkillLevelFromRating in ratingSystem.js.
  v_sub_skill_new := public._derive_displayed_skill(v_new_sub, v_sub_skill);
  v_opp_skill_new := public._derive_displayed_skill(v_new_opp, v_opp_skill);

  -- Submitter row.
  update profiles set
    wins                          = wins   + case when v_result = 'win'  then 1 else 0 end,
    losses                        = losses + case when v_result = 'loss' then 1 else 0 end,
    matches_played                = matches_played + 1,
    ranking_points                = v_new_sub,
    confirmed_ranked_match_count  = v_sub_count_new,
    rating_status                 = v_sub_status_new,
    skill                         = v_sub_skill_new,
    -- Auto-lock skill on first rating-eligible confirmed match.
    skill_level_locked            = v_sub_locked or v_sub_count_new >= 1,
    skill_level_locked_at         = case
      when v_sub_locked then skill_level_locked_at
      when v_sub_count_new >= 1 then now()
      else null
    end
  where id = v_submitter_id;

  -- Opponent row (result inverted).
  update profiles set
    wins                          = wins   + case when v_result = 'loss' then 1 else 0 end,
    losses                        = losses + case when v_result = 'win'  then 1 else 0 end,
    matches_played                = matches_played + 1,
    ranking_points                = v_new_opp,
    confirmed_ranked_match_count  = v_opp_count_new,
    rating_status                 = v_opp_status_new,
    skill                         = v_opp_skill_new,
    skill_level_locked            = v_opp_locked or v_opp_count_new >= 1,
    skill_level_locked_at         = case
      when v_opp_locked then skill_level_locked_at
      when v_opp_count_new >= 1 then now()
      else null
    end
  where id = v_opponent_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- Helper: displayed-skill derivation with hysteresis
-- ─────────────────────────────────────────────────────────────────────
--
-- Mirrors getDisplayedSkillLevelFromRating. Promotion: immediate the
-- moment rating crosses next band's floor. Demotion: only if rating
-- drops more than 50 points below the previous band's floor. If
-- prev_skill is empty / unknown, snap to whichever band contains the
-- new rating with no buffer.

create or replace function public._derive_displayed_skill(p_rating int, p_prev_skill text)
returns text
language plpgsql
immutable
as $$
declare
  v_new_skill text;
  v_prev_min  int;
  v_new_min   int;
begin
  -- Find the band containing p_rating.
  v_new_skill := case
    when p_rating < 900  then 'Beginner 1'
    when p_rating < 1100 then 'Beginner 2'
    when p_rating < 1300 then 'Intermediate 1'
    when p_rating < 1500 then 'Intermediate 2'
    when p_rating < 1700 then 'Advanced 1'
    else                      'Advanced 2'
  end;

  -- No previous skill on file → snap.
  if p_prev_skill is null or p_prev_skill = '' or p_prev_skill = v_new_skill then
    return v_new_skill;
  end if;

  v_prev_min := case p_prev_skill
    when 'Beginner 1'     then 0
    when 'Beginner 2'     then 900
    when 'Intermediate 1' then 1100
    when 'Intermediate 2' then 1300
    when 'Advanced 1'     then 1500
    when 'Advanced 2'     then 1700
    else                       null
  end;

  v_new_min := case v_new_skill
    when 'Beginner 1'     then 0
    when 'Beginner 2'     then 900
    when 'Intermediate 1' then 1100
    when 'Intermediate 2' then 1300
    when 'Advanced 1'     then 1500
    when 'Advanced 2'     then 1700
    else                       null
  end;

  -- If prev_min is unrecognised (legacy free-text skill) → snap.
  if v_prev_min is null then
    return v_new_skill;
  end if;

  -- Hysteresis on demotion only. If the new band is below the
  -- previous one and rating is within 50 of the previous floor,
  -- stay put.
  if v_new_min < v_prev_min and p_rating > v_prev_min - 50 then
    return p_prev_skill;
  end if;

  return v_new_skill;
end;
$$;

revoke all on function public._derive_displayed_skill(int, text) from public, anon, authenticated;
grant execute on function public.apply_match_outcome(text) to authenticated;

comment on function public._derive_displayed_skill(int, text) is
  'Module 7.7. Returns the displayed skill level for a given rating, with hysteresis on demotion. Mirrors getDisplayedSkillLevelFromRating in src/features/rating/utils/ratingSystem.js.';
comment on function public.apply_match_outcome(text) is
  'Module 7.7 (rewrite). Standard Elo with new K-table (40/32/24 by confirmed_ranked_match_count). Auto-locks skill_level on first confirmed ranked match. Derives displayed skill from new rating using band table + 50pt hysteresis. Casual + non-ranked rows are no-ops.';
