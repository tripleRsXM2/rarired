// src/features/scoring/components/ScoreModal.jsx
//
// Slim shell for the redesigned Log Match composer (slice 1).
//
// Responsibilities:
//   - Modal chrome (backdrop, card, max-width)
//   - All state (saving / saveError / mismatchAck / finish /
//     casualFallbackOffer / opponentLeagueIds)
//   - Hooks (live validation memo, opponent-league-eligibility effect)
//   - handleSave + supporting validators (buildValidatorOptions,
//     runScoreValidation, winnerBySets) — unchanged from the previous
//     monolithic ScoreModal
//   - Finish-state overlay (MatchFinishMoment / InviteShareCard)
//   - Header (title) + footer (Cancel + contextual Save CTA)
//   - Mounts <MatchComposer/> for the entire form body
//
// Slice 1 of the Log-Match redesign. The form body has been broken
// into MatchupHeader / OpponentPicker / ScoreboardInput / MatchComposer
// — none of which know about save state. All data flow + validation
// stays here, so existing flows (resubmit / invite / casual / league /
// challenge-conversion / tournament) work without touching their
// callers.

import { useState, useMemo, useEffect } from "react";
import { fetchOpponentActiveLeagueIds } from "../../leagues/services/leagueService.js";
import { validateMatchScore, CODES as SCORE_CODES } from "../utils/tennisScoreValidation.js";
import MatchFinishMoment from "./MatchFinishMoment.jsx";
import InviteShareCard from "./InviteShareCard.jsx";
import MatchComposer from "./MatchComposer.jsx";

