// src/features/tournaments/components/hub/SuggestedNextMovesSection.jsx
//
// Module 13 (Compete hub) — "Suggested for you" section.
//
// Renders BELOW the Active now band and Start something CTAs, ABOVE
// Explore competition types. Surfaces real-data prompts only —
// rematch a recent opponent, continue an active league. Hidden
// entirely when no suggestion items remain (after dismissals).
//
// Three behaviours users can drive:
//   1. Hide / show toggle in the section header (collapse to just
//      the eyebrow row when they don't want suggestions in their
//      face right now). Local component state — refresh resets.
//   2. Side-arrow carousel between suggestions when there's more
//      than one. State-swap (not scroll-snap) — the section
//      shows ONE card at a time with full content; arrows advance.
//   3. × dismiss per card. Permanently hides that specific
//      suggestion via localStorage (handled by the parent's
//      `onDismiss(key)`). The dismissal is keyed to the underlying
//      entity (matchId / leagueId), so a future suggestion against
//      a DIFFERENT entity re-surfaces.
//
// Visual: subordinate to the dark Active now band — same hairline-
// bordered light card chrome the rest of the hub uses, with
// outlined CTAs (no accent fill on action buttons).

import { useState } from "react";
import PlayerAvatar from "../../../../components/ui/PlayerAvatar.jsx";
import SectionHeader, { HUB_SECTION_MB } from "./SectionHeader.jsx";

export default function SuggestedNextMovesSection({
  t,
  // Array of suggestion items (already filtered against dismissals
  // by the parent). Each item has { type, key, rematch?, continueLeague? }.
  suggestions,
  profileMap,
  onRematch,        // (opponentProfile, sourceMatch) => void
  onOpenLeague,     // (leagueId) => void
  onDismiss,        // (key) => void  — persists to localStorage in parent
}) {
  // Section visibility — when nothing remains after dismissals the
  // whole block unmounts. No empty-state placeholder here; the
  // section's whole point is real prompts, and "no prompts" reads
  // as the user has actioned everything.
  if (!suggestions || suggestions.length === 0) return null;

  // Expand/collapse — local state, defaults to expanded. Mirrors
  // PastCompetitionsSection's Hide/Show pattern but inverted
  // (active suggestions deserve to be visible by default; past is
  // historical and hides itself).
  var [expanded, setExpanded] = useState(true);

  // Carousel index — clamped against the current suggestion count
  // so a dismissal that removes the active item doesn't strand us
  // out of range.
  var [activeIdx, setActiveIdx] = useState(0);
  var safeIdx = Math.min(Math.max(0, activeIdx), suggestions.length - 1);
  var hasMany = suggestions.length > 1;
  var current = suggestions[safeIdx];

  function goPrev() { setActiveIdx(function (i) { return Math.max(0, (i || 0) - 1); }); }
  function goNext() { setActiveIdx(function (i) { return Math.min(suggestions.length - 1, (i || 0) + 1); }); }

  function handleDismiss(key) {
    // Adjust the index BEFORE the parent re-renders us with a
    // shorter list. If we're on the last item, step back by one.
    if (safeIdx >= suggestions.length - 1 && safeIdx > 0) {
      setActiveIdx(safeIdx - 1);
    }
    if (onDismiss) onDismiss(key);
  }

  return (
    <section style={{ marginBottom: HUB_SECTION_MB }}>
      <SectionHeader
        t={t}
        label="Suggested for you"
        count={hasMany ? null : null /* count carried by indicator below when expanded */}
        action={
          <ToggleBtn
            t={t}
            expanded={expanded}
            onClick={function () { setExpanded(function (v) { return !v; }); }}
          />
        }
      />

      {expanded && (
        <div style={{ position: "relative" }}>
          {/* Indicator + carousel chrome above the card. Only
              renders when there's more than one suggestion — a
              single card doesn't need controls. */}
          {hasMany && (
            <div style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              marginBottom:   8,
            }}>
              <div style={{
                fontSize:      10,
                fontWeight:    700,
                color:         t.textTertiary,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}>
                {(safeIdx + 1) + " of " + suggestions.length}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <CarouselArrow t={t} dir="left"  enabled={safeIdx > 0}                       onClick={goPrev} />
                <CarouselArrow t={t} dir="right" enabled={safeIdx < suggestions.length - 1}  onClick={goNext} />
              </div>
            </div>
          )}

          {/* Single card render — keyed by suggestion key so React
              tears down + remounts on swap rather than re-using
              state across different content (avatar busy state etc). */}
          {current.type === "rematch" && (
            <RematchCard
              key={current.key}
              t={t}
              rematch={current.rematch}
              profileMap={profileMap}
              onRematch={onRematch}
              onDismiss={function () { handleDismiss(current.key); }}
            />
          )}
          {current.type === "continue_league" && (
            <ContinueLeagueCard
              key={current.key}
              t={t}
              continueLeague={current.continueLeague}
              onOpenLeague={onOpenLeague}
              onDismiss={function () { handleDismiss(current.key); }}
            />
          )}
        </div>
      )}
    </section>
  );
}

