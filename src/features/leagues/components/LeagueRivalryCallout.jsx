// src/features/leagues/components/LeagueRivalryCallout.jsx
//
// Slice 4 of the design overhaul: the rivalry callout inside the
// league detail view. Sits between the Next-opponent card and the
// standings table.
//
// Per docs/design-direction.md → League surfaces:
//   "Rivalry callout if you have a tied or escalating H2H within
//    the league."
//
// "Rivalry" is defined here as a CONFIRMED, LINKED-OPPONENT, league-
// scoped H2H of ≥2 matches that is either tied or within one match
// of being tied. We pick the pair with the most matches (the most
// invested rivalry); tie-break by smallest score gap, then by most
// recent match.
//
// This complements LeagueNextOpponent (cold pair — needs a first
// match) without overlapping; both can render — they answer
// different retention questions.

import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";

function pickRivalry(viewerHistory, leagueId, viewerId) {
  if (!viewerHistory || !leagueId || !viewerId) return null;
  // Filter to confirmed, league-scoped, linked-opponent matches.
  var leagueMatches = viewerHistory.filter(function (m) {
    if (m.status !== "confirmed") return false;
    if (m.isThirdParty) return false; // friend-vs-friend isn't viewer's H2H
    if (m.league_id !== leagueId) return false;
    var oppId = m.isTagged ? m.submitterId : m.opponent_id;
    return !!oppId && oppId !== viewerId;
  });
  if (!leagueMatches.length) return null;

  // user_id → { plays, viewerWins, oppWins, lastTs, lastMatch, lastResult }
  var buckets = {};
  leagueMatches.forEach(function (m) {
    var oppId = m.isTagged ? m.submitterId : m.opponent_id;
    if (!buckets[oppId]) {
      buckets[oppId] = {
        oppId: oppId,
        plays: 0, viewerWins: 0, oppWins: 0,
        lastTs: 0, lastMatch: null, lastResult: null,
      };
    }
    var b = buckets[oppId];
    b.plays += 1;
    if (m.result === "win") b.viewerWins += 1; else b.oppWins += 1;
    var ts = m.rawDate ? new Date(m.rawDate).getTime() : 0;
    if (ts >= b.lastTs) {
      b.lastTs = ts;
      b.lastMatch = m;
      b.lastResult = m.result;
    }
  });

  var pairs = Object.values(buckets).filter(function (b) {
    if (b.plays < 2) return false;
    return Math.abs(b.viewerWins - b.oppWins) <= 1;
  });
  if (!pairs.length) return null;

  pairs.sort(function (a, b) {
    if (a.plays !== b.plays) return b.plays - a.plays;
    var gapA = Math.abs(a.viewerWins - a.oppWins);
    var gapB = Math.abs(b.viewerWins - b.oppWins);
    if (gapA !== gapB) return gapA - gapB;
    return b.lastTs - a.lastTs;
  });
  return pairs[0];
}

function statusLine(viewerWins, oppWins) {
  if (viewerWins === oppWins) {
    return "Tied " + viewerWins + "–" + oppWins + " · break the tie";
  }
  if (viewerWins > oppWins) {
    return viewerWins + "–" + oppWins + " · keep your edge";
  }
  return viewerWins + "–" + oppWins + " · level the score";
}

export default function LeagueRivalryCallout({
  t, authUser, league, profileMap, history, openChallenge,
}) {
  if (!authUser || !league) return null;
  if (league.status !== "active") return null;

  var pick = pickRivalry(history, league.id, authUser.id);
  if (!pick) return null;

  var p = (profileMap && profileMap[pick.oppId]) || { id: pick.oppId, name: "Player" };
  var iLead = pick.viewerWins > pick.oppWins;
  var theyLead = pick.oppWins > pick.viewerWins;
  // Tone: tied = orange (urgent), behind = red (claw it back), ahead = green (defend it).
  var tone = pick.viewerWins === pick.oppWins ? t.orange
           : theyLead ? t.red
           : t.green;
  var toneSubtle = pick.viewerWins === pick.oppWins ? t.orangeSubtle
           : theyLead ? t.redSubtle
           : t.greenSubtle;

  function onRematch() {
    if (!openChallenge) return;
    openChallenge(
      Object.assign({ id: pick.oppId, name: p.name, suburb: p.suburb || "", skill: p.skill || "" }, p),
      "league_rivalry",
      pick.lastMatch || undefined
    );
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderLeft: "3px solid " + tone,
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
            fontSize: 10, fontWeight: 700, color: tone,
            letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 3,
          }}>
            Rivalry
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
            display: "flex", alignItems: "center", gap: 6,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700,
              padding: "2px 6px", borderRadius: 0,
              background: toneSubtle, color: tone,
              border: "1px solid " + tone + "33",
              letterSpacing: "0.12em", textTransform: "uppercase",
              flexShrink: 0,
            }}>
              {iLead ? "You lead" : theyLead ? "They lead" : "Tied"}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              {statusLine(pick.viewerWins, pick.oppWins)}
            </span>
          </div>
        </div>
        {openChallenge && (
          <button
            onClick={onRematch}
            style={{
              flexShrink: 0,
              padding: "9px 14px",
              borderRadius: 8,
              border: "none",
              background: tone, color: "#fff",
              fontSize: 12, fontWeight: 700,
              letterSpacing: "0.02em",
              cursor: "pointer",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}>
            Rematch
          </button>
        )}
      </div>
    </div>
  );
}
