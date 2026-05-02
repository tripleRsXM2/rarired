// src/features/scoring/pages/LogMatchPage.jsx
//
// Editorial Tennis "Log a Match v2" — single-screen match-card flow.
// Mounted at /match/log; entered via the "+" in the bottom tab bar.
//
// The score is the hero. Everything else is a tappable detail row
// that opens a bottom sheet. Submit reveals a celebration overlay
// with the opponent name + score + a "pending confirmation" pill.
//
// Wires to existing infrastructure:
//   - useMatchHistory.submitMatch handles the actual insert + ranked
//     match_tag notification (or casual_match_logged for casual
//     non-league rows). Same path the legacy ScoreModal uses.
//   - Opponent recents = unique linked opponents from history (most
//     recent first) merged with viewer's friends.
//   - Type → League with no leagues → empty-state CTA navigates to
//     /tournaments/leagues so the user can create from the
//     existing CreateLeagueModal entry point on that page.
//
// Component boundaries are intentionally inlined here — the sheets
// only exist on this page and aren't reused elsewhere. If a sheet
// grows beyond ~80 lines it can be split out.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ED_TOK } from "../../home/components/EditorialScreen.jsx";

// ── Page ─────────────────────────────────────────────────────────

export default function LogMatchPage({
  authUser,
  profile,
  history,
  friends,
  myLeagues,
  submitMatch,
  toast,
}) {
  var navigate = useNavigate();

  // ── Form state ────────────────────────────────────────────────
  var [sets, setSets] = useState([{ a: "", b: "" }, { a: "", b: "" }]);
  var [opp, setOpp] = useState(null);            // { id, name, sub }
  var [type, setType] = useState(null);          // 'league' | 'casual' | 'tournament'
  var [leagueId, setLeagueId] = useState(null);  // when type === 'league'
  var [completion, setCompletion] = useState("completed"); // 'completed' | 'time_limited' | 'retired'
  var [details, setDetails] = useState({
    court: "",
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    notes: "",
  });

  // ── Score-sheet state ─────────────────────────────────────────
  // Lifted to the page so opening a specific cell from the
  // scoreboard preserves which set + side is being edited.
  var [activeSet, setActiveSet] = useState(0);
  var [activeSide, setActiveSide] = useState("a");
  var [scoreMode, setScoreMode] = useState("pad");

  // ── Sheet open state ──────────────────────────────────────────
  var [sheet, setSheet] = useState(null); // 'score' | 'opp' | 'type' | 'completion' | 'details'

  // ── Submit + celebration ──────────────────────────────────────
  var [saving, setSaving] = useState(false);
  var [saveError, setSaveError] = useState("");
  var [celebration, setCelebration] = useState(null); // { won, score, opp, status }

  // ── Derived ───────────────────────────────────────────────────
  var completedSets = useMemo(function () {
    return sets.filter(function (s) { return s.a !== "" && s.b !== ""; });
  }, [sets]);

  var compactScore = completedSets
    .map(function (s) { return s.a + "–" + s.b; })
    .join(", ");

  var won = useMemo(function () {
    var aWins = 0, bWins = 0;
    sets.forEach(function (s) {
      if (s.a === "" || s.b === "") return;
      var na = Number(s.a), nb = Number(s.b);
      if (Number.isNaN(na) || Number.isNaN(nb) || na === nb) return;
      if (na > nb) aWins++; else bWins++;
    });
    if (aWins === 0 && bWins === 0) return null;
    if (aWins === bWins) return null; // tied — no clear winner yet
    return aWins > bWins;
  }, [sets]);

  // Eligible leagues for the picker — viewer is active in them and
  // they're active. Mode filtering happens at submit time (server
  // trigger validates league.mode vs match_type).
  var activeLeagues = useMemo(function () {
    return (myLeagues || []).filter(function (lg) {
      return lg && lg.status === "active" && lg.my_status === "active";
    });
  }, [myLeagues]);

  // Recent opponents: most-recent confirmed match per linked opponent.
  var recentOpponents = useMemo(function () {
    var seen = {};
    var out = [];
    (history || []).forEach(function (m) {
      if (!m.opponent_id || m.opponent_id === (authUser && authUser.id)) return;
      if (seen[m.opponent_id]) return;
      seen[m.opponent_id] = true;
      out.push({
        id:   m.opponent_id,
        name: m.friendName || m.opponentName || m.oppName || m.playerName || "Player",
        sub:  m.match_type === "ranked" ? "Played recently" : "Casual",
      });
    });
    return out.slice(0, 6);
  }, [history, authUser]);

  // All players list = recents + friends, deduped by id.
  var allPlayers = useMemo(function () {
    var byId = {};
    recentOpponents.forEach(function (p) { byId[p.id] = p; });
    (friends || []).forEach(function (f) {
      if (!f || !f.id || byId[f.id]) return;
      byId[f.id] = {
        id:   f.id,
        name: f.name || "Player",
        sub:  (f.suburb || "Friend") + (f.skill ? " · " + f.skill : ""),
      };
    });
    return Object.values(byId);
  }, [recentOpponents, friends]);

  // Submit gating — score + opponent + type all set.
  var ready = completedSets.length > 0 && !!opp && !!type && !saving
    && (type !== "league" || !!leagueId);

  // ── Handlers ──────────────────────────────────────────────────
  function close() { navigate(-1); }

  function editSet(i, side) {
    setActiveSet(i);
    setActiveSide(side);
    setSheet("score");
  }

  function addSet() {
    if (sets.length >= 5) return;
    setSets(sets.concat([{ a: "", b: "" }]));
    setActiveSet(sets.length);
    setActiveSide("a");
    setSheet("score");
  }

  function delSet(i) {
    if (sets.length <= 1) {
      setSets([{ a: "", b: "" }]);
      return;
    }
    var next = sets.filter(function (_, idx) { return idx !== i; });
    setSets(next);
    if (activeSet >= next.length) setActiveSet(next.length - 1);
  }

  // ── Submit ────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!ready) return;
    setSaving(true);
    setSaveError("");

    // Build the legacy submitMatch payload from our state. The hook
    // takes scoreDraft.sets in {you, them} format — translate.
    var draft = {
      sets:           sets.filter(function (s) { return s.a !== "" || s.b !== ""; })
                       .map(function (s) { return { you: s.a, them: s.b }; }),
      result:         won ? "win" : "loss",
      notes:          details.notes || "",
      date:           details.date,
      venue:          details.court || "",
      court:          "",
      matchType:      type === "casual" ? "casual" : "ranked",
      completionType: completion,
      leagueId:       (type === "league" && leagueId) ? leagueId : null,
      inviteOpponent: false,
    };

    // scoreModal envelope — submitMatch reads scoreModal.casual to
    // pick the linked-opponent path. Always casual=true here; when
    // an opponent is selected (opp.id), submitMatch promotes the
    // row to ranked + pending_confirmation per our usual rules.
    var sm = {
      casual:    true,
      oppName:   opp ? opp.name : "",
      tournName: type === "casual" ? "Casual Match" : (type === "league" ? "League" : "Match"),
    };

    var res;
    try {
      res = await submitMatch({
        scoreModal:  sm,
        scoreDraft:  draft,
        oppName:     opp.name,
        opponentId:  opp.id,
      });
    } catch (e) {
      setSaving(false);
      setSaveError("Could not save — please try again.");
      return;
    }

    setSaving(false);
    if (res && res.error) {
      var msg = (typeof res.error === "string" ? res.error : null) || res.message || "Could not save match.";
      setSaveError(msg);
      if (toast) toast(msg, "error");
      return;
    }

    setCelebration({
      won:    won,
      score:  compactScore,
      opp:    opp,
      status: (res && res.status) || "pending_confirmation",
      type:   type,
    });
  }

  function celebrationDone() {
    setCelebration(null);
    navigate("/home");
  }

  // ── Render ────────────────────────────────────────────────────
  var ctxLabel = labelForType(type, leagueId, activeLeagues);
  var completionLabel = labelForCompletion(completion);
  var detailsSummary = formatDetailsSummary(details);

  return (
    <div style={{
      background:    ED_TOK.bg,
      color:         ED_TOK.ink,
      fontFamily:    ED_TOK.sans,
      minHeight:     "100dvh",
      display:       "flex",
      flexDirection: "column",
    }}>
      {/* Top bar — Back · "Log a match" · Close */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems:          "center",
        padding:             "calc(16px + env(safe-area-inset-top, 0px)) 22px 14px",
        background:          ED_TOK.bg,
        position:            "sticky",
        top:                 0,
        zIndex:              5,
      }}>
        <button
          onClick={close}
          aria-label="Back"
          style={topIconBtn(ED_TOK, "start")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <span style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      11,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color:         ED_TOK.muted,
          fontWeight:    600,
        }}>
          Log a match
        </span>
        <button
          onClick={close}
          aria-label="Close"
          style={topIconBtn(ED_TOK, "end")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6l-12 12"/>
          </svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 16 }}>
        {/* HERO — verdict pill + scoreboard */}
        <div style={{ padding: "22px 22px 28px" }}>
          <VerdictPill won={won} />
          <Scoreboard
            sets={sets}
            activeSet={activeSet}
            activeSide={activeSide}
            onEditCell={editSet}
            onAddSet={addSet}
            onDelSet={delSet}
          />
        </div>

        {/* DETAIL ROWS */}
        <div style={{ borderTop: "1px solid " + ED_TOK.line }}>
          <DetailRow
            label="How it ended"
            value={completionLabel}
            empty={false}
            onClick={function () { setSheet("completion"); }}
          />
          <DetailRow
            label="Opponent"
            value={opp ? opp.name : "Choose opponent"}
            empty={!opp}
            sub={opp ? opp.sub : null}
            onClick={function () { setSheet("opp"); }}
          />
          <DetailRow
            label="Type"
            value={ctxLabel || "League, casual, or tournament"}
            empty={!type}
            sub={subForType(type, leagueId, activeLeagues)}
            onClick={function () { setSheet("type"); }}
          />
          <DetailRow
            label="Details"
            value={detailsSummary || "Court, date, notes (optional)"}
            empty={!detailsSummary}
            sub={details.notes ? quote(details.notes, 48) : null}
            onClick={function () { setSheet("details"); }}
          />
        </div>

        {/* SUBMIT */}
        <div style={{ padding: "22px 22px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{
            fontFamily:    ED_TOK.mono,
            fontSize:      10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color:         ready ? ED_TOK.ink : ED_TOK.muted,
            fontWeight:    600,
            textAlign:     "center",
          }}>
            {submitHint(ready, completedSets.length, opp, type, leagueId, saving)}
          </span>
          {saveError && (
            <span style={{
              fontFamily: ED_TOK.mono,
              fontSize:   11,
              color:      ED_TOK.loss,
              textAlign:  "center",
              letterSpacing: "0.04em",
            }}>
              {saveError}
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={!ready}
            style={primaryBtn(ED_TOK, !ready)}>
            {saving ? "Saving…" : "Log match"}
            {!saving && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* SHEETS */}
      <BottomSheet open={sheet === "score"} title="Score" onClose={function () { setSheet(null); }}>
        <ScoreSheet
          sets={sets}
          setSets={setSets}
          mode={scoreMode}
          setMode={setScoreMode}
          activeSet={activeSet}
          setActiveSet={setActiveSet}
          activeSide={activeSide}
          setActiveSide={setActiveSide}
          onDone={function () { setSheet(null); }}
        />
      </BottomSheet>

      <BottomSheet open={sheet === "completion"} title="How it ended" onClose={function () { setSheet(null); }}>
        <CompletionSheet
          value={completion}
          setValue={setCompletion}
          onDone={function () { setSheet(null); }}
        />
      </BottomSheet>

      <BottomSheet open={sheet === "opp"} title="Opponent" onClose={function () { setSheet(null); }}>
        <OpponentSheet
          recents={recentOpponents}
          allPlayers={allPlayers}
          onPick={function (p) { setOpp(p); setSheet(null); }}
        />
      </BottomSheet>

      <BottomSheet open={sheet === "type"} title="Match type" onClose={function () { setSheet(null); }}>
        <TypeSheet
          value={type}
          setValue={setType}
          leagueId={leagueId}
          setLeagueId={setLeagueId}
          activeLeagues={activeLeagues}
          onDone={function () { setSheet(null); }}
          onCreateLeague={function () { setSheet(null); navigate("/tournaments/leagues"); }}
        />
      </BottomSheet>

      <BottomSheet open={sheet === "details"} title="Details" onClose={function () { setSheet(null); }}>
        <DetailsSheet
          details={details}
          setDetails={setDetails}
          onDone={function () { setSheet(null); }}
        />
      </BottomSheet>

      {/* CELEBRATION */}
      <MatchCelebration
        data={celebration}
        onDone={celebrationDone}
      />
    </div>
  );
}

