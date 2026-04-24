-- ─────────────────────────────────────────────────────────────────────────────
-- 20260425_match_type_separation.sql
--
-- Core product rule: a match has an explicit match_type — 'ranked' or
-- 'casual'. Ranked counts (Elo + leaderboard); casual just records that
-- the match happened (feed + history only).
--
--   Casual = "this happened"
--   Ranked = "this counts"
--
-- Before this migration the client derived ranked-vs-casual from the
-- string `tourn_name` ('Ranked' / 'Casual Match' / tournament-name) and
-- from `opponent_id IS NOT NULL`. That worked but split the truth across
-- two columns and a free-text label. This migration:
--
-- 1. Adds match_type with CHECK + default 'casual' (safer onboarding —
--    a missing client tag never accidentally affects Elo).
-- 2. Backfills existing rows from the (opponent_id, tourn_name) heuristic
--    so every historical match keeps the same Elo treatment it had before.
-- 3. Gates apply_match_outcome on match_type='ranked' so casual matches
--    confirm normally but never bump ranking_points / wins / losses /
--    matches_played / streak — they remain "this happened" only.
-- 4. Extends validate_match_league to require match_type='ranked' for any
--    match tagged with a league_id (leagues are ranked-only by design).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Column + check + default ─────────────────────────────────────────────
ALTER TABLE public.match_history
  ADD COLUMN IF NOT EXISTS match_type text NOT NULL DEFAULT 'casual'
    CHECK (match_type IN ('ranked', 'casual'));


-- ── 2. Backfill ─────────────────────────────────────────────────────────────
-- A match was treated as 'ranked' under the old heuristic if EITHER:
--   • opponent_id IS NOT NULL (linked-opponent ranked submission), OR
--   • tourn_name was a real tournament name (not '', 'Casual Match', 'Casual').
-- Everything else is 'casual'. We apply the update once; new rows get the
-- explicit value from the client (see useMatchHistory.submitMatch).
UPDATE public.match_history
   SET match_type = 'ranked'
 WHERE match_type = 'casual'  -- only touch rows still on the default
   AND (
     opponent_id IS NOT NULL
     OR (tourn_name IS NOT NULL AND tourn_name NOT IN ('', 'Casual Match', 'Casual'))
   );


-- ── 3. Index for ranked-only queries (leaderboard, ranked-W/L counts) ──────
CREATE INDEX IF NOT EXISTS idx_match_history_ranked
  ON public.match_history(match_type, status)
  WHERE match_type = 'ranked';


