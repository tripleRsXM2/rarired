// src/features/notifications/components/ActionReviewDrawer.jsx
// In-context review modal for dispute / correction / counter-proposal notifications.
// Opens directly from the notification tray — no navigation required.
// Displays original vs proposed comparison with diff highlighting, then lets
// the user Accept, Counter-propose, or Void without leaving the current screen.
//
// Visual language: editorial — hairline strips, ALL-CAPS eyebrows at
// 0.12–0.16em, tabular numerals for scores, no rounded card-on-card.
// Matches the redesigned Home / Profile / ScoreModal vocabulary so the
// trust moment reads as part of the same product.

import { useState } from "react";
import { avColor } from "../../../lib/utils/avatar.js";
import { formatMatchScore } from "../../scoring/utils/tennisScoreValidation.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

var NOTIF_META = {
  match_disputed: {
    eyebrow:  "Disputed",
    title:    "Match result disputed",
    subtitle: function (name) { return name + " disputed your match result and submitted a correction."; },
  },
  match_correction_requested: {
    eyebrow:  "Correction proposed",
    title:    "Score correction proposed",
    subtitle: function (name) { return name + " proposed a correction to your match result."; },
  },
  match_counter_proposed: {
    eyebrow:  "Counter-proposal",
    title:    "Counter-proposal received",
    subtitle: function (name) { return name + " responded to your correction with a counter-proposal."; },
  },
  // Unified review flow — match_tag lands here too. No proposal yet; the user
  // is confirming the original logged match (or disputing / voiding it).
  match_tag: {
    eyebrow:  "Confirm",
    title:    "Confirm this match",
    subtitle: function (name) { return name + " logged a match with you. Does this look right?"; },
  },
};

var REASON_LABELS = {
  wrong_score:   "Score is wrong",
  wrong_winner:  "Winner is wrong",
  wrong_date:    "Date is wrong",
  wrong_venue:   "Venue or court is wrong",
  not_my_match:  "This wasn't my match",
  other:         "Other",
};

function formatResult(result) {
  return result === "win" ? "Win" : "Loss";
}

function formatSets(sets) {
  if (!sets || !sets.length) return "—";
  // Centralised in tennisScoreValidation so the dispute drawer renders
  // tiebreak details ("7-6 (7-4)") the same way the rest of the app does.
  var s = formatMatchScore(sets);
  return s || "—";
}

