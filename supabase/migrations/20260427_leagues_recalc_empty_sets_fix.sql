-- ─────────────────────────────────────────────────────────────────────────────
-- 20260427_leagues_recalc_empty_sets_fix.sql
--
-- Fix: recalculate_league_standings() raised
--
--     ERROR:  invalid input syntax for type integer: ""
--
-- when a league match had a set with an empty-string score on one side
-- (e.g. {"you": "6", "them": ""} — a retirement / incomplete set).
-- The (s->>'them')::int cast fails on ''.
--
-- Because the recalc is called from an AFTER trigger on match_history,
-- this exception propagated up and rolled back the enclosing
-- transaction — meaning the opponent's confirm_match_and_update_stats
-- RPC ALSO rolled back. Net effect: confirmed clicks did nothing,
-- league standings never updated, and users saw a raw Postgres error
-- in the UI.
--
-- Fix: replace every (s->>'xxx')::int with NULLIF(s->>'xxx','')::int.
-- That turns empty strings into NULL which:
--   • `::int` passes through (NULL::int = NULL)
--   • `sum(...)` ignores NULL automatically
--   • `>` and `<` return NULL on either side, so WHERE clauses skip
--     incomplete sets (they don't count as sets-won/sets-lost)
--
-- The function body is otherwise identical to the original.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

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
    RETURN;
  END IF;

  DELETE FROM public.league_standings WHERE league_id = p_league_id;

  WITH active_members AS (
    SELECT user_id
    FROM public.league_members
    WHERE league_id = p_league_id AND status = 'active'
  ),
  eligible_matches AS (
    SELECT m.*
    FROM public.match_history m
    WHERE m.league_id = p_league_id
      AND m.status = 'confirmed'
      AND m.user_id     IN (SELECT user_id FROM active_members)
      AND m.opponent_id IN (SELECT user_id FROM active_members)
  ),
  per_player AS (
    -- Submitter side
    SELECT
      m.user_id                                    AS player_id,
      m.id                                         AS match_id,
      m.confirmed_at                               AS confirmed_at,
      CASE WHEN m.result = 'win'  THEN 1 ELSE 0 END AS is_win,
      CASE WHEN m.result = 'loss' THEN 1 ELSE 0 END AS is_loss,
      CASE WHEN m.result = 'win'  THEN 'win'
           WHEN m.result = 'loss' THEN 'loss'
           ELSE NULL END                           AS last_result_text,
      COALESCE((SELECT count(*) FROM jsonb_array_elements(m.sets) s
                 WHERE NULLIF(s->>'you', '')::int > NULLIF(s->>'them', '')::int), 0) AS sets_won,
      COALESCE((SELECT count(*) FROM jsonb_array_elements(m.sets) s
                 WHERE NULLIF(s->>'you', '')::int < NULLIF(s->>'them', '')::int), 0) AS sets_lost,
      COALESCE((SELECT sum(NULLIF(s->>'you', '')::int)  FROM jsonb_array_elements(m.sets) s), 0) AS games_won,
      COALESCE((SELECT sum(NULLIF(s->>'them', '')::int) FROM jsonb_array_elements(m.sets) s), 0) AS games_lost
    FROM eligible_matches m

    UNION ALL

    -- Opponent side (mirror)
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
                 WHERE NULLIF(s->>'them', '')::int > NULLIF(s->>'you', '')::int), 0) AS sets_won,
      COALESCE((SELECT count(*) FROM jsonb_array_elements(m.sets) s
                 WHERE NULLIF(s->>'them', '')::int < NULLIF(s->>'you', '')::int), 0) AS sets_lost,
      COALESCE((SELECT sum(NULLIF(s->>'them', '')::int) FROM jsonb_array_elements(m.sets) s), 0) AS games_won,
      COALESCE((SELECT sum(NULLIF(s->>'you', '')::int)  FROM jsonb_array_elements(m.sets) s), 0) AS games_lost
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
          f.player_id       ASC
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

COMMIT;
