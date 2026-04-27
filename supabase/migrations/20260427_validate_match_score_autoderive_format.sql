-- 20260427_validate_match_score_autoderive_format.sql
--
-- Fix: ranked one-set match rejected at the DB layer despite the
-- client validator (and product spec) treating it as a valid 0.60×
-- weighted ranked match.
--
-- Bug surfaced as a UI contradiction:
--   - "ONE SET" notice (live JS validator):
--       "One-set ranked matches count toward your rating at reduced
--        weight (about 60% of a full best-of-3)."
--   - "CAN'T SAVE" error (DB trigger on insert):
--       "ranked best-of-3 match requires one player to win 2 sets
--        (got 1-0)."
--
-- Root cause: validate_match_score()'s `v_format` defaulted to
-- 'best_of_3' and was only overridden when a league row was tagged.
-- A non-league 1-set ranked submission always fell through to BO3
-- rules and got rejected. The JS tennisScoreValidation has had a
-- resolveFormat() helper for a while that auto-derives:
--
--     1 set  → 'one_set'
--     2+ set → 'best_of_3'   (BO3 finished in 2 or 3, mirrors product spec)
--
-- This migration mirrors that into the SQL trigger so the two
-- layers stay in lockstep.
--
-- The body of the function is otherwise unchanged from
-- 20260428_validate_match_score_invite_status.sql — only the v_format
-- resolution + the one-set tail-check is touched.

create or replace function public.validate_match_score()
returns trigger
language plpgsql
as $$
declare
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
  v_format         text;       -- ← no default; resolved below
begin
  -- Module 9 widens the status set to include pending_opponent_claim
  -- (rated match waiting on an invite claim).
  is_ranked_check := NEW.match_type = 'ranked'
                 AND NEW.status IN ('confirmed', 'pending_confirmation', 'pending_opponent_claim');

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

  -- ── Format resolution (now mirrors the JS resolveFormat helper) ──
  -- Order of precedence:
  --   1. League's explicit `match_format` (when row tagged)
  --   2. Auto-derive from sets count: 1 → one_set, 2+ → best_of_3
  --
  -- Without this, a non-league ranked 1-set submission always
  -- defaulted to best_of_3 and got rejected at the tail check below
  -- as "needs one player to win 2 sets" — contradicting the JS
  -- validator's accepted "one set @ 0.60×" path.
  IF NEW.league_id IS NOT NULL THEN
    SELECT match_format INTO v_format FROM public.leagues WHERE id = NEW.league_id;
  END IF;
  IF v_format IS NULL THEN
    v_format := CASE WHEN total_sets = 1 THEN 'one_set' ELSE 'best_of_3' END;
  END IF;

  FOR set_obj, current_idx IN
    SELECT value, ord - 1
      FROM jsonb_array_elements(NEW.sets) WITH ORDINALITY arr(value, ord)
  LOOP
    IF set_obj->>'you' IS NULL OR set_obj->>'you' = ''
       OR set_obj->>'them' IS NULL OR set_obj->>'them' = '' THEN
      IF is_ranked_check THEN
        RAISE EXCEPTION 'ranked match: every set needs a numeric "you" + "them" score'
          USING ERRCODE = 'check_violation';
      END IF;
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

    IF y > t THEN sub_set_wins := sub_set_wins + 1;
    ELSIF t > y THEN opp_set_wins := opp_set_wins + 1;
    END IF;
  END LOOP;

  IF is_ranked_check THEN
    IF v_format = 'one_set' THEN
      IF total_sets <> 1
         OR (sub_set_wins + opp_set_wins) <> 1 THEN
        RAISE EXCEPTION 'ranked one-set match needs exactly 1 completed set with a winner'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      IF NOT (sub_set_wins >= 2 AND sub_set_wins > opp_set_wins)
         AND NOT (opp_set_wins >= 2 AND opp_set_wins > sub_set_wins) THEN
        RAISE EXCEPTION 'ranked best-of-3 match requires one player to win 2 sets (got %-%)',
          sub_set_wins, opp_set_wins
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
end;
$$;

comment on function public.validate_match_score() is
  'BEFORE-INSERT score validator on match_history. v_format now auto-derives '
  'from sets count when no league override exists (1 set → one_set, 2+ → best_of_3), '
  'matching the JS tennisScoreValidation.resolveFormat helper. Fixes the contradiction '
  'where a 1-set ranked submission was accepted by the live JS validator (with a '
  '"60% weight" notice) but rejected by the DB trigger as "needs to win 2 sets".';
