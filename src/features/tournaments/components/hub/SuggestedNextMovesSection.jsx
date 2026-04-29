// src/features/tournaments/components/hub/SuggestedNextMovesSection.jsx
//
// Module 13 (Compete hub) — "Suggested for you" section.
//
// Design pass: dropped the outlined card chrome and the side-arrow
// carousel. Each suggestion is now a banner-style row separated
// from the next by a hairline divider — reads as integrated content
// rather than three boxes stacked on top of each other.
//
// Behaviours kept from the previous slice:
//   - Hide / Show toggle in the section header (collapse).
//   - × dismiss per row (persists to per-user localStorage via the
//     parent's onDismiss handler — see suggestionDismissals.js).
//   - Section returns null when no items remain after dismissals,
//     so everything below reflows up automatically.
//
// Behaviours removed:
//   - The state-swap carousel + side arrows + N-of-M indicator.
//     With ≤2 active suggestion types in V1 (rematch + continue
//     league), a vertical stack reads cleaner and matches the
//     "more like banners" brief.

import { useState } from "react";
import PlayerAvatar from "../../../../components/ui/PlayerAvatar.jsx";
import SectionHeader from "./SectionHeader.jsx";

export default function SuggestedNextMovesSection({
  t,
  suggestions,
  profileMap,
  onRematch,        // (opponentProfile, sourceMatch) => void
  onOpenLeague,     // (leagueId) => void
  onDismiss,        // (key) => void  — persists to localStorage in parent
}) {
  // Section unmounts entirely when nothing remains. The parent's
  // section-margin then collapses (no orphan whitespace) and the
  // rest of the page reflows up — exactly the "section is gone,
  // everything below comes up" behaviour the brief asks for.
  if (!suggestions || suggestions.length === 0) return null;

  // Local expand/collapse — defaults expanded.
  var [expanded, setExpanded] = useState(true);

  return (
    <section style={{ marginBottom: "clamp(20px, 3vw, 32px)" }}>
      <SectionHeader
        t={t}
        label="Suggested for you"
        action={
          <ToggleLink
            t={t}
            expanded={expanded}
            onClick={function () { setExpanded(function (v) { return !v; }); }}
          />
        }
      />

      {expanded && suggestions.map(function (s, idx) {
        var isLast = idx === suggestions.length - 1;
        if (s.type === "rematch") {
          return (
            <RematchRow
              key={s.key}
              t={t}
              rematch={s.rematch}
              profileMap={profileMap}
              onRematch={onRematch}
              onDismiss={function () { onDismiss && onDismiss(s.key); }}
              isLast={isLast}
            />
          );
        }
        if (s.type === "continue_league") {
          return (
            <ContinueLeagueRow
              key={s.key}
              t={t}
              continueLeague={s.continueLeague}
              onOpenLeague={onOpenLeague}
              onDismiss={function () { onDismiss && onDismiss(s.key); }}
              isLast={isLast}
            />
          );
        }
        return null;
      })}
    </section>
  );
}

// ── ToggleLink ───────────────────────────────────────────────────
// Quiet text-link toggle in the section header. Lost the outlined
// button chrome — section actions are calm typography, not buttons.
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

// ── ArrowAction ──────────────────────────────────────────────────
// Inline arrow-action link used by every suggestion row. Reads as a
// "→" link, not a filled / outlined button. Tap area is generous
// via padding without growing the visual.
function ArrowAction({ t, label, busy, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        flexShrink:    0,
        background:    "transparent",
        border:        "none",
        padding:       "8px 4px",
        color:         t.text,
        fontSize:      11.5,
        fontWeight:    700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor:        busy ? "default" : "pointer",
        opacity:       busy ? 0.6 : 1,
        display:       "inline-flex",
        alignItems:    "center",
        gap:           6,
        transition:    "opacity 0.15s",
      }}
      onMouseEnter={function (e) { if (!busy) e.currentTarget.style.opacity = "0.6"; }}
      onMouseLeave={function (e) { if (!busy) e.currentTarget.style.opacity = "1"; }}>
      {busy ? "…" : label}
      {!busy && <span style={{ fontSize: 13, lineHeight: 1 }}>→</span>}
    </button>
  );
}