export default function ScoreModal({
  t, authUser, scoreModal, setScoreModal,
  scoreDraft, setScoreDraft,
  casualOppName, setCasualOppName,
  casualOppId, setCasualOppId,
  showOppDrop, setShowOppDrop,
  friends, suggestedPlayers,
  submitMatch, resubmitMatch, recordResult,
  // Module 6.7 — viewer's suburb drives the court-dropdown priority.
  viewerSuburb,
  // Slice 1 redesign — viewer profile powers the matchup header avatar.
  viewerProfile,
  // Module 7 — leagues the viewer is actively in.
  myLeagues,
}) {
  var [saving, setSaving] = useState(false);
  var [saveError, setSaveError] = useState("");
  // Result/sets mismatch warning — warn once on first save, let the
  // user correct or proceed on the second tap.
  var [mismatchAck, setMismatchAck] = useState(false);
  // Finish-moment payload. When non-null the modal swaps the body for
  // the acknowledgment card (or the InviteShareCard if invite was created).
  var [finish, setFinish] = useState(null);
  // Casual-fallback diagnostic (slice B of Module 7.6) — shown beneath
  // the form when ranked validation fails but a casual time-limited
  // save would pass.
  var [casualFallbackOffer, setCasualFallbackOffer] = useState(null);
  // Opponent's overlapping league memberships — drives league-selector
  // eligibility. Hooked to run on every linked-opponent change.
  var [opponentLeagueIds, setOpponentLeagueIds] = useState(new Set());

  // Live validation memo — recomputes on every relevant draft change.
  // Mirrors the pre-redesign behaviour so the inline Invalid /
  // Time-limited / One-set captions still render under the scoreboard.
  var liveValidation = useMemo(function () {
    if (!scoreDraft || !scoreDraft.sets) return null;
    var clean = scoreDraft.sets.filter(function (s) { return s.you !== "" || s.them !== ""; });
    if (!clean.length) return null;
    var league = scoreDraft.leagueId
      ? (myLeagues || []).find(function (lg) { return lg.id === scoreDraft.leagueId; })
      : null;
    var matchType = scoreDraft.matchType
      || ((scoreModal && scoreModal.resubmit) || casualOppId ? 'ranked' : 'casual');
    if (matchType === 'ranked' && !casualOppId && !(scoreModal && scoreModal.resubmit)) {
      matchType = 'casual';
    }
    var completionType = scoreDraft.completionType || 'completed';
    var allowPartial = (matchType === 'casual') && (completionType !== 'completed');
    return validateMatchScore(clean, {
      matchType: matchType,
      completionType: completionType,
      // null lets the validator auto-derive format from sets count
      // (1 set → one_set, 2+ sets → best_of_3). Leagues still win
      // when present because league.match_format is explicit.
      matchFormat: (league && league.match_format) || null,
      finalSetFormat: (league && league.tiebreak_format === 'super_tiebreak_final')
        ? 'match_tiebreak' : 'normal_set',
      allowPartialScores: allowPartial,
      requireTiebreakDetails: matchType === 'ranked' && completionType === 'completed',
      leagueMode: league ? league.mode : null,
      leagueAllowPartial: false,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scoreDraft && JSON.stringify(scoreDraft.sets),
    scoreDraft && scoreDraft.matchType,
    scoreDraft && scoreDraft.completionType,
    scoreDraft && scoreDraft.leagueId,
    casualOppId, scoreModal && scoreModal.resubmit,
    (myLeagues || []).length,
  ]);

  // Refresh the opponent's league set whenever the linked opponent
  // changes. MUST live above the early-return below so hook order
  // stays stable across modal open/close cycles.
  var isVerifiedForEffect = scoreModal ? (!!scoreModal.resubmit || !!casualOppId) : false;
  useEffect(function () {
    if (!scoreModal) { setOpponentLeagueIds(new Set()); return; }
    if (!isVerifiedForEffect || !casualOppId) { setOpponentLeagueIds(new Set()); return; }
    var candidateIds = (myLeagues || [])
      .filter(function (lg) { return lg.status === "active" && lg.my_status === "active"; })
      .map(function (lg) { return lg.id; });
    if (!candidateIds.length) { setOpponentLeagueIds(new Set()); return; }
    var alive = true;
    fetchOpponentActiveLeagueIds(casualOppId, candidateIds).then(function (r) {
      if (!alive) return;
      if (r.error) { setOpponentLeagueIds(new Set()); return; }
      setOpponentLeagueIds(new Set((r.data || []).map(function (m) { return m.league_id; })));
    });
    return function () { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casualOppId, isVerifiedForEffect, !!scoreModal, (myLeagues || []).length]);

  if (!scoreModal) return null;

  var isResubmit = !!scoreModal.resubmit;
  var isVerified = isResubmit ? true : !!casualOppId;

  // ── helpers ─────────────────────────────────────────────────────────

  // Compute who the sets say won. Skip blanks / NaN. Returns
  // "win" | "loss" | null.
  function winnerBySets(sets) {
    if (!sets || !sets.length) return null;
    var ys = 0, ts = 0;
    sets.forEach(function (s) {
      var yStr = s.you  == null ? "" : String(s.you).trim();
      var tStr = s.them == null ? "" : String(s.them).trim();
      if (yStr === "" || tStr === "") return;
      var y = Number(yStr), th = Number(tStr);
      if (Number.isNaN(y) || Number.isNaN(th)) return;
      if (y === th) return;
      if (y > th) ys++; else ts++;
    });
    if (ys === ts) return null;
    return ys > ts ? "win" : "loss";
  }

  function buildValidatorOptions(forceCasual) {
    var explicitMatchType = scoreDraft.matchType;
    var defaultMatchType  = (isVerified) ? 'ranked' : 'casual';
    var matchType = forceCasual ? 'casual' : (explicitMatchType || defaultMatchType);
    if (matchType === 'ranked' && !isVerified) matchType = 'casual';
    var leagueId = scoreDraft.leagueId || null;
    var league = leagueId
      ? (myLeagues || []).find(function (lg) { return lg.id === leagueId; })
      : null;
    return {
      matchType: matchType,
      completionType: forceCasual ? 'time_limited' : 'completed',
      matchFormat: (league && league.match_format) || null,
      finalSetFormat: (league && league.tiebreak_format === 'super_tiebreak_final')
        ? 'match_tiebreak' : 'normal_set',
      allowPartialScores: !!forceCasual,
      requireTiebreakDetails: !forceCasual && matchType === 'ranked',
      leagueMode: league ? league.mode : null,
      leagueAllowPartial: false,
    };
  }

  function runScoreValidation(forceCasual) {
    var clean = scoreDraft.sets.filter(function (s) { return s.you !== "" || s.them !== ""; });
    var ranked = buildValidatorOptions(false);
    var attempt = forceCasual ? buildValidatorOptions(true) : ranked;
    var rankedResult = validateMatchScore(clean, ranked);
    var attemptResult = forceCasual ? validateMatchScore(clean, attempt) : rankedResult;

    setCasualFallbackOffer(null);

    if (attemptResult.ok) return true;

    if (!forceCasual && rankedResult.code === SCORE_CODES.RANKED_REQUIRES_COMPLETED) {
      var casualOpts = buildValidatorOptions(true);
      var casualResult = validateMatchScore(clean, casualOpts);
      if (casualResult.ok) {
        setCasualFallbackOffer({ code: rankedResult.code, message: rankedResult.message });
        setSaveError(rankedResult.message);
        return false;
      }
    }
    setSaveError(attemptResult.message);
    return false;
  }

  async function handleSave(opts) {
    var forceCasual = !!(opts && opts.forceCasual);
    setSaveError("");
    var clean = scoreDraft.sets.filter(function (s) { return s.you !== "" || s.them !== ""; });
    if (!clean.length) { setSaveError("Add at least one set score."); return; }

    if (!runScoreValidation(forceCasual)) return;

    var whoWon = winnerBySets(clean);
    if (whoWon && whoWon !== scoreDraft.result && !mismatchAck) {
      setMismatchAck(true);
      setSaveError(
        "Heads up — your set scores say you " + (whoWon === "win" ? "won" : "lost") +
        " but you picked " + (scoreDraft.result === "win" ? "Win" : "Loss") +
        ". Tap Save again to keep it, or fix the scores above."
      );
      return;
    }

    setSaving(true);

    if (isResubmit) {
      var resubRes = await resubmitMatch(scoreModal.match, scoreDraft);
      setSaving(false);
      if (resubRes && resubRes.error) {
        setSaveError(typeof resubRes.error === 'string' ? resubRes.error : "Could not resubmit — please try again.");
        return;
      }
      setFinish({
        status: "pending_confirmation",
        result: scoreDraft.result,
        opponentName: scoreModal.oppName || (scoreModal.match && scoreModal.match.oppName) || "your opponent",
      });
      return;
    }

    var oppName = scoreModal.casual ? (casualOppName.trim() || "Unknown") : scoreModal.oppName;
    var opponentId = scoreModal.casual ? casualOppId : (scoreModal.opponentId || null);

    var draftForSubmit = forceCasual
      ? Object.assign({}, scoreDraft, { matchType: 'casual', leagueId: null })
      : scoreDraft;

    var res = await submitMatch({
      scoreModal,
      scoreDraft: draftForSubmit,
      oppName,
      opponentId,
    });
    setSaving(false);

    if (res && res.error) {
      if (res.error === 'duplicate') {
        setSaveError(res.message || "This match is already logged.");
      } else if (res.error === 'rating_uninitialised') {
        setSaveError(res.message || "Set your starting skill level before logging ranked matches.");
      } else if (res.error !== 'not_authenticated') {
        setSaveError(typeof res.error === 'string' ? res.error : "Could not save match — please try again.");
      }
      return;
    }

    if (scoreModal.winnerId1 && scoreModal.winnerId2) {
      var winnerId = scoreDraft.result === "win" ? scoreModal.winnerId1 : scoreModal.winnerId2;
      recordResult(scoreModal.tournId, scoreModal.roundIdx, scoreModal.matchId, winnerId);
    }

    setFinish({
      status: res && res.status ? res.status : "confirmed",
      result: scoreDraft.result,
      opponentName: oppName,
      invite: res && res.invite ? res.invite : null,
      matchId: res && res.matchId ? res.matchId : null,
    });
  }

  function closeFromFinish() {
    setFinish(null);
    setScoreModal(null);
    setCasualOppName("");
    setCasualOppId(null);
  }

  function backdropClick() {
    if (finish) return;
    setScoreModal(null);
    if (!isResubmit) { setCasualOppName(""); setCasualOppId(null); }
  }

  // Slice 4 — fully contextual CTA copy. Drives from the same signals
  // the composer uses internally (matchType, invite-toggle, completion)
  // so the button label always reflects what tapping it actually does.
  var ctaLabel = computeCtaLabel({
    saving: saving,
    isResubmit: isResubmit,
    isVerified: isVerified,
    isCasualModal: !!(scoreModal && scoreModal.casual),
    isTournamentSlot: !!(scoreModal && scoreModal.winnerId1 && scoreModal.winnerId2),
    matchType: scoreDraft.matchType,
    completionType: scoreDraft.completionType,
    inviteOpponent: !!scoreDraft.inviteOpponent,
    hasOpponentName: !!(casualOppName && casualOppName.trim()),
  });

  // When the modal opens locked to a specific league (per-league
  // "+ Log match" button), restrict the opponent picker to that
  // league's active members only and suppress the suggested-players
  // list so users can only file a match against someone in the
  // league. The lock context lives on scoreModal.lockedLeague —
  // see openLogMatchInLeague in App.jsx.
  var lockedLeague = (scoreModal && scoreModal.lockedLeague) || null;
  var lockedFriends = friends;
  var lockedSuggested = suggestedPlayers;
  if (lockedLeague && Array.isArray(lockedLeague.memberIds) && lockedLeague.memberIds.length > 0) {
    var allowed = new Set(lockedLeague.memberIds);
    lockedFriends = (friends || []).filter(function (f) { return allowed.has(f.id); });
    lockedSuggested = [];
  }

  return (
    <div
      onClick={backdropClick}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, padding: "0 16px",
      }}>
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="pop"
        style={{
          background: t.modalBg, border: "1px solid " + t.border,
          borderRadius: 16,
          padding: "28px 24px",
          width: "100%", maxWidth: 540,
          maxHeight: "92vh", overflowY: "auto",
        }}>
        {finish ? (
          finish.invite ? (
            <InviteShareCard
              t={t}
              matchId={finish.matchId}
              invite={finish.invite}
              loggerName={authUser && (authUser.name || (authUser.user_metadata && authUser.user_metadata.name))}
              invitedName={finish.opponentName}
              onClose={closeFromFinish}
            />
          ) : (
            <MatchFinishMoment
              t={t}
              status={finish.status}
              result={finish.result}
              opponentName={finish.opponentName}
              onClose={closeFromFinish}
            />
          )
        ) : (
          <>
            <h2 style={{
              fontSize: 18, fontWeight: 700,
              color: t.text, marginBottom: 18,
              letterSpacing: "-0.3px",
            }}>
              {isResubmit ? "Edit & Resubmit" : "Log Match"}
            </h2>

            <MatchComposer
              t={t}
              scoreModal={scoreModal}
              isResubmit={isResubmit}
              isVerified={isVerified}
              viewerProfile={viewerProfile}
              viewerSuburb={viewerSuburb}
              scoreDraft={scoreDraft}
              setScoreDraft={setScoreDraft}
              casualOppName={casualOppName}
              setCasualOppName={setCasualOppName}
              casualOppId={casualOppId}
              setCasualOppId={setCasualOppId}
              showOppDrop={showOppDrop}
              setShowOppDrop={setShowOppDrop}
              friends={lockedFriends}
              suggestedPlayers={lockedSuggested}
              myLeagues={myLeagues}
              opponentLeagueIds={opponentLeagueIds}
              lockedLeague={lockedLeague}
              liveValidation={liveValidation}
              saveError={saveError}
              casualFallbackOffer={casualFallbackOffer}
              saving={saving}
              onSaveCasualFallback={function () {
                setSaveError("");
                setCasualFallbackOffer(null);
                handleSave({ forceCasual: true });
              }}
            />

            {/* Footer — Cancel + contextual Save CTA. */}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                onClick={function () {
                  setScoreModal(null);
                  if (!isResubmit) { setCasualOppName(""); setCasualOppId(null); }
                }}
                style={{
                  flex: 1, padding: "12px", borderRadius: 8,
                  border: "1px solid " + t.border,
                  background: "transparent", color: t.text,
                  fontSize: 13, fontWeight: 500,
                  cursor: "pointer",
                }}>
                Cancel
              </button>
              <button
                onClick={function () { handleSave(); }}
                disabled={saving}
                style={{
                  flex: 2, padding: "12px", borderRadius: 8,
                  border: "none",
                  background: saving ? t.border : t.accent,
                  color: "#fff", fontSize: 13, fontWeight: 600,
                  opacity: saving ? 0.7 : 1,
                  cursor: saving ? "default" : "pointer",
                }}>
                {ctaLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Slice 4 — derive CTA copy from the same context the composer uses.
// The label always reflects what tapping the button actually does.
//
// Order of precedence (most specific → most generic):
//   1. Saving spinner state              → "Saving…"
//   2. Resubmit context                  → "Resubmit for confirmation"
//   3. Tournament-bracket slot           → "Save & advance bracket"
//   4. Casual modal + freetext + invite  → "Save & share invite"
//   5. Casual modal + freetext + !invite → "Save as casual"
//   6. Casual modal + linked + ranked    → "Submit for confirmation"
//   7. Casual modal + linked + casual    → "Save match"
//   8. Anything else (legacy fallback)   → "Save result"
//
// Time-limited / retired completion type is signalled by the inline
// caption strip under the scoreboard, not the CTA copy — keeps the
// button label short and punchy.
function computeCtaLabel({
  saving,
  isResubmit,
  isVerified,
  isCasualModal,
  isTournamentSlot,
  matchType,
  completionType,           // eslint-disable-line no-unused-vars
  inviteOpponent,
  hasOpponentName,
}) {
  if (saving) return "Saving…";
  if (isResubmit) return "Resubmit for confirmation";
  if (isTournamentSlot) return "Save & advance bracket";
  if (isCasualModal && !isVerified && hasOpponentName && inviteOpponent) {
    return "Save & share invite";
  }
  if (isCasualModal && !isVerified) {
    // Freetext / no opponent picked yet — without an invite this is a
    // casual-only record. Same copy whether or not a name is typed,
    // because the action is the same.
    return "Save as casual";
  }
  if (isCasualModal && isVerified) {
    var effective = matchType || 'ranked';
    return effective === 'ranked'
      ? "Submit for confirmation"
      : "Save match";
  }
  return "Save result";
}
