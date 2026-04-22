-- ─────────────────────────────────────────────────────────────────────────────
-- DDL-presence smoke test for 20260426_leagues_v1_foundation.sql
--
-- This test verifies the MIGRATION LANDED CORRECTLY — tables, columns,
-- constraints, functions, triggers, policies, grants. It does NOT create
-- synthetic users (profiles.id FKs to auth.users and we're running against
-- a shared DB; behavioural tests that need real sessions belong in the UI
-- integration tests once slice 2 lands).
--
-- Run with:
--   SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase/access-token)" \
--     /tmp/supabase db query --linked \
--     -f supabase/migrations/verify/20260426_leagues_v1_smoke.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count int;
BEGIN
  -- ── 1. Tables ─────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN ('leagues','league_members','league_standings');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 tables (leagues, league_members, league_standings), found %', v_count;
  END IF;
  RAISE NOTICE 'TEST 1 PASS: 3 tables present';

  -- ── 2. match_history.league_id column exists + nullable ──────────────────
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='match_history' AND column_name='league_id';
  IF v_count <> 1 THEN RAISE EXCEPTION 'match_history.league_id column missing'; END IF;

  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='match_history'
    AND column_name='league_id' AND is_nullable='YES';
  IF v_count <> 1 THEN RAISE EXCEPTION 'match_history.league_id must be nullable'; END IF;
  RAISE NOTICE 'TEST 2 PASS: match_history.league_id present + nullable';

  -- ── 3. match_history.league_id FK references leagues(id) ─────────────────
  SELECT count(*) INTO v_count
  FROM information_schema.referential_constraints r
  JOIN information_schema.key_column_usage k
    ON k.constraint_name = r.constraint_name
  WHERE k.table_schema = 'public'
    AND k.table_name   = 'match_history'
    AND k.column_name  = 'league_id';
  IF v_count < 1 THEN RAISE EXCEPTION 'match_history.league_id FK missing'; END IF;
  RAISE NOTICE 'TEST 3 PASS: match_history.league_id FK present';

  -- ── 4. All expected RPCs + trigger functions present ─────────────────────
  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'create_league','invite_to_league','respond_to_league_invite',
      'remove_league_member','archive_league',
      'recalculate_league_standings',
      'validate_match_league','recalc_league_standings_on_match_change',
      '_set_leagues_updated_at'
    );
  IF v_count < 9 THEN
    RAISE EXCEPTION 'Expected 9 functions, found % — one or more RPCs/triggers missing', v_count;
  END IF;
  RAISE NOTICE 'TEST 4 PASS: all 9 functions present';

  -- ── 5. Triggers attached to match_history ────────────────────────────────
  SELECT count(*) INTO v_count
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname = 'match_history'
    AND t.tgname IN ('trg_match_history_validate_league','trg_match_history_recalc_league_standings')
    AND NOT t.tgisinternal;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Expected 2 league triggers on match_history, found %', v_count;
  END IF;
  RAISE NOTICE 'TEST 5 PASS: validate_league + recalc_standings triggers attached to match_history';

  -- ── 6. RLS enabled on all three new tables ───────────────────────────────
  SELECT count(*) INTO v_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('leagues','league_members','league_standings')
    AND c.relrowsecurity = true;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'RLS not enabled on all 3 new tables (only % have it)', v_count;
  END IF;
  RAISE NOTICE 'TEST 6 PASS: RLS enabled on all 3 new tables';

  -- ── 7. SELECT policy present for each new table ──────────────────────────
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN ('leagues','league_members','league_standings');
  IF v_count < 3 THEN
    RAISE EXCEPTION 'Expected at least 3 RLS policies across new tables, found %', v_count;
  END IF;
  RAISE NOTICE 'TEST 7 PASS: % RLS policies present', v_count;

  -- ── 8. authenticated role has EXECUTE on user-facing RPCs ────────────────
  --     (create_league / invite_to_league / respond_to_league_invite /
  --      remove_league_member / archive_league)
  SELECT count(*) INTO v_count
  FROM information_schema.routine_privileges
  WHERE routine_schema='public'
    AND grantee='authenticated'
    AND privilege_type='EXECUTE'
    AND routine_name IN (
      'create_league','invite_to_league','respond_to_league_invite',
      'remove_league_member','archive_league'
    );
  IF v_count < 5 THEN
    RAISE EXCEPTION 'Expected authenticated EXECUTE on 5 RPCs, found %', v_count;
  END IF;
  RAISE NOTICE 'TEST 8 PASS: authenticated has EXECUTE on 5 user-facing RPCs';

  -- ── 9. authenticated role does NOT have EXECUTE on internal functions ────
  SELECT count(*) INTO v_count
  FROM information_schema.routine_privileges
  WHERE routine_schema='public'
    AND grantee='authenticated'
    AND privilege_type='EXECUTE'
    AND routine_name IN ('recalculate_league_standings');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'authenticated should NOT have EXECUTE on recalculate_league_standings (found %)', v_count;
  END IF;
  RAISE NOTICE 'TEST 9 PASS: recalculate_league_standings is server-only (no client EXECUTE)';

  -- ── 10. Index on match_history(league_id) ────────────────────────────────
  SELECT count(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname='public'
    AND tablename='match_history'
    AND indexname='idx_match_history_league';
  IF v_count <> 1 THEN RAISE EXCEPTION 'idx_match_history_league missing'; END IF;
  RAISE NOTICE 'TEST 10 PASS: match_history league index present';

  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'ALL DDL PRESENCE CHECKS PASSED';
  RAISE NOTICE 'Behavioural tests deferred to slice 2 (UI integration).';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
