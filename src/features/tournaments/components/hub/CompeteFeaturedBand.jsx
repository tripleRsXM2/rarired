// src/features/tournaments/components/hub/CompeteFeaturedBand.jsx
//
// Module 13 (Compete hub design pass) — full-bleed dark editorial
// moment that sits between the hero and Active now. Visual sibling
// of HomeLeagueBand: same INK background, same big-rank pattern,
// same two-tone white type. The point is to give Compete the same
// "premium editorial" anchor the Feed top has — without that, the
// page reads as a stack of equal-weight outlined cards.
//
// Render contract:
//   - Renders only when there's at least one active league with the
//     viewer's standings already cached. If standings haven't loaded
//     yet the hub silently falls back to the Slice 2 layout (no
//     flicker — the lazy-load fires on hub mount; once it lands,
//     this component starts rendering on the next render tick).
//   - Selects `league` via a single criterion: first active league
//     in the hook's natural order (most-recently-touched first).
//     Engagement-based selection is a future polish.
//   - The featured league is excluded from ActiveNowSection so it
//     isn't rendered twice. The hub passes the id back via
//     `excludeLeagueIds`.
//
// Full-bleed escape:
//   The hub container has maxWidth 720 + horizontal padding clamp.
//   To break out and stretch edge-to-edge, the band uses negative
//   horizontal margins matching the hub's padding. Standard pattern
//   — survives the .fade-up wrapper's CSS transform because we
//   don't rely on position: fixed.

import { useMemo } from "react";

// INK constants — intentionally hardcoded, not theme tokens. Mirrors
// HomeLeagueBand exactly so the editorial moment feels consistent
// across every theme.
var INK          = "#0A0A0A";
var INK_TEXT     = "#FFFFFF";
var INK_TEXT_DIM = "rgba(255,255,255,0.55)";
var INK_WIN      = "#7CD14E";
var INK_LOSS     = "#FF6B6B";

// ── Featured league selection ───────────────────────────────────
//
// Returns { league, standing, memberCount } for the league that
// should be featured, or null if none qualify. Public so the hub
// can read the selected id for the exclude-list it passes to
// ActiveNowSection.
export function selectFeaturedLeague(leagues, detailCache, viewerId) {
  if (!leagues || !viewerId) return null;
  for (var i = 0; i < leagues.length; i++) {
    var lg = leagues[i];
    if (lg.my_status !== "active")  continue;
    if (lg.status    !== "active")  continue;   // exclude past/voided defensively
    var detail = detailCache && detailCache[lg.id];
    if (!detail || !detail.standings) continue; // wait for cache
    var standing = detail.standings.find(function (s) { return s.user_id === viewerId; });
    if (!standing || !standing.rank) continue;  // need rank to feature
    var memberCount = (detail.members || []).filter(function (m) { return m.status === "active"; }).length;
    return {
      league:      lg,
      standing:    standing,
      memberCount: memberCount || null,
    };
  }
  return null;
}

// Pick the viewer's most-recent confirmed match in this league —
// powers the "Last match: Won/Lost vs X" caption. Mirrors
// HomeLeagueBand.pickLastLeagueResult so feel + behaviour match.
function pickLastLeagueResult(detail, leagueId, viewerId) {
  if (!detail || !detail.recent || !leagueId || !viewerId) return null;
  var rows = detail.recent.filter(function (m) {
    if (m.status !== "confirmed") return false;
    if (m.league_id && m.league_id !== leagueId) return false;
    return m.user_id === viewerId || m.opponent_id === viewerId;
  });
  rows.sort(function (a, b) {
    var ad = a.confirmed_at ? new Date(a.confirmed_at).getTime() : 0;
    var bd = b.confirmed_at ? new Date(b.confirmed_at).getTime() : 0;
    return bd - ad;
  });
  return rows[0] || null;
}

// ── Component ───────────────────────────────────────────────────

