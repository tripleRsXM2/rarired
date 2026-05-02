// src/features/home/pages/MatchesScreen.jsx
//
// Editorial Tennis matches screen — surfaces as the "Activity"
// bottom-tab destination.
//
// 2026-05-02: dropped the EditorialScreen wrapper + the redundant
// "<n> confirmed" kicker + 56px "Matches" hero. The global top
// mob-nav now handles the title ("Activity") via App.jsx's
// topBarTitle wiring; the page body opens straight onto the
// stat strip + filter chips + match list.
//
//   1. 3-stat strip — Played / Wins / Rate (now the page hero;
//      scrolling past it fades "Activity" into the global top bar)
//   2. Filter chips — All / League / Casual / Tournament
//   3. Vertical match list — date column · W/L badge · opponent +
//      score + type · rating delta
//
// Data comes from the same matchHistory.history prop the legacy
// HomeTab used. We surface only confirmed matches here.

import { useEffect, useMemo, useRef, useState } from "react";
import { ED_TOK, MicroLabel } from "../components/EditorialScreen.jsx";
import { formatMatchScore } from "../../scoring/utils/tennisScoreValidation.js";

var FILTERS = ["All", "League", "Casual", "Tournament"];

export default function MatchesScreen({ authUser, history, leaguesIndex, openProfile, setScrolledPastHero }) {
  var [filter, setFilter] = useState("All");
  var heroRef = useRef(null);

  // Scroll observer — fades "Activity" into the global top bar
  // when the stat strip (the page hero) leaves the viewport.
  useEffect(function () {
    if (!heroRef.current) return;
    if (!setScrolledPastHero) return;
    setScrolledPastHero(false);
    var io = new IntersectionObserver(function (entries) {
      setScrolledPastHero(!entries[0].isIntersecting);
    }, { threshold: 0.1 });
    io.observe(heroRef.current);
    return function () { io.disconnect(); };
  }, [setScrolledPastHero]);

  // Confirmed-only stream + viewer-frame normalization.
  // useMatchHistory already attaches `result` in viewer frame for
  // tagged rows (the user's POV) so we can read it directly.
  var confirmed = useMemo(function () {
    return (history || []).filter(function (m) { return m.status === "confirmed"; });
  }, [history]);

  // Stats — Played / Wins / Win-rate.
  var played = confirmed.length;
  var wins   = confirmed.filter(function (m) { return m.result === "win"; }).length;
  var rate   = played > 0 ? Math.round((wins / played) * 100) : 0;

  // Filtered list per chip.
  var filtered = useMemo(function () {
    if (filter === "All") return confirmed;
    if (filter === "Tournament") {
      return confirmed.filter(function (m) {
        return !!m.tournament_id || (m.tournName && m.tournName !== "Casual Match" && m.tournName !== "Ranked");
      });
    }
    if (filter === "League") {
      return confirmed.filter(function (m) { return !!m.league_id; });
    }
    if (filter === "Casual") {
      return confirmed.filter(function (m) {
        return m.match_type === "casual" && !m.league_id;
      });
    }
    return confirmed;
  }, [confirmed, filter]);

  return (
    <div className="cs-ed-push" style={{
      background:    ED_TOK.bg,
      color:         ED_TOK.ink,
      fontFamily:    ED_TOK.sans,
      minHeight:     "calc(100dvh - 64px)",
      paddingBottom: 96,
    }}>
      {/* Stat strip — 3 columns with hairline dividers. This is
          the page hero; scrolling past it fades "Activity" into
          the global top bar. */}
      <div ref={heroRef} style={{
        display:             "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        padding:             "20px 22px 18px",
        borderBottom:        "1px solid " + ED_TOK.line,
        marginBottom:        6,
      }}>
        <div style={{ textAlign: "left" }}>
          <div style={statBigStyle()}>{played}</div>
          <MicroLabel>Played</MicroLabel>
        </div>
        <div style={{ textAlign: "left", borderLeft: "1px solid " + ED_TOK.line, paddingLeft: 14 }}>
          <div style={statBigStyle()}>{wins}</div>
          <MicroLabel>Wins</MicroLabel>
        </div>
        <div style={{ textAlign: "left", borderLeft: "1px solid " + ED_TOK.line, paddingLeft: 14 }}>
          <div style={statBigStyle()}>{rate}%</div>
          <MicroLabel>Rate</MicroLabel>
        </div>
      </div>

      {/* Filter chips. */}
      <div style={{
        display:     "flex",
        gap:         6,
        flexWrap:    "wrap",
        padding:     "0 22px 14px",
      }}>
        {FILTERS.map(function (f) {
          var on = filter === f;
          return (
            <button
              key={f}
              onClick={function () { setFilter(f); }}
              style={{
                background:    on ? ED_TOK.ink : "transparent",
                border:        "1px solid " + (on ? ED_TOK.ink : ED_TOK.line),
                color:         on ? ED_TOK.bg  : ED_TOK.ink2,
                borderRadius:  999,
                padding:       "6px 12px",
                fontFamily:    ED_TOK.mono,
                fontSize:      11,
                letterSpacing: "0.08em",
                fontWeight:    500,
                textTransform: "uppercase",
                cursor:        "pointer",
                transition:    "160ms",
              }}>
              {f}
            </button>
          );
        })}
      </div>

      {/* Match list. */}
      {filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: "0 22px" }}>
          {filtered.map(function (m, idx) {
            return (
              <li key={m.id || idx}>
                <MatchRow match={m} authUser={authUser} leaguesIndex={leaguesIndex} openProfile={openProfile} isLast={idx === filtered.length - 1} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── MatchRow ────────────────────────────────────────────────────
// Grid: [date][W/L badge][main stack: opp + score · type][delta]
function MatchRow({ match, authUser, leaguesIndex, openProfile, isLast }) {
  var won = match.result === "win";

  // Opponent display name — useMatchHistory normalizes this onto
  // friendName/opponentName/oppName/playerName depending on the row
  // shape. Same fallback chain HomeNextAction uses.
  var oppName = match.friendName || match.opponentName || match.oppName || match.playerName || "Player";

  // Date column — short day + numeric date. The viewer's locale is
  // already en-AU per the rest of the app.
  var dateLabel = formatRowDate(match);

  // Score — viewer-frame string ("6-4, 6-3"). formatMatchScore gives
  // us the canonical render.
  var scoreLabel = formatMatchScore(match.sets) || "—";

  // Type label — surface league name when present, else casual /
  // ranked / tournament. Falls back to tournName for legacy rows.
  var typeLabel;
  if (match.league_id && leaguesIndex && leaguesIndex[match.league_id]) {
    typeLabel = leaguesIndex[match.league_id];
  } else if (match.tournament_id) {
    typeLabel = match.tournName || "Tournament";
  } else if (match.match_type === "casual") {
    typeLabel = "Casual";
  } else {
    typeLabel = "Ranked";
  }

  // Rating delta — only meaningful for ranked matches and only when
  // useMatchHistory has surfaced it on the row. Hide otherwise.
  var delta = (match.match_type === "ranked" && typeof match.rating_delta === "number")
    ? match.rating_delta
    : null;

  // Tap — opens opponent profile when we have an id; cheaper than
  // wiring a new match-detail route in Phase 2. Falls back to no-op
  // when the row is freetext/unlinked.
  function handleClick() {
    if (!openProfile) return;
    var oppId = match.opponent_id;
    if (match.isTagged) oppId = match.submitterId;
    if (oppId && (!authUser || oppId !== authUser.id)) openProfile(oppId);
  }

  return (
    <button
      onClick={handleClick}
      style={{
        width:               "100%",
        background:          "transparent",
        border:              "none",
        display:             "grid",
        gridTemplateColumns: "44px 28px 1fr auto",
        gap:                 14,
        alignItems:          "center",
        padding:             "14px 0",
        borderBottom:        isLast ? "none" : "1px solid " + ED_TOK.line,
        textAlign:           "left",
        color:               "inherit",
        cursor:              "pointer",
        fontFamily:          ED_TOK.sans,
      }}>
      {/* Date */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <div style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      9.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color:         ED_TOK.muted,
          fontWeight:    600,
        }}>
          {dateLabel.day}
        </div>
        <div style={{
          fontFamily:    ED_TOK.display,
          fontSize:      15,
          fontWeight:    600,
          letterSpacing: "-0.01em",
          color:         ED_TOK.ink,
        }}>
          {dateLabel.short}
        </div>
      </div>

      {/* W/L badge */}
      <div style={{
        width:        28,
        height:       28,
        borderRadius: 6,
        display:      "grid",
        placeItems:   "center",
        fontFamily:   ED_TOK.mono,
        fontWeight:   700,
        fontSize:     12,
        border:       "1.5px solid " + (won ? "rgba(58,125,68,0.5)" : "rgba(195,57,43,0.5)"),
        color:        won ? ED_TOK.win : ED_TOK.loss,
        background:   won ? "rgba(58,125,68,0.06)" : "rgba(195,57,43,0.06)",
      }}>
        {won ? "W" : "L"}
      </div>

      {/* Main stack */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily:    ED_TOK.display,
          fontSize:      16,
          fontWeight:    600,
          letterSpacing: "-0.015em",
          color:         ED_TOK.ink,
          lineHeight:    1.1,
          marginBottom:  3,
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
        }}>
          vs. {oppName}
        </div>
        <div style={{
          fontFamily: ED_TOK.mono,
          fontSize:   11,
          color:      ED_TOK.muted,
          display:    "flex",
          alignItems: "center",
          flexWrap:   "wrap",
          gap:        "0 6px",
        }}>
          <span>{scoreLabel}</span>
          <span style={{ color: ED_TOK.muted }}>·</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{typeLabel}</span>
        </div>
      </div>

      {/* Delta */}
      {delta != null ? (
        <div style={{
          fontFamily:    ED_TOK.mono,
          fontWeight:    700,
          fontSize:      13,
          letterSpacing: "0.02em",
          color:         delta >= 0 ? ED_TOK.win : ED_TOK.loss,
        }}>
          {delta >= 0 ? "+" : ""}{delta}
        </div>
      ) : (
        <div style={{ width: 1 }}/>
      )}
    </button>
  );
}

// Stat-strip number style — Space Grotesk 36px per design.
function statBigStyle() {
  return {
    fontFamily:    ED_TOK.display,
    fontSize:      36,
    fontWeight:    700,
    letterSpacing: "-0.02em",
    lineHeight:    1,
    marginBottom:  6,
    color:         ED_TOK.ink,
  };
}

// Pull "Mon" / "Apr 28" pieces from whatever date shape the row has.
// useMatchHistory normalizes match_date into a localized string; we
// re-parse from the original ISO when available, otherwise fall back
// to splitting the localized string.
function formatRowDate(match) {
  var iso = match.match_date || match.matchDate || null;
  if (iso) {
    var d = new Date(iso);
    if (!isNaN(d.getTime())) {
      var day = d.toLocaleDateString("en-AU", { weekday: "short" });
      var short = d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
      return { day: day, short: short };
    }
  }
  // Fallback — useMatchHistory's `date` is already "29 Apr 2026". Pull
  // the first two tokens for the short label and fake a day kicker.
  var d2 = match.date || "";
  var bits = d2.split(" ");
  return {
    day:   bits[0] ? bits[0].slice(0, 3).toUpperCase() : "",
    short: bits.length >= 2 ? (bits[0] + " " + bits[1]) : d2,
  };
}

// ── Empty state ─────────────────────────────────────────────────
function EmptyState({ filter }) {
  var msg = filter === "All"
    ? "Log a match — your history starts here."
    : "No " + filter.toLowerCase() + " matches yet.";
  return (
    <div style={{
      padding:    "32px 22px",
      textAlign:  "center",
      color:      ED_TOK.muted,
      fontFamily: ED_TOK.sans,
      fontSize:   14,
      lineHeight: 1.5,
    }}>
      {msg}
    </div>
  );
}
