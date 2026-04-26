-- 20260428_validate_match_score_invite_status.sql
--
-- Module 9 follow-up to slice 1.
--
-- The validate_match_score BEFORE-INSERT trigger from
-- 20260425_validate_match_score.sql validates strict-rules for ranked
-- + (confirmed | pending_confirmation) rows. Module 9 adds a new
-- 'pending_opponent_claim' status — these rows should ALSO be
-- strictly validated since they're rated matches awaiting an
-- opponent claim, not casual / time-limited rows.
--
-- The patch adds 'pending_opponent_claim' to the is_ranked_check
-- status set. Everything else in the trigger is unchanged.

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
  v_format         text := 'best_of_3';
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

  IF NEW.league_id IS NOT NULL THEN
    SELECT match_format INTO v_format FROM public.leagues WHERE id = NEW.league_id;
    v_format := COALESCE(v_format, 'best_of_3');
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
  'BEFORE-INSERT score validator on match_history. Module 9 update: now applies strict-rules to pending_opponent_claim rows alongside pending_confirmation/confirmed (ranked rated matches awaiting an opponent claim). Mirrors the JS tennisScoreValidation rules.';
