-- ============================================================================
-- 20260420_bump_stats_for_match.sql
--
-- bump_stats_for_match(uuid): stats-only helper called by
-- accept_correction_and_update_stats after it has already written the
-- corrected values and set status='confirmed'.
--
-- Mirrors the exact formula in confirm_match_and_update_stats (text param),
-- but takes uuid so the SECURITY DEFINER caller can pass p_match_id directly.
-- match_history.id is text → cast with ::text in the WHERE.
--
-- Safe to re-run (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bump_stats_for_match(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submitter_id uuid;
  v_opponent_id  uuid;
  v_result       text;
BEGIN
  -- Match is already confirmed with corrected values by the calling function.
  -- Just read the result and update both players' stats.
  -- match_history.id is text; cast uuid param for the WHERE.
  SELECT user_id, opponent_id, result
    INTO v_submitter_id, v_opponent_id, v_result
    FROM match_history
   WHERE id = p_match_id::text;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  -- Submitter stats
  UPDATE profiles SET
    wins           = wins   + CASE WHEN v_result = 'win'  THEN 1 ELSE 0 END,
    losses         = losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    matches_played = matches_played + 1,
    ranking_points = GREATEST(0,
      1000
      + (wins   + CASE WHEN v_result = 'win'  THEN 1 ELSE 0 END) * 15
      - (losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END) * 10
    )
  WHERE id = v_submitter_id;

  -- Opponent stats (result is inverted — stored in submitter frame in DB)
  UPDATE profiles SET
    wins           = wins   + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    losses         = losses + CASE WHEN v_result = 'win'  THEN 1 ELSE 0 END,
    matches_played = matches_played + 1,
    ranking_points = GREATEST(0,
      1000
      + (wins   + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END) * 15
      - (losses + CASE WHEN v_result = 'win'  THEN 1 ELSE 0 END) * 10
    )
  WHERE id = v_opponent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_stats_for_match(uuid) TO authenticated;
