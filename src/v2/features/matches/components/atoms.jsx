// atoms.jsx — shared atomic UI for the v2 tennis scoring design.
// Faithful port of the design's `atoms.jsx`. Theme-aware via `theme`
// prop (a value from `THEMES` in `utils/tokens.js`) and `accent` prop
// (a court accent color). Inline-style React, no Tailwind, no CSS
// modules — preserves the design's pattern.

import React from "react";
import { pointLabel } from "../utils/tennisEngine.js";

export function ServeDot({ active = false, color = "#d4e84a", size = 9 }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      background: active ? color : "transparent",
      boxShadow: active ? `0 0 0 2px ${color}33` : `inset 0 0 0 1.5px currentColor`,
      opacity: active ? 1 : 0.35,
      verticalAlign: "middle",
    }} />
  );
}

export function LiveDot({ accent = "#d4e84a" }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ position: "relative", width: 8, height: 8 }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: accent }} />
        <span style={{
          position: "absolute", inset: 0, borderRadius: "50%", background: accent,
          animation: "t-ring 1.4s ease-out infinite",
        }} />
      </span>
      <span className="t-cap" style={{ color: accent, letterSpacing: "0.16em" }}>LIVE</span>
    </span>
  );
}

export function PointButton({ label, sub, onTap, theme, accent, primary = false, disabled = false, style = {} }) {
  const [press, setPress] = React.useState(false);
  return (
    <button
      onPointerDown={() => setPress(true)}
      onPointerUp={() => setPress(false)}
      onPointerLeave={() => setPress(false)}
      onClick={() => !disabled && onTap?.()}
      disabled={disabled}
      style={{
        appearance: "none", border: 0, padding: "14px 18px",
        borderRadius: 14, cursor: disabled ? "default" : "pointer",
        background: primary ? accent : theme.chip,
        color: primary ? "#0f1410" : theme.ink,
        fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
        transform: press ? "scale(0.97)" : "scale(1)",
        transition: "transform .08s, background .15s",
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}>
      <span>{label}</span>
      {sub && <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>{sub}</span>}
    </button>
  );
}

export function ScoreCell({ value, big = false, active = false, complete = false, theme, accent, sup = null }) {
  return (
    <div style={{
      minWidth: big ? 60 : 36,
      height: big ? 60 : 40,
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative",
      color: active ? accent : (complete ? theme.ink : theme.inkSoft),
      fontFamily: "JetBrains Mono, monospace",
      fontVariantNumeric: "tabular-nums",
      fontWeight: big ? 600 : 500,
      fontSize: big ? 44 : 22,
      letterSpacing: "-0.02em",
    }}>
      {value}
      {sup != null && (
        <span style={{
          position: "absolute", top: big ? 6 : 2, right: big ? -2 : -6,
          fontSize: big ? 14 : 10, fontWeight: 500, opacity: 0.7,
        }}>{sup}</span>
      )}
    </div>
  );
}

export function PlayerRow({ player, server, sets, currentPoint, won, theme, accent, big = false, showPoint = true }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `1fr repeat(${sets.length}, ${big ? 36 : 30}px) ${showPoint ? (big ? 70 : 52) + "px" : ""}`,
      alignItems: "center", gap: big ? 10 : 6,
      padding: big ? "12px 4px" : "8px 4px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <ServeDot active={server} color={accent} size={big ? 10 : 8} />
        <span style={{
          fontFamily: "Inter, sans-serif", fontWeight: won ? 600 : 500,
          fontSize: big ? 18 : 14, color: theme.ink,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{player}</span>
        {won && <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, color: accent, letterSpacing: "0.1em" }}>•</span>}
      </div>
      {sets.map((s, i) => (
        <div key={i} className="t-num" style={{
          textAlign: "center", fontSize: big ? 22 : 16,
          color: s.complete ? theme.ink : theme.inkFaint,
          fontWeight: s.winner ? 600 : 500,
          position: "relative",
        }}>
          {s.score}
          {s.tb != null && <sup style={{ fontSize: big ? 11 : 9, marginLeft: 1, color: theme.inkSoft }}>{s.tb}</sup>}
        </div>
      ))}
      {showPoint && (
        <div className="t-num" style={{
          textAlign: "center", fontSize: big ? 28 : 18,
          color: currentPoint === "Ad" ? accent : theme.ink, fontWeight: 600,
        }}>{currentPoint}</div>
      )}
    </div>
  );
}

