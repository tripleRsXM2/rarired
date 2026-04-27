// src/features/scoring/components/MatchComposer.jsx
//
// Orchestrator for the redesigned Log Match composer body. Receives
// every piece of state + every callback from ScoreModal and lays them
// out in the new editorial hierarchy:
//
//   1. Matchup header (you VS opponent — embeds OpponentPicker on the
//      casual+freetext path, chip-display elsewhere)
//   2. Scoreboard hero (players-as-rows, sets-as-cols, inline tb)
//   3. Outcome strip — Win/Loss + live validation + one-set notice
//   4. Match-type toggle (when both players are linked)
//   5. Completion type (casual only)
//   6. League selector (when eligible)
//   7. Invite-to-confirm toggle (casual + freetext only)
//   8. Collapsible "Add details" — date / venue / court
//   9. Error strip
//  10. Casual-fallback offer
//
// Slice 1 of the Log-Match redesign — pure structural lift. Validator,
// submit logic, state shape, and persistent fields are unchanged.

import { useState, useEffect } from "react";
import { inputStyle } from "../../../lib/theme.js";
import { COURTS } from "../../map/data/courts.js";
import { ONE_SET_RATING_NOTICE } from "../../rating/copy.js";
import { formatMatchScore } from "../utils/tennisScoreValidation.js";
import MatchupHeader from "./MatchupHeader.jsx";
import OpponentPicker from "./OpponentPicker.jsx";
import ScoreboardInput from "./ScoreboardInput.jsx";

// Slice 2 — derive the winner from the set scores when the match has
// a clear outcome. Returns "win" | "loss" | null.
//
// Rules:
//   - completion='retired'      → null  (retiree can be sets-ahead)
//   - completion='time_limited' → null  (sets-won doesn't define winner)
//   - any blank / NaN cell      → ignored (only counts fully-typed sets)
//   - tied set count            → null  (ambiguous — let user pick)
//   - otherwise                 → whoever won more sets, in viewer frame
//
// Used by the composer to (a) hide the manual Win/Loss buttons when the
// outcome is unambiguous + completed, and (b) auto-sync scoreDraft.result
// so the rest of the system (validator, submit, finish moment) sees the
// derived value without relying on the user to tap a button. Manual
// buttons stay visible whenever this returns null.
function deriveResultFromSets(sets, completionType) {
  if (completionType === 'retired' || completionType === 'time_limited') return null;
  if (!sets || !sets.length) return null;
  var yWins = 0, tWins = 0;
  for (var i = 0; i < sets.length; i++) {
    var s = sets[i];
    var yStr = s.you  == null ? "" : String(s.you).trim();
    var tStr = s.them == null ? "" : String(s.them).trim();
    if (yStr === "" || tStr === "") continue;
    var y = Number(yStr), t = Number(tStr);
    if (!Number.isFinite(y) || !Number.isFinite(t)) continue;
    if (y === t) continue;
    if (y > t) yWins++; else tWins++;
  }
  if (yWins === 0 && tWins === 0) return null;
  if (yWins === tWins) return null;
  return yWins > tWins ? 'win' : 'loss';
}

// Sort COURTS so venues in the viewer's own suburb float to the top, then
// same-zone, then alphabetical. Mirrors the helper that lived in the old
// ScoreModal — kept here so the composer is self-contained.
function sortCourtsForViewer(viewerSuburb) {
  var vs = (viewerSuburb || "").trim().toLowerCase();
  var myZone = null;
  if (vs) {
    var hit = COURTS.find(function (c) { return (c.suburb || "").toLowerCase() === vs; });
    if (hit) myZone = hit.zone;
  }
  return COURTS.slice().sort(function (a, b) {
    var aSub = (a.suburb || "").toLowerCase();
    var bSub = (b.suburb || "").toLowerCase();
    var aTier = vs && aSub === vs ? 0 : (myZone && a.zone === myZone ? 1 : 2);
    var bTier = vs && bSub === vs ? 0 : (myZone && b.zone === myZone ? 1 : 2);
    if (aTier !== bTier) return aTier - bTier;
    return a.name.localeCompare(b.name);
  });
}

