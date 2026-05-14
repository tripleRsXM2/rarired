// HomeScreen.jsx — v2 BaselineApp Home dashboard. Faithful port of the
// design's `HomeDashboard` from `main-app.jsx`. Owns: greeting eyebrow
// + headline, live-match card (or new-match CTA), Appearance toggle
// (Classic / Modern), Quick Actions grid (2×2), This-week stats,
// Recent matches list.

import React from "react";
import { Ball, ServeDot } from "../features/matches/components/atoms.jsx";
import { elapsedMs, fmtDuration, pointLabel } from "../features/matches/utils/tennisEngine.js";
import AppearanceToggle from "./AppearanceToggle.jsx";
import QuickActionsGrid from "./QuickActionsGrid.jsx";

export default function HomeScreen({
  theme, accent, court, liveMatch, history,
  // weekStats: { matches, wins, losses, record, onCourt } — computed
  //   in useV2History from the viewer's match_history rows. null while
  //   the first fetch is in flight (we show a placeholder dash).
  // viewerName: signed-in player's display name (falls back to email
  //   handle if no profile row); used in the "Good <greeting>, X."
  //   line so the dashboard reads personal on the first frame.
  weekStats, viewerName,
  onGo, onNewMatch, look, onLookChange,
}) {
  const inFlight = liveMatch && !liveMatch.endedAt;
  const h = new Date().getHours();
  const greeting = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";

  // Stat tiles — read from the live weekStats prop with sensible
  // placeholders while the fetch is in flight or there's no data yet.
  const wkMatches = weekStats ? String(weekStats.matches) : "—";
  const wkRecord  = weekStats ? weekStats.record : "—";
  const wkCourt   = weekStats ? weekStats.onCourt : "—";

  // First-name slice for the greeting line. We don't print the whole
  // display name to keep the headline short — "Good morning, Mikey"
  // reads better than "Good morning, Mikey T".
  const firstName = (viewerName || "").split(/\s+/)[0] || "";
  return (
    <div style={{ width: "100%", height: "100%", overflowY: "auto", background: theme.bg, color: theme.ink, padding: "32px 40px 60px" }}>
      <div className="t-cap" style={{ color: theme.inkSoft }}>Home</div>
      <h1 className="t-serif" style={{ fontSize: 56, lineHeight: 1, margin: "6px 0 22px", letterSpacing: "-0.025em" }}>Home</h1>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <div className="t-cap" style={{ color: theme.inkSoft }}>Today · {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
          <h2 className="t-serif" style={{ fontSize: 38, lineHeight: 1, margin: "6px 0 0", letterSpacing: "-0.02em" }}>
            Good {greeting}{firstName ? ", " + firstName : ""}.
          </h2>
        </div>
        <Ball size={22} color={accent} />
      </div>

      {inFlight ? (
        <button onClick={() => onGo("live")} className="t-btn" style={{
          width: "100%", appearance: "none", border: 0, padding: 0, marginBottom: 18,
          borderRadius: 16, overflow: "hidden", background: court.surface, color: "#fbf6e9",
          textAlign: "left", boxShadow: "0 6px 18px rgba(0,0,0,0.12)", cursor: "pointer",
        }}>
          <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff4d4d" }} className="t-pulse" />
              <span className="t-cap" style={{ color: "rgba(251,246,233,0.7)" }}>Live · {fmtDuration(elapsedMs(liveMatch)).split(":").slice(0, 2).join(":")}</span>
            </div>
            <span className="t-cap" style={{ color: "rgba(251,246,233,0.5)" }}>{court.label || court.name}</span>
          </div>
          <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            <HomeMatchRow m={liveMatch} side={0} accent={accent} />
            <HomeMatchRow m={liveMatch} side={1} accent={accent} />
          </div>
          <div style={{ padding: "10px 16px", borderTop: "0.5px solid rgba(251,246,233,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontFamily: "Inter", color: "rgba(251,246,233,0.7)" }}>Continue scoring →</span>
            <span style={{ fontSize: 11, fontFamily: "Inter", color: accent, fontWeight: 600 }}>Tap to open</span>
          </div>
        </button>
      ) : (
        <button onClick={onNewMatch} className="t-btn" style={{
          width: "100%", appearance: "none", border: 0, padding: "16px 18px", marginBottom: 18,
          borderRadius: 16, background: court.surface, color: "#fbf6e9",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          textAlign: "left", boxShadow: "0 6px 18px rgba(0,0,0,0.12)", cursor: "pointer",
        }}>
          <div>
            <div className="t-cap" style={{ color: "rgba(251,246,233,0.7)" }}>Ready to play</div>
            <div className="t-serif" style={{ fontSize: 26, marginTop: 4, lineHeight: 1 }}>Start new match</div>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: accent, color: "#0f1410", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          </div>
        </button>
      )}

      {/* Appearance toggle moved to global header (mobile top bar +
          desktop sidebar) per user feedback: 'In home: Can you move
          the appearance option to the top tab heading? so you always
          able to change the look at any tab'. */}

      <QuickActionsGrid theme={theme} accent={accent} onGo={onGo} historyCount={history.length} />

      <div className="t-cap" style={{ color: theme.inkSoft, margin: "4px 4px 10px" }}>This week</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 22 }}>
        <StatTile theme={theme} value={wkMatches} label="Matches" />
        <StatTile theme={theme} value={wkRecord}  label="W-L" accent={accent} />
        <StatTile theme={theme} value={wkCourt}   label="On court" />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 4px 10px" }}>
        <span className="t-cap" style={{ color: theme.inkSoft }}>Recent</span>
        <button onClick={() => onGo("history")} className="t-btn" style={{
          appearance: "none", border: 0, background: "transparent", color: theme.inkSoft,
          fontSize: 11, fontFamily: "Inter", fontWeight: 600, cursor: "pointer",
        }}>See all →</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {history.slice(0, 3).map((m, i) => (
          <button key={i} onClick={() => onGo("summary")} className="t-btn" style={{
            appearance: "none", background: theme.bgRaised, color: theme.ink,
            borderRadius: 12, padding: "12px 14px", textAlign: "left",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            border: `0.5px solid ${theme.line}`, cursor: "pointer",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 6, height: 32, borderRadius: 3, background: m.win ? accent : theme.inkFaint }} />
              <div>
                <div style={{ fontSize: 13, fontFamily: "Inter", fontWeight: 600 }}>{m.opp}</div>
                <div style={{ fontSize: 11, color: theme.inkSoft, marginTop: 2 }}>{m.date}</div>
              </div>
            </div>
            <div className="t-num" style={{ fontSize: 14, fontWeight: 600, color: m.win ? theme.ink : theme.inkSoft }}>{m.score}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function HomeMatchRow({ m, side, accent }) {
  const name = side === 0 ? m.p1.name : m.p2.name;
  const sets = m.setHistory.map((s) => s.score[side]);
  const games = m.games[side];
  const pt = pointLabel(m, side);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ServeDot active={m.serverIndex === side} color={accent} size={6} />
        <span style={{ fontSize: 16, fontFamily: "Inter", fontWeight: 600 }}>{name}</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
        {sets.map((s, i) => (
          <span key={i} className="t-num" style={{ color: s > m.setHistory[i].score[1 - side] ? "#fff" : "rgba(251,246,233,0.5)", fontSize: 16, fontWeight: 600 }}>{s}</span>
        ))}
        <span className="t-num" style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>{games}</span>
        <span className="t-num" style={{ color: accent, fontSize: 22, fontWeight: 700, minWidth: 28, textAlign: "right" }}>{pt}</span>
      </div>
    </div>
  );
}

function StatTile({ theme, value, label, accent }) {
  return (
    <div style={{ background: theme.bgRaised, border: `0.5px solid ${theme.line}`, borderRadius: 12, padding: "12px" }}>
      <div className="t-num" style={{ fontSize: 22, fontWeight: 700, color: accent || theme.ink, lineHeight: 1, letterSpacing: "-0.03em" }}>{value}</div>
      <div style={{ fontSize: 10, color: theme.inkSoft, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "Inter", fontWeight: 600 }}>{label}</div>
    </div>
  );
}
