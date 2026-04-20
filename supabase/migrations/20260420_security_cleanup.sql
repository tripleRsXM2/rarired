-- ============================================================================
-- 20260420_security_cleanup.sql
--
-- Fixes found via live DB audit:
--
-- 1. DROP old insecure text-param versions of accept_correction_and_update_stats
--    and void_match — they have no auth checks (anyone could accept/void any match).
--    The uuid-param versions (with proper SECURITY DEFINER + auth checks) remain.
--
-- 2. Fix accept_correction_and_update_stats(uuid): match_date column is TEXT,
--    remove the unnecessary ::date cast to avoid potential format issues.
--
-- 3. Add SET search_path = public to expire_stale_matches and
--    confirm_match_and_update_stats (missing from both).
--
-- 4. Add SELECT policy to match_revisions — RLS was enabled but no policies
--    existed, so only SECURITY DEFINER inserts worked; direct reads were blocked
--    for everyone.
--
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop old insecure text-param overloads
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.accept_correction_and_update_stats(text);
DROP FUNCTION IF EXISTS public.void_match(text, text);

-- ---------------------------------------------------------------------------
-- 2. accept_correction_and_update_stats(uuid) — fix match_date cast
--    match_history.match_date is TEXT; storing via ::date would roundtrip
--    through Postgres DateStyle. Store the raw string directly instead.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_correction_and_update_stats(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match    match_history%ROWTYPE;
  v_proposal jsonb;
BEGIN
  SELECT * INTO v_match
    FROM match_history
   WHERE id = p_match_id::text
     FOR UPDATE;

  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'match not found';
  END IF;
  IF v_match.status NOT IN ('disputed', 'pending_reconfirmation') THEN
    RAISE EXCEPTION 'match not in a disputable state (status=%)', v_match.status;
  END IF;
  IF v_match.current_proposal IS NULL THEN
    RAISE EXCEPTION 'no proposal to accept';
  END IF;
  IF auth.uid() <> v_match.pending_action_by THEN
    RAISE EXCEPTION 'only the party owed a response can accept';
  END IF;

  v_proposal := v_match.current_proposal;

  UPDATE match_history SET
    status             = 'confirmed',
    result             = v_proposal->>'result',
    sets               = v_proposal->'sets',
    match_date         = v_proposal->>'match_date',   -- TEXT column, no ::date cast
    venue              = v_proposal->>'venue',
    court              = v_proposal->>'court',
    current_proposal   = NULL,
    proposal_by        = NULL,
    pending_action_by  = NULL,
    dispute_expires_at = NULL,
    confirmed_at       = now()
  WHERE id = p_match_id::text;

  PERFORM bump_stats_for_match(p_match_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_correction_and_update_stats(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. expire_stale_matches — add SET search_path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_matches()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE match_history
     SET status = 'expired'
   WHERE status = 'pending_confirmation'
     AND expires_at IS NOT NULL
     AND expires_at < now();

  UPDATE match_history
     SET status            = 'voided',
         voided_at         = now(),
         voided_reason     = 'timeout',
         current_proposal  = NULL,
         proposal_by       = NULL,
         pending_action_by = NULL
   WHERE status IN ('disputed', 'pending_reconfirmation')
     AND dispute_expires_at IS NOT NULL
     AND dispute_expires_at < now();
$$;

GRANT EXECUTE ON FUNCTION public.expire_stale_matches() TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. confirm_match_and_update_stats — add SET search_path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_match_and_update_stats(p_match_id text)
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
  UPDATE match_history
     SET status = 'confirmed', confirmed_at = now()
   WHERE id = p_match_id
   RETURNING user_id, opponent_id, result
        INTO v_submitter_id, v_opponent_id, v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  UPDATE profiles SET
    wins           = wins   + CASE WHEN v_result = 'win'  THEN 1 ELSE 0 END,
    losses         = losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    matches_played = matches_played + 1,
    ranking_points = GREATEST(0,
      1000
      + (wins   + CASE WHEN v_result = 'win'  THEN 1 ELSE 0 END) * 15
      - (losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END) * 10)
  WHERE id = v_submitter_id;

  UPDATE profiles SET
    wins           = wins   + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    losses         = losses + CASE WHEN v_result = 'win'  THEN 1 ELSE 0 END,
    matches_played = matches_played + 1,
    ranking_points = GREATEST(0,
      1000
      + (wins   + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END) * 15
      - (losses + CASE WHEN v_result = 'win'  THEN 1 ELSE 0 END) * 10)
  WHERE id = v_opponent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_match_and_update_stats(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. match_revisions — add SELECT policy (RLS on, no policies = no reads)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS match_revisions_select ON match_revisions;
CREATE POLICY match_revisions_select ON match_revisions
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id    FROM match_history WHERE id = match_revisions.match_id
      UNION
      SELECT opponent_id FROM match_history WHERE id = match_revisions.match_id
    )
  );
