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
      display: "grid", gridTemplateColumns: "1fr 320px", overflow: "hidden",
    }}>
      {/* main */}
      <div style={{ display: "flex", flexDirection: "column", padding: "20px 28px", minWidth: 0 }}>
        {/* top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Ball size={20} color={accent} />
            <span className="t-serif" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>Baseline</span>
            <span style={{ width: 1, height: 18, background: theme.line }} />
            <Eyebrow color={theme.inkSoft}>Live match</Eyebrow>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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
          background: theme.scoreBg, color: theme.scoreInk, borderRadius: 18, padding: "32px 36px",
          display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 24,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            <BigPlayerLine match={match} side={0} accent={accent} theme={theme} />
            <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
            <BigPlayerLine match={match} side={1} accent={accent} theme={theme} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <span className="t-cap" style={{ color: "rgba(232,230,223,0.5)" }}>{match.inTiebreak ? "Tiebreak" : (isDeuce(match) ? "Deuce" : "Game")}</span>
            <div className="t-num" style={{ fontSize: 14, color: "rgba(232,230,223,0.6)", letterSpacing: "0.04em" }}>
              SET {match.setHistory.length + 1} · {match.cfg.sets > 1 ? `Bo${match.cfg.sets}` : "Pro 8"}
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
          <DesktopTapZone player={match.p1} server={match.serverIndex === 0} onTap={() => onPoint(0)} onMinus={onUndo} theme={theme} accent={accent} />
          <DesktopTapZone player={match.p2} server={match.serverIndex === 1} onTap={() => onPoint(1)} onMinus={onUndo} theme={theme} accent={accent} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {["Ace", "Winner", "Double fault", "Unforced error", "Net cord"].map((t) => (
            <span key={t} className="t-btn" style={{
              padding: "6px 12px", borderRadius: 999,
              background: theme.chip, color: theme.ink,
              fontFamily: "Inter", fontSize: 11, fontWeight: 500, letterSpacing: "0.02em",
              border: `1px solid ${theme.line}`,
            }}>{t}</span>
          ))}
          <div style={{ flex: 1 }} />
          <span className="t-cap" style={{ color: theme.inkFaint, alignSelf: "center" }}>Tag last point ↑</span>
        </div>
      </div>

      {/* sidebar */}
      <div style={{
        background: theme.bgRaised, borderLeft: `1px solid ${theme.line}`,
        padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18, overflow: "hidden",
      }}>
        <div>
          <Eyebrow color={theme.inkSoft}>Live stats</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            <StatBar label="Points"  a={match.stats.pointsWon[0]} b={match.stats.pointsWon[1]} theme={theme} accent={accent} />
            <StatBar label="Aces"    a={match.stats.aces[0]}      b={match.stats.aces[1]}      theme={theme} accent={accent} />
            <StatBar label="Winners" a={match.stats.winners[0]}   b={match.stats.winners[1]}   theme={theme} accent={accent} />
            <StatBar label="UE"      a={match.stats.errors[0]}    b={match.stats.errors[1]}    theme={theme} accent={accent} />
          </div>
        </div>
        <div style={{ height: 1, background: theme.line }} />
        <div>
          <Eyebrow color={theme.inkSoft}>Point log</Eyebrow>
          <div className="t-noscroll" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
            {match.log.slice(-12).reverse().map((p, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 10, alignItems: "center",
                padding: "6px 4px", fontFamily: "Inter", fontSize: 12, color: theme.ink,
              }}>
                <span className="t-num" style={{ color: theme.inkFaint, fontSize: 11 }}>S{p.set + 1}.{p.game + 1}</span>
                <span style={{ color: p.winner === 0 ? accent : theme.inkSoft }}>{p.winner === 0 ? match.p1.name : match.p2.name}</span>
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
              padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
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
            <button onClick={onUndo} className="t-btn" style={{
              flex: 1, appearance: "none", border: `1px solid ${theme.line}`,
              background: "transparent", color: theme.ink, padding: "11px",
              fontFamily: "Inter", fontWeight: 600, fontSize: 12, cursor: "pointer",
            }}>Undo</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BigPlayerLine({ match, side, accent, theme }) {
  const player = side === 0 ? match.p1 : match.p2;
  const won = match.endedAt && match.setsWon[side] > match.setsWon[1 - side];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 28, alignItems: "center", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <ServeDot active={match.serverIndex === side} color={accent} size={11} />
        <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 26, color: theme.scoreInk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {player.name}
        </span>
        {won && <span style={{ color: accent, fontWeight: 700 }}>•</span>}
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        {Array.from({ length: match.cfg.sets }, (_, i) => {
          const sh = match.setHistory[i];
          const cur = i === match.setHistory.length && !match.endedAt;
          const v = sh ? sh.score[side] : (cur ? match.games[side] : "·");
          const tb = sh?.tb ? Math.min(...sh.tb) : (cur && match.inTiebreak ? match.tbPoints[side] : null);
          const isWin = sh && sh.score[side] > sh.score[1 - side];
          return (
            <div key={i} className="t-num" style={{
              fontSize: 38, fontWeight: 600, letterSpacing: "-0.03em",
              color: isWin ? theme.scoreInk : (sh ? "rgba(232,230,223,0.5)" : (cur ? theme.scoreInk : "rgba(232,230,223,0.25)")),
              minWidth: 36, textAlign: "center", position: "relative",
            }}>
              {v}{tb != null && <sup style={{ fontSize: 14, marginLeft: 1, opacity: 0.7 }}>{tb}</sup>}
            </div>
          );
        })}
      </div>
      <div className="t-num" style={{
        fontSize: 56, fontWeight: 600, letterSpacing: "-0.04em",
        color: pointLabel(match, side) === "Ad" ? accent : theme.scoreInk, minWidth: 80, textAlign: "right",
      }}>{pointLabel(match, side)}</div>
    </div>
  );
}

function DesktopTapZone({ player, server, onTap, onMinus, theme, accent }) {
  // Card-as-div (not <button>) so the inner +/- circles can be real
  // buttons. The whole card is still tap-to-score on click except when
  // the click originates inside one of the +/- circles. User feedback:
  // 'on the web version in live scoring. Can you add the - and +
  // buttons for scoring in the names?'
  return (
    <div onClick={onTap} className="t-btn" role="button" tabIndex={0} style={{
      border: `1px solid ${theme.line}`,
      background: theme.bgRaised, borderRadius: 18, padding: "24px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      color: theme.ink, textAlign: "left", cursor: "pointer", minHeight: 160,
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ServeDot active={server} color={accent} size={9} />
          <span className="t-cap" style={{ color: theme.inkSoft }}>Point for</span>
        </div>
        <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 22, marginTop: 12 }}>{player.name}</div>
        <div style={{ marginTop: 6, color: theme.inkFaint, fontSize: 12 }}>tap to score</div>
      </div>
      {/* +/- buttons — identical size + style (only icon differs), to
          mirror the mobile Live screen. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={(e) => { e.stopPropagation(); onMinus && onMinus(); }} className="t-btn" aria-label="Remove point" style={{
          width: 56, height: 56, borderRadius: "50%",
          appearance: "none", border: 0, cursor: "pointer",
          background: theme.chip, color: theme.ink,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background .2s",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onTap && onTap(); }} className="t-btn" aria-label="Add point" style={{
          width: 56, height: 56, borderRadius: "50%",
          appearance: "none", border: 0, cursor: "pointer",
          background: theme.chip, color: theme.ink,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background .2s",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
}
