// src/features/trust/components/PostMatchFeedbackCard.jsx
//
// Module 10 (Slice 2) — private post-match feedback prompt.
//
// Shown AFTER the opponent confirms a match (not after the submitter
// logs — too early in the truth loop). Sits as a small floating card
// at the bottom of the viewport so it doesn't block the feed; one-tap
// Skip is always available.
//
// UX rules (locked, see docs/player-trust-and-reliability.md):
//   - Light + non-confrontational. Default chips are positive
//     ("Good match", "Score felt fair", "Showed up"); negative chips
//     ("No-show / issue", "Sportsmanship issue") render in muted
//     colour and require an extra tap to confirm.
//   - Optional 500-char private note. The label makes it clear the
//     note never goes public and only helps CourtSync improve match
//     quality. Note is hidden behind a "+ Add a note" affordance so
//     the card stays compact for the common case.
//   - Skip is one tap. Skipping records nothing (we never write the
//     row at all on skip — silence ≠ negative).
//   - Submit is also one tap. Defaults: any chip the user picked is
//     submitted; un-picked chips are NULL (not false). The DB doesn't
//     distinguish "tapped no" from "didn't tap" for the positive
//     chips — both are nullable booleans, NULL means "didn't answer."
//   - sessionStorage cooldown by match_id stops the card re-rendering
//     within the same tab session if the user dismissed it.

import { useEffect, useState } from "react";
import { submitPostMatchFeedback } from "../services/trustService.js";
import { track } from "../../../lib/analytics.js";

var COOLDOWN_PREFIX = "cs_feedback_dismissed_";

function isCooledDown(matchId) {
  if (!matchId) return false;
  try {
    return sessionStorage.getItem(COOLDOWN_PREFIX + matchId) === "1";
  } catch (_) { return false; }
}

function markCooldown(matchId) {
  if (!matchId) return;
  try {
    sessionStorage.setItem(COOLDOWN_PREFIX + matchId, "1");
  } catch (_) {}
}

// Single chip — three states: idle / on / negative-on.
// `negative` chips get a muted ring on tap (instead of accent) so the
// surface stays calm even when the user reports an issue.
function Chip({ t, label, value, onChange, negative }) {
  var on = !!value;
  var color = on
    ? (negative ? t.textSecondary : t.green)
    : t.textTertiary;
  var border = on
    ? (negative ? t.border + "AA" : t.green + "55")
    : t.border;
  var bg = on
    ? (negative ? t.bgTertiary : t.greenSubtle)
    : "transparent";
  return (
    <button type="button"
      onClick={function () { onChange(!on); }}
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid " + border,
        background: bg,
        color: color,
        fontSize: 11, fontWeight: 700,
        letterSpacing: "0.04em",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}>
      {label}
    </button>
  );
}

