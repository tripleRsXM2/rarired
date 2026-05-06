// BaselineApp.jsx — Root v2 shell. Full-bleed layout (no browser-chrome
// preview wrapper) so the v2 app fills the actual viewport on web and
// iPad. On narrow viewports (<700px) we swap the sidebar layout for a
// mobile shell that renders the design's phone screens
// (LiveScoringScreen, ChangeoverScreen, SummaryScreen, HistoryScreen,
// QuickLogScreen) with a bottom tab bar.
//
// Default appearance is **Modern**; a segmented toggle on Home flips
// between Classic and Modern token sets and applies the modern CSS
// overlay alongside it. Default theme is `paper`, default court is
// `grass` — matches the prototype.
//
// User feedback (web): 'can you make sure it doesnt have a window
// inside a window? make it full screen. it doesnt need
// baseline.tennis/home bar at the top with the 3 colour circles.'
// User feedback (mobile): 'the Zip had a mobile section, can you make
// sure its using that?'

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
import { useIsWide } from "../features/matches/hooks/useIsWide.js";

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

  const isWide = useIsWide(700);

  // ── Mobile layout (<700px) ──────────────────────────────────
  // Renders the design's phone-frame screens directly into the
  // viewport (no fake phone bezel — we ARE the phone). Bottom tab
  // bar swaps between the 5 most-used routes; a top kebab opens
  // the secondary routes (messages, watch, etc.).
  if (!isWide) {
    return (
      <div className={look === "modern" ? "v2-modern-root" : ""} style={{
        position: "fixed", inset: 0, zIndex: 0,
        background: theme.bg, color: theme.ink,
        fontFamily: "Inter, -apple-system, system-ui, sans-serif",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Top bar — back-to-picker on the left, theme name on the right. */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "calc(env(safe-area-inset-top, 0px) + 10px) 16px 10px",
          borderBottom: `0.5px solid ${theme.line}`, flexShrink: 0,
          background: theme.bg,
        }}>
          <button onClick={onBack} style={{
            appearance: "none", background: "transparent", border: 0, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            color: theme.inkSoft, fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase",
            padding: 4,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 4 L 6 8 L 10 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>
          <span style={{
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase",
            color: theme.inkSoft,
          }}>Baseline</span>
        </div>

        {/* Content — flex 1, scrolls within itself. */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <MobileRouteView
            route={route}
            theme={theme} accent={accent} court={court}
            liveMatch={liveMatch} finishedMatch={finishedMatch}
            onPoint={onPoint} onUndo={onUndoLive}
            onGo={onGo} onNewMatch={onNewMatch}
            look={look} onLookChange={setLook}
          />
        </div>

        {/* Bottom tab bar — primary mobile nav. 5 tabs that match the
            most-used sidebar items. Secondary routes (messages, watch,
            desktop) reachable via Home tiles. */}
        <MobileTabBar route={route} onGo={onGo} theme={theme} accent={accent} />
      </div>
    );
  }

  // ── Desktop / iPad layout (≥700px) ──────────────────────────
  // Full-bleed: NO browser-chrome wrapper, NO macOS dots, NO URL
  // bar. Sidebar fixed-width on the left, main content fills the
  // rest. The whole shell takes 100vh.
  return (
    <div className={look === "modern" ? "v2-modern-root" : ""} style={{
      position: "fixed", inset: 0, zIndex: 0,
      background: theme.bg, color: theme.ink,
      fontFamily: "Inter, -apple-system, system-ui, sans-serif",
      display: "flex", overflow: "hidden",
    }}>
      <Sidebar theme={theme} accent={accent} route={route} onGo={onGo} onBack={onBack} />
      <div style={{ flex: 1, minWidth: 0, position: "relative", overflow: "auto" }}>
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
  );
}

// ─── Desktop route view ────────────────────────────────────────────

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

// ─── Mobile route view ─────────────────────────────────────────────
// Renders the design's phone-frame screens directly into the viewport.
// Each screen is full-flex so it stretches inside the scroll region.

function MobileRouteView({
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
      return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <LiveScoringScreen
            match={liveMatch} theme={theme} accent={accent} court={court}
            onPoint={onPoint} onUndo={onUndo}
            onChangeover={() => onGo("changeover")}
          />
        </div>
      );
    case "competitions":
      return <CompetitionsScreen theme={theme} accent={accent} court={court} onLog={() => onGo("live")} />;
    case "messages":
      return <MessagesScreen theme={theme} accent={accent} isPhone={true} />;
    case "changeover":
      return <ChangeoverScreen match={liveMatch} theme={theme} accent={accent} court={court} onResume={() => onGo("live")} totalSec={90} />;
    case "summary":
      return <SummaryScreen match={finishedMatch} theme={theme} accent={accent} court={court} onShare={() => {}} onNew={onNewMatch} />;
    case "history":
      return <HistoryScreen theme={theme} accent={accent} matches={SAMPLE_HISTORY} />;
    case "quicklog":
      return <QuickLogScreen theme={theme} accent={accent} onSave={() => onGo("home")} />;
    case "desktop":
    case "watch":
      // On mobile, fall back to home for desktop/watch routes (they
      // don't make sense on a phone). Tap home + scroll to recents.
      return <HomeScreen theme={theme} accent={accent} court={court} liveMatch={liveMatch} history={SAMPLE_HISTORY} onGo={onGo} onNewMatch={onNewMatch} look={look} onLookChange={onLookChange} />;
    default:
      return <HomeScreen theme={theme} accent={accent} court={court} liveMatch={liveMatch} history={SAMPLE_HISTORY} onGo={onGo} onNewMatch={onNewMatch} look={look} onLookChange={onLookChange} />;
  }
}

// ─── Mobile tab bar ────────────────────────────────────────────────

function MobileTabBar({ route, onGo, theme, accent }) {
  const TABS = [
    { id: "home",         label: "Home",        Icon: HomeIcon },
    { id: "live",         label: "Live",        Icon: LiveIcon },
    { id: "competitions", label: "Compete",     Icon: TrophyIcon },
    { id: "history",      label: "History",     Icon: HistoryIcon },
    { id: "quicklog",     label: "Quick log",   Icon: PenIcon },
  ];
  return (
    <div style={{
      display: "flex", justifyContent: "space-around", alignItems: "center",
      padding: "8px 6px calc(env(safe-area-inset-bottom, 0px) + 8px)",
      borderTop: `0.5px solid ${theme.line}`,
      background: theme.bg, flexShrink: 0,
    }}>
      {TABS.map(function(t){
        var on = route === t.id ||
                 (t.id === "live" && (route === "changeover" || route === "summary"));
        return (
          <button key={t.id} type="button" onClick={function(){ onGo(t.id); }}
            style={{
              appearance: "none", background: "transparent", border: 0, cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "4px 8px",
              color: on ? accent : theme.inkSoft,
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase",
              fontWeight: on ? 600 : 500,
              minWidth: 0,
            }}>
            <t.Icon size={20} active={on}/>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Tab icons (line-art SVG, no emoji) ────────────────────────────

function HomeIcon({ size=20 }){ return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 11 L 12 4 L 21 11 V 20 a 1 1 0 0 1 -1 1 H 14 v -6 H 10 v 6 H 4 a 1 1 0 0 1 -1 -1 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/></svg>); }
function LiveIcon({ size=20, active }){ return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill={active ? "currentColor" : "none"} fillOpacity="0.18"/><path d="M3 12 C 7 9, 17 9, 21 12" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M3 12 C 7 15, 17 15, 21 12" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>); }
function TrophyIcon({ size=20 }){ return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4 H 17 V 8 C 17 11.5, 14.5 14, 12 14 C 9.5 14, 7 11.5, 7 8 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/><path d="M7 5 H 4 C 4 8, 6 9, 7 9 M 17 5 H 20 C 20 8, 18 9, 17 9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/><path d="M9 21 H 15 M 12 14 V 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>); }
function HistoryIcon({ size=20 }){ return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6 H 20 M 4 12 H 20 M 4 18 H 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>); }
function PenIcon({ size=20 }){ return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20 H 9 L 19 10 L 14 5 L 4 15 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/><path d="M12 7 L 17 12" stroke="currentColor" strokeWidth="1.2"/></svg>); }

export { LiveScoringScreen };
