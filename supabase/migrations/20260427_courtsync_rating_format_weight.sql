-- 20260427_courtsync_rating_format_weight.sql
--
-- Module 7.7 supplement — apply match-format weighting inside
-- apply_match_outcome. A one-set ranked match still updates rating,
-- but at 0.60× the impact of a full best-of-3.
--
-- Weight table (mirrors src/features/rating/constants.js → FORMAT_WEIGHTS):
--   one_set                       0.60
--   best_of_3 finished in 2 sets  1.00
--   best_of_3 finished in 3 sets  1.10
--   best_of_3 with match-tiebreak 0.85
--   incomplete                    0    (defensive — should never reach here)
--
-- Format is inferred from the sets jsonb shape. The validator
-- (validate_match_score) already rejected invalid shapes upstream so
-- by the time apply_match_outcome runs we only need to classify.

-- ─────────────────────────────────────────────────────────────────────
-- _match_format_weight(p_sets jsonb)
-- ─────────────────────────────────────────────────────────────────────

create or replace function public._match_format_weight(p_sets jsonb)
returns numeric
language plpgsql
immutable
as $$
declare
  v_count int;
  v_clean jsonb;
  v_set   jsonb;
  v_y_str text;
  v_t_str text;
  v_y     int;
  v_t     int;
  v_s1_winner text;
  v_s2_winner text;
  v_hi    int;
  v_lo    int;
begin
  if p_sets is null or jsonb_typeof(p_sets) <> 'array' then
    return 0;
  end if;

  -- Strip blank/empty/non-numeric rows.
  select coalesce(jsonb_agg(s), '[]'::jsonb)
    into v_clean
    from jsonb_array_elements(p_sets) s
   where (s->>'you') is not null and (s->>'you') <> ''
     and (s->>'them') is not null and (s->>'them') <> ''
     and (s->>'you') ~ '^-?[0-9]+$'
     and (s->>'them') ~ '^-?[0-9]+$';

  v_count := jsonb_array_length(v_clean);

  if v_count = 0 then return 0; end if;

  -- one_set
  if v_count = 1 then return 0.60; end if;

  -- 2 sets — best_of_3 finished 2-0
  if v_count = 2 then
    -- Set 1
    v_set := v_clean->0;
    v_y := (v_set->>'you')::int;
    v_t := (v_set->>'them')::int;
    v_s1_winner := case when v_y > v_t then 'you' when v_t > v_y then 'them' else null end;

    -- Set 2
    v_set := v_clean->1;
    v_y := (v_set->>'you')::int;
    v_t := (v_set->>'them')::int;
    v_s2_winner := case when v_y > v_t then 'you' when v_t > v_y then 'them' else null end;

    if v_s1_winner is not null and v_s1_winner = v_s2_winner then
      return 1.00;
    end if;
    -- Split sets but only 2 played → defensive 0 (validator wouldn't
    -- accept this; never reaches us in practice).
    return 0;
  end if;

  -- 3 sets — classify by final-set shape
  if v_count = 3 then
    v_set := v_clean->2;
    v_y := (v_set->>'you')::int;
    v_t := (v_set->>'them')::int;
    v_hi := greatest(v_y, v_t);
    v_lo := least(v_y, v_t);
    -- Match-tiebreak: hi >= 10 with margin 2. A normal set caps at 7
    -- (7-5 / 7-6) so any final-set with hi >= 10 must be a match-
    -- tiebreak; no need to also gate on lo.
    if v_hi >= 10 and (v_hi - v_lo) >= 2 then
      return 0.85;
    end if;
    return 1.10;
  end if;

  -- > 3 sets shouldn't happen in any current format. Defensive 0
  -- so a corrupted row never gets full rating impact.
  return 0;
end;
$$;

revoke all on function public._match_format_weight(jsonb) from public, anon, authenticated;

comment on function public._match_format_weight(jsonb) is
  'Module 7.7 supplement. Returns the rating multiplier for a match given its sets jsonb. Mirrors getMatchFormatWeight in src/features/rating/utils/ratingSystem.js.';

-- ─────────────────────────────────────────────────────────────────────
-- apply_match_outcome — apply format weight to the delta
-- ─────────────────────────────────────────────────────────────────────

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
  v_sets            jsonb;
  v_weight          numeric;

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
  select user_id, opponent_id, result, match_type, sets
    into v_submitter_id, v_opponent_id, v_result, v_match_type, v_sets
    from match_history
   where id = p_match_id;

  if not found then
    raise exception 'apply_match_outcome: match % not found', p_match_id;
  end if;

  if v_opponent_id is null then return; end if;
  if v_match_type is not null and v_match_type <> 'ranked' then return; end if;

  -- Module 7.7 supplement: classify match format and pull weight.
  -- A 0 weight is functionally a no-op for rating but we still update
  -- the counters so the calibration period progresses correctly. (In
  -- practice, weight=0 only happens on corrupted rows the validator
  -- failed to catch.)
  v_weight := public._match_format_weight(v_sets);

  perform 1
    from profiles
   where id in (v_submitter_id, v_opponent_id)
   order by id
   for update;

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

  v_expected_sub := 1.0 / (1.0 + power(10.0, (v_opp_rating - v_sub_rating) / 400.0));
  v_expected_opp := 1.0 - v_expected_sub;

  v_score_sub := case when v_result = 'win' then 1.0 else 0.0 end;
  v_score_opp := 1.0 - v_score_sub;

  -- Format weight is applied AFTER expected-score + K (per spec).
  v_new_sub := greatest(0, v_sub_rating + round(v_k_sub * (v_score_sub - v_expected_sub) * v_weight)::int);
  v_new_opp := greatest(0, v_opp_rating + round(v_k_opp * (v_score_opp - v_expected_opp) * v_weight)::int);

  v_sub_count_new := v_sub_count + 1;
  v_opp_count_new := v_opp_count + 1;
  v_sub_status_new := case when v_sub_count_new >= 5 then 'established' else 'provisional' end;
  v_opp_status_new := case when v_opp_count_new >= 5 then 'established' else 'provisional' end;

  v_sub_skill_new := public._derive_displayed_skill(v_new_sub, v_sub_skill);
  v_opp_skill_new := public._derive_displayed_skill(v_new_opp, v_opp_skill);

  update profiles set
    wins                          = wins   + case when v_result = 'win'  then 1 else 0 end,
    losses                        = losses + case when v_result = 'loss' then 1 else 0 end,
    matches_played                = matches_played + 1,
    ranking_points                = v_new_sub,
    confirmed_ranked_match_count  = v_sub_count_new,
    rating_status                 = v_sub_status_new,
    skill                         = v_sub_skill_new,
    skill_level_locked            = v_sub_locked or v_sub_count_new >= 1,
    skill_level_locked_at         = case
      when v_sub_locked then skill_level_locked_at
      when v_sub_count_new >= 1 then now()
      else null
    end
  where id = v_submitter_id;

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

grant execute on function public.apply_match_outcome(text) to authenticated;

comment on function public.apply_match_outcome(text) is
  'Module 7.7 + supplement. Standard Elo with new K-table (40/32/24), per-player K, match-format weight (one_set 0.60 / 2-set 1.00 / 3-set 1.10 / match-tiebreak 0.85), auto-lock skill on first confirmed ranked match, derive displayed skill from new rating with 50pt hysteresis. Casual + non-ranked rows are no-ops.';
