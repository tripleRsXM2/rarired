-- 20260425_restrict_expire_stale_matches.sql
--
-- SECURITY FIX: expire_stale_matches() is a SECURITY DEFINER function that
-- performs global UPDATEs on match_history (flipping pending→expired and
-- stale-disputed→voided). Prior migrations granted EXECUTE to `anon` and
-- `authenticated`, which meant any client with the anon key could trigger
-- a global mutation.
--
-- The function remains the canonical server-side sweep, but only trusted
-- roles (pg_cron owner + service_role) can invoke it now. Client code
-- uses the user-scoped JS helpers `expireStalePendingMatches(userId)` and
-- `expireDisputedMatches(userId)` which issue UPDATEs constrained by both
-- an explicit (user_id | opponent_id = me) filter AND the existing RLS
-- UPDATE policy on match_history.
--
-- pg_cron is unaffected: the 'expire-stale-matches' job runs as the
-- `postgres` role (verified via `SELECT username FROM cron.job`), which
-- is not one of the roles we revoke from.

REVOKE ALL ON FUNCTION public.expire_stale_matches() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_stale_matches() FROM anon;
REVOKE ALL ON FUNCTION public.expire_stale_matches() FROM authenticated;

-- Defensive: ensure service_role (backend / edge functions) retains
-- EXECUTE even if a future migration tightens default privileges.
GRANT EXECUTE ON FUNCTION public.expire_stale_matches() TO service_role;

-- Document the access model on the function itself so the next dev
-- sees the constraint in \df+ output.
COMMENT ON FUNCTION public.expire_stale_matches() IS
  'Global match-expiry sweep. SECURITY DEFINER. Callable ONLY by the '
  'pg_cron job (runs as postgres) and service_role. Never expose to '
  'anon / authenticated — clients use the user-scoped helpers in '
  'src/features/scoring/services/matchService.js instead.';