// ── DismissBtn ───────────────────────────────────────────────────
// Tiny × at the right of each row. Subtle in default state; lifts
// to text colour on hover so it's discoverable without competing
// with the row's title.
function DismissBtn({ t, onClick }) {
  return (
    <button
      onClick={function (e) { e.stopPropagation(); onClick && onClick(); }}
      aria-label="Dismiss suggestion"
      title="Don't show this suggestion again"
      style={{
        flexShrink:      0,
        width:           28, height: 28,
        background:      "transparent",
        border:          "none",
        color:           t.textTertiary,
        cursor:          "pointer",
        padding:         0,
        display:         "inline-flex",
        alignItems:      "center",
        justifyContent:  "center",
        transition:      "color 0.15s",
      }}
      onMouseEnter={function (e) { e.currentTarget.style.color = t.text; }}
      onMouseLeave={function (e) { e.currentTarget.style.color = t.textTertiary; }}>
      <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
        <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    </button>
  );
}

// ── Row chrome — shared between RematchRow + ContinueLeagueRow ──
// No card box. Just a flex row with horizontal padding, vertical
// padding, and a hairline border-bottom (dropped on the last row).
function rowStyle(t, isLast) {
  return {
    display:      "flex",
    alignItems:   "center",
    gap:          12,
    padding:      "12px 0",
    borderBottom: isLast ? "none" : "1px solid " + t.border,
  };
}

function rowTitleStyle(t) {
  return {
    fontSize:      14,
    fontWeight:    700,
    color:         t.text,
    letterSpacing: "-0.2px",
    lineHeight:    1.25,
    overflow:      "hidden",
    textOverflow:  "ellipsis",
    whiteSpace:    "nowrap",
  };
}

function rowBodyStyle(t) {
  return {
    fontSize:      12,
    color:         t.textSecondary,
    marginTop:     2,
    lineHeight:    1.4,
    overflow:      "hidden",
    textOverflow:  "ellipsis",
    whiteSpace:    "nowrap",
  };
}

// ── RematchRow ──────────────────────────────────────────────────
function RematchRow({ t, rematch, profileMap, onRematch, onDismiss, isLast }) {
  var [busy, setBusy] = useState(false);

  var profile = profileMap && profileMap[rematch.opponentId];
  var targetUser = profile
    ? Object.assign({}, profile, { id: rematch.opponentId })
    : { id: rematch.opponentId, name: rematch.opponentName || "Player" };
  var avatarProfile = profile || {
    id:         rematch.opponentId,
    name:       targetUser.name,
    avatar_url: rematch.match && rematch.match.oppAvatarUrl,
  };

  function handleClick() {
    if (busy) return;
    setBusy(true);
    try { onRematch(targetUser, rematch.match); } finally {
      setTimeout(function () { setBusy(false); }, 250);
    }
  }

  return (
    <div style={rowStyle(t, isLast)}>
      <div style={{ flexShrink: 0 }}>
        <PlayerAvatar
          name={targetUser.name}
          avatar={avatarProfile.avatar}
          profile={avatarProfile}
          size={32}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={rowTitleStyle(t)}>Rematch {targetUser.name}</div>
        <div style={rowBodyStyle(t)}>You played recently</div>
      </div>

      <ArrowAction t={t} label="Challenge" busy={busy} onClick={handleClick} />
      <DismissBtn t={t} onClick={onDismiss} />
    </div>
  );
}

// ── ContinueLeagueRow ───────────────────────────────────────────
function ContinueLeagueRow({ t, continueLeague, onOpenLeague, onDismiss, isLast }) {
  var lg      = continueLeague.league;
  var opp     = continueLeague.opponent;
  var oppName = continueLeague.opponentName;

  var bodyLine = (opp && oppName)
    ? "Next: " + oppName
    : "Open your league and keep it moving";

  return (
    <div style={rowStyle(t, isLast)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={rowTitleStyle(t)}>Continue {lg.name || "your league"}</div>
        <div style={rowBodyStyle(t)}>{bodyLine}</div>
      </div>

      <ArrowAction
        t={t}
        label="Open league"
        onClick={function () { onOpenLeague(lg.id); }}
      />
      <DismissBtn t={t} onClick={onDismiss} />
    </div>
  );
}
