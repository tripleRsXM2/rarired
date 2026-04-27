// src/features/tournaments/components/hub/ActiveCompetitionCard.jsx
//
// Module 13 (Compete hub Slice 1) — single card shape used by every
// row inside ActiveNowSection. Reads the normalized item shape from
// `competeNormalize.js` so the section file doesn't have to know
// what kind of competition it's rendering.
//
// Visual rules:
//   - Priority 1 (action-required) gets a 3px coloured left rule —
//     orange for invites, accent for incoming challenges. Reads as
//     "this needs you" without needing a separate header.
//   - Status pill on the right keeps the card scannable.
//   - Primary CTA is a full-width-on-mobile thumb-friendly button.
//   - Secondary CTA renders next to primary on desktop, stacks below
//     on mobile (we use flex-wrap so one rule covers both).
//
// All text colours / backgrounds resolve against the theme via the
// `t` prop (project-wide convention).

import { useState } from "react";

export default function ActiveCompetitionCard({ t, item }) {
  // Resolve tone tokens against the theme. statusTone is the only
  // string the helper file knows about; mapping happens here so the
  // theme token surface stays bound to one component.
  var toneFg = toneToColor(t, item.statusTone, "fg");
  var toneBg = toneToColor(t, item.statusTone, "bg");

  var leftAccentColor = item.accentLeft
    ? (item.accentLeft === "orange" ? t.orange : t.accent)
    : null;

  return (
    <div
      style={{
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderLeft: leftAccentColor ? "3px solid " + leftAccentColor : ("1px solid " + t.border),
        borderRadius: 10,
        padding: "14px 14px",
        marginBottom: 10,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
      {/* ── Top row: title block + status pill ─────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: t.text,
            // Design pass: tighter letter-spacing on titles ties the
            // card typography to the editorial scale used by the
            // featured dark band ("-0.02em" on the band's title;
            // -0.2px sits cleanly between that and the page title).
            letterSpacing: "-0.2px", lineHeight: 1.3,
            // No ellipsis cap — the card is never inside a horizontally
            // constrained container, and clipping titles makes invites
            // genuinely confusing ("…ague invite" reads as garbage).
            overflowWrap: "anywhere",
          }}>
            {item.title}
          </div>
          {item.subtitle && (
            <div style={{
              fontSize: 11.5, color: t.textSecondary, marginTop: 3,
              lineHeight: 1.45, letterSpacing: "0.01em",
            }}>
              {item.subtitle}
            </div>
          )}
          {item.meta && (
            <div style={{
              fontSize: 10.5, color: t.textTertiary, marginTop: 3,
              letterSpacing: "0.02em",
            }}>
              {item.meta}
            </div>
          )}
        </div>

        {/* Status pill — flex-shrink:0 keeps it from squeezing the title.
            Design pass: sharp-corner squares (radius 0) match the
            recent-form chips and result pills used across HomeHero /
            HomeLeaguesStrip. The previous rounded-pellet shape
            (radius 20) read as a different visual language. */}
        <span style={{
          flexShrink: 0,
          fontSize: 9, fontWeight: 700, color: toneFg, background: toneBg,
          padding: "4px 8px", borderRadius: 0,
          letterSpacing: "0.12em", textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}>
          {item.statusLabel}
        </span>
      </div>

      {/* ── CTA row ─────────────────────────────────────────────── */}
      {/* flex-wrap means desktop = side-by-side, narrow mobile =
          stacks. Each button gets minWidth 0 + flex:1 so they share
          width when both fit on one line. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {item.primaryCta && (
          <CtaButton
            t={t}
            kind="primary"
            label={item.primaryCta.label}
            onClick={item.primaryCta.onClick}
          />
        )}
        {item.secondaryCta && (
          <CtaButton
            t={t}
            kind="secondary"
            label={item.secondaryCta.label}
            onClick={item.secondaryCta.onClick}
          />
        )}
      </div>
    </div>
  );
}

// ── CtaButton ─────────────────────────────────────────────────────
//
// Single button. 44px tall (thumb-friendly) per the mobile spec.
// Manages its own busy state so the parent doesn't need to know
// which row is mid-RPC. Async onClick is wrapped in a try/finally so
// busy clears even if the underlying call throws.
function CtaButton({ t, kind, label, onClick }) {
  var [busy, setBusy] = useState(false);

  function handleClick() {
    if (busy) return;
    var r;
    try { r = onClick(); } catch (e) { /* swallow — the page surfaces errors via toast */ return; }
    if (r && typeof r.then === "function") {
      setBusy(true);
      r.finally(function () { setBusy(false); });
    }
  }

  var primary = kind === "primary";
  return (
    <button
      onClick={handleClick}
      disabled={busy}
      style={{
        flex: "1 1 140px",
        minWidth: 0,
        minHeight: 44,
        padding: "10px 14px",
        // Slice 2: round corners to 10 to match HomeNextAction +
        // hub hero. Sharp 0-radius reads as the older app-shell
        // button style we're moving away from.
        borderRadius: 10,
        border: primary ? "none" : ("1px solid " + t.border),
        background: primary ? t.accent : "transparent",
        color: primary ? "#fff" : t.text,
        fontSize: 12.5, fontWeight: 700,
        letterSpacing: "0.03em", textTransform: "uppercase",
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.65 : 1,
        transition: "opacity 0.15s",
      }}
      onMouseEnter={function (e) { if (!busy) e.currentTarget.style.opacity = "0.85"; }}
      onMouseLeave={function (e) { if (!busy) e.currentTarget.style.opacity = "1"; }}>
      {busy ? "…" : label}
    </button>
  );
}

// ── tone resolver ────────────────────────────────────────────────
function toneToColor(t, tone, role) {
  switch (tone) {
    case "accent":  return role === "fg" ? t.accent       : t.accentSubtle;
    case "green":   return role === "fg" ? t.green        : t.greenSubtle;
    case "orange":  return role === "fg" ? t.orange       : t.bgTertiary;
    case "red":     return role === "fg" ? t.red          : t.bgTertiary;
    case "neutral":
    default:        return role === "fg" ? t.textTertiary : t.bgTertiary;
  }
}