// ── VerdictPill ──────────────────────────────────────────────────

function VerdictPill({ won }) {
  var bg, color, label;
  if (won === true)       { bg = "#B8E6C2"; color = "#1A4527"; label = "● Win"; }
  else if (won === false) { bg = "#F0B5A8"; color = "#5C2018"; label = "● Loss"; }
  else                    { bg = ED_TOK.bg2; color = ED_TOK.muted; label = "○ Tap to score"; }

  return (
    <div style={{
      fontFamily:    ED_TOK.mono,
      fontSize:      10.5,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      fontWeight:    700,
      marginBottom:  18,
    }}>
      <span style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           6,
        padding:       "4px 10px",
        borderRadius:  999,
        background:    bg,
        color:         color,
      }}>
        {label}
      </span>
    </div>
  );
}

// ── Scoreboard (dark card) ──────────────────────────────────────

function Scoreboard({ sets, activeSet, activeSide, onEditCell, onAddSet, onDelSet }) {
  return (
    <div style={{
      borderRadius: 22,
      background:   ED_TOK.ink,
      color:        ED_TOK.bg,
      padding:      "20px 22px 22px",
      position:     "relative",
      overflow:     "hidden",
    }}>
      {/* Side headers */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems:          "center",
        fontFamily:          ED_TOK.mono,
        fontSize:            10.5,
        letterSpacing:       "0.18em",
        textTransform:       "uppercase",
        fontWeight:          700,
        marginBottom:        14,
      }}>
        <span style={{ textAlign: "left", color: ED_TOK.bg }}>You</span>
        <span style={{
          fontFamily:    ED_TOK.display,
          fontSize:      11,
          fontWeight:    500,
          letterSpacing: "0.1em",
          color:         "rgba(240, 233, 218, 0.4)",
          padding:       "0 10px",
        }}>vs</span>
        <span style={{ textAlign: "right", color: "rgba(240, 233, 218, 0.55)" }}>Opponent</span>
      </div>

      {/* Score rows */}
      {sets.map(function (s, i) {
        var aN = Number(s.a), bN = Number(s.b);
        var aWins = s.a !== "" && s.b !== "" && aN > bN;
        var bWins = s.a !== "" && s.b !== "" && bN > aN;
        var aActive = activeSet === i && activeSide === "a";
        var bActive = activeSet === i && activeSide === "b";

        return (
          <div key={i} style={{
            display:             "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems:          "center",
            gap:                 14,
            padding:             "6px 0",
            position:            "relative",
            borderTop:           i === 0 ? "none" : "1px solid rgba(240, 233, 218, 0.08)",
            marginTop:           i === 0 ? 0 : 4,
            paddingTop:          i === 0 ? 6 : 10,
          }}>
            <ScoreCell side="a" value={s.a} active={aActive} winner={aWins}
              onClick={function () { onEditCell(i, "a"); }}/>
            <span style={{
              fontFamily:    ED_TOK.mono,
              fontSize:      9.5,
              fontWeight:    700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color:         "rgba(240, 233, 218, 0.4)",
              textAlign:     "center",
              whiteSpace:    "nowrap",
            }}>
              Set {i + 1}
            </span>
            <ScoreCell side="b" value={s.b} active={bActive} winner={bWins}
              onClick={function () { onEditCell(i, "b"); }}/>
            {sets.length > 1 && (
              <button
                onClick={function (e) { e.stopPropagation(); onDelSet(i); }}
                aria-label={"Remove set " + (i + 1)}
                style={{
                  position:   "absolute",
                  top:        "50%",
                  right:      -14,
                  transform:  "translateY(-50%)",
                  width:      20, height: 20,
                  borderRadius: "50%",
                  background: "rgba(240, 233, 218, 0.14)",
                  color:      ED_TOK.bg,
                  border:     "none",
                  fontSize:   11,
                  cursor:     "pointer",
                  display:    "flex",
                  alignItems: "center", justifyContent: "center",
                  lineHeight: 1,
                  opacity:    0,
                  transition: "opacity 160ms",
                }}
                onMouseEnter={function (e) { e.currentTarget.style.opacity = 1; }}
                onMouseLeave={function (e) { e.currentTarget.style.opacity = 0; }}>
                ×
              </button>
            )}
          </div>
        );
      })}

      {/* + Add set */}
      {sets.length < 5 && (
        <button
          onClick={onAddSet}
          style={{
            marginTop:    12,
            width:        "100%",
            background:   "transparent",
            border:       "1px dashed rgba(240, 233, 218, 0.22)",
            color:        "rgba(240, 233, 218, 0.6)",
            borderRadius: 12,
            padding:      10,
            fontFamily:   ED_TOK.mono,
            fontSize:     10.5,
            fontWeight:   700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            cursor:       "pointer",
            transition:   "160ms",
          }}
          onMouseEnter={function (e) {
            e.currentTarget.style.borderColor = ED_TOK.bg;
            e.currentTarget.style.color = ED_TOK.bg;
          }}
          onMouseLeave={function (e) {
            e.currentTarget.style.borderColor = "rgba(240, 233, 218, 0.22)";
            e.currentTarget.style.color = "rgba(240, 233, 218, 0.6)";
          }}>
          + Add set
        </button>
      )}

      {/* Hint */}
      <div style={{
        marginTop:     12,
        fontFamily:    ED_TOK.mono,
        fontSize:      10.5,
        fontWeight:    600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color:         "rgba(240, 233, 218, 0.45)",
        textAlign:     "center",
      }}>
        Tap any number to edit
      </div>
    </div>
  );
}

