// QuickActionsGrid.jsx — 2×2 quick-actions tile grid for the v2 Home
// screen. Faithful port of the design's ActionTile pattern in
// `main-app.jsx`. Each tile dispatches a route id back to the shell.

import React from "react";
import { NavIcon } from "./Sidebar.jsx";

export default function QuickActionsGrid({ theme, accent, onGo, historyCount = 0 }) {
  const tiles = [
    { route: "competitions", icon: "trophy", label: "Competitions", sub: "Tournaments" },
    { route: "quicklog",     icon: "edit",   label: "Quick-log",    sub: "Final score" },
    { route: "changeover",   icon: "clock",  label: "Changeover",   sub: "90s timer" },
    { route: "history",      icon: "list",   label: "History",      sub: `${historyCount} matches` },
  ];
  return (
    <>
      <div className="t-cap" style={{ color: theme.inkSoft, margin: "4px 4px 10px" }}>Quick actions</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 22 }}>
        {tiles.map((t) => (
          <button key={t.route} onClick={() => onGo(t.route)} className="t-btn" style={{
            appearance: "none", border: `0.5px solid ${theme.line}`,
            background: theme.bgRaised, color: theme.ink,
            borderRadius: 14, padding: "14px 14px 16px", textAlign: "left",
            display: "flex", flexDirection: "column", gap: 12, minHeight: 86,
            cursor: "pointer",
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: theme.chip, color: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <NavIcon name={t.icon} size={16} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontFamily: "Inter", fontWeight: 600 }}>{t.label}</div>
              <div style={{ fontSize: 11, color: theme.inkSoft, marginTop: 1 }}>{t.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
