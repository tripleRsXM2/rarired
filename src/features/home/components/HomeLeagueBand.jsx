// src/features/home/components/HomeLeagueBand.jsx
//
// Visual reset v2: the editorial full-bleed band that breaks the
// center rail for emotional emphasis. Used once per Home surface to
// surface the viewer's most-relevant league.
//
// Composition:
//   - Full-width near-black background (#0A0A0A) — escapes the
//     720px center rail that constrains other Home sections.
//   - Inner content constrained to max-width 720, centered.
//   - Eyebrow "Standings" → league name as section title (display) →
//     "#N · X-Y · M players" caption → "View league →" link.
//
// Hidden when the viewer has no active leagues (calm hierarchy:
// nothing to show, nothing rendered).
//
// Per docs/design-direction.md → Visual reset (v2): "Full-bleed for
// emotion. One or two sections per surface escape the center rail
// and use a near-black band with white type. Sparingly used."

import { useEffect } from "react";

function pickLastLeagueResult(history, leagueId, authUserId) {
  if (!history || !leagueId || !authUserId) return null;
  var rows = history.filter(function (m) {
    if (m.status !== "confirmed") return false;
    if (m.isThirdParty) return false; // friend-vs-friend, not viewer's last result
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

export default function HomeLeagueBand({
  t, authUser, history,
  myLeagues, leagueDetailCache, loadLeagueDetail,
  onOpenLeague,
}) {
  if (!authUser) return null;

  // Filter to active memberships of active leagues. Take the most-recently
  // active by updated_at — the hook returns rows in that order.
  var active = (myLeagues || []).filter(function (lg) {
    return lg.my_status === "active" && lg.status === "active";
  });
  var league = active[0];

  // Lazily load detail for the chosen league. Cache prevents re-fetch.
  useEffect(function () {
    if (!league || !loadLeagueDetail) return;
    var cached = leagueDetailCache && leagueDetailCache[league.id];
    if (!cached) loadLeagueDetail(league.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league && league.id]);

  if (!league) return null;

  var detail = leagueDetailCache && leagueDetailCache[league.id];
  var standings = (detail && detail.standings) || [];
  var members   = (detail && detail.members) || [];
  var memberCount = members.length || standings.length || null;
  var myRow = standings.find(function (s) { return s.user_id === authUser.id; });
  var rank = myRow && myRow.rank;
  var record = myRow ? (myRow.wins + "-" + myRow.losses) : null;
  var lastResult = pickLastLeagueResult(history, league.id, authUser.id);
  var iWon = lastResult && (lastResult.iWon === true || lastResult.result === "win");

  // Constants — INK is intentionally hard-coded (not a theme token) so
  // the band's editorial impact is consistent across every theme.
  var INK = "#0A0A0A";
  var INK_TEXT = "#FFFFFF";
  var INK_TEXT_DIM = "rgba(255,255,255,0.55)";

  function open() {
    if (onOpenLeague && league && league.id) onOpenLeague(league.id);
  }

  return (
    <div
      onClick={open}
      style={{
        background: INK,
        color: INK_TEXT,
        cursor: onOpenLeague ? "pointer" : "default",
        // Full-bleed: no horizontal margin. The page wrapper must NOT
        // constrain this component's outer width — see HomeTab.jsx.
        width: "100%",
      }}>
      <div style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "clamp(40px, 6vw, 64px) clamp(20px, 4vw, 32px)",
      }}>
        <div style={{
          fontSize: 10,
          fontWeight: 800,
          color: INK_TEXT_DIM,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          marginBottom: 16,
        }}>
          Standings
        </div>

        <div style={{
          fontSize: "clamp(26px, 4vw, 36px)",
          fontWeight: 700,
          color: INK_TEXT,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          marginBottom: 24,
        }}>
          {league.name || "Untitled league"}
        </div>

        {/* Rank + record — display number on the left, caption on the right */}
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "clamp(20px, 4vw, 40px)",
          flexWrap: "wrap",
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: "clamp(56px, 9vw, 80px)",
              fontWeight: 800,
              color: INK_TEXT,
              letterSpacing: "-0.04em",
              lineHeight: 0.95,
              fontVariantNumeric: "tabular-nums",
            }}>
              {rank ? "#" + rank : "—"}
            </div>
            <div style={{
              marginTop: 10,
              fontSize: 10,
              fontWeight: 700,
              color: INK_TEXT_DIM,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}>
              Your rank
            </div>
          </div>

          <div style={{
            minWidth: 0,
            paddingBottom: 4,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            {record && (
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: INK_TEXT,
                letterSpacing: "0.04em",
              }}>
                {record}
                {memberCount ? <span style={{ color: INK_TEXT_DIM, fontWeight: 500 }}> · {memberCount} players</span> : null}
              </div>
            )}
            {lastResult && (
              <div style={{
                fontSize: 12,
                fontWeight: 500,
                color: INK_TEXT_DIM,
                letterSpacing: "0.02em",
              }}>
                Last match: <span style={{ color: iWon ? "#7CD14E" : "#FF6B6B", fontWeight: 700 }}>
                  {iWon ? "Won" : "Lost"}
                </span>
                {lastResult.opponentName ? <span> vs {lastResult.opponentName}</span> : null}
              </div>
            )}
          </div>
        </div>

        {/* View link */}
        {onOpenLeague && (
          <div style={{
            marginTop: 32,
            fontSize: 12,
            fontWeight: 700,
            color: INK_TEXT,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}>
            View league
            <span style={{ fontSize: 14 }}>→</span>
          </div>
        )}
      </div>
    </div>
  );
}