function ScoreCell({ side, value, active, winner, onClick }) {
  var color = winner
    ? "#B8E6C2"
    : (side === "a" ? ED_TOK.bg : "rgba(240, 233, 218, 0.55)");
  var weight = side === "a" ? 500 : 400;
  return (
    <span
      onClick={onClick}
      style={{
        display:       "inline-flex",
        alignItems:    "baseline",
        cursor:        "pointer",
        position:      "relative",
        justifyContent: side === "a" ? "flex-start" : "flex-end",
      }}>
      <span style={{
        fontFamily:     ED_TOK.display,
        fontSize:       64,
        fontWeight:     weight,
        letterSpacing:  "-0.05em",
        lineHeight:     0.85,
        color:          color,
        opacity:        value === "" ? 0.28 : 1,
        borderBottom:   "2px solid " + (active ? ED_TOK.accent : "transparent"),
        paddingBottom:  3,
        minWidth:       36,
        textAlign:      "center",
        transition:     "color 160ms, border-bottom-color 160ms",
      }}>
        {value === "" ? "0" : value}
      </span>
    </span>
  );
}

// ── DetailRow ────────────────────────────────────────────────────

function DetailRow({ label, value, sub, empty, onClick }) {
  var [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={function () { setHover(true); }}
      onMouseLeave={function () { setHover(false); }}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            14,
        padding:        "18px 22px",
        borderBottom:   "1px solid " + ED_TOK.line,
        background:     hover ? ED_TOK.bg2 : "transparent",
        border:         "none",
        borderLeft:     "none",
        borderRight:    "none",
        borderTop:      "none",
        width:          "100%",
        textAlign:      "left",
        cursor:         "pointer",
        color:          "inherit",
        transition:     "background 140ms",
        fontFamily:     "inherit",
      }}>
      <span style={{
        fontFamily:    ED_TOK.mono,
        fontSize:      10.5,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color:         ED_TOK.muted,
        fontWeight:    600,
        width:         100,
        flex:          "0 0 auto",
      }}>
        {label}
      </span>
      <span style={{
        flex:          1,
        fontFamily:    ED_TOK.display,
        fontSize:      18,
        fontWeight:    500,
        letterSpacing: "-0.02em",
        color:         empty ? ED_TOK.muted : ED_TOK.ink,
        opacity:       empty ? 0.7 : 1,
        lineHeight:    1.25,
      }}>
        {value}
        {sub && (
          <small style={{
            display:       "block",
            fontFamily:    ED_TOK.mono,
            fontSize:      10.5,
            fontWeight:    500,
            letterSpacing: "0.04em",
            color:         ED_TOK.muted,
            marginTop:     3,
          }}>
            {sub}
          </small>
        )}
      </span>
      <span style={{
        color:    ED_TOK.muted,
        fontSize: 18,
        flex:     "0 0 auto",
      }}>›</span>
    </button>
  );
}

