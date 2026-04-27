// src/features/tournaments/utils/competeSuggestions.js
//
// Module 13 (Compete hub Slice 3) — pure helpers that derive the
// "Suggested next moves" cards from real hook data only. Two types
// approved for V1:
//
//   1. Rematch recent opponent — most-recent confirmed match the
//      viewer played against a linked opponent (skipping casual
//      freetext + third-party matches).
//
//   2. Continue active league — the first active league (where the
//      viewer is an active member) with a viable next-opponent
//      derived from members + viewer history. Falls back to a
//      generic "open your league" prompt when no reliable next
//      opponent surfaces but at least one active league exists.
//
// Every helper fails closed: returns null when data is missing or
// produces a low-confidence result. No fake suggestions are ever
// fabricated. The caller hides the entire section when both
// helpers return null.

// ─────────────────────────────────────────────────────────────────────
// 0. Composition — array shape consumed by SuggestedNextMovesSection
// ─────────────────────────────────────────────────────────────────────
//
// Returns an array of suggestion items in display order. Each item
// has a stable `key` so the section can:
//   - filter against per-user dismissal state (suggestionDismissals)
//   - use as a React key on the card
//
// Key shape is scoped to the underlying entity rather than just the
// type, so a future rematch suggestion against a different match
// re-surfaces after dismissing the current one.

