// src/features/tournaments/components/hub/SuggestedNextMovesSection.jsx
//
// Module 13 (Compete hub Slice 3) — "Suggested for you" section.
// Renders BELOW the Active now band and ABOVE Explore competition
// types. Surfaces real-data prompts only:
//
//   • Rematch recent opponent  (most-recent confirmed match w/ profile)
//   • Continue active league   (next opponent if reliable, else
//                               safer fallback copy)
//
// Visibility: the section is rendered ONLY when at least one of the
// two suggestions is non-null. The caller passes the two pre-derived
// suggestion objects; this component never owns selection logic.
//
// Visual weight: subordinate to the Active now band. Hairline border,
// radius 10, calm padding. CTA buttons use the existing accent style
// from the hub (radius 10, 44px tap target) but at a quieter visual
// scale than the Active band's white-on-INK actions.

import { useState } from "react";
import PlayerAvatar from "../../../../components/ui/PlayerAvatar.jsx";
import SectionHeader, { HUB_SECTION_MB } from "./SectionHeader.jsx";

export default function SuggestedNextMovesSection({
  t,
  rematch,           // { match, opponentId, opponentName } | null
  continueLeague,    // { league, opponent, opponentName } | null
  profileMap,        // for avatar/profile lookup
  // Handlers:
  onRematch,         // (opponentProfile, sourceMatch) => void
  onOpenLeague,      // (leagueId) => void
}) {
  // Hidden when nothing real to suggest — no filler, no placeholder.
  if (!rematch && !continueLeague) return null;

  return (
    <section style={{ marginBottom: HUB_SECTION_MB }}>
      <SectionHeader t={t} label="Suggested for you" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rematch && (
          <RematchCard
            t={t}
            rematch={rematch}
            profileMap={profileMap}
            onRematch={onRematch}
          />
        )}
        {continueLeague && (
          <ContinueLeagueCard
            t={t}
            continueLeague={continueLeague}
            onOpenLeague={onOpenLeague}
          />
        )}
      </div>
    </section>
  );
}

// ── RematchCard ────────────────────────────────────────────────
// Avatar (left) + name + body line + "Challenge" CTA (right).
// Body line is intentionally terse — "You played recently" rather
// than scoreboard detail, since the surface is a prompt, not a
// recap.
function RematchCard({ t, rematch, profileMap, onRematch }) {
  var [busy, setBusy] = useState(false);

  // Build the targetUser shape openChallenge expects: id + name + a
  // few profile fields when available. Falls back to a minimal
  // shape so the composer still opens (it only requires id + name).
  var profile = profileMap && profileMap[rematch.opponentId];
  var targetUser = profile
    ? Object.assign({}, profile, { id: rematch.opponentId })
    : { id: rematch.opponentId, name: rematch.opponentName || "Player" };

  // Avatar resolution: prefer the loaded profile (PlayerAvatar reads
  // avatar / avatar_url), else fall back to the avatar URL the
  // history row was enriched with at load time.
  var avatarProfile = profile || {
    id:     rematch.opponentId,
    name:   targetUser.name,
    avatar_url: rematch.match && rematch.match.oppAvatarUrl,
  };

  function handleClick() {
    if (busy) return;
    setBusy(true);
    try { onRematch(targetUser, rematch.match); } finally {
      // No promise to wait on — openChallenge opens the composer
      // synchronously. Reset shortly so re-clicks don't lock out.
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
          fontSize:      14,
          fontWeight:    700,
          color:         t.text,
          letterSpacing: "-0.2px",
          lineHeight:    1.2,
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
        }}>
          Rematch {targetUser.name}
        </div>
        <div style={{
          fontSize:      12,
          color:         t.textSecondary,
          marginTop:     3,
          lineHeight:    1.4,
        }}>
          You played recently
        </div>
      </div>

      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          flexShrink:     0,
          minHeight:      36,
          padding:        "0 14px",
          background:     t.accent,
          color:          "#fff",
          border:         "none",
          borderRadius:   10,
          fontSize:       11.5,
          fontWeight:     700,
          letterSpacing:  "0.04em",
          textTransform:  "uppercase",
          cursor:         busy ? "default" : "pointer",
          opacity:        busy ? 0.7 : 1,
          transition:     "opacity 0.15s",
        }}
        onMouseEnter={function (e) { if (!busy) e.currentTarget.style.opacity = "0.85"; }}
        onMouseLeave={function (e) { if (!busy) e.currentTarget.style.opacity = "1"; }}>
        {busy ? "…" : "Challenge"}
      </button>
    </div>
  );
}

// ── ContinueLeagueCard ─────────────────────────────────────────
// No avatar (it's a league, not a person). Title + body + "Open
// league" CTA. Body adapts based on whether a reliable next-opponent
// surfaced from the picker:
//   - opponent present  → "Next: {name} · N matches played" style
//   - opponent null     → "Open your league and keep it moving"
function ContinueLeagueCard({ t, continueLeague, onOpenLeague }) {
  var lg       = continueLeague.league;
  var opp      = continueLeague.opponent;
  var oppName  = continueLeague.opponentName;

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
          fontSize:      14,
          fontWeight:    700,
          color:         t.text,
          letterSpacing: "-0.2px",
          lineHeight:    1.2,
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
        }}>
          Continue {lg.name || "your league"}
        </div>
        <div style={{
          fontSize:      12,
          color:         t.textSecondary,
          marginTop:     3,
          lineHeight:    1.4,
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
        }}>
          {bodyLine}
        </div>
      </div>

      <button
        onClick={function () { onOpenLeague(lg.id); }}
        style={{
          flexShrink:     0,
          minHeight:      36,
          padding:        "0 14px",
          background:     "transparent",
          color:          t.text,
          border:         "1px solid " + t.border,
          borderRadius:   10,
          fontSize:       11.5,
          fontWeight:     700,
          letterSpacing:  "0.04em",
          textTransform:  "uppercase",
          cursor:         "pointer",
          transition:     "opacity 0.15s",
        }}
        onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.7"; }}
        onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}>
        Open league
      </button>
    </div>
  );
}
