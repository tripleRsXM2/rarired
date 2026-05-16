// LiveScoringScreen.jsx — Mobile / narrow-viewport live scoring layout
// ported from the v2 Claude Design `screens-mobile.jsx`. Stripped of
// the FinishSheet / MoreSheet / competitions wiring (those depend on
// state we don't have in the visual prototype) but the visual chrome —
// scoreboard, status pills (Deuce / Tiebreak / Match Point), big tap
// zones, serve clock, action row — is preserved.

import React from "react";
import {
  Scoreboard, Pill, ServeDot, CourtMini, LiveDot,
} from "./atoms.jsx";
import CourtPicker from "./CourtPicker.jsx";
import DesktopLiveScreen from "./DesktopLiveScreen.jsx";
import {
  isDeuce, isMatchPoint, fmtDuration, elapsedMs,
  engineToLogPayload,
} from "../utils/tennisEngine.js";

// Persistence for the "Advanced view" preference. Per-device — each
// browser remembers its own choice. localStorage is fail-silent so
// SSR / private mode / quota-exceeded all degrade to standard view.
var ADVANCED_KEY = "cs.v2.liveAdvanced";
function readAdvanced() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    return window.localStorage.getItem(ADVANCED_KEY) === "1";
  } catch (_) { return false; }
}
function writeAdvanced(v) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (v) window.localStorage.setItem(ADVANCED_KEY, "1");
    else   window.localStorage.removeItem(ADVANCED_KEY);
  } catch (_) {}
}