export function buildSuggestions(args) {
  var out = [];
  var rematch = pickRecentRematch(args.history || [], args.viewerId, args.profileMap || {});
  if (rematch) {
    out.push({
      type:    "rematch",
      key:     "rematch:" + (rematch.match && rematch.match.id ? rematch.match.id : rematch.opponentId),
      rematch: rematch,
    });
  }
  var continueLeague = pickContinueLeague({
    leagues:     args.leagues     || [],
    detailCache: args.detailCache || {},
    history:     args.history     || [],
    viewerId:    args.viewerId,
    profileMap:  args.profileMap  || {},
  });
  if (continueLeague) {
    out.push({
      type:           "continue_league",
      key:            "continue_league:" + continueLeague.league.id,
      continueLeague: continueLeague,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// 1. Rematch recent opponent
// ─────────────────────────────────────────────────────────────────────
//
// Walk the viewer's history in descending date order (history is
// already sorted that way by useMatchHistory) and return the first
// confirmed match against a linked opponent that isn't the viewer
// themselves and isn't a friend-vs-friend third-party row.
//
// Skip rules:
//   - status !== 'confirmed' → not a finalised match
//   - isThirdParty            → friend-vs-friend match the viewer
//                               isn't a party to
//   - !opponent_id            → casual freetext opponent (no profile
//                               to send a challenge to)
//   - opponent_id === viewerId (defensive)
//
// Returns:
//   {
//     match:     <history row>,
//     opponentId: string,
//     opponentName: string | null  // best-known display name
//   }
//   or null when nothing qualifies.

export function pickRecentRematch(history, viewerId, profileMap) {
  if (!viewerId || !history || !history.length) return null;

  for (var i = 0; i < history.length; i++) {
    var m = history[i];
    if (!m || m.status !== "confirmed") continue;
    if (m.isThirdParty) continue;

    // Resolve which side is the opponent from the viewer's POV. The
    // useMatchHistory normaliser flips this for tagged matches —
    // mirror that logic here so we don't accidentally pick the
    // viewer themselves on tagged rows.
    var opponentId = m.isTagged ? m.submitterId : m.opponent_id;
    if (!opponentId) continue;
    if (opponentId === viewerId) continue;

    var profile = profileMap && profileMap[opponentId];
    var opponentName = (profile && profile.name) || m.oppName || null;

    return {
      match:        m,
      opponentId:   opponentId,
      opponentName: opponentName,
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// 2. Next-opponent picker (extracted from LeagueNextOpponent)
// ─────────────────────────────────────────────────────────────────────
//
// Pure derivation of the "most overdue" league opponent for the
// viewer. Mirrors the implementation in
// `src/features/leagues/components/LeagueNextOpponent.jsx` so the
// hub and the league-detail surface stay in sync. If the source
// component evolves, update this in lockstep.
//
// Inputs:
//   viewerHistory          — match history rows (any source the
//                             league_id filter can match)
//   members                — league_members rows {user_id, joined_at, status}
//   leagueId               — string
//   leagueMaxPerOpponent   — number | null  (null = no cap)
//   viewerId               — string
//
// Returns: { userId, joinedAt, plays, lastTs } | null
//
// Edge cases handled:
//   - empty members / no viewer → null
//   - all members maxed out     → null
//   - viewer is the only member → null

export function pickSuggestion(viewerHistory, members, leagueId, leagueMaxPerOpponent, viewerId) {
  if (!members || !members.length || !viewerId) return null;

  // Confirmed-only, league-scoped matches the viewer is in.
  var leagueMatches = (viewerHistory || []).filter(function (m) {
    if (m.status !== "confirmed") return false;
    if (m.isThirdParty)            return false;
    if (m.league_id !== leagueId)  return false;
    return true;
  });

  // user_id → { plays, lastTs }
  var stats = {};
  leagueMatches.forEach(function (m) {
    var oppId = m.isTagged ? m.submitterId : m.opponent_id;
    if (!oppId || oppId === viewerId) return;
    var ts = m.rawDate ? new Date(m.rawDate).getTime() : 0;
    if (!stats[oppId]) stats[oppId] = { plays: 0, lastTs: 0 };
    stats[oppId].plays += 1;
    if (ts > stats[oppId].lastTs) stats[oppId].lastTs = ts;
  });

  var candidates = members
    .filter(function (m) { return m.user_id !== viewerId && m.status === "active"; })
    .map(function (m) {
      var s = stats[m.user_id] || { plays: 0, lastTs: 0 };
      return {
        userId:   m.user_id,
        joinedAt: m.joined_at ? new Date(m.joined_at).getTime() : 0,
        plays:    s.plays,
        lastTs:   s.lastTs,
      };
    })
    .filter(function (c) {
      if (!leagueMaxPerOpponent) return true;
      return c.plays < leagueMaxPerOpponent;
    });

  if (!candidates.length) return null;

  candidates.sort(function (a, b) {
    if (a.plays !== b.plays) return a.plays - b.plays;
    if (a.plays === 0) return a.joinedAt - b.joinedAt;  // earliest joined first
    return a.lastTs - b.lastTs;                          // oldest "last played" first
  });
  return candidates[0];
}

// ─────────────────────────────────────────────────────────────────────
// 3. Continue active league
// ─────────────────────────────────────────────────────────────────────
//
// Walks the viewer's active leagues, picks the first one with a
// reliable next-opponent suggestion (rich card). If no active
// league has a viable next-opponent but the viewer DOES have at
// least one active league, returns the first active league with
// `opponent: null` so the caller renders the "safer" fallback copy.
//
// If the viewer has no active leagues at all, returns null and the
// section hides this card.
//
// Returns:
//   {
//     league:          <league row>,
//     opponent:        { userId, plays, lastTs } | null,
//     opponentName?:   string | null,
//   }
//   or null when no active league exists.

export function pickContinueLeague(args) {
  var leagues       = args.leagues       || [];
  var detailCache   = args.detailCache   || {};
  var history       = args.history       || [];
  var viewerId      = args.viewerId;
  var profileMap    = args.profileMap    || {};
  if (!viewerId) return null;

  // The viewer's active memberships of active leagues. Voided is
  // pre-filtered upstream by useLeagues; the additional
  // status === 'active' check is a defensive belt-and-braces.
  var activeMine = leagues.filter(function (lg) {
    return lg.my_status === "active" && lg.status === "active";
  });
  if (!activeMine.length) return null;

  // First pass: try to find a league with a high-confidence next
  // opponent (members + history both available, picker returns).
  for (var i = 0; i < activeMine.length; i++) {
    var lg     = activeMine[i];
    var detail = detailCache[lg.id];
    if (!detail || !detail.members || !detail.members.length) continue;
    var pick = pickSuggestion(history, detail.members, lg.id, lg.max_matches_per_opponent, viewerId);
    if (pick) {
      var p = profileMap[pick.userId];
      return {
        league:       lg,
        opponent:     pick,
        opponentName: (p && p.name) || null,
      };
    }
  }

  // Fallback: at least one active league exists. Use the first
  // (the hook returns leagues most-recently-touched first) so the
  // card renders the "safer" copy without faking a next opponent.
  return {
    league:       activeMine[0],
    opponent:     null,
    opponentName: null,
  };
}