// ── BottomSheet wrapper ─────────────────────────────────────────
//
// Auto-plays a slide-up animation on mount via the same .cs-sheet-
// panel CSS the legacy modal uses (defined in providers.jsx). We
// gate mount on `open` so the keyframe runs each time the sheet
// opens. Closing unmounts immediately (matches the rest of the
// app's modal close behaviour).

function BottomSheet({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <>
      <div
        className="cs-sheet-scrim"
        onClick={onClose}
      />
      <div
        className="cs-sheet-panel"
        onClick={function (e) { e.stopPropagation(); }}
        style={{
          background:    ED_TOK.bg,
          color:         ED_TOK.ink,
          borderRadius:  "28px 28px 0 0",
          borderTop:     "1px solid " + ED_TOK.line,
          padding:       "10px 22px calc(24px + env(safe-area-inset-bottom, 0px))",
          fontFamily:    ED_TOK.sans,
          maxHeight:     "86dvh",
          overflowY:     "auto",
          boxShadow:     "0 -10px 40px rgba(0,0,0,0.18)",
        }}>
        <div style={{
          width:        36,
          height:       4,
          background:   ED_TOK.lineStrong,
          borderRadius: 999,
          margin:       "0 auto 8px",
        }}/>
        <div style={{
          display:             "grid",
          gridTemplateColumns: "32px 1fr 32px",
          alignItems:          "center",
          padding:             "8px 0 14px",
        }}>
          <span/>
          <span style={{
            textAlign:     "center",
            fontFamily:    ED_TOK.mono,
            fontSize:      11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight:    700,
            color:         ED_TOK.ink,
          }}>
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width:        32, height: 32,
              borderRadius: "50%",
              background:   ED_TOK.bg2,
              border:       "none",
              cursor:       "pointer",
              display:      "grid",
              placeItems:   "center",
              color:        ED_TOK.ink,
              justifySelf:  "end",
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6l-12 12"/>
            </svg>
          </button>
        </div>
        <div>{children}</div>
      </div>
    </>
  );
}

// ── ScoreSheet ───────────────────────────────────────────────────
// Pad mode: 0–9 keys, single-digit replaces + auto-advances. DEL
// erases. NEXT manually advances (You → Opp → next set; on the
// last cell it just dismisses the sheet).
// Tally mode: +/- per side, set selector at top.