// ── ToggleBtn ────────────────────────────────────────────────────
// Small Hide/Show button in the section header. Same chrome as the
// PastCompetitions toggle for visual consistency.
function ToggleBtn({ t, expanded, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={expanded}
      style={{
        padding:        "4px 10px",
        minHeight:      28,
        background:     "transparent",
        border:         "1px solid " + t.border,
        borderRadius:   8,
        color:          t.textSecondary,
        fontSize:       11,
        fontWeight:     700,
        letterSpacing:  "0.04em",
        textTransform:  "uppercase",
        cursor:         "pointer",
      }}>
      {expanded ? "Hide" : "Show"}
    </button>
  );
}

// ── CarouselArrow ────────────────────────────────────────────────
// Compact circular-ish arrow button for the light-chrome carousel.
// Smaller than the dark band's side-arrows; sits in the section
// header's indicator row rather than over content.
function CarouselArrow({ t, dir, enabled, onClick }) {
  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      aria-label={dir === "left" ? "Previous suggestion" : "Next suggestion"}
      style={{
        width:           28, height: 28,
        background:      "transparent",
        border:          "1px solid " + t.border,
        borderRadius:    999,
        color:           enabled ? t.text : t.textTertiary,
        cursor:          enabled ? "pointer" : "default",
        opacity:         enabled ? 1 : 0.4,
        display:         "inline-flex",
        alignItems:      "center",
        justifyContent:  "center",
        padding:         0,
      }}>
      <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
        {dir === "left" ? (
          <path d="M11 4l-5 5 5 5" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round"/>
        ) : (
          <path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round"/>
        )}
      </svg>
    </button>
  );
}

// ── DismissBtn ───────────────────────────────────────────────────
// Tiny × button in the top-right of each card. Clicking removes
// the suggestion from view permanently (per device, per user).
// Hit area enlarged via padding without growing the visual.
function DismissBtn({ t, onClick }) {
  return (
    <button
      onClick={function (e) { e.stopPropagation(); onClick && onClick(); }}
      aria-label="Dismiss suggestion"
      title="Don't show this suggestion again"
      style={{
        flexShrink:      0,
        width:           24, height: 24,
        background:      "transparent",
        border:          "none",
        borderRadius:    999,
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

// ── RematchCard ─────────────────────────────────────────────────
function RematchCard({ t, rematch, profileMap, onRematch, onDismiss }) {
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
    <div style={{
      background:   t.bgCard,
      border:       "1px solid " + t.border,
      borderRadius: 10,
      padding:      "12px 14px",
      display:      "flex",
      alignItems:   "center",
      gap:          12,
    }}>
      <div style={{ flexShrink: 0 }}>
        <PlayerAvatar
          name={targetUser.name}
          avatar={avatarProfile.avatar}
          profile={avatarProfile}
          size={40}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: t.text,
          letterSpacing: "-0.2px", lineHeight: 1.2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          Rematch {targetUser.name}
        </div>
        <div style={{
          fontSize: 12, color: t.textSecondary,
          marginTop: 3, lineHeight: 1.4,
        }}>
          You played recently
        </div>
      </div>

      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          flexShrink:    0,
          minHeight:     36,
          padding:       "0 14px",
          background:    "transparent",
          color:         t.text,
          border:        "1px solid " + t.border,
          borderRadius:  10,
          fontSize:      11.5,
          fontWeight:    700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          cursor:        busy ? "default" : "pointer",
          opacity:       busy ? 0.6 : 1,
          transition:    "opacity 0.15s",
        }}
        onMouseEnter={function (e) { if (!busy) e.currentTarget.style.opacity = "0.7"; }}
        onMouseLeave={function (e) { if (!busy) e.currentTarget.style.opacity = "1"; }}>
        {busy ? "…" : "Challenge"}
      </button>

      <DismissBtn t={t} onClick={onDismiss} />
    </div>
  );
}

// ── ContinueLeagueCard ─────────────────────────────────────────
function ContinueLeagueCard({ t, continueLeague, onOpenLeague, onDismiss }) {
  var lg      = continueLeague.league;
  var opp     = continueLeague.opponent;
  var oppName = continueLeague.opponentName;

  var bodyLine = (opp && oppName)
    ? "Next: " + oppName
    : "Open your league and keep it moving";

  return (
    <div style={{
      background:   t.bgCard,
      border:       "1px solid " + t.border,
      borderRadius: 10,
      padding:      "12px 14px",
      display:      "flex",
      alignItems:   "center",
      gap:          12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: t.text,
          letterSpacing: "-0.2px", lineHeight: 1.2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          Continue {lg.name || "your league"}
        </div>
        <div style={{
          fontSize: 12, color: t.textSecondary,
          marginTop: 3, lineHeight: 1.4,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {bodyLine}
        </div>
      </div>

      <button
        onClick={function () { onOpenLeague(lg.id); }}
        style={{
          flexShrink:    0,
          minHeight:     36,
          padding:       "0 14px",
          background:    "transparent",
          color:         t.text,
          border:        "1px solid " + t.border,
          borderRadius:  10,
          fontSize:      11.5,
          fontWeight:    700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          cursor:        "pointer",
          transition:    "opacity 0.15s",
        }}
        onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.7"; }}
        onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}>
        Open league
      </button>

      <DismissBtn t={t} onClick={onDismiss} />
    </div>
  );
}
