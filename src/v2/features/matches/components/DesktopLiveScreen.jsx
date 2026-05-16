// DesktopLiveScreen.jsx — Desktop / iPad live scoring layout ported
// from the v2 Claude Design `screens-web.jsx > DesktopLive`. Two-column
// grid: scoreboard + tap zones on the left, live stats + point log on
// the right. Stripped of the FinishSheet (no competitions wiring in
// the v2 visual prototype).

import React from "react";
import {
  Ball, Eyebrow, LiveDot, CourtMini, ServeDot, StatBar,
} from "./atoms.jsx";
import CourtPicker from "./CourtPicker.jsx";
import {
  isDeuce, isMatchPoint, pointLabel, fmtDuration, elapsedMs,
  engineToLogPayload,
} from "../utils/tennisEngine.js";

export default function DesktopLiveScreen({
  match, theme, accent, court, onPoint, onUndo, onChangeover,
  // Court picker (optional, see LiveScoringScreen).
  courts, currentCourtId, onCourtChange,
  // Persist-the-match callback. Returns { error: null } / { error: msg }.
  // Wired in BaselineApp.onSaveLiveMatch — reshapes the engine state
  // and hands off to logV2Match (same backend as Quick-log: writes
  // match_history + fires match_tag notification + emits the
  // confirm-card DM into the opponent's thread).
  onSave,
  // End the current set early with whatever games are on the board.
  // Discoverable affordance for "we only played 4 games, let's call
  // it" flows — undo is the safety net for accidental taps.
  onEndSet,
  // Re-label the most recent point. Accepts engine keys:
  // 'ace' / 'df' / 'winner' / 'error' / 'net'. Null clears.
  onTagPoint,
  // Optional — when present, shows a small "Exit advanced view"
  // chip in the top bar. Wired from LiveScoringScreen's mobile
  // Advanced toggle so the user can come back to the standard
  // mobile view without rotating their phone.
  onExitAdvanced,
  // Destructive: wipes the in-progress match without saving.
  // BaselineApp wraps in window.confirm — handler arrives
  // already-confirmed from there. Surfaced as a small text link at
  // the bottom of the sidebar action column so accidental taps are
  // rare.
  onCancel,
  // Tightens padding / font sizes / sidebar width so the desktop
  // layout fits a 7" phone in landscape. Set by LiveScoringScreen
  // when it hands off to advanced mode. Standard desktop calls
  // omit this prop and keep the full spacing. User feedback: "For
  // the advanced mode, Can you just make everything a little bit
  // smaller so it fits on the phone better?"
  compact = false,
}) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  const [saving, setSaving] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState("");

  React.useEffect(() => {
    const id = setInterval(force, 1000);
    return () => clearInterval(id);
  }, []);

  // Save is available the moment any score lands — completed set OR
  // a partial in-progress set (3-2 etc.) OR an in-progress tiebreak.
  // engineToLogPayload returns [] for a truly empty 0-0 match; we
  // gate the button on that.
  const canSave = !!(match && engineToLogPayload(match).length > 0);
  const matchDone = !!(match && match.endedAt);

  // End-set gating: only meaningful when at least one game has
  // landed in the current set (or an in-progress tiebreak). Avoids
  // letting the user "end" a 0-0 set into setHistory.
  const canEndSet = !!(match && !match.endedAt && (
    (Array.isArray(match.games)   && (match.games[0]   > 0 || match.games[1]   > 0)) ||
    (match.inTiebreak && Array.isArray(match.tbPoints) && (match.tbPoints[0] > 0 || match.tbPoints[1] > 0))
  ));

  // Tag chips: human labels in the UI, engine keys in the action.
  // Net cord is log-only (no stat impact) but still useful for the
  // point timeline.
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

  // Sizing tokens — standard desktop vs. compact (mobile advanced
  // landscape). Tightens everything that touches vertical space
  // most aggressively since landscape on a phone is ~400px tall.
  const Z = compact ? {
    sidebarW: 240,
    mainPad: "12px 18px",
    sidebarPad: "12px 14px",
    scorePadV: 18, scorePadH: 22,
    nameFs: 22, sumFs: 18, sumFsBig: 28,
    tapPad: "14px 16px", tapNameFs: 16,
    tapMinH: 0,
    chipFs: 10.5, chipPad: "5px 10px",
    actionPad: "10px 12px", actionFs: 12,
    pointLogFs: 11,
  } : {
    sidebarW: 320,
    mainPad: "20px 28px",
    sidebarPad: "20px 22px",
    scorePadV: 32, scorePadH: 36,
    nameFs: 28, sumFs: 22, sumFsBig: 36,
    tapPad: "20px 22px", tapNameFs: 18,
    tapMinH: 0,
    chipFs: 11, chipPad: "6px 12px",
    actionPad: "12px 14px", actionFs: 13,
    pointLogFs: 12,
  };
  const handleSave = React.useCallback(async function () {
    if (!onSave || saving) return;
    setSaveErr("");
    setSaving(true);
    var r = await onSave();
    setSaving(false);
    if (r && r.error) setSaveErr((r.error && r.error.message) || String(r.error));
  }, [onSave, saving]);

  return (
    <div style={{
      width: "100%", height: "100%", background: theme.bg, color: theme.ink,
      display: "grid", gridTemplateColumns: `1fr ${Z.sidebarW}px`, overflow: "hidden",
    }}>
      {/* main */}
      <div style={{ display: "flex", flexDirection: "column", padding: Z.mainPad, minWidth: 0 }}>
        {/* top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Ball size={20} color={accent} />
            <span className="t-serif" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>Baseline</span>
            <span style={{ width: 1, height: 18, background: theme.line }} />
            <Eyebrow color={theme.inkSoft}>Live match</Eyebrow>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {onExitAdvanced && (
              <button onClick={onExitAdvanced} className="t-btn" style={{
                appearance: "none", border: `1px solid ${theme.line}`,
                background: theme.bg, color: theme.inkSoft,
                borderRadius: 999, padding: "5px 11px",
                fontFamily: "Inter", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
                display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
              }} aria-label="Exit advanced view">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
                Standard view
              </button>
            )}
            <LiveDot accent={accent} />
            <span style={{ color: theme.inkSoft, fontSize: 13 }} className="t-num">{fmtDuration(elapsedMs(match))}</span>
            {courts && onCourtChange ? (
              <CourtPicker
                courts={courts}
                currentId={currentCourtId || "grass"}
                onChange={onCourtChange}
                theme={theme}
                accent={accent}
                size={22}
              />
            ) : (
              <>
                <CourtMini surface={court.surface} size={22} />
                <span className="t-cap" style={{ color: theme.inkSoft }}>{court.label}</span>
              </>
            )}
          </div>
        </div>

        {/* big scoreboard */}
        <div style={{
          background: theme.scoreBg, color: theme.scoreInk, borderRadius: 18,
          padding: `${Z.scorePadV}px ${Z.scorePadH}px`,
          display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: compact ? 16 : 24,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            <BigPlayerLine match={match} side={0} accent={accent} theme={theme} compact={compact} />
            <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
            <BigPlayerLine match={match} side={1} accent={accent} theme={theme} compact={compact} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <span className="t-cap" style={{ color: "rgba(232,230,223,0.5)" }}>{match.inTiebreak ? "Tiebreak" : (isDeuce(match) ? "Deuce" : "Game")}</span>
            <div className="t-num" style={{ fontSize: 14, color: "rgba(232,230,223,0.6)", letterSpacing: "0.04em" }}>
              SET {match.setHistory.length + 1} · {match.cfg.label || (match.cfg.sets > 1 ? `Bo${match.cfg.sets}` : "Pro 8")}
            </div>
            {isMatchPoint(match) >= 0 && (
              <span className="t-cap t-pulse" style={{
                background: accent, color: "#0f1410", padding: "5px 10px", borderRadius: 999,
                letterSpacing: "0.12em", marginTop: 4,
              }}>MATCH POINT</span>
            )}
          </div>
        </div>

        {/* point area */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
          <DesktopTapZone player={match.p1} server={match.serverIndex === 0} onTap={() => onPoint(0)} onMinus={onUndo} theme={theme} accent={accent} compact={compact} />
          <DesktopTapZone player={match.p2} server={match.serverIndex === 1} onTap={() => onPoint(1)} onMinus={onUndo} theme={theme} accent={accent} compact={compact} />
        </div>

        {/* Tag chips — apply / re-apply a label to the most recent
            point. The active tag highlights so the user can tell
            which one's on. Disabled until at least one point has
            been scored. */}
        <div style={{ display: "flex", gap: compact ? 6 : 8, marginTop: compact ? 8 : 14, flexWrap: "wrap" }}>
          {TAGS.map(function (t) {
            var on = lastTag === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={function () { if (onTagPoint && hasLastPoint) onTagPoint(on ? null : t.key); }}
                disabled={!hasLastPoint}
                className="t-btn"
                style={{
                  appearance: "none",
                  padding: Z.chipPad, borderRadius: 999,
                  background: on ? theme.ink : theme.chip,
                  color: on ? theme.bg : theme.ink,
                  fontFamily: "Inter", fontSize: Z.chipFs, fontWeight: on ? 700 : 500, letterSpacing: "0.02em",
                  border: `1px solid ${on ? theme.ink : theme.line}`,
                  cursor: hasLastPoint ? "pointer" : "default",
                  opacity: hasLastPoint ? 1 : 0.5,
                }}>{t.label}</button>
            );
          })}
          {!compact && (
            <>
              <div style={{ flex: 1 }} />
              <span className="t-cap" style={{ color: theme.inkFaint, alignSelf: "center" }}>
                {hasLastPoint ? "Tag last point ↑" : "Score a point to tag it"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* sidebar */}
      <div style={{
        background: theme.bgRaised, borderLeft: `1px solid ${theme.line}`,
        padding: Z.sidebarPad, display: "flex", flexDirection: "column", gap: compact ? 12 : 18, overflow: "hidden",
      }}>
        <div>
          <Eyebrow color={theme.inkSoft}>Live stats</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 14, marginTop: compact ? 10 : 14 }}>
            <StatBar label="Points"  a={match.stats.pointsWon[0]} b={match.stats.pointsWon[1]} theme={theme} accent={accent} />
            <StatBar label="Aces"    a={match.stats.aces[0]}      b={match.stats.aces[1]}      theme={theme} accent={accent} />
            <StatBar label="Winners" a={match.stats.winners[0]}   b={match.stats.winners[1]}   theme={theme} accent={accent} />
            <StatBar label="UE"      a={match.stats.errors[0]}    b={match.stats.errors[1]}    theme={theme} accent={accent} />
          </div>
        </div>
        <div style={{ height: 1, background: theme.line }} />
        <div style={{ minHeight: 0, flex: compact ? "1 1 auto" : "0 0 auto", display: "flex", flexDirection: "column" }}>
          <Eyebrow color={theme.inkSoft}>Point log</Eyebrow>
          <div className="t-noscroll" style={{
            marginTop: compact ? 6 : 10, display: "flex", flexDirection: "column", gap: compact ? 2 : 4,
            maxHeight: compact ? 140 : 220, overflowY: "auto",
          }}>
            {match.log.slice(-12).reverse().map((p, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 10, alignItems: "center",
                padding: compact ? "4px 4px" : "6px 4px",
                fontFamily: "Inter", fontSize: Z.pointLogFs, color: theme.ink,
              }}>
                <span className="t-num" style={{ color: theme.inkFaint, fontSize: Z.pointLogFs - 1 }}>S{p.set + 1}.{p.game + 1}</span>
                <span style={{ color: p.winner === 0 ? accent : theme.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.winner === 0 ? match.p1.name : match.p2.name}</span>
                <span className="t-cap" style={{ color: theme.inkFaint }}>{p.tag || "pt"}</span>
              </div>
            ))}
            {match.log.length === 0 && <span style={{ fontSize: 12, color: theme.inkFaint }}>No points yet.</span>}
          </div>
        </div>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Save match — uses the same backend as Quick-log
              (logV2Match → match_history + match_tag notification +
              confirm-card DM to the opponent). Disabled until at
              least one set has been completed; promoted to the
              primary accent treatment once the engine flips
              endedAt so the user can tell "the match is over,
              go log it". */}
          {onSave && (
            <button onClick={handleSave} disabled={!canSave || saving} className="t-btn" style={{
              appearance: "none", border: matchDone ? 0 : `1px solid ${theme.line}`,
              background: matchDone ? accent : theme.bg,
              color: matchDone ? "#0f1410" : theme.ink,
              padding: Z.actionPad, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontFamily: "Inter", fontWeight: matchDone ? 700 : 600, fontSize: Z.actionFs,
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
              padding: "8px 10px", borderRadius: 8, background: `${accent}1f`, color: theme.ink,
              fontFamily: "Inter", fontSize: 12, fontWeight: 500,
            }}>{saveErr}</div>
          )}
          <button onClick={onChangeover} className="t-btn" style={{
            appearance: "none", border: `1px solid ${theme.line}`,
            background: theme.bg, color: theme.ink,
            padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontFamily: "Inter", fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.2 1.5"/></svg>
            Changeover · 90s
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {/* End set early — closes the current set with whatever
                games are on the board and rolls into the next set.
                Undo unwinds it. Disabled when there's nothing to
                end (0-0 with no in-progress TB). */}
            {onEndSet && (
              <button onClick={onEndSet} disabled={!canEndSet} className="t-btn" style={{
                flex: 1, appearance: "none", border: `1px solid ${theme.line}`,
                background: "transparent", color: theme.ink,
                padding: compact ? "9px" : "11px",
                fontFamily: "Inter", fontWeight: 600, fontSize: compact ? 11.5 : 12,
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
              background: "transparent", color: theme.ink,
              padding: compact ? "9px" : "11px",
              fontFamily: "Inter", fontWeight: 600, fontSize: compact ? 11.5 : 12, cursor: "pointer",
            }}>Undo</button>
          </div>
          {/* Cancel match — destructive, sits subtly under Undo so
              accidental taps are rare. Confirm dialog lives in
              BaselineApp.onCancelLiveMatch. */}
          {onCancel && (
            <button onClick={onCancel} className="t-btn" style={{
              appearance: "none", border: 0, background: "transparent",
              color: theme.inkFaint, padding: "6px",
              fontFamily: "Inter", fontWeight: 500, fontSize: 11.5,
              cursor: "pointer", textDecoration: "underline",
              alignSelf: "center",
            }}>Cancel match</button>
          )}
        </div>
      </div>
    </div>
  );
}

function BigPlayerLine({ match, side, accent, theme, compact = false }) {
  const player = side === 0 ? match.p1 : match.p2;
  const won = match.endedAt && match.setsWon[side] > match.setsWon[1 - side];
  // Compact sizing for landscape-on-phone advanced mode.
  const nameFs   = compact ? 18 : 26;
  const setFs    = compact ? 26 : 38;
  const setMin   = compact ? 28 : 36;
  const tbFs     = compact ? 11 : 14;
  const ptFs     = compact ? 36 : 56;
  const ptMin    = compact ? 56 : 80;
  const colGap   = compact ? 10 : 14;
  const outerGap = compact ? 18 : 28;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: outerGap, alignItems: "center", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 12, minWidth: 0 }}>
        <ServeDot active={match.serverIndex === side} color={accent} size={compact ? 9 : 11} />
        <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: nameFs, color: theme.scoreInk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {player.name}
        </span>
        {won && <span style={{ color: accent, fontWeight: 700 }}>•</span>}
      </div>
      <div style={{ display: "flex", gap: colGap }}>
        {Array.from({ length: match.cfg.sets }, (_, i) => {
          const sh = match.setHistory[i];
          const cur = i === match.setHistory.length && !match.endedAt;
          const v = sh ? sh.score[side] : (cur ? match.games[side] : "·");
          const tb = sh?.tb ? Math.min(...sh.tb) : (cur && match.inTiebreak ? match.tbPoints[side] : null);
          const isWin = sh && sh.score[side] > sh.score[1 - side];
          return (
            <div key={i} className="t-num" style={{
              fontSize: setFs, fontWeight: 600, letterSpacing: "-0.03em",
              color: isWin ? theme.scoreInk : (sh ? "rgba(232,230,223,0.5)" : (cur ? theme.scoreInk : "rgba(232,230,223,0.25)")),
              minWidth: setMin, textAlign: "center", position: "relative",
            }}>
              {v}{tb != null && <sup style={{ fontSize: tbFs, marginLeft: 1, opacity: 0.7 }}>{tb}</sup>}
            </div>
          );
        })}
      </div>
      <div className="t-num" style={{
        fontSize: ptFs, fontWeight: 600, letterSpacing: "-0.04em",
        color: pointLabel(match, side) === "Ad" ? accent : theme.scoreInk, minWidth: ptMin, textAlign: "right",
      }}>{pointLabel(match, side)}</div>
    </div>
  );
}

function DesktopTapZone({ player, server, onTap, onMinus, theme, accent, compact = false }) {
  // Card-as-div (not <button>) so the inner +/- circles can be real
  // buttons. The whole card is still tap-to-score on click except when
  // the click originates inside one of the +/- circles.
  const pad = compact ? "14px 16px" : "24px";
  const minH = compact ? 0 : 160;
  const nameFs = compact ? 16 : 22;
  const btnSize = compact ? 40 : 56;
  return (
    <div onClick={onTap} className="t-btn" role="button" tabIndex={0} style={{
      border: `1px solid ${theme.line}`,
      background: theme.bgRaised, borderRadius: 18, padding: pad,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      color: theme.ink, textAlign: "left", cursor: "pointer", minHeight: minH,
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ServeDot active={server} color={accent} size={compact ? 7 : 9} />
          <span className="t-cap" style={{ color: theme.inkSoft }}>Point for</span>
        </div>
        <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: nameFs, marginTop: compact ? 6 : 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.name}</div>
        {!compact && <div style={{ marginTop: 6, color: theme.inkFaint, fontSize: 12 }}>tap to score</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: compact ? 6 : 10, flexShrink: 0 }}>
        <button onClick={(e) => { e.stopPropagation(); onMinus && onMinus(); }} className="t-btn" aria-label="Remove point" style={{
          width: btnSize, height: btnSize, borderRadius: "50%",
          appearance: "none", border: 0, cursor: "pointer",
          background: theme.chip, color: theme.ink,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background .2s",
        }}>
          <svg width={compact ? 16 : 20} height={compact ? 16 : 20} viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onTap && onTap(); }} className="t-btn" aria-label="Add point" style={{
          width: btnSize, height: btnSize, borderRadius: "50%",
          appearance: "none", border: 0, cursor: "pointer",
          background: theme.chip, color: theme.ink,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background .2s",
        }}>
          <svg width={compact ? 16 : 20} height={compact ? 16 : 20} viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
}
