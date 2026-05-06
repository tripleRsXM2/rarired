// ChangeoverScreen.jsx — 90s changeover / 120s set-break timer overlay.
// Faithful port of the design's `ChangeoverScreen` from
// `screens-mobile.jsx`. Court-surface backdrop, decorative court lines,
// TimerRing, mini scoreboard, pause / skip CTA pair.

import React from "react";
import { Eyebrow, Scoreboard, TimerRing } from "./atoms.jsx";

export default function ChangeoverScreen({ match, theme, accent, court, onResume, totalSec = 90 }) {
  const [remaining, setRemaining] = React.useState(totalSec);
  const [paused, setPaused] = React.useState(false);
  React.useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [paused]);

  const isSetBreakNow = totalSec === 120;
  const overlayTheme = {
    bg: "transparent", bgRaised: "transparent", ink: "#fbf6e9",
    inkSoft: "rgba(251,246,233,0.7)", inkFaint: "rgba(251,246,233,0.4)",
    line: "rgba(251,246,233,0.15)", chip: "rgba(251,246,233,0.08)",
  };

  return (
    <div style={{
      height: "100%", width: "100%", background: court.surface, color: "#fbf6e9",
      display: "flex", flexDirection: "column", position: "relative", overflow: "hidden",
    }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.18 }} preserveAspectRatio="none" viewBox="0 0 400 800">
        <rect x="20" y="60" width="360" height="680" fill="none" stroke="#fff" strokeWidth="2" />
        <rect x="60" y="200" width="280" height="400" fill="none" stroke="#fff" strokeWidth="1.5" />
        <line x1="60" y1="400" x2="340" y2="400" stroke="#fff" strokeWidth="1.5" />
        <line x1="200" y1="60" x2="200" y2="740" stroke="#fff" strokeWidth="1.5" />
      </svg>

      <div style={{ position: "relative", zIndex: 1, padding: "54px 20px 0", textAlign: "center" }}>
        <Eyebrow color="rgba(251,246,233,0.7)">{isSetBreakNow ? "Set break" : "Changeover"}</Eyebrow>
        <h1 className="t-serif" style={{ fontSize: 36, lineHeight: 1.1, margin: "8px 0 0", letterSpacing: "-0.01em" }}>
          {isSetBreakNow ? "Take a breath" : "Switch ends"}
        </h1>
      </div>

      <div style={{ flex: 1, position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <TimerRing
          remainingMs={remaining * 1000}
          totalMs={totalSec * 1000}
          size={260}
          theme={{ line: "rgba(251,246,233,0.18)", ink: "#fbf6e9" }}
          accent={accent}
          paused={paused}
        />
      </div>

      <div style={{ position: "relative", zIndex: 1, padding: "0 20px 12px" }}>
        <div style={{ background: "rgba(15,20,16,0.55)", backdropFilter: "blur(12px)", borderRadius: 14, padding: "12px 14px", border: "1px solid rgba(251,246,233,0.15)" }}>
          <Scoreboard match={match} theme={overlayTheme} accent={accent} showPoint={false} />
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 1, padding: "8px 20px 28px", display: "flex", gap: 10 }}>
        <button onClick={() => setPaused(!paused)} className="t-btn" style={{
          flex: 1, appearance: "none", border: "1px solid rgba(251,246,233,0.3)",
          borderRadius: 12, padding: "14px", background: "rgba(251,246,233,0.08)",
          color: "#fbf6e9", fontFamily: "Inter", fontWeight: 600, fontSize: 14,
        }}>{paused ? "Resume" : "Pause"}</button>
        <button onClick={onResume} className="t-btn" style={{
          flex: 2, appearance: "none", border: 0,
          borderRadius: 12, padding: "14px", background: "#fbf6e9", color: "#0f1410",
          fontFamily: "Inter", fontWeight: 600, fontSize: 14,
        }}>Skip &amp; resume</button>
      </div>
    </div>
  );
}
