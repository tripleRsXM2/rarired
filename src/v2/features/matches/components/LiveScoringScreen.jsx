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
import {
  isDeuce, isMatchPoint, fmtDuration, elapsedMs,
  engineToLogPayload,
} from "../utils/tennisEngine.js";

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
