// V2MatchHome.jsx — V2 entry page rendered at the `/v2` route. Owns
// the v2 chrome (theme + court picker, back link to the picker) and
// hosts the `V2LiveScoringPage` content.
//
// This is the single mount point for the v2 namespace — `App.jsx`
// renders this in place of `V2Placeholder` when the user picks V2 and
// hits `/v2`. Fonts inject on mount via `ensureFonts()` so the rest
// of the app stays untouched.

import React from "react";
import { THEMES, COURTS } from "../utils/tokens.js";
import { ensureFonts } from "../utils/fonts.js";
import V2LiveScoringPage from "./V2LiveScoringPage.jsx";

const THEME_OPTIONS = [
  { id: "paper",      label: "Paper" },
  { id: "scoreboard", label: "Scoreboard" },
  { id: "court",      label: "Court" },
];

const COURT_OPTIONS = [
  { id: "grass", label: "Grass" },
  { id: "hard",  label: "Hard" },
  { id: "clay",  label: "Clay" },
  { id: "blue",  label: "Blue" },
  { id: "mono",  label: "Mono" },
];

export default function V2MatchHome({ onBack }) {
  React.useEffect(() => { ensureFonts(); }, []);

  const [themeId, setThemeId] = React.useState("paper");
  const [courtId, setCourtId] = React.useState("grass");
  const theme = THEMES[themeId];
  const court = COURTS[courtId];
  const accent = court.accent;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 0,
      display: "flex", flexDirection: "column",
      background: theme.bg, color: theme.ink,
      fontFamily: "Inter, -apple-system, system-ui, sans-serif",
      overflow: "hidden",
    }}>
      {/* Top chrome — back link + theme/court pickers */}
      <header style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 16px",
        borderBottom: `1px solid ${theme.line}`,
        flexShrink: 0, flexWrap: "wrap",
      }}>
        <button
          type="button"
          onClick={onBack}
          className="t-btn"
          style={{
            appearance: "none", border: `1px solid ${theme.line}`,
            background: "transparent", color: theme.inkSoft,
            padding: "6px 12px", borderRadius: 999, cursor: "pointer",
            fontFamily: "Inter", fontSize: 11, fontWeight: 600,
            letterSpacing: "0.12em", textTransform: "uppercase",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12 6 8l4-4"/></svg>
          Back
        </button>
        <span className="t-cap" style={{ color: theme.inkFaint }}>v2 · live scoring</span>

        <div style={{ flex: 1 }} />

        <PickerSegmented label="Theme" value={themeId} options={THEME_OPTIONS} onChange={setThemeId} theme={theme} />
        <PickerSegmented label="Court" value={courtId} options={COURT_OPTIONS} onChange={setCourtId} theme={theme} />
      </header>

      <main style={{ flex: 1, minHeight: 0 }}>
        <V2LiveScoringPage theme={theme} accent={accent} court={court} />
      </main>
    </div>
  );
}

function PickerSegmented({ label, value, options, onChange, theme }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="t-cap" style={{ color: theme.inkFaint }}>{label}</span>
      <div style={{ display: "inline-flex", padding: 3, gap: 3, background: theme.chip, borderRadius: 10 }}>
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              className="t-btn"
              style={{
                appearance: "none", border: 0, padding: "5px 10px",
                borderRadius: 8, cursor: "pointer",
                background: active ? theme.bgRaised : "transparent",
                color: active ? theme.ink : theme.inkSoft,
                fontFamily: "Inter", fontWeight: 600, fontSize: 11,
                letterSpacing: "0.04em",
              }}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
