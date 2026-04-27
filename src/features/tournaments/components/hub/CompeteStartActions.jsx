// src/features/tournaments/components/hub/CompeteStartActions.jsx
//
// Module 13 (Compete hub) — the "start something new" CTA row that
// lives directly below the Active now band.
//
// Visual: two equal-flex outlined buttons. Both share the same
// quieter chrome (transparent bg + hairline border) so neither
// challenge nor league pops over the other. The dark band above
// is the page's accent moment; these CTAs are calm secondary
// prompts.

import { HUB_SECTION_MB } from "./SectionHeader.jsx";

export default function CompeteStartActions({ t, onChallenge, onCreateLeague }) {
  return (
    <section style={{
      marginBottom: HUB_SECTION_MB,
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
    }}>
      <ActionBtn t={t} label="New challenge" onClick={onChallenge}    />
      <ActionBtn t={t} label="New league"    onClick={onCreateLeague} />
    </section>
  );
}

function ActionBtn({ t, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: "1 1 140px",
        minWidth: 0, minHeight: 44, height: 44,
        padding: "0 16px",
        background: "transparent",
        color: t.text,
        border: "1px solid " + t.border,
        borderRadius: 10,
        fontSize: 12.5, fontWeight: 700, lineHeight: 1,
        letterSpacing: "0.03em", textTransform: "uppercase",
        cursor: "pointer",
        transition: "opacity 0.15s",
      }}
      onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.7"; }}
      onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}>
      {label}
    </button>
  );
}
