// HistoryScreen.jsx — Match-history list for the v2 BaselineApp.
// Faithful port of the design's `HistoryScreen` in
// `screens-mobile-2.jsx`. Reads from the SAMPLE_HISTORY seed.

import React from "react";
import { CourtMini, Eyebrow } from "./atoms.jsx";
import { COURTS } from "../utils/tokens.js";

export default function HistoryScreen({ theme, accent, matches }) {
  return (
    <div style={{ height: "100%", background: theme.bg, color: theme.ink, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "22px 20px 8px" }}>
        <Eyebrow color={theme.inkSoft}>This season</Eyebrow>
        <h1 className="t-serif" style={{ fontSize: 38, lineHeight: 1.05, margin: "6px 0 0", letterSpacing: "-0.015em" }}>
          <em>14</em> matches
        </h1>
        <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
          <Stat label="W–L"       v="9–5"  theme={theme} />
          <Stat label="Win %"     v="64%"  theme={theme} />
          <Stat label="Avg. time" v="1:24" theme={theme} />
        </div>
      </div>

      <div style={{ padding: "14px 20px 6px", display: "flex", gap: 6, overflowX: "auto" }} className="t-noscroll">
        {["All", "Wins", "Losses", "Singles", "Doubles"].map((f, i) => (
          <Chip key={f} active={i === 0} theme={theme}>{f}</Chip>
        ))}
      </div>

      <div className="t-noscroll" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
        {matches.map((m, i) => (
          <HistoryRow key={i} {...m} theme={theme} accent={accent} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, v, theme }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span className="t-num" style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>{v}</span>
      <span className="t-cap" style={{ color: theme.inkSoft }}>{label}</span>
    </div>
  );
}

function Chip({ children, active, theme }) {
  return (
    <button className="t-btn" style={{
      appearance: "none", border: `1px solid ${active ? theme.ink : theme.line}`,
      borderRadius: 999, padding: "6px 12px",
      background: active ? theme.ink : "transparent",
      color: active ? theme.bg : theme.ink,
      fontFamily: "Inter", fontWeight: 500, fontSize: 12,
      whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

function HistoryRow({ date, opp, score, win, surface, theme, accent }) {
  const surfaceColor = COURTS[surface]?.surface || "#1a4d2e";
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "40px 1fr auto auto", gap: 12, alignItems: "center",
      padding: "12px 14px", background: theme.bgRaised, border: `1px solid ${theme.line}`, borderRadius: 14,
    }}>
      <CourtMini surface={surfaceColor} size={32} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, color: theme.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>vs {opp}</div>
        <div style={{ fontSize: 11, color: theme.inkSoft, fontFamily: "Inter" }}>{date}</div>
      </div>
      <span className="t-num" style={{ fontSize: 14, color: theme.ink, fontWeight: 500 }}>{score}</span>
      <span style={{
        padding: "3px 8px", borderRadius: 999,
        background: win ? `${accent}30` : theme.chip,
        color: win ? theme.ink : theme.inkSoft,
        fontFamily: "Inter", fontWeight: 700, fontSize: 10, letterSpacing: "0.08em",
      }}>{win ? "W" : "L"}</span>
    </div>
  );
}