function ScoreSheet({ sets, setSets, mode, setMode, activeSet, setActiveSet, activeSide, setActiveSide, onDone }) {
  function advance() {
    if (activeSide === "a") { setActiveSide("b"); return; }
    if (activeSet < sets.length - 1) {
      setActiveSet(activeSet + 1);
      setActiveSide("a");
      return;
    }
    onDone();
  }

  function updCell(val) {
    var next = sets.map(function (s) { return Object.assign({}, s); });
    if (val === "del") {
      next[activeSet][activeSide] = (next[activeSet][activeSide] || "").slice(0, -1);
      setSets(next);
      return;
    }
    // Single-digit entry replaces + auto-advances after a tiny delay
    // so the user sees the digit land before the cursor moves.
    next[activeSet][activeSide] = val;
    setSets(next);
    setTimeout(advance, 90);
  }

  function tallyAdj(side, d) {
    var next = sets.map(function (s) { return Object.assign({}, s); });
    var v = parseInt(next[activeSet][side]) || 0;
    var nv = Math.max(0, v + d);
    next[activeSet][side] = nv === 0 ? "" : String(nv);
    setSets(next);
  }

  function addSet() {
    if (sets.length >= 5) return;
    setSets(sets.concat([{ a: "", b: "" }]));
    setActiveSet(sets.length);
    setActiveSide("a");
  }

  return (
    <div style={{ paddingBottom: 12 }}>
      <div style={{
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "center",
        marginBottom:   12,
      }}>
        <div style={{
          display:      "inline-flex",
          border:       "1px solid " + ED_TOK.line,
          borderRadius: 999,
          padding:      3,
        }}>
          <ModeToggleBtn label="Pad" on={mode === "pad"} onClick={function () { setMode("pad"); }}/>
          <ModeToggleBtn label="Tally" on={mode === "tally"} onClick={function () { setMode("tally"); }}/>
        </div>
        <span style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      10.5,
          fontWeight:    700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color:         ED_TOK.muted,
        }}>
          Set {activeSet + 1} · {activeSide === "a" ? "You" : "Opp"}
        </span>
      </div>

      {mode === "pad" ? (
        <>
          {/* Mini score preview */}
          <div style={{
            background:   ED_TOK.bg2,
            borderRadius: 14,
            padding:      "16px 18px",
            display:      "flex",
            gap:          10,
            alignItems:   "baseline",
            flexWrap:     "wrap",
          }}>
            {sets.map(function (s, i) {
              var aOn = activeSet === i && activeSide === "a";
              var bOn = activeSet === i && activeSide === "b";
              return (
                <span key={i} style={{
                  display:    "inline-flex",
                  alignItems: "baseline",
                  gap:        4,
                  opacity:    activeSet === i ? 1 : 0.5,
                }}>
                  <span
                    onClick={function () { setActiveSet(i); setActiveSide("a"); }}
                    style={miniNumStyle(ED_TOK, aOn)}>
                    {s.a || "·"}
                  </span>
                  <span style={{
                    fontFamily: ED_TOK.display,
                    fontSize:   20,
                    color:      ED_TOK.muted,
                  }}>–</span>
                  <span
                    onClick={function () { setActiveSet(i); setActiveSide("b"); }}
                    style={miniNumStyle(ED_TOK, bOn)}>
                    {s.b || "·"}
                  </span>
                </span>
              );
            })}
            {sets.length < 5 && (
              <button
                onClick={addSet}
                style={{
                  width:        28, height: 28,
                  borderRadius: "50%",
                  border:       "1px dashed " + ED_TOK.lineStrong,
                  background:   "transparent",
                  color:        ED_TOK.muted,
                  cursor:       "pointer",
                  fontSize:     14,
                }}>
                +
              </button>
            )}
          </div>

          {/* Number pad */}
          <div style={{
            display:             "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap:                 8,
            marginTop:           12,
          }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) {
              return <PadKey key={n} onClick={function () { updCell(String(n)); }}>{n}</PadKey>;
            })}
            <PadKey variant="del" onClick={function () { updCell("del"); }}>DEL</PadKey>
            <PadKey onClick={function () { updCell("0"); }}>0</PadKey>
            <PadKey variant="ok" onClick={advance}>NEXT</PadKey>
          </div>
        </>
      ) : (
        <>
          {/* Set selector */}
          <div style={{
            display:        "flex",
            gap:            6,
            alignItems:     "center",
            justifyContent: "center",
            marginTop:      6,
          }}>
            {sets.map(function (_, i) {
              var on = activeSet === i;
              return (
                <button key={i}
                  onClick={function () { setActiveSet(i); }}
                  style={{
                    width:        28, height: 28,
                    borderRadius: 8,
                    border:       "1px solid " + (on ? ED_TOK.ink : ED_TOK.line),
                    background:   on ? ED_TOK.ink : "transparent",
                    color:        on ? ED_TOK.bg : ED_TOK.ink,
                    fontFamily:   ED_TOK.mono,
                    fontSize:     11,
                    fontWeight:   700,
                    cursor:       "pointer",
                  }}>{i + 1}</button>
              );
            })}
            {sets.length < 5 && (
              <button
                onClick={addSet}
                style={{
                  width:        28, height: 28,
                  borderRadius: 8,
                  border:       "1px dashed " + ED_TOK.lineStrong,
                  background:   "transparent",
                  color:        ED_TOK.muted,
                  fontFamily:   ED_TOK.mono,
                  fontSize:     11,
                  fontWeight:   700,
                  cursor:       "pointer",
                }}>+</button>
            )}
          </div>

          {/* Tally cards */}
          <div style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr",
            gap:                 10,
            marginTop:           14,
          }}>
            <TallyCol label="You"      value={sets[activeSet]?.a || 0} onMinus={function(){ tallyAdj("a", -1); }} onPlus={function(){ tallyAdj("a", +1); }}/>
            <TallyCol label="Opponent" value={sets[activeSet]?.b || 0} onMinus={function(){ tallyAdj("b", -1); }} onPlus={function(){ tallyAdj("b", +1); }}/>
          </div>
        </>
      )}

      <button
        onClick={onDone}
        style={Object.assign({}, primaryBtn(ED_TOK, false), { width: "100%", marginTop: 18 })}>
        Done
      </button>
    </div>
  );
}

function ModeToggleBtn({ label, on, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background:    on ? ED_TOK.ink : "transparent",
        color:         on ? ED_TOK.bg : ED_TOK.ink2,
        border:        "none",
        padding:       "7px 12px",
        borderRadius:  999,
        fontFamily:    ED_TOK.mono,
        fontSize:      10.5,
        fontWeight:    700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        cursor:        "pointer",
      }}>
      {label}
    </button>
  );
}

function PadKey({ children, onClick, variant }) {
  var ok = variant === "ok";
  var del = variant === "del";
  return (
    <button
      onClick={onClick}
      style={{
        height:       56,
        background:   ok ? ED_TOK.ink : ED_TOK.bg2,
        border:       "1px solid " + (ok ? ED_TOK.ink : ED_TOK.line),
        borderRadius: 14,
        fontFamily:   del || ok ? ED_TOK.mono : ED_TOK.display,
        fontSize:     del || ok ? 12 : 26,
        fontWeight:   ok ? 700 : 500,
        letterSpacing: del || ok ? "0.16em" : 0,
        textTransform: del || ok ? "uppercase" : "none",
        color:        ok ? ED_TOK.bg : ED_TOK.ink,
        cursor:       "pointer",
        transition:   "100ms",
      }}
      onMouseEnter={function (e) {
        if (ok) return;
        e.currentTarget.style.background = ED_TOK.ink;
        e.currentTarget.style.color = ED_TOK.bg;
      }}
      onMouseLeave={function (e) {
        if (ok) return;
        e.currentTarget.style.background = ED_TOK.bg2;
        e.currentTarget.style.color = ED_TOK.ink;
      }}>
      {children}
    </button>
  );
}

function TallyCol({ label, value, onMinus, onPlus }) {
  return (
    <div style={{
      background:    ED_TOK.bg2,
      border:        "1px solid " + ED_TOK.line,
      borderRadius:  18,
      padding:       18,
      textAlign:     "center",
      display:       "flex",
      flexDirection: "column",
      gap:           12,
    }}>
      <span style={{
        fontFamily:    ED_TOK.mono,
        fontSize:      10.5,
        fontWeight:    700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color:         ED_TOK.muted,
      }}>{label}</span>
      <span style={{
        fontFamily:    ED_TOK.display,
        fontSize:      80,
        fontWeight:    500,
        letterSpacing: "-0.05em",
        lineHeight:    0.9,
      }}>{value}</span>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <TallyBtn onClick={onMinus}>−</TallyBtn>
        <TallyBtn onClick={onPlus}>+</TallyBtn>
      </div>
    </div>
  );
}

function TallyBtn({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width:        48, height: 48,
        borderRadius: "50%",
        background:   ED_TOK.bg,
        border:       "1px solid " + ED_TOK.lineStrong,
        fontSize:     22,
        cursor:       "pointer",
        color:        ED_TOK.ink,
      }}
      onMouseEnter={function (e) {
        e.currentTarget.style.background = ED_TOK.ink;
        e.currentTarget.style.color = ED_TOK.bg;
        e.currentTarget.style.borderColor = ED_TOK.ink;
      }}
      onMouseLeave={function (e) {
        e.currentTarget.style.background = ED_TOK.bg;
        e.currentTarget.style.color = ED_TOK.ink;
        e.currentTarget.style.borderColor = ED_TOK.lineStrong;
      }}>
      {children}
    </button>
  );
}

