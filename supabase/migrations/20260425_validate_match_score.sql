-- 20260425_validate_match_score.sql
--
-- BEFORE-INSERT trigger that hardens score validity at the DB layer.
-- The client validator (src/features/scoring/utils/tennisScoreValidation.js)
-- is canonical; this trigger mirrors its rules so a forced REST POST
-- with garbage scores can't bypass the UI gate.
--
-- Scope:
--   - Runs only on INSERT (not UPDATE) so existing rows + status flips
--     from confirm/dispute/void flows aren't re-validated. The original
--     score was validated at insert time.
--   - For match_type='ranked' AND status IN ('confirmed','pending_confirmation'):
--       * each set must have integer non-negative you + them
--       * each set must match a valid completed tennis pattern:
--           6-0..6-4, 7-5, 7-6, or match-tiebreak ≥10 win-by-2 on the
--           LAST set when the match is 1-1 going in
--       * the match must have a clear winner per format:
--           one_set     → exactly 1 completed set with a winner
--           best_of_3   → one player won ≥2 sets
--   - For match_type='casual' or pending non-confirmed states: only
--     basic shape (non-negative integers if a value is present). Soft
--     mode covers partial / time-limited casual scores like 5-3.
--   - For NULL or empty sets on a ranked confirmed/pending row: hard fail.
--
-- Mirrors the validate_match_league pattern (BEFORE-INSERT trigger that
-- shares its rules with the client). See tennisScoreValidation.js for
-- the canonical logic.

CREATE OR REPLACE FUNCTION public.validate_match_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  set_obj          jsonb;
  current_idx      int;
  total_sets       int;
  y                int;
  t                int;
  hi               int;
  lo               int;
  is_normal_set    boolean;
  is_match_tb      boolean;
  is_match_tb_ok   boolean;
  is_ranked_check  boolean;
  sub_set_wins     int := 0;
  opp_set_wins     int := 0;
  v_format         text := 'best_of_3';
BEGIN
  is_ranked_check := NEW.match_type = 'ranked'
                 AND NEW.status IN ('confirmed', 'pending_confirmation');

  IF NEW.sets IS NULL
     OR jsonb_typeof(NEW.sets) <> 'array'
     OR jsonb_array_length(NEW.sets) = 0 THEN
    IF is_ranked_check THEN
      RAISE EXCEPTION 'ranked match must have at least one set'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  total_sets := jsonb_array_length(NEW.sets);

  -- Pull league match_format if league-tagged. Default 'best_of_3'.
  IF NEW.league_id IS NOT NULL THEN
    SELECT match_format INTO v_format FROM public.leagues WHERE id = NEW.league_id;
    v_format := COALESCE(v_format, 'best_of_3');
  END IF;

  -- Per-set checks. Use WITH ORDINALITY to know which index we're on
  -- (final-set match-tiebreak is only allowed as the LAST set when
  -- the prior sets are 1-1).
  FOR set_obj, current_idx IN
    SELECT value, ord - 1
      FROM jsonb_array_elements(NEW.sets) WITH ORDINALITY arr(value, ord)
  LOOP
    -- Empty / blank score handling
    IF set_obj->>'you' IS NULL OR set_obj->>'you' = ''
       OR set_obj->>'them' IS NULL OR set_obj->>'them' = '' THEN
      IF is_ranked_check THEN
        RAISE EXCEPTION 'ranked match: every set needs a numeric "you" + "them" score'
          USING ERRCODE = 'check_violation';
      END IF;
      -- Casual partial set — skip but don't fail.
      CONTINUE;
    END IF;

    BEGIN
      y := (set_obj->>'you')::int;
      t := (set_obj->>'them')::int;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'set scores must be integers (got %)', set_obj
        USING ERRCODE = 'check_violation';
    END;

    IF y < 0 OR t < 0 THEN
      RAISE EXCEPTION 'set scores cannot be negative (got %-%)', y, t
        USING ERRCODE = 'check_violation';
    END IF;

    IF is_ranked_check THEN
      hi := GREATEST(y, t);
      lo := LEAST(y, t);

      is_normal_set := (hi = 6 AND lo BETWEEN 0 AND 4)
                    OR (hi = 7 AND lo = 5)
                    OR (hi = 7 AND lo = 6);

      -- match-tiebreak is only allowed as the LAST set of a best_of_3
      -- decider (1-1 in prior sets).
      is_match_tb := (current_idx = total_sets - 1)
                 AND v_format = 'best_of_3'
                 AND sub_set_wins = 1
                 AND opp_set_wins = 1;
      is_match_tb_ok := is_match_tb
                    AND hi >= 10
                    AND (hi - lo) >= 2;

      IF NOT (is_normal_set OR is_match_tb_ok) THEN
        RAISE EXCEPTION 'ranked match: invalid set score %-% (set %)', y, t, current_idx + 1
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- Tally completed-set wins (used for the final-set match-tiebreak
    -- gate above + the match-winner check below).
    IF y > t THEN sub_set_wins := sub_set_wins + 1;
    ELSIF t > y THEN opp_set_wins := opp_set_wins + 1;
    END IF;
  END LOOP;

  -- Match-level winner check, ranked only.
  IF is_ranked_check THEN
    IF v_format = 'one_set' THEN
      IF total_sets <> 1
         OR (sub_set_wins + opp_set_wins) <> 1 THEN
        RAISE EXCEPTION 'ranked one-set match needs exactly 1 completed set with a winner'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      -- best_of_3 (default)
      IF NOT (sub_set_wins >= 2 AND sub_set_wins > opp_set_wins)
         AND NOT (opp_set_wins >= 2 AND opp_set_wins > sub_set_wins) THEN
        RAISE EXCEPTION 'ranked best-of-3 match requires one player to win 2 sets (got %-%)',
          sub_set_wins, opp_set_wins
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_match_score_trigger ON public.match_history;
CREATE TRIGGER validate_match_score_trigger
  BEFORE INSERT ON public.match_history
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_match_score();

COMMENT ON FUNCTION public.validate_match_score() IS
  'BEFORE-INSERT score validator on match_history. Hardens against forced REST writes that bypass the client validator (tennisScoreValidation.js). Strict for ranked confirmed/pending; permissive for casual partial / time-limited scores. Mirrors the validate_match_league trigger pattern.';
