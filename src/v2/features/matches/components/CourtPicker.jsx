// CourtPicker — pressable court indicator with a small dropdown menu.
// Used in the Live screens (mobile + desktop) so the user can change
// the court surface on the fly. Click the court chip → menu of all
// 5 courts (grass / hard / clay / blue / mono). Click one → fires
// onCourtChange and closes.
//
// User feedback: 'the grass icon in the top right, can you make it
// pressable? and have you be able to change it to hard court clay etc.'

import React from "react";
import { CourtMini } from "./atoms.jsx";

export default function CourtPicker({ courts, currentId, onChange, theme, accent, size = 20 }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef(null);

  // Close on outside-click.
  React.useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current = courts[currentId] || courts.grass;
  const order = ["grass", "hard", "clay", "blue", "mono"]; // canonical ordering

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Change court"
        style={{
          appearance: "none", border: 0, background: "transparent",
          cursor: "pointer", padding: "4px 8px", borderRadius: 8,
          display: "inline-flex", alignItems: "center", gap: 8,
          color: "inherit",
          transition: "background 140ms",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = theme.chip || "rgba(0,0,0,0.05)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <CourtMini surface={current.surface} size={size} />
        <span className="t-cap" style={{ color: theme.inkSoft }}>{current.label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true" style={{ marginLeft: 2 }}>
          <path d="M1 1 L 5 5 L 9 1" stroke={theme.inkSoft} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div role="menu" style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          minWidth: 168,
          background: theme.bgRaised || theme.bg, color: theme.ink,
          border: `0.5px solid ${theme.line}`,
          borderRadius: 12,
          boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
          padding: 6,
          zIndex: 50,
          display: "flex", flexDirection: "column", gap: 2,
        }}>
          {order.map((id) => {
            const c = courts[id];
            if (!c) return null;
            const active = id === currentId;
            return (
              <button
                key={id}
                role="menuitem"
                onClick={() => { onChange(id); setOpen(false); }}
                style={{
                  appearance: "none", border: 0, cursor: "pointer", textAlign: "left",
                  background: active ? theme.chip || "rgba(0,0,0,0.05)" : "transparent",
                  color: theme.ink,
                  borderRadius: 8,
                  padding: "8px 10px",
                  display: "flex", alignItems: "center", gap: 10,
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontSize: 13, fontWeight: active ? 600 : 500,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = theme.chip || "rgba(0,0,0,0.04)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <CourtMini surface={c.surface} size={18} />
                <span style={{ flex: 1 }}>{c.label}</span>
                {active && (
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8 L 7 12 L 13 4" stroke={accent} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
