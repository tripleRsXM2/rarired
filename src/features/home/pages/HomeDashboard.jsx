// src/features/home/pages/HomeDashboard.jsx
//
// v1 Home — a tennis stats dashboard. Layout modelled on the Claude
// Code usage panel the user referenced: an All/30d/7d range filter,
// an 8-tile stat grid, and a contribution-style play heatmap, with a
// one-line context footer.
//
// All numbers derive from the same source — the viewer's confirmed
// match history — so the tiles, the heatmap, and the footer always
// agree. The range filter retunes the 8 tiles + the heatmap window
// together.
//
// Editorial Tennis palette (cream paper / espresso ink / clay
// accent) — the screenshot was a dark panel; we keep its *layout*,
// not its colours, so Home stays in the v1 realm.

import { useMemo, useState, useEffect } from "react";
import { ED_TOK } from "../components/EditorialScreen.jsx";

// ── Date helpers ──────────────────────────────────────────────────
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dayKey(d) {
  // Local YYYY-MM-DD — match_history.rawDate is already this shape,
  // so heatmap lookups and rawDate rows line up without tz drift.
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var dd = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + dd;
}
function parseDayKey(key) {
  // "YYYY-MM-DD" → local Date at midnight (no tz shift).
  var p = (key || "").split("-");
  if (p.length !== 3) return null;
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return Number.isNaN(d.getTime()) ? null : d;
}
var HEATMAP_WEEKS = 24;          // ~6 months of squares, matches the screenshot density

