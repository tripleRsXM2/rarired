// src/features/tournaments/components/hub/CompeteStartActions.jsx
//
// Module 13 (Compete hub) — the "start something new" CTA row.
//
// Design pass: lost the outlined button boxes. Now reads as a quiet
// pair of text-links separated by a centered dot. The dark Active
// Now band above is the only emphasized moment on the page; these
// CTAs are calm "and here's what to do next" prompts, not draws of
// the eye. 44px tap height preserved via padding.

import { HUB_SECTION_MB } from "./SectionHeader.jsx";

export default function CompeteStartActions({ t, onChallenge, onCreateLeague }) {
  return (
    <section style={{
      marginBottom: HUB_SECTION_MB,
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      flexWrap:       "wrap",
      gap:            "0 16px",
    }}>
      <TextAction t={t} label="+ New challenge" onClick={onChallenge}    />
      <span aria-hidden="true" style={{
        color:         t.textTertiary,
        fontSize:      11,
        letterSpacing: "0.16em",
      }}>·</span>
      <TextAction t={t} label="+ New league"    onClick={onCreateLeague} />
    </section>
  );
}

function TextAction({ t, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        // 44px hit target via vertical padding without rendering as
        // a button-shaped box. Background + border are transparent;
        // hover dims the text instead of fading a fill.
        minHeight:     44,
        padding:       "12px 6px",
        background:    "transparent",
        border:        "none",
        color:         t.text,
        fontSize:      12.5,
        fontWeight:    700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor:        "pointer",
        transition:    "opacity 0.15s",
      }}
      onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.6"; }}
      onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}>
      {label}
    </button>
  );
}