export default function MatchComposer({
  t,
  // Modal context
  scoreModal,
  isResubmit,
  isVerified,
  // Viewer (for the matchup header "you" side)
  viewerProfile,
  viewerSuburb,
  // Score draft
  scoreDraft, setScoreDraft,
  // Casual opponent state
  casualOppName, setCasualOppName,
  casualOppId,   setCasualOppId,
  showOppDrop,   setShowOppDrop,
  // Lists
  friends, suggestedPlayers,
  myLeagues, opponentLeagueIds,
  // When set, the score modal was opened locked to a specific league
  // (LeaguesPanel "+ Log match" button). Renders the league as a
  // read-only chip + hides the match-type picker (forced to the
  // league's mode). See openLogMatchInLeague in App.jsx.
  lockedLeague,
  // Validation / save signals
  liveValidation,
  saveError,
  casualFallbackOffer,
  saving,
  onSaveCasualFallback, // () => void — fires "save as casual time-limited"
}) {
  var iStyle = inputStyle(t);

  // Slice 2 — auto-sync scoreDraft.result with the derived outcome
  // whenever the score becomes unambiguous. Manual Win/Loss buttons
  // stay hidden in this state; the user only sees + interacts with
  // them when the score is empty / tied / retired / time-limited.
  var derivedResult = deriveResultFromSets(scoreDraft.sets, scoreDraft.completionType);
  useEffect(function () {
    if (derivedResult && scoreDraft.result !== derivedResult) {
      setScoreDraft(function (d) { return Object.assign({}, d, { result: derivedResult }); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedResult]);

  // Collapsible "Add details" — closed by default. We treat the section
  // as auto-open if any field already has a non-default value, so a
  // resubmit / pre-filled draft always shows what's there.
  var hasDetailDefaults = (
    (scoreDraft.venue && scoreDraft.venue.trim()) ||
    (scoreDraft.court && scoreDraft.court.trim()) ||
    // Date is always set; treat "today" as the default and only pre-open
    // when the draft holds a non-today date (rare — resubmit).
    (scoreDraft.date && scoreDraft.date !== new Date().toISOString().slice(0, 10))
  );
  var [detailsOpen, setDetailsOpen] = useState(!!hasDetailDefaults);

  // Effective match type used by the composer's display rules. Mirrors
  // the same heuristic ScoreModal uses for liveValidation; keeping the
  // logic here means the composer can render context-aware bits without
  // a roundtrip prop.
  var effectiveMatchType = scoreDraft.matchType
    || ((isResubmit || casualOppId) ? 'ranked' : 'casual');
  if (effectiveMatchType === 'ranked' && !casualOppId && !isResubmit) {
    effectiveMatchType = 'casual';
  }

  // Resolve the linked opponent profile for the matchup header, if
  // we have one (resubmit or selected friend). Used purely for avatar.
  var linkedOppProfile = null;
  if (isResubmit) {
    // Resubmit context doesn't carry a profile blob — header shows just
    // the name. That's fine.
    linkedOppProfile = null;
  } else if (casualOppId) {
    linkedOppProfile = (friends || []).concat(suggestedPlayers || [])
      .find(function (u) { return u.id === casualOppId; }) || null;
  } else if (scoreModal && scoreModal.opponentId) {
    // Tournament-bracket / challenge-conversion path: ScoreModal carries
    // the opp identity in its own context. We don't have a profile blob
    // either way — header gracefully falls back to initials.
    linkedOppProfile = null;
  }

  // Build the "you" name from the viewer profile. Fallbacks land on a
  // generic label so the header still reads clean if the profile hasn't
  // hydrated yet.
  var youName = (viewerProfile && viewerProfile.name) || "You";

  // Decide what fills the right side of the matchup header.
  // - Resubmit: opp is locked, render chip (use scoreModal.oppName).
  // - Tournament / challenge: same — locked linked opp.
  // - Casual + freetext: embed the OpponentPicker.
  // - Casual + selected friend: OpponentPicker still owns the chip
  //   render so the user can clear and re-pick.
  var oppSlot = null;
  var oppChipName = null;
  if (isResubmit) {
    oppChipName = scoreModal.oppName || "Opponent";
  } else if (scoreModal && scoreModal.casual) {
    // Casual modal — ScoreModal opens this for "Log Match" + challenge
    // conversions. The OpponentPicker handles both the typing and the
    // selected-friend chip.
    oppSlot = (
      <OpponentPicker
        t={t}
        value={casualOppName}
        onChangeName={function (v) {
          setCasualOppName(v);
          setCasualOppId(null);
        }}
        selectedId={casualOppId}
        onSelect={function (id, name) {
          setCasualOppName(name || "");
          setCasualOppId(id || null);
          setShowOppDrop(false);
        }}
        onClear={function () {
          setCasualOppName("");
          setCasualOppId(null);
          setShowOppDrop(false);
        }}
        friends={friends}
        suggestedPlayers={suggestedPlayers}
        showDrop={showOppDrop}
        setShowDrop={setShowOppDrop}
      />
    );
  } else {
    // Tournament / non-casual context — opp is always set.
    oppChipName = scoreModal.oppName || "Opponent";
  }

  var headerSubtitle = isResubmit
    ? "Edit & resubmit"
    : (scoreModal.tournName && scoreModal.tournName !== "Casual Match"
        ? scoreModal.tournName
        : null);

  var sortedCourts = sortCourtsForViewer(viewerSuburb);
  var currentVenue = scoreDraft.venue || "";
  var matchesKnownCourt = !!currentVenue && sortedCourts.some(function (c) { return c.name === currentVenue; });
  var isCustomVenue = !!currentVenue && !matchesKnownCourt;
  var venueSelectValue = matchesKnownCourt ? currentVenue : (isCustomVenue ? "__custom__" : "");

  function handleVenueSelect(e) {
    var v = e.target.value;
    if (v === "__custom__") {
      setScoreDraft(function (d) { return Object.assign({}, d, { venue: d.venue || "" }); });
      return;
    }
    setScoreDraft(function (d) { return Object.assign({}, d, { venue: v }); });
  }

  // ---------- Render ----------
  return (
    <>
      <MatchupHeader
        t={t}
        youName={youName}
        youProfile={viewerProfile}
        oppName={oppChipName}
        oppProfile={linkedOppProfile}
        oppSlot={oppSlot}
        subtitle={headerSubtitle}
      />

      {/* Resubmit hint strip — replaces the old "corrected result will
          be sent…" card, but moves it under the matchup framing so the
          user reads it at the right moment. */}
      {isResubmit && (
        <div style={{
          marginBottom: 14,
          paddingTop: 10, paddingBottom: 10,
          borderBottom: "1px solid " + t.border,
          fontSize: 11, color: t.textSecondary,
          letterSpacing: "-0.1px", lineHeight: 1.5,
        }}>
          Corrected result will be sent to <strong style={{ color: t.text }}>{scoreModal.oppName}</strong> to confirm again.
        </div>
      )}

      {/* SCOREBOARD — the hero. */}
      <ScoreboardInput
        t={t}
        sets={scoreDraft.sets}
        onSetsChange={function (next) {
          setScoreDraft(function (d) { return Object.assign({}, d, { sets: next }); });
        }}
        youLabel="You"
        oppLabel={(casualOppName && casualOppName.trim()) ? casualOppName.trim().split(" ")[0] : "Opp"}
      />

      {/* Live validation caption — under scoreboard for tight feedback loop. */}
      {liveValidation && !liveValidation.ok && (
        <CaptionStrip t={t} tag="Invalid" tagColor={t.red} message={liveValidation.message} />
      )}
      {liveValidation && liveValidation.ok && liveValidation.completionStatus === "partial" && (
        <CaptionStrip
          t={t}
          tag={scoreDraft.completionType === 'retired' ? 'Retired' : 'Time-limited'}
          tagColor={t.textTertiary}
          message="Saved as casual. Won't affect rating."
        />
      )}
      {liveValidation && liveValidation.ok
        && liveValidation.completionStatus !== "partial"
        && (function () {
          var clean = (scoreDraft.sets || []).filter(function (s) { return s.you !== "" || s.them !== ""; });
          if (clean.length !== 1) return null;
          if (effectiveMatchType !== 'ranked') return null;
          return <CaptionStrip t={t} tag="One set" tagColor={t.orange} message={ONE_SET_RATING_NOTICE} />;
        })()
      }

      {/* RESULT — Slice 2: derive from scoreboard when unambiguous,
          fall back to manual Win/Loss buttons when the score is empty,
          tied, or the match is retired / time-limited (cases where the
          set count alone doesn't define the winner). */}
      {derivedResult ? (
        <div style={{
          marginTop: 14, marginBottom: 16,
          paddingTop: 12, paddingBottom: 12,
          borderTop: "1px solid " + t.border,
          borderBottom: "1px solid " + t.border,
        }}>
          <div style={{
            display: "flex", alignItems: "baseline", gap: 10,
            marginBottom: 4,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 800,
              color: t.textTertiary, letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}>
              Outcome
            </span>
            <span style={{
              fontSize: 16, fontWeight: 800,
              color: derivedResult === 'win' ? t.green : t.red,
              letterSpacing: "0.04em", textTransform: "uppercase",
            }}>
              You {derivedResult === 'win' ? 'win' : 'lose'}
            </span>
          </div>
          <div style={{
            fontSize: 13, color: t.textSecondary,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.1px",
          }}>
            {formatMatchScore(scoreDraft.sets) || ""}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14, marginBottom: 16 }}>
          <label style={labelStyle(t)}>Result</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { id: "win",  l: "Win",  c: t.green },
              { id: "loss", l: "Loss", c: t.red   },
            ].map(function (r) {
              var on = scoreDraft.result === r.id;
              return (
                <button key={r.id}
                  onClick={function () {
                    setScoreDraft(function (d) { return Object.assign({}, d, { result: r.id }); });
                  }}
                  style={{
                    flex: 1, padding: "12px", borderRadius: 9,
                    border: "1px solid " + (on ? r.c : t.border),
                    background: on ? r.c + "18" : "transparent",
                    fontSize: 15, fontWeight: on ? 700 : 400,
                    color: on ? r.c : t.textSecondary,
                    cursor: "pointer",
                  }}>
                  {r.l}
                </button>
              );
            })}
          </div>
          {/* Tiny helper hint when the score is empty — sets context
              for why we're asking. Hidden once a score is being typed. */}
          {(!scoreDraft.sets || scoreDraft.sets.every(function (s) { return s.you === "" && s.them === ""; })) && (
            <div style={{
              fontSize: 10.5, color: t.textTertiary,
              marginTop: 6, lineHeight: 1.4,
              letterSpacing: "-0.05px",
            }}>
              Enter the score above and we'll work out who won.
            </div>
          )}
        </div>
      )}

      {/* MATCH TYPE — only when opponent is a linked friend (Module 7.5).
          Freetext stays casual until the invite-to-confirm flow runs.
          Suppressed entirely when the modal is locked to a league —
          the match-type is forced to the league's mode in that case
          (see openLogMatchInLeague + scoreDraft.matchType setter). */}
      {!isResubmit && scoreModal.casual && casualOppName.trim() && isVerified && !lockedLeague && (function () {
        var current = scoreDraft.matchType || 'ranked';
        function pick(mt) {
          setScoreDraft(function (d) { return Object.assign({}, d, { matchType: mt }); });
        }
        return (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle(t)}>Match type</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { id: 'ranked', label: 'Ranked' },
                { id: 'casual', label: 'Casual' },
              ].map(function (mt) {
                var on = current === mt.id;
                var color = on
                  ? (mt.id === 'ranked' ? t.accent : t.textSecondary)
                  : t.textSecondary;
                var bg = on
                  ? (mt.id === 'ranked' ? t.accentSubtle : t.bgTertiary)
                  : 'transparent';
                var borderC = on
                  ? (mt.id === 'ranked' ? t.accent : t.border)
                  : t.border;
                return (
                  <button key={mt.id} type="button"
                    onClick={function () { pick(mt.id); }}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8,
                      border: '1px solid ' + borderC,
                      background: bg, color: color,
                      fontSize: 12, fontWeight: on ? 700 : 500,
                      cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {mt.label}
                  </button>
                );
              })}
            </div>
            <div style={{
              fontSize: 10.5, color: t.textTertiary,
              marginTop: 6, lineHeight: 1.4,
            }}>
              {current === 'ranked'
                ? 'Counts toward ELO — opponent will confirm to lock it in.'
                : 'Logged for records only — no ELO or W/L impact.'}
            </div>
          </div>
        );
      })()}

      {/* COMPLETION TYPE — casual only. */}
      {(scoreDraft.matchType === 'casual' || (!casualOppId && !isResubmit)) && (
        <div style={{ marginBottom: 16 }}>
          <label style={Object.assign({}, labelStyle(t), { letterSpacing: "0.12em" })}>How it ended</label>
          <div style={{
            display: "flex",
            borderTop: "1px solid " + t.border,
            borderBottom: "1px solid " + t.border,
          }}>
            {[
              { id: 'completed',    label: 'Completed'    },
              { id: 'time_limited', label: 'Time-limited' },
              { id: 'retired',      label: 'Retired'      },
            ].map(function (c, i) {
              var on = (scoreDraft.completionType || 'completed') === c.id;
              return (
                <button key={c.id}
                  onClick={function () {
                    setScoreDraft(function (d) { return Object.assign({}, d, { completionType: c.id }); });
                  }}
                  style={{
                    flex: 1,
                    padding: "10px 6px",
                    background: "transparent",
                    border: "none",
                    borderLeft: i === 0 ? "none" : "1px solid " + t.border,
                    color: on ? t.text : t.textTertiary,
                    fontSize: 11, fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    position: "relative",
                  }}>
                  {c.label}
                  {on && (
                    <span style={{
                      position: "absolute", left: 0, right: 0, bottom: -1, height: 2,
                      background: t.text,
                    }}/>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* LEAGUE — locked chip when the modal opened from the
          per-league "+ Log match" path. The user can't change which
          league this match files into and can't drop it to "No
          Competition". The chip mirrors the visual weight of an
          input row so the form rhythm stays consistent. */}
      {!isResubmit && lockedLeague && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle(t)}>League</label>
          <div style={{
            padding:        "10px 12px",
            borderRadius:   8,
            border:         "1px solid " + t.border,
            background:     t.bgTertiary,
            color:          t.text,
            fontSize:       13,
            fontWeight:     600,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            gap:            10,
          }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lockedLeague.name || "League"}
            </span>
            <span style={{
              flexShrink:     0,
              fontSize:       9,
              fontWeight:     800,
              color:          t.textTertiary,
              letterSpacing:  "0.12em",
              textTransform:  "uppercase",
            }}>
              Locked
            </span>
          </div>
        </div>
      )}

      {/* LEAGUE selector — only when NOT locked to a specific league. */}
      {!lockedLeague && (function () {
        if (isResubmit) return null;
        if (!isVerified) return null;
        var eligible = (myLeagues || []).filter(function (lg) {
          return lg.status === "active"
            && lg.my_status === "active"
            && lg.mode === effectiveMatchType
            && opponentLeagueIds.has(lg.id);
        });
        if (!eligible.length) return null;
        var currentId = scoreDraft.leagueId || "";
        var pickIsStale = currentId && !eligible.some(function (lg) { return lg.id === currentId; });
        if (pickIsStale && currentId) {
          setTimeout(function () {
            setScoreDraft(function (d) { return Object.assign({}, d, { leagueId: null }); });
          }, 0);
        }
        var prompt = effectiveMatchType === 'ranked'
          ? 'Count toward a ranked league?'
          : 'Count toward a casual league?';
        return (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle(t)}>{prompt}</label>
            <select
              value={pickIsStale ? "" : currentId}
              onChange={function (e) {
                var v = e.target.value || null;
                setScoreDraft(function (d) { return Object.assign({}, d, { leagueId: v }); });
              }}
              style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0, appearance: "auto" })}>
              {/* Default no-league option. Reads as a positive
                  framing ("Regular Ranked / Casual") rather than the
                  former "No — just a ranked match" which read like
                  rejecting a question. The "— No Competition"
                  qualifier makes it explicit that the match counts
                  for global stats but not toward any league. */}
              <option value="">
                {effectiveMatchType === "ranked"
                  ? "Regular Ranked — No Competition"
                  : "Regular Casual — No Competition"}
              </option>
              {eligible.map(function (lg) {
                return <option key={lg.id} value={lg.id}>{lg.name}</option>;
              })}
            </select>
          </div>
        );
      })()}

      {/* INVITE-TO-CONFIRM — casual + freetext only. */}
      {!isResubmit && scoreModal.casual && casualOppName.trim() && !isVerified && (function () {
        var on = !!scoreDraft.inviteOpponent;
        return (
          <div style={{
            marginBottom: 16,
            paddingTop: 12, paddingBottom: 12,
            borderTop: "1px solid " + t.border,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <button type="button"
              onClick={function () {
                setScoreDraft(function (d) {
                  return Object.assign({}, d, { inviteOpponent: !on });
                });
              }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "transparent", border: "none",
                padding: 0, cursor: "pointer",
              }}>
              <span style={{
                flexShrink: 0,
                width: 42, height: 24, borderRadius: 12,
                border: "1px solid " + (on ? t.accent : t.border),
                background: on ? t.accent : "transparent",
                position: "relative",
                transition: "background 0.15s, border-color 0.15s",
              }}>
                <span style={{
                  position: "absolute",
                  top: 2, left: on ? 20 : 2,
                  width: 18, height: 18, borderRadius: "50%",
                  background: on ? "#fff" : t.textSecondary,
                  transition: "left 0.15s, background 0.15s",
                }}/>
              </span>
              <span style={{
                fontSize: 11, fontWeight: 800,
                color: t.text, letterSpacing: "0.12em",
                textTransform: "uppercase",
                textAlign: "left",
              }}>
                Invite {casualOppName.trim()} to confirm
              </span>
            </button>
            <div style={{
              fontSize: 11, color: t.textSecondary,
              lineHeight: 1.5, letterSpacing: "-0.1px",
              paddingLeft: 52,
            }}>
              {on
                ? "We'll generate a secure link you can share. They sign in, claim it, then confirm or dispute. The match doesn't affect rating until they confirm."
                : "Without an invite, this match logs as a casual record only — no rating impact, no verification."}
            </div>
          </div>
        );
      })()}

      {/* COLLAPSIBLE — Date / Venue / Court. */}
      <div style={{
        marginBottom: 16,
        borderTop: "1px solid " + t.border,
      }}>
        <button type="button"
          onClick={function () { setDetailsOpen(function (v) { return !v; }); }}
          style={{
            width: "100%",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "transparent", border: "none",
            padding: "12px 0",
            cursor: "pointer",
          }}>
          <span style={{
            fontSize: 10, fontWeight: 800,
            color: t.textSecondary, letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}>
            {detailsOpen ? "Match details" : "+ Add details"}
          </span>
          <span style={{
            fontSize: 12, color: t.textTertiary,
            transform: detailsOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}>
            ▾
          </span>
        </button>
        {detailsOpen && (
          <div style={{ paddingBottom: 4 }}>
            {/* Date */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle(t)}>Date</label>
              <input type="date" value={scoreDraft.date}
                onChange={function (e) {
                  setScoreDraft(function (d) { return Object.assign({}, d, { date: e.target.value }); });
                }}
                style={Object.assign({}, iStyle, { fontSize: 14, marginBottom: 0 })}/>
            </div>

            {/* Venue + Court */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}>
              <div>
                <label style={labelStyle(t)}>Venue</label>
                <select
                  value={venueSelectValue}
                  onChange={handleVenueSelect}
                  style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0, appearance: "auto" })}>
                  <option value="">— Select court —</option>
                  {sortedCourts.map(function (c) {
                    var isLocal = viewerSuburb && (c.suburb || "").toLowerCase() === (viewerSuburb || "").toLowerCase();
                    var label = isLocal
                      ? (c.name + " · " + c.suburb + " ★")
                      : (c.name + " · " + c.suburb);
                    return <option key={c.name} value={c.name}>{label}</option>;
                  })}
                  <option value="__custom__">Custom venue…</option>
                </select>
              </div>
              <div>
                <label style={labelStyle(t)}>Court</label>
                <input value={scoreDraft.court || ""} placeholder="e.g. Court 3"
                  onChange={function (e) {
                    setScoreDraft(function (d) { return Object.assign({}, d, { court: e.target.value }); });
                  }}
                  style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0 })}/>
              </div>
            </div>

            {isCustomVenue && (
              <div style={{ marginTop: 8 }}>
                <input value={currentVenue} placeholder="Type venue name"
                  autoFocus
                  onChange={function (e) {
                    setScoreDraft(function (d) { return Object.assign({}, d, { venue: e.target.value }); });
                  }}
                  style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0 })}/>
                <div style={{
                  fontSize: 10, color: t.textTertiary,
                  marginTop: 4, letterSpacing: "0.02em",
                }}>
                  Can't find your court? Type the venue name here.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ERROR strip */}
      {saveError && (
        <CaptionStrip
          t={t}
          tag="Can't save"
          tagColor={t.red}
          message={saveError}
          messageColor={t.text}
          bordered
        />
      )}

      {/* CASUAL FALLBACK offer */}
      {casualFallbackOffer && (
        <div style={{
          marginBottom: 14,
          paddingTop: 12, paddingBottom: 12,
          borderTop: "1px solid " + t.border,
          borderBottom: "1px solid " + t.border,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 800,
            color: t.orange, letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}>
            Partial score
          </span>
          <span style={{
            fontSize: 13, color: t.text,
            lineHeight: 1.35, letterSpacing: "-0.1px",
          }}>
            This score isn't a completed match, so it can't affect rating. Save as casual time-limited instead?
          </span>
          <button
            onClick={onSaveCasualFallback}
            disabled={saving}
            style={{
              alignSelf: "flex-start",
              marginTop: 2,
              padding: "0 0 2px 0",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid " + t.text,
              color: t.text,
              fontSize: 11, fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
              opacity: saving ? 0.5 : 1,
            }}>
            Save as casual →
          </button>
        </div>
      )}
    </>
  );
}

// Local helpers — kept inside the file to avoid creating a noisy
// shared-style soup until slice 4 settles the final design system.

function labelStyle(t) {
  return {
    fontSize: 10, fontWeight: 700,
    color: t.textSecondary,
    display: "block", marginBottom: 6,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
}

function CaptionStrip({ t, tag, tagColor, message, messageColor, bordered }) {
  return (
    <div style={{
      marginTop: bordered ? 0 : 10,
      marginBottom: bordered ? 12 : 0,
      paddingTop: 10, paddingBottom: bordered ? 10 : 0,
      borderTop: "1px solid " + t.border,
      display: "flex", gap: 10, alignItems: "baseline",
    }}>
      <span style={{
        fontSize: 9, fontWeight: 800,
        color: tagColor, letterSpacing: "0.16em",
        textTransform: "uppercase", flexShrink: 0,
      }}>
        {tag}
      </span>
      <span style={{
        fontSize: 12,
        color: messageColor || t.textSecondary,
        lineHeight: 1.4, letterSpacing: "-0.1px",
      }}>
        {message}
      </span>
    </div>
  );
}
