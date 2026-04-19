-- ============================================================================
-- 20260420_propose_match_correction.sql
--
-- Adds propose_match_correction(), a SECURITY DEFINER RPC that handles
-- both the initial dispute and all subsequent counter-proposals in one
-- atomic transaction.
--
-- Previously, dispute/counter writes went through a direct client-side
-- UPDATE on match_history via proposeCorrection() in matchService.js.
-- That direct write fails under RLS when the opponent (who doesn't own
-- the row) tries to dispute a match submitted by someone else.
--
-- This function takes ownership of:
--   - validating the caller is a party to the match
--   - enforcing state-machine transitions
--   - writing the match update
--   - inserting the match_revisions history row
-- …all in a single serializable transaction under SECURITY DEFINER so RLS
-- is bypassed correctly for both parties.
--
-- Depends on: 20260419_dispute_system_v2.sql (status check constraint,
--             pending_reconfirmation status value)
--
-- Safe to re-run (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION propose_match_correction(
  p_match_id    uuid,
  p_reason_code text,
  p_reason_detail text,
  p_proposal    jsonb,
  p_next_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match         match_history%ROWTYPE;
  v_caller        uuid := auth.uid();
  v_new_rev       int;
  v_pending_by    uuid;
  v_action        text;
BEGIN
  -- ── 1. Lock the row ──────────────────────────────────────────────────────
  SELECT * INTO v_match
    FROM match_history
   WHERE id = p_match_id
     FOR UPDATE;

  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  -- ── 2. Caller must be one of the two parties ─────────────────────────────
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF v_caller NOT IN (v_match.user_id, v_match.opponent_id) THEN
    RAISE EXCEPTION 'not_a_party';
  END IF;

  -- ── 3. Reject untagged / casual matches ──────────────────────────────────
  IF v_match.opponent_id IS NULL THEN
    RAISE EXCEPTION 'no_opponent: cannot dispute a casual match with no opponent';
  END IF;

  -- ── 4. Validate next_status value ────────────────────────────────────────
  IF p_next_status NOT IN ('disputed', 'pending_reconfirmation') THEN
    RAISE EXCEPTION 'invalid_next_status: %', p_next_status;
  END IF;

  -- ── 5. State-machine transition rules ────────────────────────────────────
  IF v_match.status = 'pending_confirmation' THEN
    -- Opening a dispute: only the opponent can act, must target 'disputed'
    IF v_caller <> v_match.opponent_id THEN
      RAISE EXCEPTION 'only_opponent_can_open_dispute';
    END IF;
    IF p_next_status <> 'disputed' THEN
      RAISE EXCEPTION 'opening_dispute_must_use_disputed_status';
    END IF;
    -- After opening: submitter (user_id) owes the response
    v_pending_by := v_match.user_id;
    v_action     := 'disputed';

  ELSIF v_match.status IN ('disputed', 'pending_reconfirmation') THEN
    -- Counter-proposal: only the party currently owed a response can act
    IF v_caller <> v_match.pending_action_by THEN
      RAISE EXCEPTION 'not_pending_action_party: caller=% expected=%',
        v_caller, v_match.pending_action_by;
    END IF;
    -- pending_action_by flips to the other party
    v_pending_by := CASE
      WHEN v_caller = v_match.user_id THEN v_match.opponent_id
      ELSE v_match.user_id
    END;
    v_action := 'counter_proposed';

  ELSE
    RAISE EXCEPTION 'invalid_transition: cannot propose correction from status %',
      v_match.status;
  END IF;

  -- ── 6. Compute new revision count ────────────────────────────────────────
  v_new_rev := COALESCE(v_match.revision_count, 0) + 1;

  -- ── 7. Update match_history ───────────────────────────────────────────────
  UPDATE match_history SET
    status              = p_next_status,
    dispute_raised_by   = v_caller,
    dispute_reason_code = p_reason_code,
    dispute_reason_detail = p_reason_detail,
    current_proposal    = p_proposal,
    proposal_by         = v_caller,
    pending_action_by   = v_pending_by,
    revision_count      = v_new_rev,
    dispute_expires_at  = now() + interval '48 hours'
  WHERE id = p_match_id;

  -- ── 8. Insert revision history (atomic with the update above) ─────────────
  INSERT INTO match_revisions (
    match_id,
    revision_number,
    changed_by,
    action,
    snapshot_before,
    snapshot_after,
    reason_code,
    reason_detail
  ) VALUES (
    p_match_id,
    v_new_rev,
    v_caller,
    v_action,
    jsonb_build_object(
      'result',     v_match.result,
      'sets',       v_match.sets,
      'match_date', v_match.match_date,
      'venue',      v_match.venue,
      'court',      v_match.court
    ),
    p_proposal,
    p_reason_code,
    p_reason_detail
  );
END;
$$;

GRANT EXECUTE ON FUNCTION propose_match_correction(uuid, text, text, jsonb, text)
  TO authenticated;
