-- ─────────────────────────────────────────────────────────────────────────────
-- 20260427_leagues_rls_recursion_fix.sql
--
-- Fixes a silent read-path failure from slice 1: all three SELECT policies on
-- leagues / league_members / league_standings used an inline EXISTS subquery
-- against league_members, which re-triggered league_members's own RLS policy
-- (which references league_members again), producing:
--
--     ERROR:  42P17: infinite recursion detected in policy for
--     relation "league_members"
--
-- Symptom: leagues created via create_league RPC persisted correctly in the
-- DB, but the authenticated SELECT from the client returned empty / errored
-- out silently (useLeagues logged to console but showed "no leagues").
--
-- Fix: replace the inline EXISTS with a SECURITY DEFINER STABLE helper
-- function. SECURITY DEFINER runs with the definer's privileges and
-- bypasses RLS on its internal query, breaking the recursion. STABLE lets
-- Postgres cache the result within a single query for performance.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Helper: is (user, league) an active/invited member? ─────────────────────
CREATE OR REPLACE FUNCTION public._is_league_member(p_league_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.league_members
    WHERE league_id = p_league_id
      AND user_id   = p_user_id
      AND status IN ('invited','active')
  );
$$;

-- Only authenticated callers should invoke this. Internal RLS uses it as a
-- row-filter; it returns a plain boolean so it's safe to expose.
REVOKE ALL ON FUNCTION public._is_league_member(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._is_league_member(uuid, uuid) TO authenticated;


-- ── Rewrite the three SELECT policies to use the helper ─────────────────────
DROP POLICY IF EXISTS leagues_select_members ON public.leagues;
CREATE POLICY leagues_select_members ON public.leagues
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public._is_league_member(id, auth.uid())
  );

DROP POLICY IF EXISTS league_members_select ON public.league_members;
CREATE POLICY league_members_select ON public.league_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public._is_league_member(league_id, auth.uid())
  );

DROP POLICY IF EXISTS league_standings_select ON public.league_standings;
CREATE POLICY league_standings_select ON public.league_standings
  FOR SELECT TO authenticated
  USING (
    public._is_league_member(league_id, auth.uid())
  );

COMMIT;
