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
import { ED_TOK } from "../../home/components/EditorialScreen.jsx";

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

// Editorial label/value row used inside the logged-match summary and
// the ORIGINAL / PROPOSED diff columns. Mono uppercase microlabel on
// the left, display-font value on the right.
function FieldRow({ label, value, changed }) {
  if (!value) return null;
  return (
    <div style={{
      display:        "flex",
      alignItems:     "baseline",
      justifyContent: "space-between",
      gap:            10,
      padding:        "10px 0",
      borderTop:      "1px solid " + ED_TOK.line,
    }}>
      <span style={{
        fontFamily:    ED_TOK.mono,
        fontSize:      10,
        fontWeight:    700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color:         ED_TOK.muted,
        flexShrink:    0,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily:         ED_TOK.sans,
        fontSize:           14,
        color:              changed ? ED_TOK.ink : ED_TOK.ink2,
        fontWeight:         changed ? 600 : 500,
        textAlign:          "right",
        letterSpacing:      "-0.1px",
        fontVariantNumeric: "tabular-nums",
        display:            "flex",
        alignItems:         "baseline",
        gap:                8,
      }}>
        {value}
        {changed && (
          <span style={{
            fontFamily:    ED_TOK.mono,
            fontSize:      9.5,
            fontWeight:    700,
            color:         ED_TOK.loss,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            flexShrink:    0,
          }}>changed</span>
        )}
      </span>
    </div>
  );
}

