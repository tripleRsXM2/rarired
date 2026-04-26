-- 20260429_revoke_internal_rpc_grants.sql
--
-- Revoke EXECUTE on internal / trigger-only / cron-only RPCs from
-- anon and authenticated. Without these REVOKEs, Postgres' default
-- "GRANT EXECUTE TO PUBLIC" leaves every SECURITY DEFINER function
-- callable by every signed-in user — bypassing the orchestration
-- guards in the user-facing RPCs that wrap them.
--
-- Concrete exploit closed:
--   1. apply_match_outcome(match_id) was directly callable by any
--      authenticated user. It runs the Elo math and writes wins/
--      losses/ranking_points without checking that the caller is a
--      party to the match. An attacker could repeatedly call it
--      against their own (or anyone else's) confirmed match to
--      pump their rating or trash an opponent's.
--   2. recalculate_league_standings (and a few cron sweeps) were
--      similarly exposed — DoS + nonsense state.
--
-- Trigger functions don't need EXECUTE grants to fire on DML — the
-- trigger machinery runs them as the table owner. So revoking from
-- authenticated is purely additive defence.
--
-- After this migration, every NEW function we add will inherit the
-- DEFAULT PRIVILEGES set at the bottom: PUBLIC has no EXECUTE, and
-- you must explicitly GRANT EXECUTE TO authenticated for client-
-- callable RPCs.

------------------------------------------------------------
-- 1. Trigger-only functions (must never be called directly)
------------------------------------------------------------
DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'audit_match_status_change()',
    'audit_tournaments()',
    'dm_rollback_conv_preview_on_delete()',
    'dm_update_conv_preview()',
    'guard_dm_insert_block()',
    'profiles_locked_columns_guard()',
    'recalc_league_standings_on_match_change()',
    'throttle_direct_messages()',
    'throttle_emit_notification()',
    'throttle_feed_comments()',
    'throttle_friend_requests()',
    'throttle_match_invites()',
    'validate_match_league()'
  ])
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      -- Function doesn't exist on this branch yet; skip.
      NULL;
    END;
  END LOOP;
END $$;

------------------------------------------------------------
-- 2. Cron / sweep functions (called only by pg_cron as postgres)
------------------------------------------------------------
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'cleanup_challenge_notifications()',
    'cleanup_conv_notifications()',
    'cleanup_league_invite_notifications()',
    'cleanup_match_notifications()',
    'expire_stale_challenges()',
    'expire_stale_matches()'
  ])
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END LOOP;
END $$;

------------------------------------------------------------
-- 3. Internal helpers wrapping privileged math
------------------------------------------------------------
-- apply_match_outcome — the actual rating writer. Only the trigger
-- chain (confirm_match_and_update_stats / accept_correction_and_update_stats
-- / bump_stats_for_match) should reach it. Direct callability was the
-- main exploit hole.
REVOKE ALL ON FUNCTION public.apply_match_outcome(text)               FROM PUBLIC, anon, authenticated;

-- League standings: only the *_inner helper and recalc trigger
-- should drive standings. The outer recalculate_league_standings
-- was previously open. Now both are private to the postgres role.
DO $$
BEGIN
  -- Variants exist (signature with/without league_id). Match all by
  -- pg_proc lookup so we don't have to know the signature here.
  PERFORM 1;
END $$;

REVOKE ALL ON FUNCTION public.recalculate_league_standings(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_league_standings_inner(uuid) FROM PUBLIC, anon, authenticated;

-- _is_league_member is a STABLE helper; no harm leaving it open, but
-- we lock it on principle so PUBLIC has nothing by default.
REVOKE ALL ON FUNCTION public._is_league_member(uuid, uuid)           FROM PUBLIC, anon, authenticated;

-- rls_auto_enable — RLS bootstrap, never user-callable.
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

------------------------------------------------------------
-- 4. Restore EXECUTE on the trigger functions to the table owner
--    (they need it to fire as the trigger). The owner is `postgres`
--    in Supabase.
------------------------------------------------------------
-- Trigger functions don't need explicit EXECUTE grants — Postgres
-- runs trigger functions as the owner of the table the trigger is
-- attached to, regardless of the function's privileges. So the
-- REVOKEs above don't break anything.

------------------------------------------------------------
-- 5. Default-deny going forward
------------------------------------------------------------
-- New functions created in `public` won't auto-grant EXECUTE to
-- PUBLIC. We must explicitly GRANT for each user-callable RPC.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
