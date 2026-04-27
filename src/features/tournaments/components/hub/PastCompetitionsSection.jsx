// src/features/tournaments/components/hub/PastCompetitionsSection.jsx
//
// Module 13 (Compete hub Slice 1) — collapsible Past competitions
// section. Lists completed / archived / cancelled leagues. Voided
// leagues never appear here (filtered out at the useLeagues hook
// boundary; the shared isPastLifecycle predicate from
// leagueLifecycle.js does not include 'voided' either).
//
// Responsive behaviour:
//   - Mobile (<= 640px) starts COLLAPSED. Tapping the header
//     expands. This keeps Active now visible on first paint per
//     the Slice 1 mobile constraints.
//   - Desktop (> 640px) starts EXPANDED. Plenty of vertical space.
//
// We resolve the breakpoint via window.matchMedia at mount time.
// Re-running on resize would be over-engineered for V1 — users on
// the boundary can just tap to toggle.

import { useState } from "react";
import {
  isPastLifecycle, LIFECYCLE_LABELS, lifecyclePillTokens,
} from "../../../leagues/utils/leagueLifecycle.js";
import SectionHeader, { HUB_SECTION_MB } from "./SectionHeader.jsx";

// Slightly larger than the typical "small phone" breakpoint so the
// 430px iPhone-Pro-Max viewport still defaults to collapsed (the
// Slice 1 spec calls out 375 / 390 / 430 specifically).
var COLLAPSE_BELOW_PX = 640;

export default function PastCompetitionsSection({ t, leagues, onOpenLeague }) {
  // Default to whatever the viewport says at first render.
  // SSR-safe via the typeof window guard — Vite builds happily
  // either way, but the project doesn't use SSR today.
  var initiallyExpanded = typeof window === "undefined"
    ? true
    : window.matchMedia("(min-width: " + COLLAPSE_BELOW_PX + "px)").matches;
  var [expanded, setExpanded] = useState(initiallyExpanded);

  // Filter to past leagues. Sort by status_changed_at desc so the
  // most recently archived/completed/cancelled lands at the top —
  // the freshest "memory" is most discoverable.
  var rows = (leagues || [])
    .filter(isPastLifecycle)
    .sort(function (a, b) {
      var ta = a.status_changed_at ? new Date(a.status_changed_at).getTime() : 0;
      var tb = b.status_changed_at ? new Date(b.status_changed_at).getTime() : 0;
      return tb - ta;
    });

  if (rows.length === 0) return <PastEmpty t={t} />;

  return (
    <section style={{ marginBottom: HUB_SECTION_MB }}>
      <SectionHeader
        t={t}
        label="Past competitions"
        count={rows.length}
        action={
          <button
            onClick={function () { setExpanded(function (v) { return !v; }); }}
            aria-expanded={expanded}
            style={{
              padding: "4px 10px",
              minHeight: 28,
              background: "transparent",
              border: "1px solid " + t.border,
              // Slice 2: gently rounded — keeps the toggle subtle but
              // visually consistent with the rounded card chrome below.
              borderRadius: 8,
              color: t.textSecondary,
              fontSize: 11, fontWeight: 700,
              letterSpacing: "0.04em", textTransform: "uppercase",
              cursor: "pointer",
            }}>
            {expanded ? "Hide" : "Show"}
          </button>
        }
      />
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map(function (lg) {
            return (
              <PastRow
                key={lg.id}
                t={t}
                league={lg}
                onClick={function () { onOpenLeague(lg.id); }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── PastRow ────────────────────────────────────────────────────
// Compact row — past items shouldn't compete visually with active
// cards. Reuses the same pill chrome / status colours as the
// LeaguesPanel "Past" rows so the two surfaces feel continuous.
function PastRow({ t, league, onClick }) {
  var pillTokens = lifecyclePillTokens(league.status);
  var fg = t[pillTokens.fg] || t.textTertiary;
  var bg = t[pillTokens.bg] || t.bgTertiary;
  var label = LIFECYCLE_LABELS[league.status] || league.status;

  return (
    <button
      onClick={onClick}
      style={{
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderRadius: 8,
        padding: "10px 12px",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 44,
        // Slight de-emphasis vs Active now cards. Same opacity as
        // LeaguesPanel's existing past treatment.
        opacity: 0.86,
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: t.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {league.name}
        </div>
        {league.status_reason && (
          <div style={{
            fontSize: 10.5, color: t.textTertiary, marginTop: 1,
            letterSpacing: "0.02em",
          }}>
            {humaniseReason(league.status_reason)}
          </div>
        )}
      </div>
      <span style={{
        flexShrink: 0,
        fontSize: 9, fontWeight: 700, color: fg, background: bg,
        padding: "3px 8px", borderRadius: 20,
        letterSpacing: "0.12em", textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>
    </button>
  );
}

function humaniseReason(reason) {
  // Cheap mapping. Mirrors a subset of LIFECYCLE_REASONS labels
  // without coupling to the modal's reason copy.
  switch (reason) {
    case "season_finished":      return "Season finished";
    case "inactive":             return "Went quiet";
    case "cancelled_by_creator": return "Cancelled by owner";
    case "wrong_rules":          return "Wrong rules";
    case "wrong_players":        return "Wrong players";
    case "integrity_issue":      return "Integrity issue";
    case "test_league":          return "Test league";
    case "created_by_mistake":   return "Created by mistake";
    case "other":                return null;       // skip — adds no info
    default:                     return null;
  }
}

// ── Empty state ─────────────────────────────────────────────────
// Spec asks for a clean empty state per section. Past has its own —
// kept very compact since it's a low-priority surface.
function PastEmpty({ t }) {
  return (
    <section style={{ marginBottom: HUB_SECTION_MB }}>
      <SectionHeader t={t} label="Past competitions" />
      <div style={{
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderRadius: 10,
        padding: "14px 16px",
        fontSize: 12, color: t.textTertiary, lineHeight: 1.5,
      }}>
        Finished competitions will live here.
      </div>
    </section>
  );
}