export default function LiveScoringScreen({
  match, theme, accent, court,
  onPoint, onUndo, onChangeover,
  showServeClock = true,
  // Court picker (optional). When `courts` and `onCourtChange` are
  // provided, the court chip in the top-right becomes a pressable
  // dropdown that lets the user change surfaces on the fly.
  courts, currentCourtId, onCourtChange,
  // Persist-the-match callback (mobile twin of the desktop Save).
  // Reshapes engine state and hands off to logV2Match — see
  // BaselineApp.onSaveLiveMatch.
  onSave,
  // End the current set early (mobile twin of the desktop End set
  // button). Closes the current set with whatever's on the board.
  onEndSet,
  // Re-label the most recent point ('ace' / 'df' / 'winner' /
  // 'error' / 'net'; null clears). Mirror of the desktop chip row.
  onTagPoint,
  // Discard the in-progress match without saving (confirms in
  // BaselineApp before firing). Surfaced as a small text link below
  // the action row.
  onCancel,
}) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  const [serveSec, setServeSec] = React.useState(25);
  const [tapFlash, setTapFlash] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState("");

  // Save is available any time there's any score on the board —
  // completed set OR partial in-progress games OR running tiebreak
  // points. See engineToLogPayload for the shape rules.
  const canSave = !!(match && engineToLogPayload(match).length > 0);
  const matchDone = !!(match && match.endedAt);
  const canEndSet = !!(match && !match.endedAt && (
    (Array.isArray(match.games)   && (match.games[0]   > 0 || match.games[1]   > 0)) ||
    (match.inTiebreak && Array.isArray(match.tbPoints) && (match.tbPoints[0] > 0 || match.tbPoints[1] > 0))
  ));
  // Tag chips — human UI labels, engine keys for the action.
  const TAGS = [
    { key: "ace",    label: "Ace" },
    { key: "winner", label: "Winner" },
    { key: "df",     label: "Double fault" },
    { key: "error",  label: "Unforced error" },
    { key: "net",    label: "Net cord" },
  ];
  const lastLog = match && match.log && match.log.length ? match.log[match.log.length - 1] : null;
  const lastTag = (lastLog && lastLog.tag) || null;
  const hasLastPoint = !!lastLog;
  const handleSave = React.useCallback(async function () {
    if (!onSave || saving) return;
    setSaveErr("");
    setSaving(true);
    var r = await onSave();
    setSaving(false);
    if (r && r.error) setSaveErr((r.error && r.error.message) || String(r.error));
  }, [onSave, saving]);

  React.useEffect(() => {
    if (!showServeClock) return;
    const id = setInterval(() => setServeSec((s) => (s > 0 ? s - 1 : 25)), 1000);
    return () => clearInterval(id);
  }, [showServeClock]);

  React.useEffect(() => {
    const id = setInterval(force, 1000);
    return () => clearInterval(id);
  }, []);

  const tap = (winner) => {
    setTapFlash(winner);
    setTimeout(() => setTapFlash(null), 250);
    onPoint?.(winner);
  };

  const mp = isMatchPoint(match);
  const deuce = isDeuce(match);

  // Advanced (landscape) view — opt-in toggle persisted per device.
  // When ON + the device is in landscape, we render the DesktopLive
  // layout (sidebar stats, point log, big tap zones) instead of the
  // mobile chrome. When ON + portrait, we show the RotatePrompt
  // coach card with a Standard-view escape hatch. Browsers don't
  // allow JS to force orientation outside of fullscreen / PWA so the
  // coach card is the honest answer.
  const [advanced, setAdvanced] = React.useState(readAdvanced);
  const [isLandscape, setIsLandscape] = React.useState(function () {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(orientation: landscape)").matches;
  });
  React.useEffect(function () {
    if (typeof window === "undefined" || !window.matchMedia) return;
    var mql = window.matchMedia("(orientation: landscape)");
    function on(e) { setIsLandscape(e.matches); }
    if (mql.addEventListener) mql.addEventListener("change", on);
    else mql.addListener(on);                   // Safari < 14 fallback
    return function () {
      if (mql.removeEventListener) mql.removeEventListener("change", on);
      else mql.removeListener(on);
    };
  }, []);
  function toggleAdvanced(v) {
    setAdvanced(v);
    writeAdvanced(v);
  }

  if (advanced && isLandscape && match) {
    // Landscape + opted-in — hand off to the desktop layout. All
    // mobile props pass straight through; DesktopLiveScreen
    // shows a "Standard view" chip in its top bar so the user
    // can come back without rotating.
    return (
      <DesktopLiveScreen
        match={match} theme={theme} accent={accent} court={court}
        courts={courts} currentCourtId={currentCourtId} onCourtChange={onCourtChange}
        onPoint={onPoint} onUndo={onUndo} onChangeover={onChangeover}
        onSave={onSave} onEndSet={onEndSet} onTagPoint={onTagPoint}
        onCancel={onCancel}
        onExitAdvanced={function () { toggleAdvanced(false); }}
      />
    );
  }
  if (advanced && !isLandscape) {
    return <RotatePrompt theme={theme} accent={accent} onExit={function () { toggleAdvanced(false); }} />;
  }

  return (
    <div style={{
      height: "100%", background: theme.bg, color: theme.ink,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* top bar */}
      <div style={{
        padding: "20px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LiveDot accent={accent} />
          <span style={{ color: theme.inkSoft, fontSize: 12, fontFamily: "JetBrains Mono", fontVariantNumeric: "tabular-nums" }}>
            {fmtDuration(elapsedMs(match))}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Advanced view toggle. Tap → if you're already in
              landscape we swap to the desktop layout instantly;
              if you're portrait we show the rotate coach card. */}
          <button onClick={function () { toggleAdvanced(true); }} className="t-btn" style={{
            appearance: "none", border: `1px solid ${theme.line}`,
            background: theme.bgRaised, color: theme.inkSoft,
            borderRadius: 999, padding: "4px 10px 4px 8px",
            fontFamily: "Inter", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em",
            display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
            textTransform: "uppercase",
          }} aria-label="Open advanced view">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="6" width="20" height="12" rx="2"/>
              <line x1="12" y1="2" x2="12" y2="6"/>
              <line x1="12" y1="18" x2="12" y2="22"/>
            </svg>
            Advanced
          </button>
          {courts && onCourtChange ? (
            <CourtPicker
              courts={courts}
              currentId={currentCourtId || "grass"}
              onChange={onCourtChange}
              theme={theme}
              accent={accent}
              size={20}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CourtMini surface={court.surface} size={20} />
              <span className="t-cap" style={{ color: theme.inkSoft }}>{court.label}</span>
            </div>
          )}
        </div>
      </div>

      {/* scoreboard */}
      <div style={{ padding: "8px 16px" }}>
        <Scoreboard match={match} theme={theme} accent={accent} big />
      </div>

      {/* status pill */}
      <div style={{ padding: "4px 16px 0", display: "flex", justifyContent: "center", gap: 8, minHeight: 28 }}>
        {match.inTiebreak && (
          <Pill theme={theme} accent={accent} bg={accent} ink="#0f1410">
            {(match.cfg.finalTb === "super" && match.setsWon[0] + match.setsWon[1] === match.cfg.sets - 1) ? "Super tiebreak" : "Tiebreak"}
          </Pill>
        )}
        {deuce && !match.inTiebreak && <Pill theme={theme} accent={accent}>Deuce</Pill>}
        {mp >= 0 && <Pill theme={theme} accent={accent} bg={accent} ink="#0f1410">{mp === 0 ? match.p1.name : match.p2.name} • Match point</Pill>}
      </div>

      {/* big point area */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "12px 16px 0", gap: 10 }}>
        <BigPointTap player={match.p1} side={0} server={match.serverIndex === 0} onTap={() => tap(0)} onMinus={onUndo} flash={tapFlash === 0} theme={theme} accent={accent} />
        <BigPointTap player={match.p2} side={1} server={match.serverIndex === 1} onTap={() => tap(1)} onMinus={onUndo} flash={tapFlash === 1} theme={theme} accent={accent} />
      </div>

      {/* bottom controls */}
      <div style={{
        padding: "10px 12px 18px", display: "flex", flexDirection: "column", gap: 10,
        borderTop: `1px solid ${theme.line}`, flexShrink: 0,
      }}>
        {showServeClock && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px" }}>
            <span className="t-cap" style={{ color: theme.inkSoft }}>Serve</span>
            <div style={{ flex: 1, height: 3, background: theme.chip, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${(serveSec / 25) * 100}%`, height: "100%", background: serveSec <= 5 ? "#e15554" : accent, transition: "width .9s linear" }} />
            </div>
            <span className="t-num" style={{ fontSize: 12, color: theme.ink, fontWeight: 600, minWidth: 18, textAlign: "right" }}>{serveSec}</span>
          </div>
        )}

        {/* Tag-chip row — scrolls horizontally on tight screens.
            Buttons fire onTagPoint with the engine key. Active tag
            highlights so you know what's stuck on the last point. */}
        {onTagPoint && (
          <div className="t-noscroll" style={{
            display: "flex", gap: 6, overflowX: "auto", marginBottom: 8,
            paddingBottom: 4, scrollbarWidth: "none",
          }}>
            {TAGS.map(function (t) {
              var on = lastTag === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={function () { if (hasLastPoint) onTagPoint(on ? null : t.key); }}
                  disabled={!hasLastPoint}
                  className="t-btn"
                  style={{
                    appearance: "none",
                    padding: "6px 12px", borderRadius: 999, flexShrink: 0,
                    background: on ? theme.ink : theme.chip,
                    color: on ? theme.bg : theme.ink,
                    fontFamily: "Inter", fontSize: 11.5, fontWeight: on ? 700 : 500, letterSpacing: "0.02em",
                    border: `1px solid ${on ? theme.ink : theme.line}`,
                    cursor: hasLastPoint ? "pointer" : "default",
                    opacity: hasLastPoint ? 1 : 0.5,
                    whiteSpace: "nowrap",
                  }}>{t.label}</button>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onChangeover} className="t-btn" style={{
            flex: 2, appearance: "none", border: `1px solid ${theme.line}`,
            background: theme.bgRaised, color: theme.ink,
            padding: "13px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontFamily: "Inter", fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.2 1.5"/></svg>
            Changeover · 90s
          </button>
          {onEndSet && (
            <button onClick={onEndSet} disabled={!canEndSet} className="t-btn" style={{
              flex: 1, appearance: "none", border: `1px solid ${theme.line}`,
              background: theme.bgRaised, color: theme.ink, padding: "13px 14px",
              fontFamily: "Inter", fontWeight: 600, fontSize: 13,
              cursor: canEndSet ? "pointer" : "default",
              opacity: canEndSet ? 1 : 0.5,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="5" width="14" height="14" rx="1"/>
              </svg>
              End set
            </button>
          )}
          <button onClick={onUndo} className="t-btn" style={{
            flex: 1, appearance: "none", border: `1px solid ${theme.line}`,
            background: theme.bgRaised, color: theme.ink, padding: "13px 14px",
            fontFamily: "Inter", fontWeight: 600, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 8a5 5 0 0 1 8.5-3.5L13 6m0 0V3m0 3h-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Undo
          </button>
        </div>

        {/* Save match — same backend as Quick-log (logV2Match →
            match_history INSERT + match_tag notification +
            confirm-card DM to the opponent). Promoted to the
            primary accent treatment once endedAt lands so the
            "now log it" call to action is obvious. */}
        {onSave && (
          <button onClick={handleSave} disabled={!canSave || saving} className="t-btn" style={{
            marginTop: 8, width: "100%",
            appearance: "none", border: matchDone ? 0 : `1px solid ${theme.line}`,
            background: matchDone ? accent : theme.bgRaised,
            color: matchDone ? "#0f1410" : theme.ink,
            padding: "13px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontFamily: "Inter", fontWeight: matchDone ? 700 : 600, fontSize: 13,
            letterSpacing: matchDone ? "0.04em" : "0",
            cursor: (canSave && !saving) ? "pointer" : "default",
            opacity: (canSave && !saving) ? 1 : 0.55,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            {saving ? "Saving…" : (matchDone ? "Save match" : "Save & log")}
          </button>
        )}
        {saveErr && (
          <div style={{
            marginTop: 6, padding: "8px 10px", borderRadius: 8,
            background: `${accent}1f`, color: theme.ink,
            fontFamily: "Inter", fontSize: 12, fontWeight: 500, textAlign: "center",
          }}>{saveErr}</div>
        )}
        {/* Cancel match — destructive, sits at the bottom of the
            action area as a subtle text link. Confirm dialog lives
            in BaselineApp.onCancelLiveMatch. */}
        {onCancel && (
          <div style={{ marginTop: 6, textAlign: "center" }}>
            <button onClick={onCancel} className="t-btn" style={{
              appearance: "none", border: 0, background: "transparent",
              color: theme.inkFaint, padding: "6px 10px",
              fontFamily: "Inter", fontWeight: 500, fontSize: 11.5,
              cursor: "pointer", textDecoration: "underline",
            }}>Cancel match</button>
          </div>
        )}
      </div>
    </div>
  );
}

function BigPointTap({ player, server, onTap, onMinus, flash, theme, accent }) {
  return (
    <div className="t-btn" style={{
      flex: 1, position: "relative", overflow: "hidden",
      border: `1px solid ${theme.line}`,
      borderRadius: 18,
      background: flash ? `${accent}33` : theme.bgRaised,
      color: theme.ink,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      transition: "background .2s",
      paddingRight: 14,
    }}>
      <button onClick={onTap} className="t-btn" style={{
        flex: 1, appearance: "none", border: 0, background: "transparent",
        padding: "20px 22px", textAlign: "left",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        color: "inherit", cursor: "pointer",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ServeDot active={server} color={accent} size={10} />
            <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 18 }}>{player.name}</span>
          </div>
          <span className="t-cap" style={{ color: theme.inkSoft }}>tap to win point</span>
        </div>
      </button>
      {/* +/- score buttons. User feedback: 'I dont like how the two
          buttons are different' — match size, background, border so
          they only differ by icon. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={(e) => { e.stopPropagation(); onMinus && onMinus(); }} className="t-btn" aria-label="Remove point" style={{
          width: 56, height: 56, borderRadius: "50%",
          appearance: "none", border: 0, cursor: "pointer",
          background: theme.chip, color: theme.ink,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background .2s",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <button onClick={onTap} className="t-btn" aria-label="Add point" style={{
          width: 56, height: 56, borderRadius: "50%",
          appearance: "none", border: 0, cursor: "pointer",
          background: flash ? accent : theme.chip, color: flash ? "#0f1410" : theme.ink,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background .2s",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
}

// Portrait coach card shown when the user has opted into Advanced
// view but their phone is still in portrait orientation. Browsers
// don't let JS force-rotate from a regular web page (lock requires
// fullscreen / installed PWA) so we ask politely. "Use standard
// view" lets them back out without rotating.
function RotatePrompt({ theme, accent, onExit }) {
  return (
    <div style={{
      height: "100%", background: theme.bg, color: theme.ink,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "32px 28px", textAlign: "center", gap: 18,
    }}>
      <div style={{
        width: 84, height: 84, borderRadius: 18,
        background: theme.bgRaised, border: `1px solid ${theme.line}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: accent, marginBottom: 4,
      }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: "rotateHint 2.4s ease-in-out infinite" }}>
          <rect x="6" y="2" width="12" height="20" rx="2"/>
          <line x1="11" y1="18" x2="13" y2="18"/>
          <path d="M2 16a8 8 0 0 1 4-7" />
          <polyline points="2 12 2 16 6 16"/>
        </svg>
      </div>
      <div>
        <div className="t-cap" style={{ color: theme.inkSoft, marginBottom: 6 }}>Advanced view</div>
        <h2 className="t-serif" style={{
          margin: 0, fontSize: 26, lineHeight: 1.15, letterSpacing: "-0.01em",
        }}>Rotate your phone.</h2>
        <p style={{
          marginTop: 10, marginBottom: 0,
          fontFamily: "Inter", fontSize: 13, color: theme.inkSoft, lineHeight: 1.5, maxWidth: 280,
        }}>
          Advanced view lays out the live scoreboard like the desktop — stats, point log, and the
          full tag row. Turn the phone landscape and it'll switch automatically.
        </p>
      </div>
      <button onClick={onExit} className="t-btn" style={{
        appearance: "none", border: `1px solid ${theme.line}`,
        background: "transparent", color: theme.ink,
        borderRadius: 999, padding: "9px 18px",
        fontFamily: "Inter", fontSize: 12, fontWeight: 600, cursor: "pointer",
      }}>Use standard view instead</button>

      <style>{`@keyframes rotateHint{0%,40%,100%{transform:rotate(0)}60%,90%{transform:rotate(-90deg)}}`}</style>
    </div>
  );
}