// Editorial hairline-strip section — used for LOGGED BY, REASON,
// AUTO-VOID, ERROR. Mono kicker + body, hairline above.
function HairlineStrip({ eyebrow, eyebrowColor, children, marginBottom }) {
  return (
    <div style={{
      borderTop:    "1px solid " + ED_TOK.line,
      paddingTop:   14,
      paddingBottom:14,
      marginBottom: marginBottom == null ? 16 : marginBottom,
    }}>
      <div style={{
        fontFamily:    ED_TOK.mono,
        fontSize:      10,
        fontWeight:    700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color:         eyebrowColor || ED_TOK.muted,
        marginBottom:  8,
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

  // Eyebrow color — match_tag is the neutral confirm flow (use muted ink).
  // Dispute / correction / counter route push the eyebrow to the clay/red
  // signal so the trust moment reads as "needs your attention."
  var ED_eyebrowColor = isMatchTag ? ED_TOK.muted : ED_TOK.loss;

  return (
    // Backdrop — ink-tinted blur, same wash as CreateLeagueModal so the
    // confirm flow reads as part of the editorial realm.
    <div
      onClick={onClose}
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         200,
        background:     "rgba(20, 17, 14, 0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "0 16px",
      }}
    >
      {/* Sheet — cream paper, espresso ink, 20px radius, soft shadow.
          Same chrome vocabulary as CreateLeagueModal / LogMatchPage. */}
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="pop"
        style={{
          background:   ED_TOK.bg,
          color:        ED_TOK.ink,
          fontFamily:   ED_TOK.sans,
          border:       "1px solid " + ED_TOK.line,
          borderRadius: 20,
          width:        "100%",
          maxWidth:     540,
          maxHeight:    "92vh",
          overflowY:    "auto",
          overflowX:    "hidden",
          overscrollBehavior:      "contain",
          WebkitOverflowScrolling: "touch",
          touchAction:  "pan-y",
          boxShadow:    "0 24px 80px rgba(20,17,14,0.35)",
        }}
      >
        <div style={{ padding: "30px 24px 28px" }}>

          {/* ── Header — mono kicker + display hero + lede ───────────────── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily:    ED_TOK.mono,
                fontSize:      10.5,
                fontWeight:    700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color:         ED_eyebrowColor,
                marginBottom:  10,
              }}>
                {meta.eyebrow}
              </div>
              <h2 style={{
                fontFamily:    ED_TOK.display,
                fontSize:      "clamp(28px, 7vw, 36px)",
                fontWeight:    600,
                letterSpacing: "-0.025em",
                lineHeight:    1.0,
                color:         ED_TOK.ink,
                margin:        "0 0 10px",
              }}>
                {meta.title}
              </h2>
              <p style={{
                fontSize:   13.5,
                color:      ED_TOK.ink2,
                margin:     0,
                lineHeight: 1.5,
              }}>
                {meta.subtitle(fromName)}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background:   "transparent",
                border:       "1px solid " + ED_TOK.line,
                width:        32,
                height:       32,
                borderRadius: "50%",
                color:        ED_TOK.ink,
                padding:      0,
                cursor:       "pointer",
                lineHeight:   1,
                flexShrink:   0,
                marginLeft:   12,
                display:      "grid",
                placeItems:   "center",
                transition:   "background 160ms ease",
              }}
              onMouseEnter={function (e) { e.currentTarget.style.background = ED_TOK.bg2; }}
              onMouseLeave={function (e) { e.currentTarget.style.background = "transparent"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* ── Match context — hairline strip with avatar + tabular result.
                 Same hairline divider language as CreateLeagueModal section
                 breaks. */}
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          14,
            paddingTop:   16,
            paddingBottom:16,
            borderTop:    "1px solid " + ED_TOK.line,
            borderBottom: "1px solid " + ED_TOK.line,
            marginBottom: 22,
          }}>
            <Avatar name={fromName} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily:    ED_TOK.mono,
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color:         ED_TOK.muted,
                marginBottom:  4,
              }}>
                vs
              </div>
              <div style={{
                fontFamily:    ED_TOK.display,
                fontSize:      20,
                fontWeight:    600,
                letterSpacing: "-0.02em",
                lineHeight:    1.05,
                color:         ED_TOK.ink,
              }}>
                {fromName}
              </div>
              <div style={{
                fontFamily:  ED_TOK.sans,
                fontSize:    12,
                color:       ED_TOK.muted,
                marginTop:   4,
                display:     "flex",
                alignItems:  "center",
                gap:         8,
                flexWrap:    "wrap",
              }}>
                <span>{origDate}</span>
                {revisionLabel && (
                  <span style={{
                    fontFamily:    ED_TOK.mono,
                    fontSize:      9.5,
                    fontWeight:    700,
                    color:         ED_TOK.loss,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                  }}>· {revisionLabel}</span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{
                fontFamily:    ED_TOK.mono,
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color:         ED_TOK.muted,
                marginBottom:  4,
              }}>
                Result
              </div>
              <div style={{
                fontFamily:    ED_TOK.display,
                fontSize:      22,
                fontWeight:    600,
                letterSpacing: "-0.02em",
                lineHeight:    1.0,
                color:         match.result === "win" ? ED_TOK.win : ED_TOK.loss,
              }}>
                {origResult}
              </div>
            </div>
          </div>

          {/* ── For match_tag: show the logged match details (original only). */}
          {isMatchTag && (
            <HairlineStrip eyebrow={"Logged by " + fromName}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <FieldRow label="Result" value={origResult + " (" + fromName + "'s view)"} changed={false} />
                {origSets && origSets !== "—" && (
                  <FieldRow label="Score" value={origSets} changed={false} />
                )}
                {origDate && (
                  <FieldRow label="Date" value={origDate} changed={false} />
                )}
                {origVenue && origVenue !== "—" && (
                  <FieldRow label="Venue" value={origVenue} changed={false} />
                )}
              </div>
            </HairlineStrip>
          )}

          {/* ── No proposal yet (only for correction/dispute notifs, not match_tag) */}
          {!proposal && !isMatchTag && (
            <HairlineStrip eyebrow="Proposal unavailable">
              <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.45 }}>
                The correction details are not available yet. Reload the app if this persists.
              </div>
            </HairlineStrip>
          )}

          {/* ── Comparison ── two stacked editorial columns. */}
          {proposal && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontFamily:    ED_TOK.mono,
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color:         ED_TOK.muted,
                marginBottom:  14,
              }}>
                {anyDiff ? "What changed" : "Proposed (no changes)"}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Original */}
                <div>
                  <div style={{
                    fontFamily:    ED_TOK.mono,
                    fontSize:      10,
                    fontWeight:    700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color:         ED_TOK.muted,
                    marginBottom:  4,
                  }}>Original</div>
                  <FieldRow label="Result" value={origResult} changed={false} />
                  <FieldRow label="Score" value={origSets} changed={false} />
                  {(match.venue || match.court) && (
                    <FieldRow label="Venue" value={origVenue} changed={false} />
                  )}
                </div>

                {/* Proposed */}
                <div>
                  <div style={{
                    fontFamily:    ED_TOK.mono,
                    fontSize:      10,
                    fontWeight:    700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color:         anyDiff ? ED_TOK.loss : ED_TOK.muted,
                    marginBottom:  4,
                  }}>Proposed</div>
                  <FieldRow label="Result" value={propResult} changed={diff.result} />
                  <FieldRow label="Score" value={propSets} changed={diff.sets} />
                  {(proposal.venue || proposal.court || match.venue || match.court) && (
                    <FieldRow label="Venue" value={propVenue} changed={diff.venue || diff.court} />
                  )}
                </div>
              </div>

              {/* Date change */}
              {diff.date && propDate && (
                <div style={{
                  marginTop:    14,
                  paddingTop:   12,
                  paddingBottom:12,
                  borderTop:    "1px solid " + ED_TOK.line,
                  display:      "flex",
                  gap:          10,
                  alignItems:   "baseline",
                }}>
                  <span style={{
                    fontFamily:    ED_TOK.mono,
                    fontSize:      10,
                    fontWeight:    700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color:         ED_TOK.loss,
                    flexShrink:    0,
                  }}>Date changed</span>
                  <span style={{
                    fontFamily:    ED_TOK.sans,
                    fontSize:      13,
                    color:         ED_TOK.ink2,
                    letterSpacing: "-0.05px",
                  }}>
                    {origDate} → {propDate}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Reason ────────────────────────────────────────────────────── */}
          {match.disputeReasonCode && (
            <HairlineStrip eyebrow={"Their reason"}>
              <div style={{
                fontFamily:    ED_TOK.sans,
                fontSize:      14,
                color:         ED_TOK.ink,
                fontWeight:    600,
                letterSpacing: "-0.05px",
              }}>
                {REASON_LABELS[match.disputeReasonCode] || match.disputeReasonCode}
              </div>
              {match.disputeReasonDetail && (
                <div style={{
                  fontFamily: ED_TOK.sans,
                  fontSize:   12.5,
                  color:      ED_TOK.muted,
                  marginTop:  4,
                  fontStyle:  "italic",
                  lineHeight: 1.5,
                }}>
                  "{match.disputeReasonDetail}"
                </div>
              )}
            </HairlineStrip>
          )}

          {/* ── Auto-void warning ─────────────────────────────────────────── */}
          {wouldAutoVoid && (
            <HairlineStrip eyebrow="Max rounds reached" eyebrowColor={ED_TOK.loss}>
              <div style={{
                fontFamily: ED_TOK.sans,
                fontSize:   13.5,
                color:      ED_TOK.ink,
                lineHeight: 1.5,
              }}>
                Counter-proposing now will void the match automatically.
              </div>
            </HairlineStrip>
          )}

          {/* ── Error ─────────────────────────────────────────────────────── */}
          {error && (
            <HairlineStrip eyebrow="Can't save" eyebrowColor={ED_TOK.loss}>
              <div style={{
                fontFamily: ED_TOK.sans,
                fontSize:   13.5,
                color:      ED_TOK.ink,
                lineHeight: 1.5,
              }}>
                {error}
              </div>
            </HairlineStrip>
          )}

          {/* ── Actions — LogMatch primaryBtn vocabulary.
                 Primary (Accept): ink-on-cream pill, mono uppercase,
                 999 radius. Secondary (Dispute / Counter, Not my match):
                 hairline-outlined pills, same shape. */}
          <div style={{
            display:        "flex",
            flexDirection:  "column",
            gap:            10,
            marginTop:      8,
            paddingTop:     20,
            borderTop:      "1px solid " + ED_TOK.line,
          }}>

            {/* Primary: Accept / Confirm */}
            <button
              onClick={handleAccept}
              disabled={saving}
              style={{
                width:          "100%",
                padding:        "16px 18px",
                borderRadius:   999,
                border:         "1px solid " + ED_TOK.ink,
                background:     ED_TOK.ink,
                color:          ED_TOK.bg,
                fontFamily:     ED_TOK.mono,
                fontSize:       11.5,
                fontWeight:     700,
                letterSpacing:  "0.18em",
                textTransform:  "uppercase",
                cursor:         saving ? "not-allowed" : "pointer",
                opacity:        saving && action !== "accept" ? 0.4
                              : saving                         ? 0.7 : 1,
                transition:     "opacity 140ms ease",
              }}
            >
              {saving && action === "accept"
                ? (isMatchTag ? "Confirming…" : "Accepting…")
                : (isMatchTag ? "Confirm match" : "Accept correction")}
            </button>

            {/* Secondary row: Counter / Dispute + Not my match */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleCounter}
                disabled={saving}
                style={{
                  flex:           1,
                  padding:        "14px 14px",
                  borderRadius:   999,
                  border:         "1px solid " + ED_TOK.lineStrong,
                  background:     "transparent",
                  color:          ED_TOK.ink,
                  fontFamily:     ED_TOK.mono,
                  fontSize:       11,
                  fontWeight:     700,
                  letterSpacing:  "0.16em",
                  textTransform:  "uppercase",
                  cursor:         saving ? "not-allowed" : "pointer",
                  opacity:        saving ? 0.5 : 1,
                  transition:     "opacity 140ms ease, background 140ms ease",
                }}
              >
                {wouldAutoVoid ? "Void match" : (isMatchTag ? "Dispute score" : "Propose correction")}
              </button>

              <button
                onClick={handleVoid}
                disabled={saving}
                style={{
                  flex:           1,
                  padding:        "14px 14px",
                  borderRadius:   999,
                  border:         "1px solid " + ED_TOK.lineStrong,
                  background:     "transparent",
                  color:          ED_TOK.loss,
                  fontFamily:     ED_TOK.mono,
                  fontSize:       11,
                  fontWeight:     700,
                  letterSpacing:  "0.16em",
                  textTransform:  "uppercase",
                  cursor:         saving ? "not-allowed" : "pointer",
                  opacity:        saving && action !== "void" ? 0.4
                                : saving                       ? 0.7 : 1,
                  transition:     "opacity 140ms ease",
                  whiteSpace:     "nowrap",
                }}
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
