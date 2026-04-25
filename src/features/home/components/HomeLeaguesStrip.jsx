// src/features/home/components/HomeLeaguesStrip.jsx
//
// Slice 1 of the design overhaul: a condensed strip of the viewer's
// active leagues, sitting between the NextAction card and the feed.
//
// Per docs/design-direction.md → "Your leagues":
//   • Up to 2 active leagues
//   • Each card shows: name + mode pill + my rank + member count + last result
//   • Tap → /tournaments/leagues?id=<id>
//   • Hidden entirely if the viewer has 0 active leagues — slice 1 keeps
//     Home calm; the discovery surface for joining a league lives elsewhere.
//
// Implementation notes:
//   • Standings + members are loaded lazily by useLeagues.loadLeagueDetail
//     and cached in leagueDetailCache. We trigger the load on mount; the
//     card renders gracefully without rank while detail is in flight.
//   • "Last result" is derived from the viewer's match history (already at
//     the HomeTab level), filtered by league_id — no extra reads.

import { useEffect } from "react";

function pickLastLeagueResult(history, leagueId, authUserId) {
  if (!history || !leagueId || !authUserId) return null;
  // Most recent CONFIRMED match in this league involving the viewer.
  var rows = history.filter(function (m) {
    if (m.status !== "confirmed") return false;
    if (m.league_id !== leagueId) return false;
    return true;
  });
  rows.sort(function (a, b) {
    var ad = a.rawDate ? new Date(a.rawDate).getTime() : 0;
    var bd = b.rawDate ? new Date(b.rawDate).getTime() : 0;
    return bd - ad;
  });
  return rows[0] || null;
}

function resultPill(t, m, authUserId) {
  if (!m) return null;
  // m.iWon is set by the history hook for confirmed matches the viewer
  // played (true/false). Defensive fallback: read from m.winnerId.
  var won;
  if (typeof m.iWon === "boolean") won = m.iWon;
  else won = m.winnerId === authUserId;

  var bg    = won ? t.greenSubtle : t.redSubtle;
  var color = won ? t.green       : t.red;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
      textTransform: "uppercase",
      padding: "3px 7px", borderRadius: 0,
      background: bg, color: color,
      border: "1px solid " + color + "33",
    }}>
      {won ? "Won" : "Lost"}
    </span>
  );
}

function modePill(t, mode) {
  var isRanked = mode !== "casual";
  var color = isRanked ? t.accent : t.textTertiary;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
      textTransform: "uppercase",
      padding: "2px 6px", borderRadius: 0,
      background: "transparent", color: color,
      border: "1px solid " + color + "55",
    }}>
      {isRanked ? "Ranked" : "Casual"}
    </span>
  );
}

function LeagueCard({ t, league, detail, lastResult, authUserId, onOpen }) {
  var standings = (detail && detail.standings) || [];
  var memberCount = (detail && detail.members && detail.members.length) || standings.length || null;
  var myRow = standings.find(function (s) { return s.user_id === authUserId; });
  var rank = myRow && myRow.rank;

  return (
    <div
      onClick={function () { if (onOpen) onOpen(league.id); }}
      style={{
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderRadius: 12,
        padding: "14px 16px",
        cursor: "pointer",
        display: "flex", flexDirection: "column", gap: 10,
        minWidth: 0,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={function (e) { e.currentTarget.style.borderColor = t.accent + "55"; }}
      onMouseLeave={function (e) { e.currentTarget.style.borderColor = t.border; }}>
      {/* Header row: name + mode pill */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: t.text,
          letterSpacing: "-0.1px", lineHeight: 1.2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          flex: 1, minWidth: 0,
        }}>
          {league.name || "Untitled league"}
        </div>
        {modePill(t, league.mode)}
      </div>

      {/* Stat row: my rank (signature metric for this card) + members */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{
            fontSize: 26, fontWeight: 800, color: t.text,
            letterSpacing: "-0.6px", lineHeight: 1, fontVariantNumeric: "tabular-nums",
          }}>
            {rank ? "#" + rank : "—"}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {rank ? "your rank" : "no rank yet"}
          </span>
        </div>
        {memberCount != null && (
          <span style={{ fontSize: 11, color: t.textTertiary, fontWeight: 600 }}>
            {memberCount} {memberCount === 1 ? "player" : "players"}
          </span>
        )}
      </div>

      {/* Footer: last result (only if there is one) */}
      {lastResult && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {resultPill(t, lastResult, authUserId)}
          <span style={{
            fontSize: 11, color: t.textSecondary,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            minWidth: 0, flex: 1,
          }}>
            vs {lastResult.opponentName || "opponent"}
          </span>
        </div>
      )}
    </div>
  );
}

export default function HomeLeaguesStrip({
  t, authUser, history,
  myLeagues, leagueDetailCache, loadLeagueDetail,
  onOpenLeague,
}) {
  if (!authUser) return null;

  // Active memberships only — invited / pending leagues don't belong on Home.
  var active = (myLeagues || []).filter(function (lg) {
    return lg.my_status === "active" && lg.status === "active";
  });

  // Top 2 by updated_at (the hook already returns rows in that order,
  // but slice() is a defensive copy in case ordering changes).
  var top = active.slice(0, 2);

  // Trigger detail load for each. The hook caches by league id, so a second
  // mount of Home doesn't re-fetch. We deliberately don't await — the cards
  // render with placeholder rank until standings arrive.
  var topIds = top.map(function (lg) { return lg.id; }).join(",");
  useEffect(function () {
    if (!loadLeagueDetail) return;
    top.forEach(function (lg) {
      var cached = leagueDetailCache && leagueDetailCache[lg.id];
      if (!cached) loadLeagueDetail(lg.id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topIds]);

  if (!top.length) return null;

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 10,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: t.textTertiary,
          textTransform: "uppercase", letterSpacing: "0.07em",
        }}>
          Your leagues
        </div>
        {active.length > top.length && (
          <button
            onClick={function () { if (onOpenLeague) onOpenLeague(top[0].id); }}
            style={{
              fontSize: 11, fontWeight: 600, color: t.textSecondary,
              background: "transparent", border: "none", cursor: "pointer",
              padding: 0, letterSpacing: "0.01em",
            }}>
            See all ({active.length})
          </button>
        )}
      </div>

      <div className="cs-leagues-strip" style={{
        display: "grid",
        gridTemplateColumns: top.length === 1 ? "1fr" : "repeat(2, 1fr)",
        gap: 10,
      }}>
        {top.map(function (lg) {
          var detail = leagueDetailCache && leagueDetailCache[lg.id];
          var lastResult = pickLastLeagueResult(history, lg.id, authUser.id);
          return (
            <LeagueCard
              key={lg.id}
              t={t}
              league={lg}
              detail={detail}
              lastResult={lastResult}
              authUserId={authUser.id}
              onOpen={onOpenLeague}
            />
          );
        })}
      </div>
    </div>
  );
}
