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

import { useEffect, useState } from "react";

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
  // Carousel index for the multi-league case. Stays at 0 when only
  // one league is active; clamped against the active list length so
  // a league disappearing (voided / archived from another tab) can't
  // strand the band on an out-of-range index. Reset on changes to
  // the active set is implicit because the index is read modulo the
  // current length below.
  var [activeIdx, setActiveIdx] = useState(0);

  if (!authUser) return null;

  // Filter to active memberships of active leagues. Take the most-recently
  // active by updated_at — the hook returns rows in that order.
  var active = (myLeagues || []).filter(function (lg) {
    return lg.my_status === "active" && lg.status === "active";
  });
  var hasMany = active.length > 1;
  var safeIdx = active.length === 0
    ? 0
    : Math.min(Math.max(0, activeIdx), active.length - 1);
  var league = active[safeIdx];

  // Lazily load detail for the CURRENTLY SHOWN league. Cache prevents
  // re-fetch. Re-runs when the user navigates to a different league
  // via the side arrows.
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

  // Side-arrow handlers. stopPropagation so the band's own
  // onClick (which navigates to league detail) doesn't fire on
  // arrow taps. Index increments are clamped via safeIdx above.
  function goPrev(e) { e.stopPropagation(); setActiveIdx(function (i) { return Math.max(0, (i || 0) - 1); }); }
  function goNext(e) { e.stopPropagation(); setActiveIdx(function (i) { return Math.min(active.length - 1, (i || 0) + 1); }); }

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
        position: "relative",
        maxWidth: 720,
        margin: "0 auto",
        padding: "clamp(40px, 6vw, 64px) clamp(20px, 4vw, 32px)",
      }}>
        {/* Eyebrow gains a "· N of M" indicator when the viewer has
            more than one active league, mirroring the Compete band. */}
        <div style={{
          fontSize: 10,
          fontWeight: 800,
          color: INK_TEXT_DIM,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          marginBottom: 16,
        }}>
          Standings
          {hasMany && (
            <span style={{ marginLeft: 8, opacity: 0.85 }}>
              · {(safeIdx + 1) + " of " + active.length}
            </span>
          )}
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

        {/* Side arrows — only render when the viewer has more than
            one active league. Glyph-only chevrons absolute-positioned
            against the inner rail's left/right edges, vertically
            anchored at ~58% so they line up with the rank/record
            cluster (same shape as Compete's ActiveNowBand). 44×44 hit
            area via padding. stopPropagation on click so the band's
            outer onClick (which navigates to league detail) doesn't
            fire when navigating between leagues. */}
        {hasMany && (
          <SideArrow dir="left"  enabled={safeIdx > 0}                       onClick={goPrev} />
        )}
        {hasMany && (
          <SideArrow dir="right" enabled={safeIdx < active.length - 1}        onClick={goNext} />
        )}
      </div>
    </div>
  );
}

// ── SideArrow ────────────────────────────────────────────────────
// Mirrors the SideArrow in src/features/tournaments/components/hub/ActiveNowBand.jsx.
// Kept local rather than shared because the carousel mechanics differ
// (HomeLeagueBand swaps content via state; ActiveNowBand uses scroll-
// snap), and the arrow's positioning context is identical only by
// coincidence — a future redesign of either band shouldn't be coupled
// to the other.
function SideArrow({ dir, enabled, onClick }) {
  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      aria-label={dir === "left" ? "Previous league" : "Next league"}
      style={{
        position: "absolute",
        top:       "58%",
        transform: "translateY(-50%)",
        left:      dir === "left"  ? 4 : "auto",
        right:     dir === "right" ? 4 : "auto",
        padding:   "12px",
        background: "transparent",
        border:     "none",
        color:      enabled ? "#FFFFFF" : "rgba(255,255,255,0.25)",
        cursor:     enabled ? "pointer" : "default",
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex:     2,
        transition: "opacity 0.15s",
      }}
      onMouseEnter={function (e) { if (enabled) e.currentTarget.style.opacity = "0.7"; }}
      onMouseLeave={function (e) { if (enabled) e.currentTarget.style.opacity = "1"; }}>
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
        {dir === "left" ? (
          <path d="M11 4l-5 5 5 5" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
        ) : (
          <path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
        )}
      </svg>
    </button>
  );
}
