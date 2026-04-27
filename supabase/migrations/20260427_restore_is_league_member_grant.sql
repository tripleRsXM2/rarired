-- 20260427_restore_is_league_member_grant.sql
--
-- Fix: leagues + league_members + league_standings invisible to every
-- authenticated user. Symptom in the UI: "No leagues yet" empty state
-- on /tournaments/leagues, and clicking "+ Create league" appears to
-- do nothing — the RPC succeeds, but the subsequent fetchMyLeagues
-- read is rejected by RLS, so the league never appears in local state.
--
-- Root cause: 20260429_revoke_internal_rpc_grants.sql REVOKED EXECUTE
-- on public._is_league_member(uuid, uuid) from PUBLIC, anon, and
-- authenticated. The "lock on principle" comment in that migration was
-- wrong: this function is called from inside three RLS USING clauses:
--
--   leagues.leagues_select_members
--   league_members.league_members_select
--   league_standings.league_standings_select
--
-- Postgres evaluates RLS expressions AS the calling role. Even though
-- _is_league_member is SECURITY DEFINER (so its body runs as the
-- function owner), the CALL itself requires EXECUTE permission on the
-- caller's role. Without it, Postgres raises:
--
--   permission denied for function _is_league_member  (SQLSTATE 42501)
--
-- and the entire SELECT returns nothing — silently for the client,
-- breakingly for the UI.
--
-- Reproduced live by running fetchMyLeagues from a signed-in browser
-- session: error.code = 42501, error.message exactly as above.
--
-- This migration restores EXECUTE on the helper. Going forward, any
-- function that's invoked from an RLS expression MUST keep EXECUTE
-- granted to the roles whose policies reference it. The
-- revoke_internal_rpc_grants migration's general intent was sound
-- (lock down trigger-only functions + the privileged math wrappers),
-- but RLS helpers belong in a separate "callable from policies"
-- bucket. Documented inline below so the next round of hardening
-- doesn't re-revoke this.

begin;

-- Re-grant EXECUTE on the RLS helper. anon needs it too because the
-- migration defaults revoked from PUBLIC + anon + authenticated
-- (PUBLIC is the umbrella both other roles inherit from).
grant execute on function public._is_league_member(uuid, uuid) to authenticated, anon;

comment on function public._is_league_member(uuid, uuid) is
  'STABLE SECURITY DEFINER helper used inside RLS policies on '
  'leagues / league_members / league_standings. Must remain EXECUTE-'
  'granted to authenticated + anon — RLS expressions are evaluated as '
  'the calling role, so revoking EXECUTE breaks the SELECT policies '
  'that depend on this function (SQLSTATE 42501). Do NOT revoke.';

commit;
