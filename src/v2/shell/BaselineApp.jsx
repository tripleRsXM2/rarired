// BaselineApp.jsx — Root v2 shell. Faithful port of the design's
// `App` component in `Baseline App - Modern.html` + `main-app.jsx`.
// Renders a macOS-window chrome with a left sidebar (Home / Live
// scoring / Competitions / Messages / Changeover / Summary / History
// / Quick log / Desktop / Watch) and a main content area that swaps
// based on the active route. Owns the live match ref so navigation
// doesn't reset the score.
//
// Default appearance is **Modern** (per the bundle entry filename); a
// segmented toggle on Home flips between Classic and Modern token sets
// and applies the modern CSS overlay alongside it. Default theme is
// `paper`, default court is `grass` — matches the prototype.

import React from "react";

import Sidebar from "./Sidebar.jsx";
import HomeScreen from "./HomeScreen.jsx";
import CompetitionsScreen from "../features/competitions/CompetitionsScreen.jsx";
import MessagesScreen from "../features/messages/MessagesScreen.jsx";

import LiveScoringScreen from "../features/matches/components/LiveScoringScreen.jsx";
import DesktopLiveScreen from "../features/matches/components/DesktopLiveScreen.jsx";
import ChangeoverScreen from "../features/matches/components/ChangeoverScreen.jsx";
import SummaryScreen from "../features/matches/components/SummaryScreen.jsx";
import HistoryScreen from "../features/matches/components/HistoryScreen.jsx";
import QuickLogScreen from "../features/matches/components/QuickLogScreen.jsx";
import WatchGlance from "../features/matches/components/WatchGlance.jsx";

import { addPoint, undo, newMatch } from "../features/matches/utils/tennisEngine.js";
import { THEMES, COURTS } from "../features/matches/utils/tokens.js";
import { MODERN_THEMES, MODERN_COURTS, ensureModernCss } from "../features/matches/utils/modernTokens.js";
import { ensureFonts } from "../features/matches/utils/fonts.js";

import { buildLiveMatch, buildFinishedMatch } from "../features/matches/data/sampleMatches.js";
import { SAMPLE_HISTORY } from "../features/matches/data/sampleHistory.js";

const DEFAULTS = { theme: "paper", court: "grass", p1Name: "You", p2Name: "M. Carter", format: "bo3" };