export default function HomeDashboard({ history, profile, setScrolledPastHero, onOpenProfile }) {
  // Range filter — All / 30d / 7d. Drives both the tiles and which
  // heatmap squares light up.
  var [range, setRange] = useState("all");

  // Heatmap hover tooltip — { x, y, text } in viewport coords, or
  // null when nothing is hovered.
  var [tip, setTip] = useState(null);

  // The dashboard owns its own header, so keep the global top-bar
  // title hidden while Home is mounted (other pages reveal it on
  // scroll-past-hero).
  useEffect(function () {
    if (setScrolledPastHero) setScrolledPastHero(false);
  }, [setScrolledPastHero]);

  // Confirmed matches only — pending / disputed rows aren't settled
  // results and would skew W-L / streaks.
  var confirmed = useMemo(function () {
    return (history || []).filter(function (m) { return m && m.status === "confirmed"; });
  }, [history]);

  // Window cutoff for the active range.
  var rangeStart = useMemo(function () {
    if (range === "all") return null;
    var days = range === "7d" ? 7 : 30;
    var s = startOfDay(new Date());
    s.setDate(s.getDate() - (days - 1));   // inclusive of today
    return s;
  }, [range]);

  // Matches inside the window — the dataset every tile is computed
  // from. A match counts when its rawDate (the day it was played)
  // falls on/after the cutoff.
  var windowed = useMemo(function () {
    if (!rangeStart) return confirmed;
    return confirmed.filter(function (m) {
      var d = parseDayKey(m.rawDate);
      return d && d.getTime() >= rangeStart.getTime();
    });
  }, [confirmed, rangeStart]);

  // ── The 8 tile stats ────────────────────────────────────────────
  var stats = useMemo(function () {
    var matches = windowed.length;
    var wins = 0;
    var dayCounts = {};          // dayKey → match count
    var oppCounts = {};          // opponent name → count
    var oppIds = {};             // opponent name → profile id (when known)

    windowed.forEach(function (m) {
      if (m.result === "win") wins++;

      if (m.rawDate) dayCounts[m.rawDate] = (dayCounts[m.rawDate] || 0) + 1;

      // Opponent name + id must come from the SAME row flavour so a
      // tap on the name lands on the right profile (mirrors the
      // MatchesScreen identity rule): tagged / third-party rows show
      // the submitter (friendName / submitterId); own rows show the
      // logged opponent (oppName / opponent_id).
      var taggedRow = m.isTagged || m.isThirdParty;
      var opp = taggedRow
        ? (m.friendName || null)
        : (m.oppName || m.opponentName || null);
      var oppId = taggedRow ? m.submitterId : m.opponent_id;
      if (opp) {
        oppCounts[opp] = (oppCounts[opp] || 0) + 1;
        if (oppId && !oppIds[opp]) oppIds[opp] = oppId;
      }
    });

    // Active days + streaks operate on the distinct sorted play days.
    var dayKeys = Object.keys(dayCounts).sort();
    var activeDays = dayKeys.length;

    // Longest streak — longest run of consecutive calendar days.
    var longest = 0, run = 0, prev = null;
    dayKeys.forEach(function (k) {
      var d = parseDayKey(k);
      if (prev && d && (d.getTime() - prev.getTime()) === 86400000) run++;
      else run = 1;
      if (run > longest) longest = run;
      prev = d;
    });

    // Current streak — consecutive days counting back from today.
    // Stays "alive" if the last play was today OR yesterday.
    var current = 0;
    var cursor = startOfDay(new Date());
    if (!dayCounts[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1); // grace for "not yet today"
    while (dayCounts[dayKey(cursor)]) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    }

    // Top opponent — most-faced.
    var topOpp = "—", topOppN = -1;
    Object.keys(oppCounts).forEach(function (o) {
      if (oppCounts[o] > topOppN) { topOppN = oppCounts[o]; topOpp = o; }
    });

    return {
      matches: matches,
      wins: wins,
      activeDays: activeDays,
      currentStreak: current,
      longestStreak: longest,
      topOpp: topOpp,
      topOppId: (topOpp !== "—" && oppIds[topOpp]) || null,
      dayCounts: dayCounts,
    };
  }, [windowed]);

  // ── Heatmap squares ─────────────────────────────────────────────
  // A 7-row × HEATMAP_WEEKS-column contribution grid. Each cell is a
  // calendar day; intensity = match count that day. Squares outside
  // the active range render empty so the heatmap visually matches
  // whatever window the tiles are showing.
  var heatCells = useMemo(function () {
    var today = startOfDay(new Date());
    // End on the Saturday of this week so the last column is full.
    var end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    var totalDays = HEATMAP_WEEKS * 7;
    var start = new Date(end);
    start.setDate(start.getDate() - (totalDays - 1));

    var cells = [];
    var cur = new Date(start);
    for (var i = 0; i < totalDays; i++) {
      var key = dayKey(cur);
      var inWindow = !rangeStart || (cur.getTime() >= rangeStart.getTime());
      var isFuture = cur.getTime() > today.getTime();
      cells.push({
        key:   key,
        count: (inWindow && !isFuture) ? (stats.dayCounts[key] || 0) : 0,
        muted: isFuture,        // days after today render faint
      });
      cur.setDate(cur.getDate() + 1);
    }
    return cells;
  }, [stats.dayCounts, rangeStart]);

  // Footer context line — a light, human read on the windowed data.
  var footer = useMemo(function () {
    if (stats.matches === 0) return "No matches in this range yet — log one to start your streak.";
    var setsGuessHrs = Math.round(stats.matches * 1.3); // ~1h20m per match
    return "That's roughly " + setsGuessHrs + " hour" + (setsGuessHrs === 1 ? "" : "s")
      + " on court across " + stats.activeDays + " day" + (stats.activeDays === 1 ? "" : "s") + ".";
  }, [stats]);

  // Heatmap intensity → cell colour. Empty cells use a faint ink
  // wash (NOT bg2 — that matches the card and the grid would
  // vanish); played days ramp from light clay to full accent.
  function cellColor(count, muted) {
    if (muted || count <= 0) return "rgba(42, 32, 26, 0.07)";
    if (count === 1) return "rgba(255,45,85,0.34)";
    if (count === 2) return "rgba(255,45,85,0.62)";
    return ED_TOK.accent;
  }

  // Hover label for a heatmap square — the calendar day it covers
  // plus that day's match count.
  function cellLabel(c) {
    var d = parseDayKey(c.key);
    var dateStr = d
      ? d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
      : c.key;
    if (c.muted) return dateStr;
    if (!c.count)  return dateStr + " · no matches";
    return dateStr + " · " + c.count + " match" + (c.count === 1 ? "" : "es");
  }

  var firstName = profile && profile.name ? profile.name.split(/\s+/)[0] : null;

  return (
    <div style={{
      background:    ED_TOK.bg,
      color:         ED_TOK.ink,
      fontFamily:    ED_TOK.sans,
      minHeight:     "calc(100dvh - var(--cs-nav-h, 0px) - var(--cs-tab-h, 0px))",
      padding:       "20px 18px 96px",
    }}>
      {/* ── Header — title + range filter ──────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBottom: 18,
      }}>
        <div>
          <div style={{
            fontFamily:    ED_TOK.display,
            fontSize:      "clamp(26px, 7vw, 34px)",
            fontWeight:    600,
            letterSpacing: "-0.025em",
            lineHeight:    1.0,
            color:         ED_TOK.ink,
          }}>
            {firstName ? firstName + "'s court" : "Your court"}
          </div>
        </div>
        {/* Range filter — All / 30d / 7d. */}
        <div style={{
          display: "inline-flex", flexShrink: 0,
          border: "1px solid " + ED_TOK.line, borderRadius: 999, overflow: "hidden",
        }}>
          {[["all", "All"], ["30d", "30d"], ["7d", "7d"]].map(function (opt) {
            var on = range === opt[0];
            return (
              <button key={opt[0]} type="button" onClick={function () { setRange(opt[0]); }}
                style={{
                  appearance:    "none",
                  border:        "none",
                  background:    on ? ED_TOK.ink : "transparent",
                  color:         on ? ED_TOK.bg : ED_TOK.muted,
                  fontFamily:    ED_TOK.mono,
                  fontSize:      10.5,
                  fontWeight:    700,
                  letterSpacing: "0.08em",
                  padding:       "7px 12px",
                  cursor:        "pointer",
                }}>{opt[1]}</button>
            );
          })}
        </div>
      </div>

      {/* ── 8-tile stat grid ───────────────────────────────────── */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap:                 8,
        marginBottom:        16,
      }}>
        <StatTile label="Matches"        value={stats.matches} />
        <StatTile label="Wins"           value={stats.wins} accent />
        <StatTile label="Active days"    value={stats.activeDays} />
        <StatTile label="Current streak" value={stats.currentStreak + "d"} />
        <StatTile label="Longest streak" value={stats.longestStreak + "d"} />
        <StatTile label="Top opponent"   value={stats.topOpp} small
          onClick={(stats.topOppId && onOpenProfile)
            ? function () { onOpenProfile(stats.topOppId); }
            : null} />
      </div>

      {/* ── Play heatmap ───────────────────────────────────────── */}
      <div style={{
        background:   ED_TOK.bg2,
        border:       "1px solid " + ED_TOK.line,
        borderRadius: 14,
        padding:      "14px 14px 12px",
      }}>
        <div style={{
          display:             "grid",
          gridTemplateRows:    "repeat(7, 1fr)",
          gridAutoFlow:        "column",
          gridAutoColumns:     "1fr",
          gap:                 4,
        }}>
          {heatCells.map(function (c, i) {
            function show(e) {
              var pt = (e.touches && e.touches[0]) || e;
              setTip({ x: pt.clientX, y: pt.clientY, text: cellLabel(c) });
            }
            return (
              <div key={i}
                onMouseEnter={show}
                onMouseMove={show}
                onMouseLeave={function () { setTip(null); }}
                onTouchStart={show}
                onTouchEnd={function () { setTip(null); }}
                style={{
                  aspectRatio:  "1 / 1",
                  borderRadius: 3,
                  background:   cellColor(c.count, c.muted),
                  cursor:       "pointer",
                }}/>
            );
          })}
        </div>
        <div style={{
          marginTop:  12,
          fontFamily: ED_TOK.sans,
          fontSize:   12.5,
          color:      ED_TOK.muted,
          lineHeight: 1.5,
        }}>
          {footer}
        </div>
      </div>

      {/* Heatmap hover tooltip — fixed to the viewport, follows the
          cursor / touch point, never intercepts pointer events. */}
      {tip && (
        <div style={{
          position:      "fixed",
          left:          tip.x,
          top:           tip.y - 40,
          transform:     "translateX(-50%)",
          background:    ED_TOK.ink,
          color:         ED_TOK.bg,
          fontFamily:    ED_TOK.mono,
          fontSize:      10.5,
          fontWeight:    600,
          letterSpacing: "0.03em",
          padding:       "6px 9px",
          borderRadius:  6,
          whiteSpace:    "nowrap",
          pointerEvents: "none",
          zIndex:        80,
          boxShadow:     "0 4px 14px rgba(42,32,26,0.22)",
        }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────
// When `onClick` is supplied the whole tile becomes a button (used by
// the Top-opponent tile so the name links through to that profile).
function StatTile({ label, value, accent, small, onClick }) {
  var clickable = typeof onClick === "function";
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      } : undefined}
      style={{
        background:   ED_TOK.bg2,
        border:       "1px solid " + ED_TOK.line,
        borderRadius: 12,
        padding:      "12px 13px",
        cursor:       clickable ? "pointer" : "default",
      }}>
      <div style={{
        fontFamily:    ED_TOK.mono,
        fontSize:      10,
        fontWeight:    700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color:         ED_TOK.muted,
      }}>{label}</div>
      <div style={{
        marginTop:      6,
        fontFamily:     ED_TOK.display,
        fontSize:       small ? 18 : 26,
        fontWeight:     600,
        letterSpacing:  "-0.02em",
        lineHeight:     1.05,
        color:          clickable ? ED_TOK.accent : (accent ? ED_TOK.accent : ED_TOK.ink),
        textDecoration: clickable ? "underline" : "none",
        textUnderlineOffset: 3,
        whiteSpace:     "nowrap",
        overflow:       "hidden",
        textOverflow:   "ellipsis",
      }}>{value}</div>
    </div>
  );
}
