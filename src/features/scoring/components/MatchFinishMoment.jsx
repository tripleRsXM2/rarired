// src/features/scoring/components/MatchFinishMoment.jsx
//
// Slice 3 of the design overhaul: the "completion moment" that
// briefly acknowledges a logged match before ScoreModal closes.
//
// Design intent (docs/design-direction.md → Log Match flow):
//   "Make the act of logging feel like an achievement, not a form
//    completion. Not a confetti animation; a brief surface for ~1.5s
//    before the modal closes."
//
// Two states map to the two real outcomes of submitMatch:
//
//   • CONFIRMED (status === 'confirmed') — casual matches, freetext
//     or linked. The match counts in the user's history immediately.
//     Card shows the W/L result chip + a "Match logged" headline.
//
//   • PENDING (status === 'pending_confirmation') — ranked matches
//     with a linked opponent. Nothing affects Elo until the opponent
//     confirms. Card shows a "Sent to <opponent> for confirmation"
//     headline so the user understands what happens next.
//
// We deliberately don't show a ranking-point delta — ranked matches
// don't move ranking until confirmation, and casual matches never
// do. Per-match Elo snapshots are slated for a future migration
// (open question #2 in design-direction.md).
//
// Auto-dismiss: 1500ms via setTimeout. The host (ScoreModal) calls
// onClose on dismiss; the modal closes from there.

import { useEffect } from "react";

var AUTO_DISMISS_MS = 1500;

function CheckIcon({ color, size }) {
  var s = size || 28;
  return (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8" stroke={color} strokeWidth="1.5" fill="none"/>
      <path d="M5.5 9.5l2.5 2.5 4.5-5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

function CrossIcon({ color, size }) {
  var s = size || 28;
  return (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8" stroke={color} strokeWidth="1.5" fill="none"/>
      <path d="M6 6l6 6M12 6l-6 6" stroke={color} strokeWidth="1.6" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function ClockIcon({ color, size }) {
  var s = size || 28;
  return (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8" stroke={color} strokeWidth="1.5" fill="none"/>
      <path d="M9 4.5V9l3 1.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

export default function MatchFinishMoment({
  t,
  status,             // 'confirmed' | 'pending_confirmation'
  result,             // 'win' | 'loss'
  opponentName,       // for the pending-ranked subtext
  onClose,            // called after AUTO_DISMISS_MS
}) {
  useEffect(function () {
    var tid = setTimeout(function () { if (onClose) onClose(); }, AUTO_DISMISS_MS);
    return function () { clearTimeout(tid); };
  }, [onClose]);

  var isPending = status === "pending_confirmation";
  var isWin     = result === "win";

  // Tone — pending uses orange (calm, "in motion"); confirmed uses
  // green/red mirroring the result.
  var tone = isPending ? t.orange : (isWin ? t.green : t.red);
  var toneSubtle = isPending ? t.orangeSubtle : (isWin ? t.greenSubtle : t.redSubtle);

  var headline = isPending
    ? "Sent for confirmation"
    : "Match logged";

  var subtitle = isPending
    ? ("Once " + (opponentName || "your opponent") + " confirms, this counts toward your rank.")
    : (isWin ? "Marked as a win in your history." : "Marked as a loss in your history.");

  var Icon = isPending ? ClockIcon : (isWin ? CheckIcon : CrossIcon);

  return (
    <div className="pop"
      style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        textAlign: "center",
        padding: "24px 8px 8px",
        gap: 14,
      }}>
      {/* Icon disc — subtle background ring matches the tone */}
      <div style={{
        width: 64, height: 64,
        borderRadius: "50%",
        background: toneSubtle,
        border: "1px solid " + tone + "55",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon color={tone} size={30} />
      </div>

      <div style={{
        fontSize: 20, fontWeight: 800, color: t.text,
        letterSpacing: "-0.4px", lineHeight: 1.15,
      }}>
        {headline}
      </div>

      {/* Result tag — only for confirmed-casual; redundant with the
          icon for pending. Sharp pill to match the rest of the chrome. */}
      {!isPending && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
          textTransform: "uppercase",
          padding: "4px 10px", borderRadius: 0,
          background: toneSubtle,
          color: tone,
          border: "1px solid " + tone + "33",
        }}>
          {isWin ? "Won" : "Lost"}
        </span>
      )}

      <div style={{
        fontSize: 13, color: t.textSecondary,
        lineHeight: 1.5, maxWidth: 320,
        marginTop: 2,
      }}>
        {subtitle}
      </div>
    </div>
  );
}
