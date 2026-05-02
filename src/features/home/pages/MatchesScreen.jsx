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

var FILTERS = ["All", "Ranked", "League", "Casual", "Tournament"];

// Statuses that count as "needs the viewer's attention" — surfaced
// inline in the list with a Pending pill + tap-to-review.
var PENDING_STATUSES = ["pending_confirmation", "disputed", "pending_reconfirmation"];

export default function MatchesScreen({ authUser, history, leaguesIndex, openProfile, onReviewMatch, setScrolledPastHero }) {
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

  // Confirmed stream — used for the stat strip (Played / Wins /
  // Rate). Only confirmed rows count toward stats.
  var confirmed = useMemo(function () {
    return (history || []).filter(function (m) { return m.status === "confirmed"; });
  }, [history]);

  // Stats — Played / Wins / Win-rate.
  var played = confirmed.length;
  var wins   = confirmed.filter(function (m) { return m.result === "win"; }).length;
  var rate   = played > 0 ? Math.round((wins / played) * 100) : 0;

  // List stream — confirmed + pending (so the user can review
  // pending matches inline). Pending rows render with a Pending
  // pill instead of a W/L badge and a tap opens the review drawer.
  var listStream = useMemo(function () {
    return (history || []).filter(function (m) {
      return m.status === "confirmed" || PENDING_STATUSES.indexOf(m.status) !== -1;
    });
  }, [history]);

  // Filtered list per chip. Filters apply across both confirmed
  // and pending rows so a pending ranked match still shows under
  // "Ranked" / "League" / etc. as expected.
  var filtered = useMemo(function () {
    function matches(m) {
      if (filter === "All") return true;
      if (filter === "Tournament") {
        return !!m.tournament_id || (m.tournName && m.tournName !== "Casual Match" && m.tournName !== "Ranked");
      }
      if (filter === "League")  return !!m.league_id;
      if (filter === "Casual")  return m.match_type === "casual" && !m.league_id;
      // Ranked = match_type ranked AND not in a league/tournament.
      // Same shape rule we use for Casual (league rows live under
      // the League chip, tournament rows under the Tournament chip).
      if (filter === "Ranked")  return m.match_type === "ranked" && !m.league_id && !m.tournament_id;
      return true;
    }
    return listStream.filter(matches);
  }, [listStream, filter]);

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

      {/* Filter chips — single row, never wrap. With 5 chips
          (All / Ranked / League / Casual / Tournament) they need
          tighter padding + letter-spacing to fit a 375px viewport.
          Equal flex:1 share so they auto-resize and centre their
          text rather than ellipsizing. */}
      <div style={{
        display:     "flex",
        gap:         6,
        flexWrap:    "nowrap",
        padding:     "0 22px 14px",
      }}>
        {FILTERS.map(function (f) {
          var on = filter === f;
          return (
            <button
              key={f}
              onClick={function () { setFilter(f); }}
              style={{
                flex:          "1 1 0",
                minWidth:      0,
                background:    on ? ED_TOK.ink : "transparent",
                border:        "1px solid " + (on ? ED_TOK.ink : ED_TOK.line),
                color:         on ? ED_TOK.bg  : ED_TOK.ink2,
                borderRadius:  999,
                padding:       "6px 4px",
                fontFamily:    ED_TOK.mono,
                fontSize:      9.5,
                letterSpacing: "0.04em",
                fontWeight:    500,
                textTransform: "uppercase",
                cursor:        "pointer",
                transition:    "160ms",
                whiteSpace:    "nowrap",
                textAlign:     "center",
                // "Tournament" is longest — keep it inside its
                // pill on narrow viewports rather than letting it
                // bleed out of the rounded border.
                overflow:      "hidden",
                textOverflow:  "ellipsis",
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
                <MatchRow
                  match={m}
                  authUser={authUser}
                  leaguesIndex={leaguesIndex}
                  openProfile={openProfile}
                  onReviewMatch={onReviewMatch}
                  isLast={idx === filtered.length - 1}
                />
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
//
// Pending rows (status !== 'confirmed') swap the W/L badge for a
// muted "?" placeholder, render a Pending pill in the right slot
// instead of the rating delta, and route the tap to onReviewMatch
// (opens the existing ActionReviewDrawer) instead of the
// opponent's profile.
function MatchRow({ match, authUser, leaguesIndex, openProfile, onReviewMatch, isLast }) {
  var isPending = match.status !== "confirmed";
  var won  = !isPending && match.result === "win";

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

  // "NEW" pill — shows on confirmed rows for the first 24h after the
  // match landed. Pending rows keep the Pending pill (the freshness
  // signal there isn't useful — the user already knows it's recent
  // and unresolved); the moment a pending row flips to confirmed,
  // the NEW pill takes over for the next 24h, then the regular
  // delta returns.
  //
  // Fallback chain because not every code path populates the same
  // timestamp: confirmedAt is set when a pending → confirmed
  // transition happens (server function), but auto-confirmed casual
  // standalone matches skip that transition, so they may only have
  // submitted_at / created_at. The optimistic local row in
  // useMatchHistory.submitMatch seeds both confirmedAt + submitted_at
  // so the pill appears immediately on first paint.
  var newAtIso = match.confirmedAt
    || match.confirmed_at
    || match.submitted_at
    || match.submittedAt
    || match.created_at
    || match.createdAt
    || null;
  var isNew = false;
  if (!isPending && newAtIso) {
    var ageMs = Date.now() - new Date(newAtIso).getTime();
    isNew = ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000;
  }

  // Tap behaviour:
  //   pending → open the review drawer so the user can confirm /
  //             dispute / void without leaving Activity
  //   confirmed → open the opponent's profile (cheap, no new route)
  function handleClick() {
    if (isPending) {
      if (onReviewMatch) onReviewMatch(match);
      return;
    }
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
      {/* Date — short label only ("Apr 28"). The weekday
          abbreviation that used to sit above was redundant since
          the short label already encodes the week-bucket the user
          cares about. */}
      <div style={{
        fontFamily:    ED_TOK.display,
        fontSize:      15,
        fontWeight:    600,
        letterSpacing: "-0.01em",
        color:         ED_TOK.ink,
      }}>
        {dateLabel.short}
      </div>

      {/* Result badge — W / L for confirmed, "?" for pending so
          the row visually reads as "still in flight". */}
      <div style={{
        width:        28,
        height:       28,
        borderRadius: 6,
        display:      "grid",
        placeItems:   "center",
        fontFamily:   ED_TOK.mono,
        fontWeight:   700,
        fontSize:     12,
        border:       "1.5px solid " + (
          isPending ? ED_TOK.line :
          won       ? "rgba(58,125,68,0.5)" :
                      "rgba(195,57,43,0.5)"
        ),
        color:        isPending ? ED_TOK.muted : (won ? ED_TOK.win : ED_TOK.loss),
        background:   isPending ? "transparent" : (won ? "rgba(58,125,68,0.06)" : "rgba(195,57,43,0.06)"),
      }}>
        {isPending ? "?" : (won ? "W" : "L")}
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

      {/* Right slot — Pending pill for pending rows (tap-to-review),
          NEW pill for confirmed rows logged in the last 24h, rating
          delta for confirmed ranked rows, blank otherwise. The NEW
          pill takes priority over the delta so a freshly-confirmed
          match reads as fresh first; the delta returns once the
          24h window closes. */}
      {isPending ? (
        <span style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      9.5,
          fontWeight:    700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color:         "#7A4118",
          background:    "#F0C8B8",
          padding:       "4px 10px",
          borderRadius:  999,
          whiteSpace:    "nowrap",
        }}>
          {match.status === "disputed" || match.status === "pending_reconfirmation"
            ? "Disputed"
            : "Pending"}
        </span>
      ) : isNew ? (
        <span style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      9.5,
          fontWeight:    700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color:         ED_TOK.accent,
          background:    "rgba(255, 45, 85, 0.10)",
          padding:       "4px 10px",
          borderRadius:  999,
          whiteSpace:    "nowrap",
        }}>
          New
        </span>
      ) : delta != null ? (
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
