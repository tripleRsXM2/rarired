-- ─────────────────────────────────────────────────────────────────────────────
-- 20260426_leagues_v1_foundation.sql
--
-- Private friend leagues — V1 schema foundation.
--
-- A league is a lightweight private season container for a small group of
-- friends to compete against each other. Matches are still normal matches
-- that flow through the existing confirm/dispute/void/expire truth system.
-- A match can OPTIONALLY be tagged with a league_id; standings are derived
-- from CONFIRMED league-tagged matches only.
--
-- V1 guarantees:
--   • We do NOT fork the match truth system. Existing RPCs and triggers for
--     confirmation / dispute / void / expiry are untouched.
--   • A match's league membership is immutable post-insert.
--   • Only active league members can play league matches against each other.
--   • Only CONFIRMED rows count. Pending / disputed / pending_reconfirmation
--     / voided / expired never contribute to standings.
--   • Standings are persisted (fast reads + future snapshot target) and kept
--     in sync by an AFTER trigger that runs a full idempotent recompute
--     whenever a league-linked match changes.
--
-- V1 deferrals (intentional):
--   • Head-to-head tiebreak — SQL-level H2H-among-tied-players requires a
--     recursive pass; deferred to V1.1. V1 falls back to deterministic
--     points → set_diff → game_diff → user_id.
--   • Public / discoverable leagues — visibility column exists but is locked
--     to 'private' in V1.
--   • "Season ending soon" notification — no cron fan-out in V1.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ═════════════════════════════════════════════════════════════════════════════

