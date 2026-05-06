// V2LiveScoringPage.jsx — Orchestrates the three "key states" preview
// (Deuce, Tiebreak, Match Point) of the v2 live scoring design.
//
// - Top: StateSwitcher to flip between mock states.
// - Body: DesktopLiveScreen on wide viewports, LiveScoringScreen on
//         narrow viewports (`useIsWide` at 700px).
// - Engine mutates match state in place; we re-render with a
//   `useReducer` version bump on each tap / undo. When real Supabase
//   persistence is added, swap the factory call for a fetch and the
//   bump for a Realtime subscription.

import React from "react";
import StateSwitcher from "../components/StateSwitcher.jsx";
import LiveScoringScreen from "../components/LiveScoringScreen.jsx";
import DesktopLiveScreen from "../components/DesktopLiveScreen.jsx";
import { KEY_STATES } from "../data/mockMatches.js";
import { addPoint, undo } from "../utils/tennisEngine.js";
import { useIsWide } from "../hooks/useIsWide.js";

export default function V2LiveScoringPage({ theme, accent, court }) {
  const wide = useIsWide(700);
  const [stateId, setStateId] = React.useState("deuce");
  const [, bump] = React.useReducer((x) => x + 1, 0);

  // Re-seed the match whenever the chosen key state changes. The engine
  // mutates in place, so we keep the ref stable across taps within one
  // state and only rebuild on an explicit switch.
  const matchRef = React.useRef(null);
  const lastIdRef = React.useRef(null);
  if (lastIdRef.current !== stateId) {
    const factory = KEY_STATES.find((s) => s.id === stateId)?.factory;
    matchRef.current = factory ? factory() : null;
    lastIdRef.current = stateId;
  }
  const match = matchRef.current;

  const onPoint = React.useCallback((side) => {
    if (!matchRef.current) return;
    addPoint(matchRef.current, side);
    bump();
  }, []);

  const onUndo = React.useCallback(() => {
    if (!matchRef.current) return;
    undo(matchRef.current);
    bump();
  }, []);

  const onChangeover = React.useCallback(() => {
    // No-op in the visual prototype — kept for parity with the design.
  }, []);

  if (!match) return null;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      width: "100%", height: "100%", minHeight: 0,
      background: theme.bg, color: theme.ink,
    }}>
      <div style={{
        padding: wide ? "14px 28px 10px" : "12px 16px 6px",
        borderBottom: `1px solid ${theme.line}`,
        flexShrink: 0,
      }}>
        <StateSwitcher
          label="Live scoring · key states"
          value={stateId}
          options={KEY_STATES}
          onChange={setStateId}
          theme={theme}
          accent={accent}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {wide
          ? <DesktopLiveScreen match={match} theme={theme} accent={accent} court={court} onPoint={onPoint} onUndo={onUndo} onChangeover={onChangeover} />
          : <LiveScoringScreen match={match} theme={theme} accent={accent} court={court} onPoint={onPoint} onUndo={onUndo} onChangeover={onChangeover} />
        }
      </div>
    </div>
  );
}