// ── CompletionSheet ──────────────────────────────────────────────

function CompletionSheet({ value, setValue, onDone }) {
  var items = [
    { id: "completed",    name: "Completed",    sub: "Match played to a normal finish" },
    { id: "time_limited", name: "Time-limited", sub: "Stopped early — partial scores OK (casual only)" },
    { id: "retired",      name: "Retired",      sub: "Someone retired — partial scores OK (casual only)" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map(function (it) {
        return (
          <ContextOption key={it.id}
            on={value === it.id}
            name={it.name}
            sub={it.sub}
            onClick={function () { setValue(it.id); onDone(); }}/>
        );
      })}
    </div>
  );
}

// ── OpponentSheet ────────────────────────────────────────────────

function OpponentSheet({ recents, allPlayers, onPick }) {
  var [q, setQ] = useState("");
  var pool = q ? allPlayers : recents;
  var filtered = q
    ? pool.filter(function (p) { return p.name.toLowerCase().includes(q.toLowerCase()); })
    : pool;
  var headLabel = q
    ? (filtered.length + " " + (filtered.length === 1 ? "result" : "results"))
    : "Recent";

  return (
    <>
      <div style={{
        background:   ED_TOK.bg2,
        border:       "1px solid " + ED_TOK.line,
        borderRadius: 14,
        padding:      "14px 16px",
        display:      "flex",
        alignItems:   "center",
        gap:          10,
        margin:       "4px 0 14px",
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          style={{ color: ED_TOK.muted }}>
          <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <input
          autoFocus
          value={q}
          onChange={function (e) { setQ(e.target.value); }}
          placeholder="Search players or league members"
          style={{
            flex:       1,
            background: "transparent",
            border:     "none",
            outline:    "none",
            fontFamily: ED_TOK.sans,
            fontSize:   15,
            color:      ED_TOK.ink,
          }}/>
      </div>
      <div style={{
        fontFamily:    ED_TOK.mono,
        fontSize:      10.5,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color:         ED_TOK.muted,
        fontWeight:    700,
        margin:        "6px 0 4px",
      }}>
        {headLabel}
      </div>
      {filtered.length === 0 ? (
        <div style={{
          padding:    "16px 0",
          color:      ED_TOK.muted,
          fontFamily: ED_TOK.sans,
          fontSize:   14,
        }}>
          {q
            ? "No matches. Add by name from your friends list."
            : "No recent opponents yet — search by name."}
        </div>
      ) : (
        filtered.map(function (p) {
          return (
            <OpponentRow key={p.id} player={p} onClick={function () { onPick(p); }}/>
          );
        })
      )}
    </>
  );
}

function OpponentRow({ player, onClick }) {
  var [hover, setHover] = useState(false);
  var initials = player.name.split(/\s+/).map(function (s) { return s[0] || ""; }).slice(0, 2).join("").toUpperCase();
  return (
    <button
      onClick={onClick}
      onMouseEnter={function () { setHover(true); }}
      onMouseLeave={function () { setHover(false); }}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            14,
        padding:        hover ? "14px 22px" : "14px 0",
        margin:         hover ? "0 -22px" : 0,
        borderBottom:   "1px solid " + ED_TOK.line,
        background:     hover ? ED_TOK.bg2 : "transparent",
        border:         "none",
        borderTop:      "none",
        borderLeft:     "none",
        borderRight:    "none",
        textAlign:      "left",
        cursor:         "pointer",
        width:          hover ? "auto" : "100%",
        color:          "inherit",
        fontFamily:     "inherit",
        transition:     "background 140ms",
      }}>
      <span style={{
        width:        38, height: 38,
        borderRadius: "50%",
        background:   "linear-gradient(140deg, #C9A876, #8E6C3F)",
        display:      "grid",
        placeItems:   "center",
        fontFamily:   ED_TOK.mono,
        fontWeight:   700,
        fontSize:     12,
        color:        "#1A1410",
        flex:         "0 0 auto",
      }}>{initials || "?"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily:    ED_TOK.display,
          fontSize:      17,
          fontWeight:    600,
          letterSpacing: "-0.02em",
          lineHeight:    1.1,
        }}>{player.name}</div>
        <div style={{
          fontFamily: ED_TOK.mono,
          fontSize:   11,
          color:      ED_TOK.muted,
          marginTop:  2,
        }}>{player.sub || ""}</div>
      </div>
      <span style={{ color: ED_TOK.muted }}>›</span>
    </button>
  );
}

// ── TypeSheet ───────────────────────────────────────────────────

function TypeSheet({ value, setValue, leagueId, setLeagueId, activeLeagues, onDone, onCreateLeague }) {
  var hasLeagues = activeLeagues.length > 0;
  var items = [
    { id: "league",     name: "League",     sub: hasLeagues ? "Counts toward standings" : "Create one to log this" },
    { id: "casual",     name: "Casual",     sub: "Just for stats and history" },
    { id: "tournament", name: "Tournament", sub: "Round in an event" },
  ];

  function pick(id) {
    if (id === "league" && !hasLeagues) return;
    setValue(id);
    if (id !== "league") setLeagueId(null);
    if (id !== "league" || !leagueId) onDone();
    // For league with no pre-selection, leave the sheet open so the
    // user can pick which league.
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map(function (it) {
        var disabled = it.id === "league" && !hasLeagues;
        return (
          <ContextOption key={it.id}
            on={value === it.id}
            disabled={disabled}
            name={it.name}
            sub={it.sub}
            onClick={function () { pick(it.id); }}/>
        );
      })}

      {/* League picker — appears under the row when League is selected */}
      {value === "league" && hasLeagues && (
        <div style={{
          marginTop:    6,
          display:      "flex",
          flexDirection: "column",
          gap:          8,
        }}>
          <span style={{
            fontFamily:    ED_TOK.mono,
            fontSize:      10.5,
            fontWeight:    700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color:         ED_TOK.muted,
          }}>
            Pick a league
          </span>
          {activeLeagues.map(function (lg) {
            return (
              <ContextOption key={lg.id}
                on={leagueId === lg.id}
                name={lg.name || "League"}
                sub={lg.mode === "casual" ? "Casual league" : "Ranked league"}
                onClick={function () {
                  setLeagueId(lg.id);
                  onDone();
                }}/>
            );
          })}
        </div>
      )}

      {/* Empty-state CTA when no leagues exist */}
      {!hasLeagues && (
        <div style={{
          marginTop:     14,
          padding:       20,
          border:        "1px dashed " + ED_TOK.lineStrong,
          borderRadius:  16,
          background:    ED_TOK.bg2,
          display:       "flex",
          flexDirection: "column",
          gap:           12,
          alignItems:    "flex-start",
        }}>
          <span style={{
            fontFamily:    ED_TOK.mono,
            fontSize:      10.5,
            fontWeight:    700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color:         ED_TOK.muted,
          }}>
            No league yet
          </span>
          <h3 style={{
            fontFamily:    ED_TOK.display,
            fontSize:      20,
            fontWeight:    600,
            letterSpacing: "-0.02em",
            margin:        0,
            lineHeight:    1.1,
          }}>
            Start a league with friends.
          </h3>
          <p style={{
            fontFamily: ED_TOK.sans,
            fontSize:   13.5,
            color:      ED_TOK.muted,
            margin:     0,
            lineHeight: 1.5,
          }}>
            A league lets you track standings and run a season together. Takes a minute.
          </p>
          <button
            onClick={onCreateLeague}
            style={{
              background:    ED_TOK.ink,
              color:         ED_TOK.bg,
              border:        "none",
              borderRadius:  999,
              padding:       "11px 18px",
              fontFamily:    ED_TOK.mono,
              fontSize:      11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight:    700,
              cursor:        "pointer",
            }}>
            Create league →
          </button>
        </div>
      )}
    </div>
  );
}

