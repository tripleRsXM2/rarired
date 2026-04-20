-- ============================================================================
-- 20260419_dispute_system_v2.sql
--
-- Fixes three gaps in the no-admin dispute resolution system:
--   1. Adds the spec-required `pending_reconfirmation` status (submitter has
--      counter-proposed and is waiting for the opponent to respond).
--   2. Adds server-side timeout enforcement via pg_cron + SECURITY DEFINER RPC
--      so disputes don't stall indefinitely when nobody opens the app.
--   3. Drops the unused `revision_requested_by` / `revision_reason` columns
--      left over from an earlier design — nothing writes to them anymore.
--
-- Safe to re-run: all statements are idempotent (IF EXISTS / IF NOT EXISTS /
-- CREATE OR REPLACE).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Status enum — add pending_reconfirmation
-- ---------------------------------------------------------------------------
-- match_history.status is stored as text (see schema), so no enum ALTER
-- needed. We only need to widen the CHECK constraint.
ALTER TABLE match_history DROP CONSTRAINT IF EXISTS match_history_status_check;
ALTER TABLE match_history ADD CONSTRAINT match_history_status_check
  CHECK (status IN (
    'pending_confirmation',
    'disputed',
    'pending_reconfirmation',
    'confirmed',
    'voided',
    'expired'
  ));

-- ---------------------------------------------------------------------------
-- 2. Drop dead columns
-- ---------------------------------------------------------------------------
ALTER TABLE match_history DROP COLUMN IF EXISTS revision_requested_by;
ALTER TABLE match_history DROP COLUMN IF EXISTS revision_reason;

-- ---------------------------------------------------------------------------
-- 3. Broaden accept_correction_and_update_stats to accept either
--    'disputed' or 'pending_reconfirmation' as the starting status.
--    Stats/ELO still only update after this function succeeds — i.e. ONLY
--    after mutual agreement lands the row in 'confirmed'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_correction_and_update_stats(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match   match_history%ROWTYPE;
  v_proposal jsonb;
BEGIN
  -- id is text; cast param to text for the WHERE
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

  -- Caller must be the party owed a response
  IF auth.uid() <> v_match.pending_action_by THEN
    RAISE EXCEPTION 'only the party owed a response can accept';
  END IF;

  v_proposal := v_match.current_proposal;

  UPDATE match_history SET
    status             = 'confirmed',
    result             = v_proposal->>'result',
    sets               = v_proposal->'sets',
    match_date         = (v_proposal->>'match_date')::date,
    venue              = v_proposal->>'venue',
    court              = v_proposal->>'court',
    current_proposal   = NULL,
    proposal_by        = NULL,
    pending_action_by  = NULL,
    dispute_expires_at = NULL,
    confirmed_at       = now()
  WHERE id = p_match_id::text;

  -- Delegate to the existing ELO/stat update path
  PERFORM bump_stats_for_match(p_match_id);
END;
$$;

-- void_match: accept 'disputed', 'pending_reconfirmation', or 'pending_confirmation'
CREATE OR REPLACE FUNCTION void_match(p_match_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match match_history%ROWTYPE;
BEGIN
  -- id is text; cast param to text for the WHERE
  SELECT * INTO v_match
    FROM match_history
   WHERE id = p_match_id::text
     FOR UPDATE;

  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'match not found';
  END IF;
  IF v_match.status NOT IN ('disputed', 'pending_reconfirmation', 'pending_confirmation') THEN
    RAISE EXCEPTION 'match cannot be voided from status %', v_match.status;
  END IF;
  IF auth.uid() NOT IN (v_match.user_id, v_match.opponent_id) THEN
    RAISE EXCEPTION 'only the parties to a match may void it';
  END IF;

  UPDATE match_history SET
    status            = 'voided',
    voided_at         = now(),
    voided_reason     = COALESCE(p_reason, 'voided'),
    current_proposal  = NULL,
    proposal_by       = NULL,
    pending_action_by = NULL
  WHERE id = p_match_id::text;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Server-side timeout enforcement
-- ---------------------------------------------------------------------------
-- expire_stale_matches() does the full sweep in one call:
--   - pending_confirmation  → expired  (submitter ran out the 72h clock)
--   - disputed              → voided (timeout)  (submitter didn't respond)
--   - pending_reconfirmation → voided (timeout) (opponent didn't respond)
--
-- SECURITY DEFINER so any authenticated user can trigger cleanup for matches
-- they're NOT party to — we need this for the client-side fallback to work
-- across both sides of every match.
CREATE OR REPLACE FUNCTION expire_stale_matches()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE match_history
     SET status = 'expired'
   WHERE status = 'pending_confirmation'
     AND expires_at IS NOT NULL
     AND expires_at < now();

  UPDATE match_history
     SET status = 'voided',
         voided_at = now(),
         voided_reason = 'timeout',
         current_proposal = NULL,
         proposal_by = NULL,
         pending_action_by = NULL
   WHERE status IN ('disputed', 'pending_reconfirmation')
     AND dispute_expires_at IS NOT NULL
     AND dispute_expires_at < now();
$$;

GRANT EXECUTE ON FUNCTION expire_stale_matches() TO authenticated, anon;

-- Schedule: run every 15 minutes. Requires the pg_cron extension which is
-- available on Supabase (enable via dashboard → Database → Extensions).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Idempotent: drop any existing schedule with the same name before creating
SELECT cron.unschedule('expire-stale-matches')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-matches');

SELECT cron.schedule(
  'expire-stale-matches',
  '*/15 * * * *',
  $cron$ SELECT expire_stale_matches(); $cron$
);

-- ---------------------------------------------------------------------------
-- 5. Verify state-machine invariants
-- ---------------------------------------------------------------------------
-- Confirmed/voided/expired matches must not carry an open proposal.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM match_history
     WHERE status IN ('confirmed', 'voided', 'expired')
       AND current_proposal IS NOT NULL
  ) THEN
    RAISE WARNING 'Found terminal-state matches with lingering current_proposal; cleaning up.';
    UPDATE match_history
       SET current_proposal = NULL,
           proposal_by = NULL,
           pending_action_by = NULL
     WHERE status IN ('confirmed', 'voided', 'expired')
       AND current_proposal IS NOT NULL;
  END IF;
END $$;