-- ── leagues ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leagues (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      text NOT NULL CHECK (length(btrim(name)) > 0),
  description               text,
  created_by                uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visibility                text NOT NULL DEFAULT 'private'
                              CHECK (visibility IN ('private')),
  status                    text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','completed','archived')),
  start_date                date,
  end_date                  date,
  max_members               integer CHECK (max_members IS NULL OR max_members >= 2),
  match_format              text NOT NULL DEFAULT 'best_of_3'
                              CHECK (match_format IN ('one_set','best_of_3')),
  tiebreak_format           text NOT NULL DEFAULT 'standard'
                              CHECK (tiebreak_format IN ('standard','super_tiebreak_final')),
  max_matches_per_opponent  integer CHECK (max_matches_per_opponent IS NULL
                                           OR max_matches_per_opponent > 0),
  win_points                integer NOT NULL DEFAULT 3 CHECK (win_points >= 0),
  loss_points               integer NOT NULL DEFAULT 0 CHECK (loss_points >= 0),
  draw_points               integer NOT NULL DEFAULT 0 CHECK (draw_points >= 0),
  -- Stored for future-readiness. V1's recalculate_league_standings() uses
  -- a hard-coded deterministic order (see docs/leagues-and-seasons.md).
  tie_break_order           jsonb NOT NULL DEFAULT
                              '["points","head_to_head","set_difference","game_difference"]'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  completed_at              timestamptz,
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_leagues_created_by ON public.leagues(created_by);
CREATE INDEX IF NOT EXISTS idx_leagues_status     ON public.leagues(status);

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION public._set_leagues_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_leagues_updated_at ON public.leagues;
CREATE TRIGGER trg_leagues_updated_at
  BEFORE UPDATE ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public._set_leagues_updated_at();


-- ── league_members ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.league_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   uuid NOT NULL REFERENCES public.leagues(id)  ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner','admin','member')),
  status      text NOT NULL DEFAULT 'invited'
                CHECK (status IN ('invited','active','declined','removed')),
  invited_by  uuid NOT NULL REFERENCES public.profiles(id),
  joined_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_league_members_user_status
  ON public.league_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_league_members_league_status
  ON public.league_members(league_id, status);


-- ── league_standings ─────────────────────────────────────────────────────────
-- Persisted for fast reads + future "season-end snapshot" target. Written
-- ONLY by the SECURITY DEFINER recalculate_league_standings() function; all
-- direct client writes are revoked.
CREATE TABLE IF NOT EXISTS public.league_standings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id        uuid NOT NULL REFERENCES public.leagues(id)  ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  played           integer NOT NULL DEFAULT 0 CHECK (played   >= 0),
  wins             integer NOT NULL DEFAULT 0 CHECK (wins     >= 0),
  losses           integer NOT NULL DEFAULT 0 CHECK (losses   >= 0),
  points           integer NOT NULL DEFAULT 0,
  sets_won         integer NOT NULL DEFAULT 0 CHECK (sets_won >= 0),
  sets_lost        integer NOT NULL DEFAULT 0 CHECK (sets_lost >= 0),
  games_won        integer NOT NULL DEFAULT 0 CHECK (games_won >= 0),
  games_lost       integer NOT NULL DEFAULT 0 CHECK (games_lost >= 0),
  set_difference   integer NOT NULL DEFAULT 0,
  game_difference  integer NOT NULL DEFAULT 0,
  last_result      text CHECK (last_result IS NULL OR last_result IN ('win','loss','draw')),
  rank             integer,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_league_standings_league
  ON public.league_standings(league_id, rank);


-- ── match_history additions ──────────────────────────────────────────────────
ALTER TABLE public.match_history
  ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_match_history_league
  ON public.match_history(league_id)
  WHERE league_id IS NOT NULL;


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. INTEGRITY — match_history league validation (BEFORE trigger)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Runs on INSERT/UPDATE. Early-returns when NEW.league_id IS NULL so existing
-- non-league flows pay zero cost. When league_id is set, enforces:
--   1. league_id is immutable (OLD.league_id != NEW.league_id → reject)
--   2. league exists and is active
--   3. both submitter and opponent are active members
--   4. max_matches_per_opponent rule not exceeded
-- All violations raise; the offending insert/update is rolled back.

CREATE OR REPLACE FUNCTION public.validate_match_league()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league          public.leagues%ROWTYPE;
  v_user_active     boolean;
  v_opp_active      boolean;
  v_existing_count  integer;
BEGIN
  -- Fast path — no league involvement, nothing to validate
  IF NEW.league_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Immutability: once a match is tagged with a league, that tag can't change.
  -- This preserves the audit trail and prevents post-hoc standings manipulation.
  IF TG_OP = 'UPDATE'
     AND OLD.league_id IS NOT NULL
     AND OLD.league_id IS DISTINCT FROM NEW.league_id THEN
    RAISE EXCEPTION 'league_id is immutable once set on a match (match %)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- League must exist and be active
  SELECT * INTO v_league
  FROM public.leagues
  WHERE id = NEW.league_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'league % does not exist', NEW.league_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_league.status <> 'active' THEN
    RAISE EXCEPTION 'league % is not active (status=%)', v_league.id, v_league.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Opponent must be present AND both parties must be active members
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

  -- max_matches_per_opponent enforcement (NULL = unlimited)
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
$$;

DROP TRIGGER IF EXISTS trg_match_history_validate_league ON public.match_history;
CREATE TRIGGER trg_match_history_validate_league
  BEFORE INSERT OR UPDATE ON public.match_history
  FOR EACH ROW EXECUTE FUNCTION public.validate_match_league();


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. STANDINGS RECALCULATION
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Full idempotent recompute. Always safe to re-run. V1 scale is trivial
-- (≤30 members, ≤500 matches); prefer clarity over incremental mutation.
--
-- Only counts matches where:
--   • match_history.league_id = p_league_id
--   • status = 'confirmed'
--   • both user_id and opponent_id are currently 'active' members
--
-- Tiebreak order (V1): points DESC, set_difference DESC, game_difference DESC,
-- user_id ASC (stable deterministic fallback). Head-to-head among tied players
-- is deferred to V1.1 — see docs/leagues-and-seasons.md.
--
-- EXECUTE is revoked from public/anon/authenticated; only callable via the
-- match_history AFTER trigger and from a future admin surface.

CREATE OR REPLACE FUNCTION public.recalculate_league_standings(p_league_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league public.leagues%ROWTYPE;
BEGIN
  SELECT * INTO v_league FROM public.leagues WHERE id = p_league_id;
  IF NOT FOUND THEN
    -- League was deleted; its standings rows cascaded. Nothing to do.
    RETURN;
  END IF;

  -- Wipe the slate for this league and rebuild from scratch. ON DELETE CASCADE
  -- from leagues already handles the deletion case; this targets only the
  -- specific league to preserve concurrency with other leagues' triggers.
  DELETE FROM public.league_standings WHERE league_id = p_league_id;

  -- Build per-player tallies by unioning each match row twice (once as user,
  -- once as opponent) and grouping.
  WITH active_members AS (
    SELECT user_id
    FROM public.league_members
    WHERE league_id = p_league_id AND status = 'active'
  ),
  -- Only matches both of whose participants are CURRENT active members count.
  eligible_matches AS (
    SELECT m.*
    FROM public.match_history m
    WHERE m.league_id = p_league_id
      AND m.status = 'confirmed'
      AND m.user_id     IN (SELECT user_id FROM active_members)
      AND m.opponent_id IN (SELECT user_id FROM active_members)
  ),
  per_player AS (
    -- Submitter side (m.result is stored in submitter's frame)
    SELECT
      m.user_id                                    AS player_id,
      m.id                                         AS match_id,
      m.confirmed_at                               AS confirmed_at,
      CASE WHEN m.result = 'win'  THEN 1 ELSE 0 END AS is_win,
      CASE WHEN m.result = 'loss' THEN 1 ELSE 0 END AS is_loss,
      CASE WHEN m.result = 'win'  THEN 'win'
           WHEN m.result = 'loss' THEN 'loss'
           ELSE NULL END                           AS last_result_text,
      -- sets_won / sets_lost from submitter's frame (s.you vs s.them per set)
      COALESCE((SELECT count(*) FROM jsonb_array_elements(m.sets) s
                 WHERE (s->>'you')::int > (s->>'them')::int), 0) AS sets_won,
      COALESCE((SELECT count(*) FROM jsonb_array_elements(m.sets) s
                 WHERE (s->>'you')::int < (s->>'them')::int), 0) AS sets_lost,
      COALESCE((SELECT sum((s->>'you')::int)   FROM jsonb_array_elements(m.sets) s), 0) AS games_won,
      COALESCE((SELECT sum((s->>'them')::int)  FROM jsonb_array_elements(m.sets) s), 0) AS games_lost
    FROM eligible_matches m

    UNION ALL

    -- Opponent side (mirror of everything above)
    SELECT
      m.opponent_id                                 AS player_id,
      m.id                                          AS match_id,
      m.confirmed_at                                AS confirmed_at,
      CASE WHEN m.result = 'loss' THEN 1 ELSE 0 END AS is_win,
      CASE WHEN m.result = 'win'  THEN 1 ELSE 0 END AS is_loss,
      CASE WHEN m.result = 'loss' THEN 'win'
           WHEN m.result = 'win'  THEN 'loss'
           ELSE NULL END                            AS last_result_text,
      COALESCE((SELECT count(*) FROM jsonb_array_elements(m.sets) s
                 WHERE (s->>'them')::int > (s->>'you')::int), 0) AS sets_won,
      COALESCE((SELECT count(*) FROM jsonb_array_elements(m.sets) s
                 WHERE (s->>'them')::int < (s->>'you')::int), 0) AS sets_lost,
      COALESCE((SELECT sum((s->>'them')::int) FROM jsonb_array_elements(m.sets) s), 0) AS games_won,
      COALESCE((SELECT sum((s->>'you')::int)  FROM jsonb_array_elements(m.sets) s), 0) AS games_lost
    FROM eligible_matches m
  ),
  aggregated AS (
    SELECT
      p.player_id,
      count(*)                                                   AS played,
      sum(p.is_win)                                              AS wins,
      sum(p.is_loss)                                             AS losses,
      sum(p.is_win)  * v_league.win_points
        + sum(p.is_loss) * v_league.loss_points                  AS points,
      sum(p.sets_won)                                            AS sets_won,
      sum(p.sets_lost)                                           AS sets_lost,
      sum(p.games_won)                                           AS games_won,
      sum(p.games_lost)                                          AS games_lost,
      sum(p.sets_won)  - sum(p.sets_lost)                        AS set_difference,
      sum(p.games_won) - sum(p.games_lost)                       AS game_difference,
      (
        SELECT p2.last_result_text
        FROM per_player p2
        WHERE p2.player_id = p.player_id
        ORDER BY p2.confirmed_at DESC NULLS LAST, p2.match_id DESC
        LIMIT 1
      )                                                          AS last_result
    FROM per_player p
    GROUP BY p.player_id
  ),
  -- Include every active member even if they've played zero confirmed matches
  -- so the standings table has a row for every current participant.
  all_members AS (
    SELECT am.user_id AS player_id
    FROM active_members am
  ),
  filled AS (
    SELECT
      am.player_id,
      COALESCE(a.played,         0)  AS played,
      COALESCE(a.wins,           0)  AS wins,
      COALESCE(a.losses,         0)  AS losses,
      COALESCE(a.points,         0)  AS points,
      COALESCE(a.sets_won,       0)  AS sets_won,
      COALESCE(a.sets_lost,      0)  AS sets_lost,
      COALESCE(a.games_won,      0)  AS games_won,
      COALESCE(a.games_lost,     0)  AS games_lost,
      COALESCE(a.set_difference, 0)  AS set_difference,
      COALESCE(a.game_difference,0)  AS game_difference,
      a.last_result
    FROM all_members am
    LEFT JOIN aggregated a ON a.player_id = am.player_id
  ),
  ranked AS (
    SELECT
      f.*,
      ROW_NUMBER() OVER (
        ORDER BY
          f.points          DESC,
          f.set_difference  DESC,
          f.game_difference DESC,
          f.player_id       ASC   -- stable deterministic fallback (V1.1 → H2H)
      ) AS rank
    FROM filled f
  )
  INSERT INTO public.league_standings (
    league_id, user_id,
    played, wins, losses, points,
    sets_won, sets_lost, games_won, games_lost,
    set_difference, game_difference,
    last_result, rank, updated_at
  )
  SELECT
    p_league_id, r.player_id,
    r.played, r.wins, r.losses, r.points,
    r.sets_won, r.sets_lost, r.games_won, r.games_lost,
    r.set_difference, r.game_difference,
    r.last_result, r.rank, now()
  FROM ranked r;
END;
$$;


-- ── AFTER trigger — keep standings in sync ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalc_league_standings_on_match_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- DELETE → OLD has the league; INSERT → NEW has it; UPDATE → either/both.
  -- Always recompute the affected league(s). Idempotent so it's safe to
  -- run multiple times; early-returns inside recalc when nothing eligible.
  IF TG_OP = 'DELETE' THEN
    IF OLD.league_id IS NOT NULL THEN
      PERFORM public.recalculate_league_standings(OLD.league_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.league_id IS NOT NULL THEN
    PERFORM public.recalculate_league_standings(NEW.league_id);
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.league_id IS NOT NULL
     AND OLD.league_id IS DISTINCT FROM NEW.league_id THEN
    -- Shouldn't happen (validate_match_league rejects it) but defence-in-depth.
    PERFORM public.recalculate_league_standings(OLD.league_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_history_recalc_league_standings ON public.match_history;
CREATE TRIGGER trg_match_history_recalc_league_standings
  AFTER INSERT OR UPDATE OR DELETE ON public.match_history
  FOR EACH ROW EXECUTE FUNCTION public.recalc_league_standings_on_match_change();


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. RPCS — creator/member flow
-- ═════════════════════════════════════════════════════════════════════════════

-- ── create_league ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_league(
  p_name                     text,
  p_description              text DEFAULT NULL,
  p_start_date               date DEFAULT NULL,
  p_end_date                 date DEFAULT NULL,
  p_max_members              integer DEFAULT NULL,
  p_match_format             text DEFAULT 'best_of_3',
  p_tiebreak_format          text DEFAULT 'standard',
  p_max_matches_per_opponent integer DEFAULT NULL,
  p_win_points               integer DEFAULT 3,
  p_loss_points              integer DEFAULT 0,
  p_draw_points              integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
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

  INSERT INTO public.leagues (
    name, description, created_by,
    start_date, end_date, max_members,
    match_format, tiebreak_format, max_matches_per_opponent,
    win_points, loss_points, draw_points
  )
  VALUES (
    btrim(p_name), p_description, v_uid,
    p_start_date, p_end_date, p_max_members,
    p_match_format, p_tiebreak_format, p_max_matches_per_opponent,
    p_win_points, p_loss_points, p_draw_points
  )
  RETURNING id INTO v_league_id;

  -- Creator is owner + active automatically. Self-invited.
  INSERT INTO public.league_members (league_id, user_id, role, status, invited_by, joined_at)
  VALUES (v_league_id, v_uid, 'owner', 'active', v_uid, now());

  -- Seed a standings row for the creator (zeroed — no matches yet).
  -- The AFTER trigger on match_history will repopulate as matches land.
  INSERT INTO public.league_standings (league_id, user_id, rank)
  VALUES (v_league_id, v_uid, 1);

  RETURN v_league_id;
END;
$$;


-- ── invite_to_league ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invite_to_league(
  p_league_id uuid,
  p_user_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean;
  v_league_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'must be signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO v_league_status FROM public.leagues WHERE id = p_league_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'league % does not exist', p_league_id;
  END IF;
  IF v_league_status <> 'active' THEN
    RAISE EXCEPTION 'league is not active';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = p_league_id AND user_id = v_uid AND role = 'owner' AND status = 'active'
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'only the league owner can invite members'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'cannot invite yourself — you are already the owner';
  END IF;

  INSERT INTO public.league_members (league_id, user_id, role, status, invited_by)
  VALUES (p_league_id, p_user_id, 'member', 'invited', v_uid)
  ON CONFLICT (league_id, user_id) DO UPDATE
    SET status     = CASE
                       WHEN league_members.status IN ('declined','removed') THEN 'invited'
                       ELSE league_members.status
                     END,
        invited_by = EXCLUDED.invited_by;

  -- Fire notification (best-effort — not part of transactional guarantees)
  INSERT INTO public.notifications (user_id, type, from_user_id, entity_id)
  VALUES (p_user_id, 'league_invite', v_uid, p_league_id);
END;
$$;


-- ── respond_to_league_invite ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.respond_to_league_invite(
  p_league_id uuid,
  p_accept    boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_member public.league_members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'must be signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_member
  FROM public.league_members
  WHERE league_id = p_league_id AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no invitation found';
  END IF;
  IF v_member.status <> 'invited' THEN
    RAISE EXCEPTION 'invitation is no longer pending (status=%)', v_member.status;
  END IF;

  IF p_accept THEN
    UPDATE public.league_members
       SET status = 'active', joined_at = now()
     WHERE id = v_member.id;

    -- Seed zeroed standings row; AFTER trigger on match_history will update
    -- as matches are logged/confirmed.
    INSERT INTO public.league_standings (league_id, user_id, rank)
    VALUES (p_league_id, v_uid, NULL)
    ON CONFLICT (league_id, user_id) DO NOTHING;

    -- Recompute ranks now that a new active member has joined
    PERFORM public.recalculate_league_standings(p_league_id);

    -- Notify other active members that someone joined
    INSERT INTO public.notifications (user_id, type, from_user_id, entity_id)
    SELECT lm.user_id, 'league_joined', v_uid, p_league_id
    FROM public.league_members lm
    WHERE lm.league_id = p_league_id
      AND lm.status = 'active'
      AND lm.user_id <> v_uid;
  ELSE
    UPDATE public.league_members
       SET status = 'declined'
     WHERE id = v_member.id;
  END IF;
END;
$$;


-- ── remove_league_member ─────────────────────────────────────────────────────
-- Per product decision: historical confirmed matches are preserved in
-- standings (they're part of the league's history). After removal, the
-- standings recompute will drop the removed user from the active_members
-- subquery so their tallies won't appear in the new standings table — but
-- the match_history rows themselves are untouched.
CREATE OR REPLACE FUNCTION public.remove_league_member(
  p_league_id uuid,
  p_user_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target public.league_members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'must be signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = p_league_id AND user_id = v_uid
      AND role = 'owner' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'only the league owner can remove members'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_target
  FROM public.league_members
  WHERE league_id = p_league_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of this league';
  END IF;
  IF v_target.role = 'owner' THEN
    RAISE EXCEPTION 'cannot remove the league owner';
  END IF;

  UPDATE public.league_members
     SET status = 'removed'
   WHERE id = v_target.id;

  PERFORM public.recalculate_league_standings(p_league_id);
END;
$$;


-- ── archive_league ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.archive_league(p_league_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'must be signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = p_league_id AND user_id = v_uid
      AND role = 'owner' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'only the league owner can archive the league'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.leagues
     SET status       = 'archived',
         completed_at = COALESCE(completed_at, now())
   WHERE id = p_league_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. RLS — SELECT visibility; writes are RPC / trigger only
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.leagues          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_standings ENABLE ROW LEVEL SECURITY;

-- leagues: visible to active OR invited members AND to the creator
DROP POLICY IF EXISTS leagues_select_members ON public.leagues;
CREATE POLICY leagues_select_members ON public.leagues
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = leagues.id
        AND lm.user_id = auth.uid()
        AND lm.status IN ('invited','active')
    )
  );
-- Writes: no direct policies → DENIED by default. Use RPCs.

-- league_members: visible to co-members (any row where the viewer is a
-- participant of that league). Own row also always visible.
DROP POLICY IF EXISTS league_members_select ON public.league_members;
CREATE POLICY league_members_select ON public.league_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.league_members me
      WHERE me.league_id = league_members.league_id
        AND me.user_id = auth.uid()
        AND me.status IN ('invited','active')
    )
  );
-- Writes DENIED → use RPCs.

-- league_standings: visible to co-members of the league.
DROP POLICY IF EXISTS league_standings_select ON public.league_standings;
CREATE POLICY league_standings_select ON public.league_standings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members me
      WHERE me.league_id = league_standings.league_id
        AND me.user_id = auth.uid()
        AND me.status IN ('invited','active')
    )
  );
-- Writes DENIED → only SECURITY DEFINER recalc writes.


-- ═════════════════════════════════════════════════════════════════════════════
-- 6. GRANTS — minimum surface
-- ═════════════════════════════════════════════════════════════════════════════

-- Tables: readable via RLS; no direct writes exposed to clients.
REVOKE ALL ON public.leagues,
             public.league_members,
             public.league_standings
  FROM public, anon, authenticated;

GRANT SELECT ON public.leagues,
                public.league_members,
                public.league_standings
  TO authenticated;

-- RPCs that clients legitimately invoke
GRANT EXECUTE ON FUNCTION public.create_league(text, text, date, date, integer, text, text, integer, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_to_league(uuid, uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_league_invite(uuid, boolean)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_league_member(uuid, uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_league(uuid)                       TO authenticated;

-- Internal: only callable via trigger / server role. No client surface.
REVOKE ALL ON FUNCTION public.recalculate_league_standings(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_match_league() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_league_standings_on_match_change() FROM public, anon, authenticated;

COMMIT;