// Compute which fields changed between original match and the proposal.
function computeDiff(match, proposal) {
  return {
    result: match.result !== proposal.result,
    sets:   formatSets(match.sets) !== formatSets(proposal.sets),
    date:   (match.rawDate || "") !== (proposal.match_date || ""),
    venue:  (match.venue || "").toLowerCase() !== (proposal.venue || "").toLowerCase(),
    court:  (match.court || "").toLowerCase() !== (proposal.court || "").toLowerCase(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Avatar({ name, size }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: avColor(name || "?"),
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.34, fontWeight: 800, color: "#fff", flexShrink: 0,
      letterSpacing: "0.04em",
    }}>
      {(name || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

// Editorial label/value row used inside ORIGINAL / PROPOSED columns.
// One per field. Diff = orange "CHANGED" eyebrow on the right.
function FieldRow({ label, value, changed, t }) {
  if (!value) return null;
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      gap: 8, padding: "8px 0",
      borderTop: "1px solid " + t.border,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: t.textTertiary, flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 13, color: changed ? t.text : t.textSecondary,
        fontWeight: changed ? 800 : 500,
        textAlign: "right", letterSpacing: "-0.1px",
        fontVariantNumeric: "tabular-nums",
        display: "flex", alignItems: "baseline", gap: 8,
      }}>
        {value}
        {changed && (
          <span style={{
            fontSize: 9, fontWeight: 800,
            color: t.orange, letterSpacing: "0.16em",
            textTransform: "uppercase", flexShrink: 0,
          }}>changed</span>
        )}
      </span>
    </div>
  );
}

// Editorial hairline-strip section — used for LOGGED BY, REASON, AUTO-VOID,
// ERROR. Replaces the old `bgTertiary + radius + border` cards.
function HairlineStrip({ eyebrow, eyebrowColor, t, children, marginBottom }) {
  return (
    <div style={{
      borderTop: "1px solid " + t.border,
      paddingTop: 12,
      paddingBottom: 12,
      marginBottom: marginBottom == null ? 14 : marginBottom,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: eyebrowColor || t.textTertiary,
        marginBottom: 6,
      }}>{eyebrow}</div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main drawer
// ─────────────────────────────────────────────────────────────────────────────

export default function ActionReviewDrawer({
  t,
  match,
  notifType,
  fromName,
  onClose,
  onDismissNotif,
  acceptCorrection,      // used by disputed / correction / counter types
  confirmOpponentMatch,  // used by match_tag (initial confirm of a pending match)
  onCounter,
  voidMatchAction,
}) {
  var [saving, setSaving]   = useState(false);
  var [action, setAction]   = useState(null); // "accept" | "void" | null
  var [error, setError]     = useState("");

  if (!match) return null;

  var meta     = NOTIF_META[notifType] || NOTIF_META["match_disputed"];
  var isMatchTag = notifType === "match_tag";
  // match_tag has no proposal — it's the initial confirmation, not a correction.
  var proposal = isMatchTag ? null : match.currentProposal;
  var diff     = proposal ? computeDiff(match, proposal) : {};
  var anyDiff  = proposal && Object.values(diff).some(Boolean);

  var wouldAutoVoid = (match.revisionCount || 0) >= 3;
  var revisionLabel = (match.revisionCount || 0) > 0
    ? "Round " + (match.revisionCount + 1) + " / 3"
    : null;

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleAccept() {
    setError("");
    setSaving(true);
    setAction("accept");
    // match_tag takes a different RPC path — it's the initial pending→confirmed
    // transition, not an accept-correction. Everything else accepts a proposal.
    var fn = isMatchTag ? confirmOpponentMatch : acceptCorrection;
    if (!fn) {
      setError("Confirm action unavailable.");
      setSaving(false); setAction(null);
      return;
    }
    var res = await fn(match);
    setSaving(false);
    if (res && res.error) {
      setError(typeof res.error === "string" ? res.error : (res.error?.message || "Failed. Try again."));
      setAction(null);
      return;
    }
    if (onDismissNotif) onDismissNotif();
    onClose();
  }

  async function handleVoid() {
    setError("");
    setSaving(true);
    setAction("void");
    var res = await voidMatchAction(match, "not_my_match");
    setSaving(false);
    if (res && res.error) {
      setError(typeof res.error === "string" ? res.error : (res.error?.message || "Failed. Try again."));
      setAction(null);
      return;
    }
    if (onDismissNotif) onDismissNotif();
    onClose();
  }

  function handleCounter() {
    onClose();
    if (onCounter) onCounter(match);
  }

  // ── Format display values ──────────────────────────────────────────────────

  var origResult  = formatResult(match.result);
  var origSets    = formatSets(match.sets);
  var origDate    = match.date || "Unknown date";
  var origVenue   = [match.venue, match.court].filter(Boolean).join(" · ") || "—";

  var propResult  = proposal ? formatResult(proposal.result) : null;
  var propSets    = proposal ? formatSets(proposal.sets) : null;
  var propDate    = proposal && proposal.match_date
    ? new Date(proposal.match_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : null;
  var propVenue   = proposal
    ? ([proposal.venue, proposal.court].filter(Boolean).join(" · ") || "—")
    : null;

  // Eyebrow color for the header — match_tag is neutral, dispute/correction/
  // counter use orange for "needs your attention".
  var headerEyebrowColor = isMatchTag ? t.text : t.orange;

  return (
    // Backdrop — centered dialog (was bottom-sheet slide-up).
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "0 16px",
      }}
    >
      {/* Sheet */}
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="pop"
        style={{
          background: t.modalBg,
          border: "1px solid " + t.border,
          borderRadius: 14,
          width: "100%",
          maxWidth: 540,
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "26px 22px 26px" }}>

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: headerEyebrowColor, marginBottom: 6,
              }}>
                {meta.eyebrow}
              </div>
              <h2 style={{
                fontSize: 22, fontWeight: 800,
                color: t.text, letterSpacing: "-0.6px",
                margin: 0, marginBottom: 4, lineHeight: 1.1,
              }}>
                {meta.title}
              </h2>
              <p style={{
                fontSize: 13, color: t.textSecondary,
                margin: 0, lineHeight: 1.45, letterSpacing: "-0.1px",
              }}>
                {meta.subtitle(fromName)}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none",
                color: t.textTertiary, fontSize: 22,
                padding: "0 0 0 12px", cursor: "pointer",
                lineHeight: 1, flexShrink: 0,
                fontWeight: 300,
                transition: "color 0.13s",
              }}
              onMouseEnter={function (e) { e.currentTarget.style.color = t.text; }}
              onMouseLeave={function (e) { e.currentTarget.style.color = t.textTertiary; }}
            >×</button>
          </div>

          {/* ── Match context — hairline strip with avatar + tabular result */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            paddingTop: 14, paddingBottom: 14,
            borderTop: "1px solid " + t.border,
            borderBottom: "1px solid " + t.border,
            marginBottom: 18,
          }}>
            <Avatar name={fromName} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
                textTransform: "uppercase", color: t.textTertiary,
                marginBottom: 3,
              }}>
                vs
              </div>
              <div style={{
                fontSize: 16, fontWeight: 800, color: t.text,
                letterSpacing: "-0.3px", lineHeight: 1.1,
              }}>
                {fromName}
              </div>
              <div style={{
                fontSize: 11, color: t.textTertiary, marginTop: 4,
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              }}>
                <span>{origDate}</span>
                {revisionLabel && (
                  <span style={{
                    fontSize: 9, fontWeight: 800,
                    color: t.orange, letterSpacing: "0.16em",
                    textTransform: "uppercase",
                  }}>· {revisionLabel}</span>
                )}
              </div>
            </div>
            <div style={{
              textAlign: "right", flexShrink: 0,
            }}>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
                textTransform: "uppercase", color: t.textTertiary,
                marginBottom: 2,
              }}>
                Result
              </div>
              <div style={{
                fontSize: 18, fontWeight: 800,
                color: match.result === "win" ? t.green : t.red,
                letterSpacing: "-0.3px", lineHeight: 1,
              }}>
                {origResult}
              </div>
            </div>
          </div>

          {/* ── For match_tag: show the logged match details (original only). */}
          {isMatchTag && (
            <HairlineStrip eyebrow={"Logged by " + fromName} t={t}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <FieldRow label="Result" value={origResult + " (" + fromName + "'s view)"} changed={false} t={t} />
                {origSets && origSets !== "—" && (
                  <FieldRow label="Score" value={origSets} changed={false} t={t} />
                )}
                {origDate && (
                  <FieldRow label="Date" value={origDate} changed={false} t={t} />
                )}
                {origVenue && origVenue !== "—" && (
                  <FieldRow label="Venue" value={origVenue} changed={false} t={t} />
                )}
              </div>
            </HairlineStrip>
          )}

          {/* ── No proposal yet (only for correction/dispute notifs, not match_tag) */}
          {!proposal && !isMatchTag && (
            <HairlineStrip eyebrow="Proposal unavailable" t={t}>
              <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.45 }}>
                The correction details are not available yet. Reload the app if this persists.
              </div>
            </HairlineStrip>
          )}

          {/* ── Comparison ── two stacked editorial columns. */}
          {proposal && (
            <div style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
                textTransform: "uppercase", color: t.textTertiary,
                marginBottom: 12,
              }}>
                {anyDiff ? "What changed" : "Proposed (no changes)"}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {/* Original */}
                <div>
                  <div style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
                    textTransform: "uppercase", color: t.textTertiary,
                    marginBottom: 4,
                  }}>Original</div>
                  <FieldRow label="Result" value={origResult} changed={false} t={t} />
                  <FieldRow label="Score" value={origSets} changed={false} t={t} />
                  {(match.venue || match.court) && (
                    <FieldRow label="Venue" value={origVenue} changed={false} t={t} />
                  )}
                </div>

                {/* Proposed */}
                <div>
                  <div style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: anyDiff ? t.orange : t.textTertiary,
                    marginBottom: 4,
                  }}>Proposed</div>
                  <FieldRow label="Result" value={propResult} changed={diff.result} t={t} />
                  <FieldRow label="Score" value={propSets} changed={diff.sets} t={t} />
                  {(proposal.venue || proposal.court || match.venue || match.court) && (
                    <FieldRow label="Venue" value={propVenue} changed={diff.venue || diff.court} t={t} />
                  )}
                </div>
              </div>

              {/* Date change */}
              {diff.date && propDate && (
                <div style={{
                  marginTop: 12,
                  paddingTop: 10, paddingBottom: 10,
                  borderTop: "1px solid " + t.border,
                  display: "flex", gap: 10, alignItems: "baseline",
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
                    textTransform: "uppercase", color: t.orange, flexShrink: 0,
                  }}>Date changed</span>
                  <span style={{
                    fontSize: 12, color: t.textSecondary, letterSpacing: "-0.1px",
                  }}>
                    {origDate} → {propDate}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Reason ────────────────────────────────────────────────────── */}
          {match.disputeReasonCode && (
            <HairlineStrip eyebrow={"Their reason"} t={t}>
              <div style={{
                fontSize: 13, color: t.text, fontWeight: 600,
                letterSpacing: "-0.1px",
              }}>
                {REASON_LABELS[match.disputeReasonCode] || match.disputeReasonCode}
              </div>
              {match.disputeReasonDetail && (
                <div style={{
                  fontSize: 12, color: t.textSecondary,
                  marginTop: 4, fontStyle: "italic", letterSpacing: "-0.1px",
                }}>
                  "{match.disputeReasonDetail}"
                </div>
              )}
            </HairlineStrip>
          )}

          {/* ── Auto-void warning ─────────────────────────────────────────── */}
          {wouldAutoVoid && (
            <HairlineStrip eyebrow="Max rounds reached" eyebrowColor={t.orange} t={t}>
              <div style={{
                fontSize: 13, color: t.text, lineHeight: 1.4,
                letterSpacing: "-0.1px",
              }}>
                Counter-proposing now will void the match automatically.
              </div>
            </HairlineStrip>
          )}

          {/* ── Error ─────────────────────────────────────────────────────── */}
          {error && (
            <HairlineStrip eyebrow="Can't save" eyebrowColor={t.red} t={t}>
              <div style={{
                fontSize: 13, color: t.text, lineHeight: 1.4,
                letterSpacing: "-0.1px",
              }}>
                {error}
              </div>
            </HairlineStrip>
          )}

          {/* ── Actions ───────────────────────────────────────────────────── */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 8,
            marginTop: 8,
            paddingTop: 16,
            borderTop: "1px solid " + t.border,
          }}>

            {/* Primary: Accept */}
            <button
              onClick={handleAccept}
              disabled={saving}
              style={{
                width: "100%", padding: "14px",
                borderRadius: 10, border: "none",
                background: saving && action === "accept" ? t.border : t.green,
                color: "#fff", fontSize: 13, fontWeight: 800,
                letterSpacing: "0.08em", textTransform: "uppercase",
                cursor: saving ? "default" : "pointer",
                opacity: saving && action !== "accept" ? 0.5 : 1,
                transition: "opacity 0.15s, background 0.15s",
              }}
              onMouseEnter={function (e) { if (!saving) e.currentTarget.style.opacity = "0.88"; }}
              onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
            >
              {saving && action === "accept"
                ? (isMatchTag ? "Confirming…" : "Accepting…")
                : (isMatchTag ? "Confirm match" : "Accept correction")}
            </button>

            {/* Secondary row: Counter + Void */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleCounter}
                disabled={saving}
                style={{
                  flex: 1, padding: "12px",
                  borderRadius: 10,
                  border: "1px solid " + t.border,
                  background: "transparent",
                  color: t.text,
                  fontSize: 11, fontWeight: 800,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.5 : 1,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={function (e) { if (!saving) e.currentTarget.style.opacity = "0.7"; }}
                onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
              >
                {wouldAutoVoid ? "Void match" : (isMatchTag ? "Dispute score" : "Propose correction")}
              </button>

              <button
                onClick={handleVoid}
                disabled={saving}
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "1px solid " + t.border,
                  background: "transparent",
                  color: t.red,
                  fontSize: 11, fontWeight: 800,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  cursor: saving ? "default" : "pointer",
                  opacity: saving && action !== "void" ? 0.5 : 1,
                  transition: "opacity 0.15s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={function (e) { if (!saving) e.currentTarget.style.opacity = "0.75"; }}
                onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
              >
                {saving && action === "void" ? "Voiding…" : "Not my match"}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