export default function CompeteFeaturedBand({
  t,
  authUser,
  leagues,            // useLeagues.leagues (voided pre-filtered)
  detailCache,        // useLeagues.detailCache
  profileMap,         // for opponent name lookup
  onOpenLeague,       // (id) => void
}) {
  var viewerId = authUser && authUser.id;

  // Memoise selection so we don't recompute every render. The data
  // it depends on is stable per render via useMemo deps.
  var sel = useMemo(function () {
    return selectFeaturedLeague(leagues, detailCache, viewerId);
  }, [leagues, detailCache, viewerId]);

  if (!sel) return null;

  var league      = sel.league;
  var standing    = sel.standing;
  var memberCount = sel.memberCount;

  var detail = detailCache && detailCache[league.id];
  var lastMatch = pickLastLeagueResult(detail, league.id, viewerId);
  var iWon = null;
  var oppName = null;
  if (lastMatch) {
    var viewerIsSubmitter = lastMatch.user_id === viewerId;
    if (viewerIsSubmitter) {
      iWon = lastMatch.result === "win";
      var oppP = profileMap && profileMap[lastMatch.opponent_id];
      oppName = (oppP && oppP.name) || null;
    } else {
      iWon = lastMatch.result === "loss";  // submitter lost → opponent (us) won
      var subP = profileMap && profileMap[lastMatch.user_id];
      oppName = (subP && subP.name) || null;
    }
  }

  var record = (typeof standing.wins === "number" && typeof standing.losses === "number")
    ? (standing.wins + "-" + standing.losses)
    : null;

  function handleOpen() { if (onOpenLeague) onOpenLeague(league.id); }

  return (
    <div
      onClick={handleOpen}
      style={{
        background:    INK,
        color:         INK_TEXT,
        cursor:        onOpenLeague ? "pointer" : "default",
        // Full-bleed escape: negative horizontal margins matching the
        // hub container's padding. Width 100% combined with the
        // container's max-width 720 + auto margins means the band
        // stretches to the page edges on narrow viewports and
        // visually anchors the page on wide ones.
        marginLeft:  "calc(-1 * clamp(20px, 4vw, 32px))",
        marginRight: "calc(-1 * clamp(20px, 4vw, 32px))",
        marginBottom: "clamp(20px, 3vw, 32px)",
      }}>
      <div style={{
        // Inner content respects the same max-width as the rest of
        // the hub so the band reads as the same conceptual rail,
        // just darker + wider on the edges.
        maxWidth: 720,
        margin:   "0 auto",
        padding:  "clamp(32px, 5vw, 56px) clamp(20px, 4vw, 32px)",
      }}>
        {/* Eyebrow — fixed label, not data-driven (mirrors Home) */}
        <div style={{
          fontSize:       10,
          fontWeight:     800,
          color:          INK_TEXT_DIM,
          letterSpacing:  "0.16em",
          textTransform:  "uppercase",
          marginBottom:   16,
        }}>
          Featured league
        </div>

        {/* League name as section title */}
        <div style={{
          fontSize:       "clamp(24px, 3.6vw, 32px)",
          fontWeight:     700,
          color:          INK_TEXT,
          letterSpacing:  "-0.02em",
          lineHeight:     1.1,
          marginBottom:   24,
        }}>
          {league.name || "Untitled league"}
        </div>

        {/* Rank display + record/stats caption — wraps on narrow */}
        <div style={{
          display:    "flex",
          alignItems: "flex-end",
          gap:        "clamp(20px, 4vw, 40px)",
          flexWrap:   "wrap",
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize:           "clamp(56px, 9vw, 80px)",
              fontWeight:         800,
              color:              INK_TEXT,
              letterSpacing:      "-0.04em",
              lineHeight:         0.95,
              fontVariantNumeric: "tabular-nums",
            }}>
              {standing.rank ? "#" + standing.rank : "—"}
            </div>
            <div style={{
              marginTop:      10,
              fontSize:       10,
              fontWeight:     700,
              color:          INK_TEXT_DIM,
              letterSpacing:  "0.12em",
              textTransform:  "uppercase",
            }}>
              Your rank
            </div>
          </div>

          <div style={{
            minWidth:      0,
            paddingBottom: 4,
            display:       "flex",
            flexDirection: "column",
            gap:           8,
          }}>
            {record && (
              <div style={{
                fontSize:      14,
                fontWeight:    600,
                color:         INK_TEXT,
                letterSpacing: "0.04em",
              }}>
                {record}
                {memberCount ? (
                  <span style={{ color: INK_TEXT_DIM, fontWeight: 500 }}>
                    {" · " + memberCount + " players"}
                  </span>
                ) : null}
              </div>
            )}
            {lastMatch && iWon != null && (
              <div style={{
                fontSize:       12,
                fontWeight:     500,
                color:          INK_TEXT_DIM,
                letterSpacing:  "0.02em",
              }}>
                Last match:{" "}
                <span style={{ color: iWon ? INK_WIN : INK_LOSS, fontWeight: 700 }}>
                  {iWon ? "Won" : "Lost"}
                </span>
                {oppName ? <span>{" vs " + oppName}</span> : null}
              </div>
            )}
          </div>
        </div>

        {/* Inline arrow link — same shape as HomeLeagueBand's "View league →" */}
        {onOpenLeague && (
          <div style={{
            marginTop:      32,
            fontSize:       12,
            fontWeight:     700,
            color:          INK_TEXT,
            letterSpacing:  "0.08em",
            textTransform:  "uppercase",
            display:        "inline-flex",
            alignItems:     "center",
            gap:            8,
          }}>
            Open league
            <span style={{ fontSize: 14 }}>→</span>
          </div>
        )}
      </div>
    </div>
  );
}