function ContextOption({ on, disabled, name, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           14,
        padding:       "16px 18px",
        background:    on ? ED_TOK.ink : ED_TOK.bg2,
        border:        "1px solid " + (on ? ED_TOK.ink : ED_TOK.line),
        borderRadius:  16,
        cursor:        disabled ? "default" : "pointer",
        width:         "100%",
        textAlign:     "left",
        color:         on ? ED_TOK.bg : ED_TOK.ink,
        fontFamily:    "inherit",
        opacity:       disabled ? 0.55 : 1,
      }}>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily:    ED_TOK.display,
          fontSize:      18,
          fontWeight:    600,
          letterSpacing: "-0.02em",
          lineHeight:    1.1,
        }}>
          {name}
        </div>
        <div style={{
          fontFamily: ED_TOK.mono,
          fontSize:   11,
          opacity:    0.7,
          marginTop:  3,
        }}>
          {sub}
        </div>
      </div>
    </button>
  );
}

// ── DetailsSheet ────────────────────────────────────────────────

function DetailsSheet({ details, setDetails, onDone }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <FieldGroup label="Court / location">
        <FieldInput
          placeholder="Rose Bay Tennis Club"
          value={details.court}
          onChange={function (e) { setDetails(Object.assign({}, details, { court: e.target.value })); }}
        />
      </FieldGroup>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <FieldGroup label="Date">
          <FieldInput
            type="date"
            value={details.date}
            onChange={function (e) { setDetails(Object.assign({}, details, { date: e.target.value })); }}
          />
        </FieldGroup>
        <FieldGroup label="Time">
          <FieldInput
            type="time"
            value={details.time}
            onChange={function (e) { setDetails(Object.assign({}, details, { time: e.target.value })); }}
          />
        </FieldGroup>
      </div>

      <FieldGroup label="Notes">
        <textarea
          placeholder="Windy day, came back from 1-4…"
          value={details.notes}
          onChange={function (e) { setDetails(Object.assign({}, details, { notes: e.target.value })); }}
          style={{
            background:    "transparent",
            border:        "none",
            borderBottom:  "1.5px solid " + ED_TOK.lineStrong,
            padding:       "12px 0",
            fontFamily:    ED_TOK.sans,
            fontSize:      16,
            letterSpacing: 0,
            lineHeight:    1.5,
            color:         ED_TOK.ink,
            outline:       "none",
            width:         "100%",
            resize:        "none",
            minHeight:     80,
          }}
          onFocus={function (e) { e.target.style.borderBottomColor = ED_TOK.ink; }}
          onBlur={function (e) { e.target.style.borderBottomColor = ED_TOK.lineStrong; }}
        />
      </FieldGroup>

      <button
        onClick={onDone}
        style={Object.assign({}, primaryBtn(ED_TOK, false), { marginTop: 6 })}>
        Save
      </button>
    </div>
  );
}