export function Scoreboard({ match, theme, accent, big = false, showPoint = true }) {
  const totalSets = match.cfg.tbOnly ? 1 : match.cfg.sets;
  const setCols = [];
  for (let i = 0; i < totalSets; i++) {
    const sh = match.setHistory[i];
    const isCurrent = i === match.setHistory.length && !match.endedAt;
    if (sh) {
      setCols.push([
        { score: sh.score[0], complete: true, winner: sh.score[0] > sh.score[1], tb: sh.tb ? Math.min(...sh.tb) : null },
        { score: sh.score[1], complete: true, winner: sh.score[1] > sh.score[0], tb: sh.tb ? Math.min(...sh.tb) : null },
      ]);
    } else if (isCurrent) {
      setCols.push([
        { score: match.games[0], complete: false, winner: false, tb: match.inTiebreak ? match.tbPoints[0] : null },
        { score: match.games[1], complete: false, winner: false, tb: match.inTiebreak ? match.tbPoints[1] : null },
      ]);
    } else {
      setCols.push([{ score: "·", complete: false, winner: false, tb: null }, { score: "·", complete: false, winner: false, tb: null }]);
    }
  }
  const setsP1 = setCols.map((c) => c[0]);
  const setsP2 = setCols.map((c) => c[1]);
  const p1 = match.p1, p2 = match.p2;
  const p1Won = match.endedAt && match.setsWon[0] > match.setsWon[1];
  const p2Won = match.endedAt && match.setsWon[1] > match.setsWon[0];

  return (
    <div style={{ background: theme.bgRaised, borderRadius: 16, padding: big ? "12px 16px" : "8px 12px", border: `1px solid ${theme.line}` }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: `1fr repeat(${totalSets}, ${big ? 36 : 30}px) ${showPoint ? (big ? 70 : 52) + "px" : ""}`,
        gap: big ? 10 : 6, paddingBottom: 6, borderBottom: `1px solid ${theme.line}`,
      }}>
        <div className="t-cap" style={{ color: theme.inkFaint }}>Player</div>
        {Array.from({ length: totalSets }, (_, i) => (
          <div key={i} className="t-cap" style={{ color: theme.inkFaint, textAlign: "center" }}>{i + 1}</div>
        ))}
        {showPoint && <div className="t-cap" style={{ color: theme.inkFaint, textAlign: "center" }}>{match.inTiebreak ? "TB" : "Pt"}</div>}
      </div>
      <PlayerRow
        player={p1.name} server={match.serverIndex === 0 && !match.endedAt}
        sets={setsP1}
        currentPoint={pointLabel(match, 0)}
        won={p1Won}
        theme={theme} accent={accent} big={big} showPoint={showPoint}
      />
      <div style={{ height: 1, background: theme.line }} />
      <PlayerRow
        player={p2.name} server={match.serverIndex === 1 && !match.endedAt}
        sets={setsP2}
        currentPoint={pointLabel(match, 1)}
        won={p2Won}
        theme={theme} accent={accent} big={big} showPoint={showPoint}
      />
    </div>
  );
}

export function CourtMini({ surface = "#1a4d2e", size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <rect x="2" y="4" width="20" height="16" rx="1" fill={surface} />
      <rect x="3.5" y="5.5" width="17" height="13" stroke="#fff" strokeOpacity="0.85" fill="none" strokeWidth="0.5" />
      <line x1="12" y1="5.5" x2="12" y2="18.5" stroke="#fff" strokeOpacity="0.85" strokeWidth="0.5" />
      <rect x="6" y="8.5" width="12" height="7" stroke="#fff" strokeOpacity="0.6" fill="none" strokeWidth="0.5" />
      <line x1="6" y1="12" x2="18" y2="12" stroke="#fff" strokeOpacity="0.6" strokeWidth="0.5" />
    </svg>
  );
}

export function Ball({ size = 16, color = "#d4e84a" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="7" fill={color} />
      <path d="M1.5 5.5 Q 8 8 14.5 5.5" stroke="#fff" strokeOpacity="0.6" fill="none" strokeWidth="0.6" />
      <path d="M1.5 10.5 Q 8 8 14.5 10.5" stroke="#fff" strokeOpacity="0.6" fill="none" strokeWidth="0.6" />
    </svg>
  );
}

export function Card({ theme, style, children, padded = true }) {
  return (
    <div style={{
      background: theme.bgRaised,
      border: `1px solid ${theme.line}`,
      borderRadius: 16, padding: padded ? 16 : 0,
      ...style,
    }}>{children}</div>
  );
}

export function Eyebrow({ children, color, style }) {
  return <div className="t-cap" style={{ color, ...style }}>{children}</div>;
}

export function StatBar({ label, a, b, theme, accent }) {
  const total = a + b || 1;
  const pa = Math.round((a / total) * 100);
  const pb = 100 - pa;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="t-num" style={{ fontSize: 16, color: theme.ink, fontWeight: 600 }}>{a}</span>
        <span className="t-cap" style={{ color: theme.inkSoft }}>{label}</span>
        <span className="t-num" style={{ fontSize: 16, color: theme.ink, fontWeight: 600 }}>{b}</span>
      </div>
      <div style={{ display: "flex", height: 4, borderRadius: 999, overflow: "hidden", background: theme.chip }}>
        <div style={{ width: `${pa}%`, background: accent }} />
        <div style={{ width: `${pb}%`, background: theme.inkFaint }} />
      </div>
    </div>
  );
}

export function Pill({ children, theme, accent, bg, ink }) {
  return (
    <div className="t-cap" style={{
      padding: "5px 10px", borderRadius: 999,
      background: bg || theme.chip, color: ink || theme.ink,
      letterSpacing: "0.1em",
    }}>{children}</div>
  );
}
