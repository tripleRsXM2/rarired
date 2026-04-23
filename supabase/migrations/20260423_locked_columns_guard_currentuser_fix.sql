-- ─────────────────────────────────────────────────────────────────────────────
-- 20260423_locked_columns_guard_currentuser_fix.sql
--
-- Fix: profiles_locked_columns_guard bypass was checking session_user
-- instead of current_user, which blocked legitimate SECURITY DEFINER
-- paths that update profile stats.
--
-- Symptom: user's friend hit "profiles.ranking_points is not user-
-- writable" when confirming a ranked match, even though the update
-- was flowing through the SECURITY DEFINER apply_match_outcome() fn.
--
-- Why: in Postgres, SECURITY DEFINER changes current_user to the
-- function owner but leaves session_user as the original login role
-- for the entire session. In Supabase, PostgREST connects as
-- 'authenticator' and SETs ROLE to 'authenticated' — so:
--   • session_user  stays  'authenticator' across the whole session
--   • current_user  starts 'authenticated'
--   • inside a SECURITY DEFINER fn owned by postgres:
--       current_user → 'postgres'  (so the UPDATE can touch locked cols)
--       session_user → 'authenticator' (unchanged)
--
-- The previous check `session_user = 'postgres'` was therefore NEVER
-- true for any PostgREST-originated query, including those inside
-- apply_match_outcome. It only passed for direct psql connections as
-- postgres. That's why pg_cron ran fine while every client-triggered
-- confirm RPC silently blew up with the "not user-writable" error.
--
-- Correct check: current_user = 'postgres'.
--   • SECURITY DEFINER fns owned by postgres → bypass ✓
--   • pg_cron jobs (run as postgres)         → bypass ✓
--   • raw user UPDATEs (current_user=authenticated) → still blocked ✓
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.profiles_locked_columns_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  -- Bypass when executing inside a SECURITY DEFINER function owned by
  -- postgres (current_user becomes 'postgres' for the duration). Also
  -- covers pg_cron and direct postgres-role access. Does NOT bypass
  -- raw client updates where current_user = 'authenticated'.
  IF current_user = 'postgres' THEN RETURN NEW; END IF;
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF tg_op <> 'UPDATE' THEN RETURN NEW; END IF;

  IF new.is_admin IS DISTINCT FROM old.is_admin THEN
    RAISE EXCEPTION 'profiles.is_admin is not user-writable';
  END IF;
  IF new.ranking_points IS DISTINCT FROM old.ranking_points THEN
    RAISE EXCEPTION 'profiles.ranking_points is not user-writable';
  END IF;
  IF new.wins IS DISTINCT FROM old.wins THEN
    RAISE EXCEPTION 'profiles.wins is not user-writable';
  END IF;
  IF new.losses IS DISTINCT FROM old.losses THEN
    RAISE EXCEPTION 'profiles.losses is not user-writable';
  END IF;
  IF new.matches_played IS DISTINCT FROM old.matches_played THEN
    RAISE EXCEPTION 'profiles.matches_played is not user-writable';
  END IF;
  IF new.streak_count IS DISTINCT FROM old.streak_count THEN
    RAISE EXCEPTION 'profiles.streak_count is not user-writable';
  END IF;
  IF new.streak_type IS DISTINCT FROM old.streak_type THEN
    RAISE EXCEPTION 'profiles.streak_type is not user-writable';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
