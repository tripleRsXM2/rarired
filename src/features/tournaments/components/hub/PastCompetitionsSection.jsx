// src/features/tournaments/components/hub/PastCompetitionsSection.jsx
//
// Module 13 (Compete hub) — collapsible Past competitions section.
// Lists completed / archived / cancelled leagues. Voided leagues
// never appear here (filtered out at the useLeagues hook boundary;
// the shared isPastLifecycle predicate from leagueLifecycle.js does
// not include 'voided' either).
//
// Design pass: dropped the outlined row chrome. Each league is now
// a banner-style row separated by a hairline divider, consistent
// with the Suggested-for-you and Explore sections. Lifecycle pill
// stays — it's the one bit of status colour worth keeping because
// finished / cancelled / archived genuinely differ.
//
// Toggle is a quiet text-link (Hide / Show), no outlined button.
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
          <ToggleLink
            t={t}
            expanded={expanded}
            onClick={function () { setExpanded(function (v) { return !v; }); }}
          />
        }
      />
      {expanded && rows.map(function (lg, idx) {
        return (
          <PastRow
            key={lg.id}
            t={t}
            league={lg}
            onClick={function () { onOpenLeague(lg.id); }}
            isLast={idx === rows.length - 1}
          />
        );
      })}
    </section>
  );
}

// ── ToggleLink ───────────────────────────────────────────────────
// Quiet text-link toggle in the section header — same as the one in
// SuggestedNextMovesSection. Section actions are calm typography,
// not buttons.
function ToggleLink({ t, expanded, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={expanded}
      style={{
        background:    "transparent",
        border:        "none",
        padding:       "4px 0 4px 12px",
        color:         t.textSecondary,
        fontSize:      10,
        fontWeight:    800,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        cursor:        "pointer",
        transition:    "color 0.15s",
      }}
      onMouseEnter={function (e) { e.currentTarget.style.color = t.text; }}
      onMouseLeave={function (e) { e.currentTarget.style.color = t.textSecondary; }}>
      {expanded ? "Hide" : "Show"}
    </button>
  );
}

// ── PastRow ────────────────────────────────────────────────────
// Hairline-separated row. No box, no border, no bgCard. The whole
// row is the affordance — tap anywhere on it to open the league.
// Lifecycle pill on the right keeps the one signal that matters:
// completed vs cancelled vs archived.
function PastRow({ t, league, onClick, isLast }) {
  var pillTokens = lifecyclePillTokens(league.status);
  var fg = t[pillTokens.fg] || t.textTertiary;
  var bg = t[pillTokens.bg] || t.bgTertiary;
  var label = LIFECYCLE_LABELS[league.status] || league.status;
  var reason = league.status_reason ? humaniseReason(league.status_reason) : null;

  return (
    <button
      onClick={onClick}
      onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.7"; }}
      onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
      style={{
        width:        "100%",
        textAlign:    "left",
        background:   "transparent",
        border:       "none",
        borderBottom: isLast ? "none" : "1px solid " + t.border,
        borderRadius: 0,
        padding:      "12px 0",
        cursor:       "pointer",
        display:      "flex",
        alignItems:   "center",
        gap:          12,
        minHeight:    44,
        transition:   "opacity 0.15s",
        font:         "inherit",
        color:        "inherit",
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:      14,
          fontWeight:    700,
          color:         t.text,
          letterSpacing: "-0.2px",
          lineHeight:    1.25,
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
        }}>
          {league.name}
        </div>
        {reason && (
          <div style={{
            fontSize:   12,
            color:      t.textSecondary,
            marginTop:  2,
            lineHeight: 1.4,
          }}>
            {reason}
          </div>
        )}
      </div>
      <span style={{
        flexShrink:    0,
        fontSize:      9,
        fontWeight:    700,
        color:         fg,
        background:    bg,
        padding:       "3px 8px",
        borderRadius:  20,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        whiteSpace:    "nowrap",
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
// kept very quiet now that the rest of the hub is box-free.
function PastEmpty({ t }) {
  return (
    <section style={{ marginBottom: HUB_SECTION_MB }}>
      <SectionHeader t={t} label="Past competitions" />
      <div style={{
        padding:    "12px 0",
        fontSize:   12,
        color:      t.textTertiary,
        lineHeight: 1.5,
      }}>
        Finished competitions will live here.
      </div>
    </section>
  );
}