-- ── 4. apply_match_outcome — gate on match_type='ranked' ────────────────────
-- Casual matches still flow through the confirmation lifecycle (status
-- transitions, notifications, the AFTER trigger that recalcs league
-- standings) but apply_match_outcome no-ops for them. Single point of
-- control: every Elo/stat write goes through this function.
CREATE OR REPLACE FUNCTION public.apply_match_outcome(p_match_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_submitter_id   uuid;
  v_opponent_id    uuid;
  v_tagged_user_id uuid;
  v_result         text;
  v_match_type     text;
  v_sub_rating     int;
  v_opp_rating     int;
  v_sub_played     int;
  v_opp_played     int;
  v_k_sub          int;
  v_k_opp          int;
  v_expected_sub   numeric;
  v_expected_opp   numeric;
  v_score_sub      numeric;
  v_score_opp      numeric;
  v_new_sub        int;
  v_new_opp        int;
BEGIN
  SELECT user_id, opponent_id, tagged_user_id, result, match_type
    INTO v_submitter_id, v_opponent_id, v_tagged_user_id, v_result, v_match_type
    FROM public.match_history
   WHERE id::text = p_match_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Match % not found', p_match_id; END IF;

  -- Auth gate: when invoked directly by a client, caller must be a party.
  -- session_user='postgres' bypass means "called from another SECURITY
  -- DEFINER function whose own auth check has already passed."
  IF session_user <> 'postgres' THEN
    IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
    IF uid NOT IN (v_submitter_id, v_opponent_id, v_tagged_user_id) THEN
      RAISE EXCEPTION 'not a party to this match';
    END IF;
  END IF;

  -- ── Core product rule: only ranked matches affect Elo/stats. ───────────
  -- Casual matches return immediately. They still have a confirmed status
  -- and live in the feed/profile/history; they just don't count.
  IF v_match_type IS DISTINCT FROM 'ranked' THEN
    RETURN;
  END IF;

  -- Ranked but no opponent (rare data drift — e.g. opponent deleted account)
  IF v_opponent_id IS NULL THEN RETURN; END IF;

  PERFORM 1 FROM public.profiles
    WHERE id IN (v_submitter_id, v_opponent_id) ORDER BY id FOR UPDATE;

  SELECT COALESCE(ranking_points, 1000), COALESCE(matches_played, 0)
    INTO v_sub_rating, v_sub_played FROM public.profiles WHERE id = v_submitter_id;
  SELECT COALESCE(ranking_points, 1000), COALESCE(matches_played, 0)
    INTO v_opp_rating, v_opp_played FROM public.profiles WHERE id = v_opponent_id;

  v_k_sub := CASE WHEN v_sub_played < 20 THEN 32 ELSE 16 END;
  v_k_opp := CASE WHEN v_opp_played < 20 THEN 32 ELSE 16 END;

  v_expected_sub := 1.0 / (1.0 + power(10.0, (v_opp_rating - v_sub_rating) / 400.0));
  v_expected_opp := 1.0 - v_expected_sub;

  v_score_sub := CASE WHEN v_result = 'win' THEN 1.0 ELSE 0.0 END;
  v_score_opp := 1.0 - v_score_sub;

  v_new_sub := greatest(0, v_sub_rating + round(v_k_sub * (v_score_sub - v_expected_sub))::int);
  v_new_opp := greatest(0, v_opp_rating + round(v_k_opp * (v_score_opp - v_expected_opp))::int);

  UPDATE public.profiles SET
    wins           = wins   + CASE WHEN v_result = 'win'  THEN 1 ELSE 0 END,
    losses         = losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    matches_played = matches_played + 1,
    ranking_points = v_new_sub
  WHERE id = v_submitter_id;

  UPDATE public.profiles SET
    wins           = wins   + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    losses         = losses + CASE WHEN v_result = 'win'  THEN 1 ELSE 0 END,
    matches_played = matches_played + 1,
    ranking_points = v_new_opp
  WHERE id = v_opponent_id;
END;
$function$;


-- ── 5. validate_match_league — leagues are ranked-only ──────────────────────
-- Augments the existing trigger: a match tagged with league_id MUST be
-- ranked. League standings are derived from confirmed ranked matches; a
-- casual league match would silently never count, which is more confusing
-- than rejecting it at insert time.
CREATE OR REPLACE FUNCTION public.validate_match_league()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_league          public.leagues%ROWTYPE;
  v_user_active     boolean;
  v_opp_active      boolean;
  v_existing_count  integer;
BEGIN
  IF NEW.league_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Immutable league_id post-insert
  IF TG_OP = 'UPDATE'
     AND OLD.league_id IS NOT NULL
     AND OLD.league_id IS DISTINCT FROM NEW.league_id THEN
    RAISE EXCEPTION 'league_id is immutable once set on a match (match %)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- League must exist + be active
  SELECT * INTO v_league FROM public.leagues WHERE id = NEW.league_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'league % does not exist', NEW.league_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_league.status <> 'active' THEN
    RAISE EXCEPTION 'league % is not active (status=%)', v_league.id, v_league.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── NEW: leagues are ranked-only ─────────────────────────────────────────
  IF NEW.match_type IS DISTINCT FROM 'ranked' THEN
    RAISE EXCEPTION 'league matches must be ranked (match_type=%, league %)',
      COALESCE(NEW.match_type, 'NULL'), NEW.league_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Opponent + both-must-be-active checks (unchanged)
  IF NEW.opponent_id IS NULL THEN
    RAISE EXCEPTION 'league matches must have an opponent_id (match %)', NEW.id
      USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = NEW.league_id AND user_id = NEW.user_id AND status = 'active'
  ) INTO v_user_active;
  IF NOT v_user_active THEN
    RAISE EXCEPTION 'user % is not an active member of league %', NEW.user_id, NEW.league_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = NEW.league_id AND user_id = NEW.opponent_id AND status = 'active'
  ) INTO v_opp_active;
  IF NOT v_opp_active THEN
    RAISE EXCEPTION 'opponent % is not an active member of league %', NEW.opponent_id, NEW.league_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- max_matches_per_opponent enforcement (unchanged)
  IF v_league.max_matches_per_opponent IS NOT NULL AND TG_OP = 'INSERT' THEN
    SELECT count(*) INTO v_existing_count
    FROM public.match_history
    WHERE league_id = NEW.league_id
      AND status <> 'voided'
      AND (
        (user_id = NEW.user_id     AND opponent_id = NEW.opponent_id) OR
        (user_id = NEW.opponent_id AND opponent_id = NEW.user_id)
      );
    IF v_existing_count >= v_league.max_matches_per_opponent THEN
      RAISE EXCEPTION
        'league % allows at most % match(es) per opponent pair (already have %)',
        NEW.league_id, v_league.max_matches_per_opponent, v_existing_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
