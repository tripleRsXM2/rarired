// src/features/trust/components/ReliabilityBadge.jsx
//
// Module 10 (Slice 2) — positive-only reliability badge.
//
// Renders ONLY for badges that pass shouldShowBadgePublic — 'responsive',
// 'reliable', 'confirmed'. For 'new' and 'building' the component
// returns null on purpose (absence-of-positive is the V1 signal for
// "no public chip yet"; we deliberately don't shame fresh accounts).
//
// Two visual variants:
//   - 'chip'    (default) — inline pill, used in FeedCard next to the
//                           opponent name and in the challenge composer.
//   - 'inline'  — text only with a small dot, used in ProfileHero
//                 underneath the rating row to keep the editorial tone.
//
// Both variants are tiny by design (8–11px font, ALL CAPS, tracking).
// The badge must never compete with the score, the rating, or the
// player's name.

import {
  shouldShowBadgePublic,
  badgeLabel,
  badgeColor,
} from "../utils/trustLevels.js";

export default function ReliabilityBadge({
  t,
  badge,                  // string from player_trust_public.public_badge
  variant,                // 'chip' | 'inline'   (default: 'chip')
  title,                  // optional override for the native tooltip
}) {
  if (!shouldShowBadgePublic(badge)) return null;
  if (!t) return null;

  var label = badgeLabel(badge);
  var color = badgeColor(t, badge) || t.textSecondary;
  var v = variant || "chip";

  if (v === "inline") {
    return (
      <span
        title={title || label}
        style={{
          display: "inline-flex", alignItems: "center",
          gap: 6, fontSize: 10, fontWeight: 800,
          color: color,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: color, flexShrink: 0,
        }}/>
        {label}
      </span>
    );
  }

  // Default chip variant — inline pill with a 1px hairline.
  return (
    <span
      title={title || label}
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 7px",
        borderRadius: 999,
        border: "1px solid " + color + "55",
        background: "transparent",
        color: color,
        fontSize: 9, fontWeight: 800,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        lineHeight: 1.2,
      }}>
      {label}
    </span>
  );
}
