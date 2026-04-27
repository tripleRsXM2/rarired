// src/features/tournaments/components/hub/CompeteStartActions.jsx
//
// Module 13 (Compete hub) — the "start something new" CTA row that
// lives directly below the Active now band. Title + subtitle moved
// up to the hero header; this is now just the two action buttons.
//
// Visual: two equal-flex buttons (primary accent + secondary outline),
// match HomeNextAction's PrimaryCTA shape (radius 10, 44px tap height,
// 0.04em letter-spacing, uppercase). Subordinate to the band — these
// are next-step prompts, not the page's main draw.

import { HUB_SECTION_MB } from "./SectionHeader.jsx";

export default function CompeteStartActions({ t, onChallenge, onCreateLeague }) {
  return (
    <section style={{
      marginBottom: HUB_SECTION_MB,
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
    }}>
      <ActionBtn t={t} kind="primary"   label="New challenge" onClick={onChallenge} />
      <ActionBtn t={t} kind="secondary" label="New league"    onClick={onCreateLeague} />
    </section>
  );
}

function ActionBtn({ t, kind, label, onClick }) {
  var primary = kind === "primary";
  return (
    <button
      onClick={onClick}
      style={{
        flex: "1 1 140px",
        minWidth: 0, minHeight: 44, height: 44,
        padding: "0 16px",
        background: primary ? t.accent : "transparent",
        color: primary ? "#fff" : t.text,
        border: primary ? "none" : ("1px solid " + t.border),
        borderRadius: 10,
        fontSize: 12.5, fontWeight: 700, lineHeight: 1,
        letterSpacing: "0.03em", textTransform: "uppercase",
        cursor: "pointer",
        transition: "opacity 0.15s",
      }}
      onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.85"; }}
      onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}>
      {label}
    </button>
  );
}