function FieldGroup({ label, children }) {
  return (
    <div>
      <div style={{
        fontFamily:    ED_TOK.mono,
        fontSize:      10.5,
        fontWeight:    700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color:         ED_TOK.muted,
        marginBottom:  -10,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function FieldInput(props) {
  return (
    <input
      {...props}
      style={{
        background:    "transparent",
        border:        "none",
        borderBottom:  "1.5px solid " + ED_TOK.lineStrong,
        padding:       "12px 0",
        fontFamily:    ED_TOK.display,
        fontSize:      22,
        fontWeight:    500,
        letterSpacing: "-0.02em",
        color:         ED_TOK.ink,
        outline:       "none",
        width:         "100%",
        marginTop:     14,
      }}
      onFocus={function (e) { e.target.style.borderBottomColor = ED_TOK.ink; }}
      onBlur={function (e)  { e.target.style.borderBottomColor = ED_TOK.lineStrong; }}
    />
  );
}

// ── MatchCelebration ────────────────────────────────────────────

function MatchCelebration({ data, onDone }) {
  // Slides up from the bottom on mount; unmounts when null.
  if (!data) return null;
  var won = data.won;
  var firstName = data.opp && data.opp.name ? data.opp.name.split(/\s+/)[0] : "your opponent";
  var pendingMsg = data.type === "casual" && data.status === "confirmed"
    ? "Logged. No rating impact for casual matches."
    : "We've sent this to " + firstName + " to confirm. Your rating updates once they say yes.";

  return (
    <div style={{
      position:       "fixed",
      inset:          0,
      background:     ED_TOK.ink,
      color:          ED_TOK.bg,
      zIndex:         300,
      display:        "flex",
      flexDirection:  "column",
      animation:      "csSheetIn 480ms cubic-bezier(0.22, 1, 0.36, 1) backwards",
      overflowY:      "auto",
    }}>
      <div style={{
        display:        "flex",
        justifyContent: "flex-end",
        padding:        "calc(14px + env(safe-area-inset-top, 0px)) 22px 0",
      }}>
        <button
          onClick={onDone}
          aria-label="Close"
          style={{
            width:        32, height: 32,
            borderRadius: "50%",
            background:   "rgba(240,233,218,0.1)",
            border:       "1px solid rgba(240,233,218,0.18)",
            color:        ED_TOK.bg,
            display:      "grid",
            placeItems:   "center",
            cursor:       "pointer",
            fontSize:     18,
            lineHeight:   0.8,
            fontFamily:   ED_TOK.display,
            paddingBottom: 3,
          }}>
          ×
        </button>
      </div>

      <div style={{
        flex:           1,
        padding:        "12px 22px 32px",
        display:        "flex",
        flexDirection:  "column",
        justifyContent: "center",
      }}>
        <div style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color:         "rgba(240,233,218,0.6)",
          fontWeight:    600,
          marginBottom:  14,
        }}>
          {data.status === "confirmed" ? "Match logged" : "Match logged · awaiting confirmation"}
        </div>
        <h1 style={{
          fontFamily:    ED_TOK.display,
          fontSize:      "clamp(64px, 22vw, 92px)",
          fontWeight:    500,
          letterSpacing: "-0.05em",
          lineHeight:    0.9,
          margin:        0,
          color:         won ? "#B8E6C2" : "#F0B5A8",
        }}>
          {won ? "Nice win." : "Tough one."}
        </h1>
        <p style={{
          fontFamily:    ED_TOK.display,
          fontSize:      26,
          fontWeight:    400,
          letterSpacing: "-0.02em",
          margin:        "18px 0 0",
          color:         "rgba(240,233,218,0.78)",
        }}>
          vs. {data.opp?.name || "—"}
        </p>
        <div style={{
          fontFamily:    ED_TOK.display,
          fontSize:      "clamp(40px, 14vw, 56px)",
          fontWeight:    500,
          letterSpacing: "-0.04em",
          margin:        "14px 0 30px",
          color:         ED_TOK.bg,
          lineHeight:    1,
        }}>
          {data.score}
        </div>
        {data.status === "pending_confirmation" && (
          <div style={{
            display:       "inline-flex",
            alignItems:    "baseline",
            gap:           8,
            padding:       "12px 18px",
            background:    "rgba(240,233,218,0.08)",
            borderRadius:  999,
            fontFamily:    ED_TOK.mono,
            fontSize:      12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color:         "rgba(240,233,218,0.85)",
            fontWeight:    600,
            alignSelf:     "flex-start",
          }}>
            <span>Pending</span>
            <span style={{
              fontFamily:    ED_TOK.display,
              fontSize:      14,
              fontWeight:    600,
              letterSpacing: "-0.02em",
              color:         "rgba(240,233,218,0.85)",
            }}>
              · awaiting confirmation
            </span>
          </div>
        )}
        <p style={{
          marginTop:  26,
          fontFamily: ED_TOK.sans,
          fontSize:   13,
          color:      "rgba(240,233,218,0.55)",
          lineHeight: 1.5,
        }}>
          {pendingMsg}
        </p>
      </div>

      <div style={{
        display: "flex",
        gap:     10,
        padding: "14px 22px calc(28px + env(safe-area-inset-bottom, 0px))",
      }}>
        <button
          onClick={onDone}
          style={{
            flex:          1,
            background:    ED_TOK.bg,
            color:         ED_TOK.ink,
            border:        "none",
            borderRadius:  999,
            padding:       16,
            fontFamily:    ED_TOK.mono,
            fontSize:      12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight:    700,
            cursor:        "pointer",
          }}>
          Done
        </button>
      </div>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────

function topIconBtn(tok, justify) {
  return {
    width:        34, height: 34,
    borderRadius: "50%",
    background:   "transparent",
    border:       "1px solid " + tok.line,
    display:      "grid",
    placeItems:   "center",
    color:        tok.ink,
    cursor:       "pointer",
    justifySelf:  justify === "end" ? "end" : (justify === "start" ? "start" : "center"),
    transition:   "background 160ms",
  };
}

function primaryBtn(tok, disabled) {
  return {
    background:    tok.ink,
    color:         tok.bg,
    border:        "none",
    borderRadius:  999,
    padding:       18,
    fontFamily:    tok.mono,
    fontSize:      12,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    fontWeight:    700,
    cursor:        disabled ? "not-allowed" : "pointer",
    opacity:       disabled ? 0.3 : 1,
    transition:    "160ms",
    display:       "inline-flex",
    alignItems:    "center",
    justifyContent: "center",
    gap:           10,
    width:         "100%",
  };
}

function miniNumStyle(tok, on) {
  return {
    fontFamily:    tok.display,
    fontSize:      32,
    fontWeight:    500,
    letterSpacing: "-0.03em",
    color:         tok.ink,
    cursor:        "pointer",
    borderBottom:  "2px solid " + (on ? tok.accent : "transparent"),
  };
}

function labelForType(type, leagueId, activeLeagues) {
  if (!type) return null;
  if (type === "casual") return "Casual match";
  if (type === "tournament") return "Tournament";
  if (type === "league") {
    if (!leagueId) return "League · pick one";
    var lg = activeLeagues.find(function (l) { return l.id === leagueId; });
    return lg ? "League · " + lg.name : "League";
  }
  return null;
}

function subForType(type, leagueId, activeLeagues) {
  if (type === "league" && leagueId) {
    var lg = activeLeagues.find(function (l) { return l.id === leagueId; });
    if (lg) return lg.mode === "casual" ? "Casual league standings" : "Ranked league standings";
  }
  if (type === "league" && !leagueId) return "Counts toward standings";
  if (type === "casual") return "Stats only";
  if (type === "tournament") return "Tournament round";
  return null;
}

function labelForCompletion(c) {
  if (c === "completed")    return "Completed";
  if (c === "time_limited") return "Time-limited";
  if (c === "retired")      return "Retired";
  return "Completed";
}

function submitHint(ready, completed, opp, type, leagueId, saving) {
  if (saving) return "Saving…";
  if (ready) return "Ready to log";
  if (completed === 0) return "Score, opponent, type";
  if (!opp) return "Pick an opponent";
  if (!type) return "Pick match type";
  if (type === "league" && !leagueId) return "Pick which league";
  return "Almost there";
}

function formatDetailsSummary(details) {
  var bits = [];
  if (details.court) bits.push(details.court);
  if (details.date) {
    var d = new Date(details.date + "T00:00");
    if (!isNaN(d.getTime())) {
      bits.push(d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
    }
  }
  return bits.join(" · ");
}

function quote(text, n) {
  var t = (text || "").trim();
  if (!t) return null;
  if (t.length <= n) return "\"" + t + "\"";
  return "\"" + t.slice(0, n) + "…\"";
}
