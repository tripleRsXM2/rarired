-- Module 3 — close notification fire gaps.
--
-- Two changes, both backwards-compatible and idempotent:
--
-- 1. Add match_history.reminder_sent_at so the "<24h left" reminder stops
--    being gated by localStorage (which breaks across devices and browser
--    resets). useMatchHistory will check this column before firing.
--
-- 2. Replace expire_stale_matches() with a version that also INSERTs
--    match_expired / match_voided notifications for both parties on each
--    transition. Existing callers and the pg_cron schedule keep working
--    unchanged; only the side-effect set grows.
--
-- Idempotent: `add column if not exists`, `CREATE OR REPLACE FUNCTION`,
-- and the notification inserts use a NOT EXISTS guard so rerunning cron
-- against already-expired rows never duplicates notifications.

-- ---------------------------------------------------------------------------
-- 1. reminder_sent_at on match_history
-- ---------------------------------------------------------------------------
alter table public.match_history
  add column if not exists reminder_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. expire_stale_matches — emit notifications alongside the status flip
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_matches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  -- Pending matches past their 72h confirmation window -> expired.
  -- Capture the rows so we can notify both parties.
  FOR r IN
    UPDATE match_history
       SET status = 'expired'
     WHERE status = 'pending_confirmation'
       AND expires_at IS NOT NULL
       AND expires_at < now()
    RETURNING id, user_id, opponent_id
  LOOP
    -- Submitter notification
    IF NOT EXISTS (
      SELECT 1 FROM notifications
       WHERE user_id = r.user_id
         AND type    = 'match_expired'
         AND match_id = r.id
    ) THEN
      INSERT INTO notifications (user_id, type, from_user_id, match_id)
      VALUES (r.user_id, 'match_expired', r.opponent_id, r.id);
    END IF;
    -- Opponent notification (if there is one — casual matches have no opp)
    IF r.opponent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM notifications
       WHERE user_id = r.opponent_id
         AND type    = 'match_expired'
         AND match_id = r.id
    ) THEN
      INSERT INTO notifications (user_id, type, from_user_id, match_id)
      VALUES (r.opponent_id, 'match_expired', r.user_id, r.id);
    END IF;
  END LOOP;

  -- Disputed / pending_reconfirmation matches past their 48h window -> voided.
  FOR r IN
    UPDATE match_history
       SET status            = 'voided',
           voided_at         = now(),
           voided_reason     = 'timeout',
           current_proposal  = NULL,
           proposal_by       = NULL,
           pending_action_by = NULL
     WHERE status IN ('disputed', 'pending_reconfirmation')
       AND dispute_expires_at IS NOT NULL
       AND dispute_expires_at < now()
    RETURNING id, user_id, opponent_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM notifications
       WHERE user_id = r.user_id
         AND type    = 'match_voided'
         AND match_id = r.id
    ) THEN
      INSERT INTO notifications (user_id, type, from_user_id, match_id)
      VALUES (r.user_id, 'match_voided', r.opponent_id, r.id);
    END IF;
    IF r.opponent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM notifications
       WHERE user_id = r.opponent_id
         AND type    = 'match_voided'
         AND match_id = r.id
    ) THEN
      INSERT INTO notifications (user_id, type, from_user_id, match_id)
      VALUES (r.opponent_id, 'match_voided', r.user_id, r.id);
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_stale_matches() TO authenticated, anon;
