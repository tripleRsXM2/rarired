// src/features/leagues/components/LeagueNextOpponent.jsx
//
// Slice 4 of the design overhaul: retention card that suggests the
// viewer's most-overdue league opponent. Sits at the top of the
// league detail view, between the league header and the standings.
//
// Per docs/design-direction.md → League surfaces:
//   "Next opponent card suggesting your most-overdue league pair."
//
// Pick algorithm:
//   1. Active members of this league, excluding the viewer.
//   2. Skip anyone who's already at league.max_matches_per_opponent
//      (the trigger validate_match_league would reject the next match
//      anyway — don't suggest something that won't insert).
//   3. Prefer the member the viewer has NEVER played (zero matches).
//      Tie-break: by member.joined_at ascending (longest-standing
//      member who's still unplayed feels more overdue than the freshly
//      invited one).
//   4. If everyone has been played, fall back to the smallest play
//      count, tie-broken by the oldest "last played" date.
//
// Output: a single editorial card with an avatar, the suggestion
// copy, and a "Challenge" CTA that opens the existing challenge
// composer prefilled with the suggested opponent.

import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";

function pickSuggestion(viewerHistory, members, leagueId, leagueMaxPerOpponent, viewerId) {
  if (!members || !members.length || !viewerId) return null;

  // Confirmed-only, league-scoped matches the viewer is in.
  var leagueMatches = (viewerHistory || []).filter(function (m) {
    if (m.status !== "confirmed") return false;
    if (m.isThirdParty) return false; // friend-vs-friend in this league isn't viewer's history
    if (m.league_id !== leagueId) return false;
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
    .filter(function (m) { return m.user_id !== viewerId; })
    .map(function (m) {
      var s = stats[m.user_id] || { plays: 0, lastTs: 0 };
      return {
        userId: m.user_id,
        joinedAt: m.joined_at ? new Date(m.joined_at).getTime() : 0,
        plays: s.plays,
        lastTs: s.lastTs,
      };
    })
    .filter(function (c) {
      if (!leagueMaxPerOpponent) return true;
      return c.plays < leagueMaxPerOpponent;
    });

  if (!candidates.length) return null;

  candidates.sort(function (a, b) {
    if (a.plays !== b.plays) return a.plays - b.plays;
    if (a.plays === 0) {
      // Both unplayed — earliest joined_at first
      return a.joinedAt - b.joinedAt;
    }
    // Both have some plays — oldest "last played" first
    return a.lastTs - b.lastTs;
  });
  return candidates[0];
}

function fmtRelativeDate(ts) {
  if (!ts) return null;
  var days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return days + " days ago";
  if (days < 60) return Math.round(days / 7) + " weeks ago";
  return Math.round(days / 30) + " months ago";
}

export default function LeagueNextOpponent({
  t, authUser, league, detail, profileMap, history, openChallenge,
}) {
  if (!authUser || !league || !detail) return null;
  if (league.status !== "active") return null;

  var members = (detail.members || []).filter(function (m) { return m.status === "active"; });
  if (members.length < 2) return null;

  var pick = pickSuggestion(
    history,
    members,
    league.id,
    league.max_matches_per_opponent,
    authUser.id
  );
  if (!pick) return null;

  var p = (profileMap && profileMap[pick.userId]) || { id: pick.userId, name: "Player" };

  var subtitle;
  if (pick.plays === 0) {
    subtitle = "Haven't played them in this league yet.";
  } else {
    var rel = fmtRelativeDate(pick.lastTs);
    subtitle = pick.plays + " match" + (pick.plays === 1 ? "" : "es") + " played"
      + (rel ? " · last " + rel : "");
  }

  function onChallenge() {
    if (!openChallenge) return;
    openChallenge(
      Object.assign({ id: pick.userId, name: p.name, suburb: p.suburb || "", skill: p.skill || "" }, p),
      "league_next_opponent"
    );
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderLeft: "3px solid " + t.accent,
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <div style={{ flexShrink: 0 }}>
          <PlayerAvatar name={p.name} avatar={p.avatar} profile={p} size={40} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: t.accent,
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3,
          }}>
            Next opponent
          </div>
          <div style={{
            fontSize: 14, fontWeight: 700, color: t.text,
            letterSpacing: "-0.1px", lineHeight: 1.2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            vs {p.name || "Player"}
          </div>
          <div style={{
            fontSize: 11, color: t.textSecondary, marginTop: 3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {subtitle}
          </div>
        </div>
        {openChallenge && (
          <button
            onClick={onChallenge}
            style={{
              flexShrink: 0,
              padding: "9px 14px",
              borderRadius: 8,
              border: "none",
              background: t.accent, color: "#fff",
              fontSize: 12, fontWeight: 700,
              letterSpacing: "0.02em",
              cursor: "pointer",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}>
            Challenge
          </button>
        )}
      </div>
    </div>
  );
}
