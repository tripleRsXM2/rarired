// WatchGlance.jsx — Apple-Watch-style mini live glance/tap surface for
// the v2 BaselineApp Watch sidebar option. Faithful port of the
// design's `WatchGlance` from `screens-web.jsx`.

import React from "react";
import { ServeDot } from "./atoms.jsx";
import { elapsedMs, fmtDuration, isMatchPoint, pointLabel } from "../utils/tennisEngine.js";

export default function WatchGlance({ match, accent, onPoint, onUndo, interactive = true }) {
  const [flash, setFlash] = React.useState(null);
  const tap = (side) => {
    if (!interactive) return;
    setFlash(side);
    setTimeout(() => setFlash(null), 220);
    onPoint?.(side);
  };
  const sz = 184;
  const mp = isMatchPoint(match);
  return (
    <div style={{
      width: sz, height: sz + 40, borderRadius: 34, overflow: "hidden",
      background: "#000", display: "flex", flexDirection: "column",
      boxShadow: "0 0 0 8px #1a1a1a, 0 0 0 9px #2a2a2a, 0 20px 40px rgba(0,0,0,0.4)",
      position: "relative",
    }}>
      <div style={{ height: 18, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px 0", position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent }} className="t-pulse" />
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, fontFamily: "Inter", fontWeight: 600, letterSpacing: "0.08em" }}>
            {match.inTiebreak ? "TB" : (mp >= 0 ? "MP" : `S${match.setHistory.length + 1}`)}
          </span>
        </div>
        <span style={{ color: accent, fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: 600 }}>
          {fmtDuration(elapsedMs(match)).split(":").slice(0, 2).join(":")}
        </span>
      </div>

      <button onClick={() => tap(0)} className="t-btn" style={{
        appearance: "none", border: 0, padding: "6px 12px",
        background: flash === 0 ? `${accent}55` : "transparent",
        color: "#fff", textAlign: "left", flex: 1,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "background .15s",
        borderBottom: "0.5px solid rgba(255,255,255,0.12)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <ServeDot active={match.serverIndex === 0} color={accent} size={6} />
          <span style={{ fontSize: 12, fontFamily: "Inter", fontWeight: 600 }}>{trim(match.p1.name)}</span>
        </div>
        <PointStrip match={match} side={0} accent={accent} />
      </button>

      <button onClick={() => tap(1)} className="t-btn" style={{
        appearance: "none", border: 0, padding: "6px 12px",
        background: flash === 1 ? `${accent}55` : "transparent",
        color: "#fff", textAlign: "left", flex: 1,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "background .15s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <ServeDot active={match.serverIndex === 1} color={accent} size={6} />
          <span style={{ fontSize: 12, fontFamily: "Inter", fontWeight: 600 }}>{trim(match.p2.name)}</span>
        </div>
        <PointStrip match={match} side={1} accent={accent} />
      </button>

      <div style={{ padding: "0 10px 8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <button onClick={(e) => { e.stopPropagation(); onUndo?.(); }} className="t-btn" style={{
          appearance: "none", border: 0, borderRadius: 8, padding: "3px 10px",
          background: "transparent", color: "rgba(255,255,255,0.55)",
          fontFamily: "Inter", fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
          display: "flex", alignItems: "center", gap: 4,
        }}>UNDO LAST POINT</button>
      </div>
    </div>
  );
}

function trim(name) { return name.length > 7 ? name.slice(0, 7) + "…" : name; }

function PointStrip({ match, side, accent }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
      {match.setHistory.map((s, i) => (
        <span key={i} className="t-num" style={{ color: s.score[side] > s.score[1 - side] ? "#fff" : "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600 }}>{s.score[side]}</span>
      ))}
      <span className="t-num" style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>{match.games[side]}</span>
      <span className="t-num" style={{ color: pointLabel(match, side) === "Ad" ? accent : "#fff", fontSize: 22, fontWeight: 700, minWidth: 26, textAlign: "right", letterSpacing: "-0.04em" }}>{pointLabel(match, side)}</span>
    </div>
  );
}
