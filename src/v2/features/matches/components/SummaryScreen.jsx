// SummaryScreen.jsx — Final / stats screen for a completed match.
// Faithful port of the design's `SummaryScreen` in `screens-mobile-2.jsx`.

import React from "react";
import { Card, CourtMini, Eyebrow, Scoreboard, StatBar } from "./atoms.jsx";
import { elapsedMs, fmtDuration } from "../utils/tennisEngine.js";

export default function SummaryScreen({ match, theme, accent, court, onShare, onNew }) {
  const winner = match.setsWon[0] > match.setsWon[1] ? match.p1 : match.p2;
  return (
    <div style={{
      height: "100%", background: theme.bg, color: theme.ink,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ padding: "22px 20px 8px" }}>
        <Eyebrow color={theme.inkSoft}>Final · {fmtDuration(elapsedMs(match))}</Eyebrow>
        <h1 className="t-serif" style={{ fontSize: 38, lineHeight: 1.05, margin: "6px 0 0", letterSpacing: "-0.015em" }}>
          {winner.name} <em>wins</em>
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
          <CourtMini surface={court.surface} size={18} />
          <span className="t-cap" style={{ color: theme.inkSoft }}>{court.label || court.name} · {match.format.toUpperCase()}</span>
        </div>
      </div>

      <div className="t-noscroll" style={{ flex: 1, overflowY: "auto", padding: "8px 20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <Card theme={theme}>
          <Scoreboard match={match} theme={theme} accent={accent} showPoint={false} big />
        </Card>

        <Card theme={theme}>
          <Eyebrow color={theme.inkSoft} style={{ marginBottom: 14 }}>Match stats</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <StatBar label="Points won"      a={match.stats.pointsWon[0]} b={match.stats.pointsWon[1]} theme={theme} accent={accent} />
            <StatBar label="Aces"            a={match.stats.aces[0]}      b={match.stats.aces[1]}      theme={theme} accent={accent} />
            <StatBar label="Winners"         a={match.stats.winners[0]}   b={match.stats.winners[1]}   theme={theme} accent={accent} />
            <StatBar label="Unforced errors" a={match.stats.errors[0]}    b={match.stats.errors[1]}    theme={theme} accent={accent} />
          </div>
        </Card>

        <Card theme={theme}>
          <Eyebrow color={theme.inkSoft} style={{ marginBottom: 12 }}>Set by set</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {match.setHistory.map((s, i) => {
              const w = s.score[0] > s.score[1] ? 0 : 1;
              return (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 12, alignItems: "center",
                }}>
                  <span className="t-num" style={{ color: theme.inkFaint, fontSize: 11 }}>0{i + 1}</span>
                  <span style={{ fontFamily: "Inter", fontSize: 13, color: theme.ink }}>
                    {w === 0 ? match.p1.name : match.p2.name}
                  </span>
                  <span className="t-num" style={{ fontSize: 16, fontWeight: 600 }}>
                    {s.score[0]}–{s.score[1]}
                    {s.tb && <sup style={{ fontSize: 10, marginLeft: 2, color: theme.inkSoft }}>{Math.min(...s.tb)}</sup>}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div style={{ padding: "12px 20px 20px", display: "flex", gap: 10, borderTop: `1px solid ${theme.line}` }}>
        <button onClick={onShare} className="t-btn" style={{
          flex: 1, appearance: "none", border: `1px solid ${theme.lineStrong}`,
          borderRadius: 12, padding: "14px", background: "transparent",
          color: theme.ink, fontFamily: "Inter", fontWeight: 600, fontSize: 14,
        }}>Share card</button>
        <button onClick={onNew} className="t-btn" style={{
          flex: 1, appearance: "none", border: 0,
          borderRadius: 12, padding: "14px", background: theme.ink, color: theme.bg,
          fontFamily: "Inter", fontWeight: 600, fontSize: 14,
        }}>New match</button>
      </div>
    </div>
  );
}
