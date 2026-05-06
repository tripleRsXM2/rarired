// AppearanceToggle.jsx — Classic / Modern segmented switch on the
// BaselineApp Home screen. Lifted out of the design's HomeDashboard
// look-switch block in `main-app.jsx` so the choice is reusable from
// any future surface (settings, etc.).

import React from "react";

export default function AppearanceToggle({ value, onChange, theme, compact = false }) {
  // Compact mode: just the segmented pill, no card chrome / label.
  // Used in the global top bar (mobile) and sidebar (desktop) so the
  // toggle is reachable from every tab.
  if (compact) {
    return (
      <div style={{
        display: "inline-flex", background: theme.chip, borderRadius: 999, padding: 3,
        border: `0.5px solid ${theme.line}`,
      }}>
        {[
          { id: "classic", label: "Classic" },
          { id: "modern",  label: "Modern" },
        ].map((opt) => {
          const active = value === opt.id;
          return (
            <button key={opt.id} onClick={() => onChange(opt.id)} className="t-btn" style={{
              appearance: "none", border: 0, cursor: "pointer",
              padding: "5px 10px", borderRadius: 999,
              background: active ? theme.ink : "transparent",
              color: active ? theme.bg : theme.inkSoft,
              fontFamily: "Inter", fontWeight: 600, fontSize: 10.5,
              letterSpacing: "0.02em",
              transition: "background .15s, color .15s",
            }}>{opt.label}</button>
          );
        })}
      </div>
    );
  }
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: theme.bgRaised, border: `0.5px solid ${theme.line}`,
      borderRadius: 12, padding: "10px 12px 10px 14px", marginBottom: 18,
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="t-cap" style={{ color: theme.inkSoft }}>Appearance</span>
        <span style={{ fontSize: 13, fontFamily: "Inter", fontWeight: 600, color: theme.ink }}>
          {value === "modern" ? "Modern · sleek mono" : "Classic · paper & serif"}
        </span>
      </div>
      <div style={{
        display: "inline-flex", background: theme.chip, borderRadius: 999, padding: 3,
        border: `0.5px solid ${theme.line}`,
      }}>
        {[
          { id: "classic", label: "Classic" },
          { id: "modern",  label: "Modern" },
        ].map((opt) => {
          const active = value === opt.id;
          return (
            <button key={opt.id} onClick={() => onChange(opt.id)} className="t-btn" style={{
              appearance: "none", border: 0, cursor: "pointer",
              padding: "6px 12px", borderRadius: 999,
              background: active ? theme.ink : "transparent",
              color: active ? theme.bg : theme.inkSoft,
              fontFamily: "Inter", fontWeight: 600, fontSize: 11,
              letterSpacing: "0.02em",
              transition: "background .15s, color .15s",
            }}>{opt.label}</button>
          );
        })}
      </div>
    </div>
  );
}