export default function BaselineApp({ onBack }) {
  React.useEffect(() => { ensureFonts(); }, []);

  // Appearance toggle — Modern (default) or Classic. Modern flips both
  // the THEMES/COURTS tables and overlays a CSS block that handles
  // type/border-radius tweaks inline styles can't reach.
  const [look, setLook] = React.useState("modern");
  React.useEffect(() => { if (look === "modern") ensureModernCss(); }, [look]);

  const themes = look === "modern" ? MODERN_THEMES : THEMES;
  const courts = look === "modern" ? MODERN_COURTS : COURTS;
  const theme = themes[DEFAULTS.theme] || themes.paper;
  const court = courts[DEFAULTS.court] || courts.grass;
  const accent = court.accent;

  const [route, setRoute] = React.useState("home");
  const [, force] = React.useReducer((x) => x + 1, 0);

  // Live match — single source of truth, ref so navigation doesn't reset it.
  const liveRef = React.useRef(null);
  if (!liveRef.current) liveRef.current = buildLiveMatch(DEFAULTS.p1Name, DEFAULTS.p2Name, DEFAULTS.format);
  const liveMatch = liveRef.current;
  const finishedMatch = React.useMemo(() => buildFinishedMatch(DEFAULTS.p1Name, DEFAULTS.p2Name), []);

  const onPoint = (side) => { addPoint(liveMatch, side); force(); };
  const onUndoLive = () => { undo(liveMatch); force(); };
  const onNewMatch = () => {
    liveRef.current = newMatch({ format: DEFAULTS.format, p1: { name: DEFAULTS.p1Name }, p2: { name: DEFAULTS.p2Name } });
    force();
    setRoute("live");
  };
  const onGo = (id) => setRoute(id);

  return (
    <div className={look === "modern" ? "v2-modern-root" : ""} style={{
      position: "fixed", inset: 0, zIndex: 0,
      background: "#f0eee9", color: theme.ink,
      fontFamily: "Inter, -apple-system, system-ui, sans-serif",
      display: "flex", alignItems: "stretch", justifyContent: "center",
      padding: 24, gap: 24, overflow: "hidden",
    }}>
      <div className="desktop-shell" style={{
        flex: 1, maxWidth: 1180, height: "100%",
        borderRadius: 18, overflow: "hidden",
        boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column",
        background: theme.bg, border: `0.5px solid ${theme.line}`,
      }}>
        {/* Window chrome — macOS dots + URL pill */}
        <div style={{
          height: 38, background: theme.bgRaised, borderBottom: `0.5px solid ${theme.line}`,
          display: "flex", alignItems: "center", padding: "0 14px", gap: 10, flexShrink: 0,
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onBack} title="Back to picker" style={{
              width: 12, height: 12, borderRadius: "50%", background: "#ff5f57",
              border: 0, padding: 0, cursor: "pointer",
            }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
          </div>
          <div style={{
            flex: 1, height: 22, borderRadius: 6, background: theme.chip, padding: "0 10px",
            display: "flex", alignItems: "center", fontSize: 11, color: theme.inkSoft, fontFamily: "Inter",
          }}>baseline.tennis/{route}</div>
        </div>

        {/* Body — sidebar + main */}
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <Sidebar theme={theme} accent={accent} route={route} onGo={onGo} />
          <div style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden" }}>
            <RouteView
              route={route}
              theme={theme} accent={accent} court={court}
              liveMatch={liveMatch} finishedMatch={finishedMatch}
              onPoint={onPoint} onUndo={onUndoLive}
              onGo={onGo} onNewMatch={onNewMatch}
              look={look} onLookChange={setLook}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function RouteView({
  route, theme, accent, court,
  liveMatch, finishedMatch,
  onPoint, onUndo, onGo, onNewMatch,
  look, onLookChange,
}) {
  switch (route) {
    case "home":
      return <HomeScreen
        theme={theme} accent={accent} court={court}
        liveMatch={liveMatch} history={SAMPLE_HISTORY}
        onGo={onGo} onNewMatch={onNewMatch}
        look={look} onLookChange={onLookChange}
      />;
    case "live":
      return <DesktopLiveScreen
        match={liveMatch} theme={theme} accent={accent} court={court}
        onPoint={onPoint} onUndo={onUndo}
        onChangeover={() => onGo("changeover")}
      />;
    case "competitions":
      return <CompetitionsScreen theme={theme} accent={accent} court={court} onLog={() => onGo("live")} />;
    case "messages":
      return <MessagesScreen theme={theme} accent={accent} isPhone={false} />;
    case "changeover":
      return <ChangeoverScreen match={liveMatch} theme={theme} accent={accent} court={court} onResume={() => onGo("live")} totalSec={90} />;
    case "summary":
      return <SummaryScreen match={finishedMatch} theme={theme} accent={accent} court={court} onShare={() => {}} onNew={onNewMatch} />;
    case "history":
      return <HistoryScreen theme={theme} accent={accent} matches={SAMPLE_HISTORY} />;
    case "quicklog":
      return <QuickLogScreen theme={theme} accent={accent} onSave={() => onGo("home")} />;
    case "desktop":
      return <DesktopLiveScreen match={liveMatch} theme={theme} accent={accent} court={court} onPoint={onPoint} onUndo={onUndo} onChangeover={() => onGo("changeover")} />;
    case "watch":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: theme.bg, gap: 36 }}>
          <WatchGlance match={liveMatch} accent={accent} onPoint={onPoint} onUndo={onUndo} />
          <div style={{ maxWidth: 280, color: theme.ink }}>
            <div className="t-cap" style={{ color: theme.inkSoft }}>Apple Watch</div>
            <h2 className="t-serif" style={{ fontSize: 32, lineHeight: 1, margin: "6px 0 12px", letterSpacing: "-0.01em" }}>Tap to score, glance to know.</h2>
            <p style={{ fontSize: 13, color: theme.inkSoft, lineHeight: 1.5, fontFamily: "Inter" }}>
              Top half is you, bottom half is your opponent. Crown spins through sets. Force-touch for stats.
            </p>
          </div>
        </div>
      );
    default:
      return <HomeScreen theme={theme} accent={accent} court={court} liveMatch={liveMatch} history={SAMPLE_HISTORY} onGo={onGo} onNewMatch={onNewMatch} look={look} onLookChange={onLookChange} />;
  }
}

// Note: the live route uses DesktopLiveScreen (the wide layout) since
// the BaselineApp shell is desktop-first. The LiveScoringScreen mobile
// layout stays exported via the matches barrel for any future phone-
// frame addition.
export { LiveScoringScreen };
