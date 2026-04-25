// src/features/profile/components/ProfileStatsAccordion.jsx
//
// Slice 2 of the design overhaul: the deeper-stats accordion on the
// own-profile page. Replaces the legacy "Ranking + Achievements" card,
// the 4-col quick-stats strip, AND the 2x2 Performance grid — all of
// which were dashboard-density chrome. Per docs/design-direction.md:
//   "Editorial cards over dashboard grids. A card has one job and tells
//    one story."
//
// Composition (single card, default collapsed):
//   • Header row: "Stats" eyebrow + a one-line preview ("X played ·
//     Y% win rate") + chevron toggle
//   • When expanded:
//       1. Big totals row — Played / Wins / Losses / Win %
//       2. Current streak (if any) + Confirmation rate (if computable)
//       3. By type — Ranked W/L · Casual W/L (only if user has both)
//       4. By format — Best of 3 W/L · One set W/L (only if user has both)
//
// Design rule: calm hierarchy. The accordion lives below the rivalry
// + leagues strip, and stays closed by default so Profile reads as
// identity → rivalry → leagues → match history without a stats wall.

import { useState } from "react";
import { computeConfirmationRate } from "../utils/profileStats.js";

function isConfirmed(m) { return m && m.status === "confirmed"; }

function statBucket(history, predicate) {
  var rows = (history || []).filter(function (m) {
    if (!isConfirmed(m)) return false;
    return predicate(m);
  });
  var wins = rows.filter(function (m) { return m.result === "win"; }).length;
  var losses = rows.length - wins;
  return { played: rows.length, wins: wins, losses: losses };
}

function summaryByType(history) {
  return {
    ranked: statBucket(history, function (m) { return m.match_type !== "casual"; }),
    casual: statBucket(history, function (m) { return m.match_type === "casual"; }),
  };
}

function summaryByFormat(history) {
  // Match format hint: prefer m.match_format if present, otherwise infer from
  // sets length (sets.length >= 2 → best_of_3, length === 1 → one_set).
  function format(m) {
    if (m.match_format === "one_set") return "one_set";
    if (m.match_format === "best_of_3") return "best_of_3";
    var n = (m.sets || []).filter(function (s) {
      return s && (s.you !== "" && s.you != null) && (s.them !== "" && s.them != null);
    }).length;
    return n >= 2 ? "best_of_3" : "one_set";
  }
  return {
    bo3: statBucket(history, function (m) { return format(m) === "best_of_3"; }),
    one: statBucket(history, function (m) { return format(m) === "one_set"; }),
  };
}

function StatRow({ t, label, value, color }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      flex: 1, minWidth: 0, padding: "8px 4px",
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, color: t.textTertiary,
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 18, fontWeight: 800,
        color: color || t.text,
        fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px", lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  );
}

function PairLine({ t, label, won, lost }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px",
      borderTop: "1px solid " + t.border,
      fontSize: 12,
    }}>
      <span style={{ color: t.textSecondary, fontWeight: 600 }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>
        <span style={{ color: t.green, fontWeight: 700 }}>{won}</span>
        <span style={{ color: t.textTertiary, margin: "0 4px" }}>–</span>
        <span style={{ color: t.red, fontWeight: 700 }}>{lost}</span>
      </span>
    </div>
  );
}

function Chevron({ t, open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none"
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
      <path d="M7 4l5 5-5 5" stroke={t.textSecondary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function ProfileStatsAccordion({
  t, profile, history,
}) {
  var [open, setOpen] = useState(false);

  var played = profile && profile.matches_played != null
    ? profile.matches_played
    : (history || []).filter(isConfirmed).length;
  var wins   = profile && profile.wins   != null ? profile.wins   : (history || []).filter(function (m) { return isConfirmed(m) && m.result === "win"; }).length;
  var losses = profile && profile.losses != null ? profile.losses : Math.max(played - wins, 0);
  var winPct = played ? Math.round(wins / played * 100) : 0;

  var streakCount = profile && profile.streak_count != null ? profile.streak_count : 0;
  var streakType  = profile && profile.streak_type;
  var streakLabel = streakCount === 0 ? "—" : streakCount + (streakType === "win" ? " W" : " L");
  var streakColor = streakType === "win" ? t.green : streakType === "loss" ? t.red : t.textTertiary;

  var confRate = computeConfirmationRate(history);

  var byType   = summaryByType(history);
  var byFormat = summaryByFormat(history);
  var hasBothTypes   = byType.ranked.played > 0 && byType.casual.played > 0;
  var hasBothFormats = byFormat.bo3.played > 0 && byFormat.one.played > 0;

  return (
    <div style={{
      background: t.bgCard,
      border: "1px solid " + t.border,
      borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* Header — toggle */}
      <button
        onClick={function () { setOpen(!open); }}
        style={{
          width: "100%", padding: "14px 18px",
          background: "transparent", border: "none",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer",
          textAlign: "left",
        }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: t.textTertiary,
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3,
          }}>
            Stats
          </div>
          <div style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>
            {played === 0
              ? "No matches yet"
              : played + " played · " + winPct + "% win rate"}
          </div>
        </div>
        <Chevron t={t} open={open} />
      </button>

      {open && (
        <div>
          {/* Big totals row */}
          <div style={{
            display: "flex", alignItems: "stretch",
            borderTop: "1px solid " + t.border,
          }}>
            <StatRow t={t} label="Played" value={played} />
            <StatRow t={t} label="Wins"   value={wins}   color={t.green} />
            <StatRow t={t} label="Losses" value={losses} color={t.red} />
            <StatRow t={t} label="Win %"  value={played ? winPct + "%" : "—"} color={t.accent} />
          </div>

          {/* Streak + confirmation rate row (if applicable) */}
          {(streakCount > 0 || confRate) && (
            <div style={{
              display: "flex", alignItems: "stretch",
              borderTop: "1px solid " + t.border,
            }}>
              {streakCount > 0 && (
                <StatRow t={t} label="Streak" value={streakLabel} color={streakColor} />
              )}
              {confRate && (
                <StatRow
                  t={t}
                  label="Confirmed"
                  value={confRate.pct + "%"}
                  color={t.text}
                />
              )}
            </div>
          )}

          {/* By type — only when there's a mix */}
          {hasBothTypes && (
            <>
              <PairLine t={t} label="Ranked" won={byType.ranked.wins} lost={byType.ranked.losses} />
              <PairLine t={t} label="Casual" won={byType.casual.wins} lost={byType.casual.losses} />
            </>
          )}

          {/* By format — only when there's a mix */}
          {hasBothFormats && (
            <>
              <PairLine t={t} label="Best of 3" won={byFormat.bo3.wins} lost={byFormat.bo3.losses} />
              <PairLine t={t} label="One set"   won={byFormat.one.wins} lost={byFormat.one.losses} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