export default function PostMatchFeedbackCard({
  t,
  matchId,
  reviewedUserId,
  reviewedName,
  onClose,            // () => void — called on submit success OR skip
  toast,              // optional app-level toast emitter
}) {
  // Pre-cooldown short-circuit. The mounting site checks this too,
  // but we keep the guard here so any future caller stays consistent.
  var [dismissed] = useState(function () { return isCooledDown(matchId); });

  var [wouldPlayAgain,    setWouldPlayAgain]    = useState(null);
  var [scoreFair,         setScoreFair]         = useState(null);
  var [showedUp,          setShowedUp]          = useState(null);
  var [noShow,            setNoShow]            = useState(false);
  var [sportsmanship,     setSportsmanship]     = useState(false);
  var [showNote,          setShowNote]          = useState(false);
  var [note,              setNote]              = useState("");
  var [submitting,        setSubmitting]        = useState(false);
  var [error,             setError]             = useState("");

  useEffect(function () {
    if (matchId) track("post_match_feedback_prompt_shown", { match_id: matchId });
  }, [matchId]);

  if (dismissed) return null;

  function handleSkip() {
    track("post_match_feedback_skipped", { match_id: matchId });
    markCooldown(matchId);
    if (onClose) onClose();
  }

  async function handleSubmit() {
    if (submitting) return;

    // Empty submit is treated as a skip — no point writing an empty row.
    var anyTapped =
      wouldPlayAgain !== null
      || scoreFair !== null
      || showedUp !== null
      || noShow
      || sportsmanship
      || (note && note.trim().length > 0);
    if (!anyTapped) {
      handleSkip();
      return;
    }

    setSubmitting(true);
    setError("");

    var r = await submitPostMatchFeedback({
      matchId: matchId,
      reviewedUserId: reviewedUserId,
      wouldPlayAgain: wouldPlayAgain,
      showedUp: showedUp,
      scoreFeltFair: scoreFair,
      sportsmanshipIssue: sportsmanship,
      noShowReport: noShow,
      privateNote: note && note.trim() ? note.trim() : null,
    });

    setSubmitting(false);

    if (!r.ok) {
      // Duplicate is not really an error — they already reviewed.
      // Treat it as "fine, dismiss" so we don't re-prompt next session.
      if (r.error.code === "duplicate") {
        markCooldown(matchId);
        if (onClose) onClose();
        return;
      }
      setError(r.error.message);
      return;
    }

    // Track positive booleans only — never include the private note.
    track("post_match_feedback_submitted", {
      match_id: matchId,
      would_play_again: !!wouldPlayAgain,
      score_felt_fair:  !!scoreFair,
      showed_up:        !!showedUp,
      sportsmanship_issue: !!sportsmanship,
      no_show_report:   !!noShow,
      has_note:         !!(note && note.trim()),
    });
    if (noShow) track("player_reported_no_show", { match_id: matchId });

    markCooldown(matchId);
    if (toast) toast("Thanks — feedback noted.", "success");
    if (onClose) onClose();
  }

  return (
    <div className="pop"
      role="dialog"
      aria-label="Post-match feedback"
      style={{
        position: "fixed",
        bottom: 16, left: 16, right: 16,
        zIndex: 220,
        maxWidth: 540,
        margin: "0 auto",
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderRadius: 14,
        padding: "16px 16px 14px",
        boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
      }}>
      {/* Header — eyebrow + title + skip */}
      <div style={{
        display: "flex", alignItems: "baseline",
        justifyContent: "space-between", marginBottom: 10,
        gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 9, fontWeight: 800,
            color: t.textTertiary, letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}>
            Private feedback
          </div>
          <div style={{
            fontSize: 16, fontWeight: 700, color: t.text,
            letterSpacing: "-0.2px", marginTop: 2,
          }}>
            How was the match{reviewedName ? " with " + reviewedName : ""}?
          </div>
        </div>
        <button type="button" onClick={handleSkip}
          aria-label="Skip"
          style={{
            background: "transparent", border: "none",
            color: t.textTertiary, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase",
            padding: "4px 0", cursor: "pointer",
            flexShrink: 0,
          }}>
          Skip
        </button>
      </div>

      {/* Positive chips */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6,
        marginBottom: 8,
      }}>
        <Chip t={t} label="Good match"     value={wouldPlayAgain} onChange={setWouldPlayAgain} />
        <Chip t={t} label="Score felt fair" value={scoreFair}      onChange={setScoreFair} />
        <Chip t={t} label="Showed up"       value={showedUp}       onChange={setShowedUp} />
      </div>

      {/* Negative chips — separated by a hairline so they don't read
          as the default option. Muted colour even when on. */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6,
        paddingTop: 8, marginBottom: 10,
        borderTop: "1px solid " + t.border,
      }}>
        <Chip t={t} label="No-show / issue"   value={noShow}        onChange={setNoShow}        negative />
        <Chip t={t} label="Sportsmanship issue" value={sportsmanship} onChange={setSportsmanship} negative />
      </div>

      {/* Private note (collapsible) */}
      {showNote ? (
        <div style={{ marginBottom: 10 }}>
          <textarea
            value={note}
            placeholder="Anything CourtSync should know? (Private — never shown publicly.)"
            maxLength={500}
            rows={3}
            onChange={function (e) { setNote(e.target.value); }}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid " + t.border,
              background: t.inputBg,
              color: t.text,
              fontSize: 12,
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
            }}/>
          <div style={{
            fontSize: 10, color: t.textTertiary,
            marginTop: 4, letterSpacing: "0.02em",
            display: "flex", justifyContent: "space-between",
          }}>
            <span>Private — visible only to CourtSync.</span>
            <span>{note.length} / 500</span>
          </div>
        </div>
      ) : (
        <button type="button"
          onClick={function () { setShowNote(true); }}
          style={{
            background: "transparent", border: "none",
            color: t.textTertiary, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.10em", textTransform: "uppercase",
            cursor: "pointer", padding: 0, marginBottom: 10,
          }}>
          + Add a note
        </button>
      )}

      {/* Error strip */}
      {error && (
        <div style={{
          fontSize: 11, color: t.red, marginBottom: 8,
          letterSpacing: "-0.05px",
        }}>
          {error}
        </div>
      )}

      {/* Submit row */}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: 8,
            border: "none",
            background: submitting ? t.border : t.accent,
            color: "#fff",
            fontSize: 12, fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: submitting ? "default" : "pointer",
          }}>
          {submitting ? "Saving…" : "Submit"}
        </button>
      </div>
    </div>
  );
}

// Convenience export so call-sites can check the cooldown before
// mounting (avoids a mount→unmount flash for already-dismissed matches).
export function feedbackCardWasDismissed(matchId) {
  return isCooledDown(matchId);
}
