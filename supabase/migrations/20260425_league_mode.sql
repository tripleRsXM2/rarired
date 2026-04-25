-- ─────────────────────────────────────────────────────────────────────────────
-- 20260425_league_mode.sql
--
-- Introduces leagues.mode ('ranked' | 'casual') so leagues can host either
-- ranked matches (Elo-bearing, the existing behaviour) OR casual matches
-- (no Elo, but still scoreboard inside the league via win_points). Replaces
-- the hardcoded `match_type='ranked'` check inside validate_match_league
-- with a per-league comparison against the new column.
--
-- Product rule (locked):
--   • mode='ranked'  → only match_type='ranked' rows accepted
--   • mode='casual'  → only match_type='casual' rows accepted
--   • cross-mode submissions are rejected at the DB layer (defence in
--     depth — UI also filters the league selector by mode)
--
-- Casual leagues still get a per-league leaderboard via the existing
-- recalculate_league_standings function — that function only filters by
-- status='confirmed' + active membership, so it's mode-agnostic and works
-- correctly for casual leagues out of the box. No global Elo bleed: casual
-- match rows still bypass apply_match_outcome (per the match_type=casual
-- short-circuit added on 2026-04-25).
--
-- Backfill: every existing league becomes 'ranked' (the previous implicit
-- behaviour). Default 'ranked' on new rows aligns with the match_type
-- default convention.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Column + check + default ─────────────────────────────────────────────
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'ranked'
    CHECK (mode IN ('ranked', 'casual'));

-- (Backfill is implicit via the default — every existing row was ranked
-- under the previous trigger, so 'ranked' is correct for them all.)

CREATE INDEX IF NOT EXISTS idx_leagues_mode_active
  ON public.leagues(mode, status)
  WHERE status = 'active';


-- ── 2. validate_match_league — per-league mode comparison ───────────────────
-- Same trigger as before; only the cross-mode check changed. Every other
-- guard (immutable league_id, league must exist + be active, both parties
-- active members, max_matches_per_opponent) is preserved verbatim.
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

  SELECT * INTO v_league FROM public.leagues WHERE id = NEW.league_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'league % does not exist', NEW.league_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_league.status <> 'active' THEN
    RAISE EXCEPTION 'league % is not active (status=%)', v_league.id, v_league.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── NEW: match_type must equal league.mode ─────────────────────────────
  -- Was previously hardcoded to 'ranked'. Now compares per-league so a
  -- mode='casual' league accepts only match_type='casual' rows, and a
  -- mode='ranked' league accepts only match_type='ranked' rows.
  IF NEW.match_type IS DISTINCT FROM v_league.mode THEN
    RAISE EXCEPTION
      'league % is mode=% but match was logged as match_type=%',
      v_league.id, v_league.mode, COALESCE(NEW.match_type, 'NULL')
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


-- ── 3. create_league — accepts p_mode ───────────────────────────────────────
-- Drops + recreates because the parameter list changed (Postgres requires
-- DROP for parameter additions on a SECURITY DEFINER function).
DROP FUNCTION IF EXISTS public.create_league(text, text, date, date, integer, text, text, integer, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.create_league(
  p_name                     text,
  p_description              text    DEFAULT NULL,
  p_start_date               date    DEFAULT NULL,
  p_end_date                 date    DEFAULT NULL,
  p_max_members              integer DEFAULT NULL,
  p_match_format             text    DEFAULT 'best_of_3',
  p_tiebreak_format          text    DEFAULT 'standard',
  p_max_matches_per_opponent integer DEFAULT NULL,
  p_win_points               integer DEFAULT 3,
  p_loss_points              integer DEFAULT 0,
  p_draw_points              integer DEFAULT 0,
  p_mode                     text    DEFAULT 'ranked'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_league_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'must be signed in to create a league'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'league name is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_mode NOT IN ('ranked', 'casual') THEN
    RAISE EXCEPTION 'mode must be ''ranked'' or ''casual'' (got %)', p_mode
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.leagues (
    name, description, created_by,
    start_date, end_date, max_members,
    match_format, tiebreak_format, max_matches_per_opponent,
    win_points, loss_points, draw_points,
    mode
  )
  VALUES (
    btrim(p_name), p_description, v_uid,
    p_start_date, p_end_date, p_max_members,
    p_match_format, p_tiebreak_format, p_max_matches_per_opponent,
    p_win_points, p_loss_points, p_draw_points,
    p_mode
  )
  RETURNING id INTO v_league_id;

  -- Creator is owner + active automatically. Self-invited.
  INSERT INTO public.league_members (league_id, user_id, role, status, invited_by, joined_at)
  VALUES (v_league_id, v_uid, 'owner', 'active', v_uid, now());

  -- Seed a standings row for the creator (zeroed — no matches yet).
  INSERT INTO public.league_standings (league_id, user_id, rank)
  VALUES (v_league_id, v_uid, 1);

  RETURN v_league_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_league(
  text, text, date, date, integer, text, text, integer, integer, integer, integer, text
) TO authenticated;

COMMIT;
