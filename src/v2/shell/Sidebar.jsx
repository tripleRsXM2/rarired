// Sidebar.jsx — Left nav rail for the v2 BaselineApp shell.
// Faithful port of the design's `SideRail` from `main-app.jsx`. Top:
// green ball + "Baseline" wordmark. Middle: 10 nav items (Home, Live
// scoring, Competitions, Messages, Changeover, Summary, History, Quick
// log, Desktop, Watch). Bottom: v0.1 footer.

import React from "react";
import { Ball } from "../features/matches/components/atoms.jsx";
import AppearanceToggle from "./AppearanceToggle.jsx";
import VersionSwitch from "./VersionSwitch.jsx";

export const ROUTES = [
  { id: "home",         label: "Home",         icon: "home" },
  { id: "live",         label: "Live scoring", icon: "live" },
  { id: "competitions", label: "Play",         icon: "trophy" },
  { id: "messages",     label: "Messages",     icon: "chat" },
  { id: "changeover",   label: "Changeover",   icon: "clock" },
  { id: "summary",      label: "Summary",      icon: "flag" },
  { id: "history",      label: "History",      icon: "list" },
  { id: "quicklog",     label: "Quick log",    icon: "edit" },
  { id: "desktop",      label: "Desktop",      icon: "monitor" },
  { id: "watch",        label: "Watch",        icon: "watch" },
];

export function NavIcon({ name, size = 16 }) {
  const st = { width: size, height: size, display: "block" };
  switch (name) {
    case "home":    return <svg style={st} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12 12 3l9 9"/><path d="M5 10v10h14V10"/></svg>;
    case "live":    return <svg style={st} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/></svg>;
    case "clock":   return <svg style={st} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case "flag":    return <svg style={st} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4"/><path d="M5 4h13l-3 5 3 5H5"/></svg>;
    case "list":    return <svg style={st} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>;
    case "edit":    return <svg style={st} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17v4h4l11-11-4-4L3 17z"/><path d="M14 6l4 4"/></svg>;
    case "monitor": return <svg style={st} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>;
    case "trophy":  return <svg style={st} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v3a3 3 0 0 1-3 3M7 5H4v3a3 3 0 0 0 3 3"/></svg>;
    case "watch":   return <svg style={st} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6V3h6v3M9 18v3h6v-3"/></svg>;
    case "chat":    return <svg style={st} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    default: return null;
  }
}

export default function Sidebar({ theme, accent, route, onGo, onBack, look, onLookChange }) {
  return (
    <div style={{
      width: 220, background: theme.bgRaised, color: theme.ink,
      borderRight: `0.5px solid ${theme.line}`, padding: "20px 12px",
      display: "flex", flexDirection: "column", gap: 4,
      flexShrink: 0, height: "100%",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px 18px" }}>
        <Ball size={20} color={accent} />
        <span className="t-serif" style={{ fontSize: 22, lineHeight: 1, letterSpacing: "-0.01em" }}>Baseline</span>
      </div>
      {onBack && (
        <div style={{ padding: "0 10px 14px" }}>
          <VersionSwitch theme={theme} onSwitchToV1={onBack} />
        </div>
      )}
      {ROUTES.map((r) => {
        const active = route === r.id;
        return (
          <button key={r.id} onClick={() => onGo(r.id)} className="t-btn" style={{
            appearance: "none", border: 0,
            background: active ? theme.chip : "transparent",
            color: active ? theme.ink : theme.inkSoft,
            borderRadius: 8, padding: "8px 10px",
            display: "flex", alignItems: "center", gap: 10, textAlign: "left",
            fontFamily: "Inter", fontSize: 13, fontWeight: active ? 600 : 500,
            cursor: "pointer",
          }}>
            <span style={{ color: active ? accent : "inherit", display: "flex" }}><NavIcon name={r.icon} size={16} /></span>
            {r.label}
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      {/* Appearance toggle — global so it's reachable from every tab.
          User feedback: 'can you move the appearance option to the top
          tab heading? so you always able to change the look at any tab' */}
      {onLookChange && (
        <div style={{ padding: "10px 6px 4px" }}>
          <AppearanceToggle value={look} onChange={onLookChange} theme={theme} compact />
        </div>
      )}
      <div style={{ borderTop: `0.5px solid ${theme.line}`, paddingTop: 14, fontSize: 10, color: theme.inkFaint, padding: "14px 10px 0" }}>
        <div className="t-cap">v0.1 · Baseline</div>
        <div style={{ marginTop: 4, fontFamily: "Inter" }}>Score the game,<br/>not the app.</div>
      </div>
    </div>
  );
}
