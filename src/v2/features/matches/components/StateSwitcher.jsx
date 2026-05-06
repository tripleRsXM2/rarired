// StateSwitcher.jsx — Top toggle that lets the user flip between the
// three "key states" of live scoring (Deuce, Tiebreak, Match Point).
// Pure presentation; takes a `value`, `options`, and `onChange`. Used
// by `V2LiveScoringPage` to seed the engine with the chosen factory.

import React from "react";

export default function StateSwitcher({ value, options, onChange, theme, accent, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {label && (
        <div className="t-cap" style={{ color: theme.inkSoft }}>{label}</div>
      )}
      <div style={{ display: "flex", gap: 6, padding: 4, background: theme.chip, borderRadius: 12 }}>
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              className="t-btn"
              style={{
                flex: 1, appearance: "none", border: 0, padding: "10px 12px",
                borderRadius: 9,
                background: active ? theme.bgRaised : "transparent",
                color: active ? theme.ink : theme.inkSoft,
                fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 12,
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all .15s",
                whiteSpace: "nowrap",
              }}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
