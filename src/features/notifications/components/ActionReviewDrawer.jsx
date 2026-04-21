// src/features/notifications/components/ActionReviewDrawer.jsx
// In-context review modal for dispute / correction / counter-proposal notifications.
// Opens directly from the notification tray — no navigation required.
// Displays original vs proposed comparison with diff highlighting, then lets
// the user Accept, Counter-propose, or Void without leaving the current screen.

import { useState } from "react";
import { avColor } from "../../../lib/utils/avatar.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

var NOTIF_META = {
  match_disputed: {
    title:    "Match result disputed",
    subtitle: function (name) { return name + " disputed your match result and submitted a correction."; },
  },
  match_correction_requested: {
    title:    "Score correction proposed",
    subtitle: function (name) { return name + " proposed a correction to your match result."; },
  },
  match_counter_proposed: {
    title:    "Counter-proposal received",
    subtitle: function (name) { return name + " responded to your correction with a counter-proposal."; },
  },
  // Unified review flow — match_tag lands here too. No proposal yet; the user
  // is confirming the original logged match (or disputing / voiding it).
  match_tag: {
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
  return sets
    .filter(function (s) { return s.you !== "" || s.them !== ""; })
    .map(function (s) { return s.you + "–" + s.them; })
    .join(", ");
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
      fontSize: size * 0.34, fontWeight: 700, color: "#fff", flexShrink: 0,
    }}>
      {(name || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

function FieldRow({ label, original, proposed, changed, t }) {
  if (!original && !proposed) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 5 }}>
      <span style={{ fontSize: 11, color: t.textTertiary, width: 44, flexShrink: 0, paddingTop: 1 }}>
        {label}
      </span>
      <span style={{
        fontSize: 13, fontWeight: changed ? 600 : 400,
        color: changed ? t.text : t.textSecondary,
        flex: 1,
      }}>
        {proposed || "—"}
        {changed && (
          <span style={{
            marginLeft: 7, fontSize: 10, fontWeight: 700,
            color: t.orange, background: t.orange + "22",
            padding: "1px 6px", borderRadius: 4, letterSpacing: "0.03em",
            textTransform: "uppercase",
          }}>changed</span>
        )}
      </span>
    </div>
  );
}

function DataCard({ title, accentColor, t, children }) {
  return (
    <div style={{
      borderRadius: 10,
      border: "1px solid " + (accentColor ? accentColor + "44" : t.border),
      background: accentColor ? accentColor + "08" : t.bgTertiary,
      padding: "13px 14px",
      borderLeft: accentColor ? "3px solid " + accentColor : "3px solid " + t.border,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: accentColor || t.textTertiary,
        marginBottom: 9,
      }}>{title}</div>
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
    ? "Round " + (match.revisionCount + 1) + " of 3"
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
          borderRadius: 16,
          width: "100%",
          maxWidth: 540,
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "24px 22px 28px" }}>

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{
                fontSize: 18, fontWeight: 700,
                color: t.text, letterSpacing: "-0.4px",
                margin: 0, marginBottom: 5,
              }}>
                {meta.title}
              </h2>
              <p style={{
                fontSize: 13, color: t.textSecondary,
                margin: 0, lineHeight: 1.45,
              }}>
                {meta.subtitle(fromName)}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none",
                color: t.textTertiary, fontSize: 20,
                padding: "0 0 0 12px", cursor: "pointer",
                lineHeight: 1, flexShrink: 0,
                transition: "color 0.13s",
              }}
              onMouseEnter={function (e) { e.currentTarget.style.color = t.text; }}
              onMouseLeave={function (e) { e.currentTarget.style.color = t.textTertiary; }}
            >×</button>
          </div>

          {/* ── Match context ─────────────────────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 14px",
            borderRadius: 10,
            background: t.bgTertiary,
            border: "1px solid " + t.border,
            marginBottom: 18,
          }}>
            <Avatar name={fromName} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>
                vs {fromName}
              </div>
              <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>
                {origDate}
                {revisionLabel && (
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontWeight: 600,
                    color: t.orange, background: t.orange + "20",
                    padding: "1px 6px", borderRadius: 4,
                  }}>{revisionLabel}</span>
                )}
              </div>
            </div>
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: match.result === "win" ? t.green : t.red,
              padding: "4px 10px",
              borderRadius: 6,
              background: (match.result === "win" ? t.green : t.red) + "18",
            }}>
              {origResult}
            </div>
          </div>

          {/* ── For match_tag: show the logged match details (original only). */}
          {isMatchTag && (
            <div style={{
              padding: "14px 16px",
              borderRadius: 10,
              background: t.bgTertiary,
              border: "1px solid " + t.border,
              fontSize: 13, color: t.text, lineHeight: 1.5,
              marginBottom: 18,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textTertiary, marginBottom: 8 }}>
                Logged by {fromName}
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary }}>Result · </span>
                <span style={{ fontWeight: 600 }}>{origResult}</span>
                <span style={{ color: t.textTertiary, fontSize: 12 }}> (from {fromName}'s view)</span>
              </div>
              {origSets && origSets !== "—" && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary }}>Score · </span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{origSets}</span>
                </div>
              )}
              {origDate && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary }}>Date · </span>
                  {origDate}
                </div>
              )}
              {origVenue && origVenue !== "—" && (
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary }}>Venue · </span>
                  {origVenue}
                </div>
              )}
            </div>
          )}

          {/* ── No proposal yet (only for correction/dispute notifs, not match_tag) */}
          {!proposal && !isMatchTag && (
            <div style={{
              padding: "16px 14px",
              borderRadius: 10,
              background: t.bgTertiary,
              border: "1px solid " + t.border,
              fontSize: 13, color: t.textSecondary,
              marginBottom: 18, textAlign: "center",
            }}>
              The correction details are not available yet.
              <br />
              <span style={{ fontSize: 12, color: t.textTertiary }}>
                Reload the app if this persists.
              </span>
            </div>
          )}

          {/* ── Comparison ────────────────────────────────────────────────── */}
          {proposal && (
            <div style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase", color: t.textTertiary,
                marginBottom: 10,
              }}>
                {anyDiff ? "What changed" : "Proposed (no changes detected)"}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                {/* Original */}
                <DataCard title="Original" t={t}>
                  <FieldRow label="Result" original={origResult} proposed={origResult} changed={false} t={t} />
                  <FieldRow label="Score" original={origSets} proposed={origSets} changed={false} t={t} />
                  {(match.venue || match.court) && (
                    <FieldRow label="Venue" original={origVenue} proposed={origVenue} changed={false} t={t} />
                  )}
                </DataCard>

                {/* Arrow */}
                <div style={{
                  display: "flex", alignItems: "center",
                  color: t.textTertiary, fontSize: 16, flexShrink: 0, marginTop: 28,
                }}>→</div>

                {/* Proposed */}
                <DataCard title="Proposed" accentColor={anyDiff ? t.orange : null} t={t}>
                  <FieldRow
                    label="Result" original={origResult} proposed={propResult}
                    changed={diff.result} t={t}
                  />
                  <FieldRow
                    label="Score" original={origSets} proposed={propSets}
                    changed={diff.sets} t={t}
                  />
                  {(proposal.venue || proposal.court || match.venue || match.court) && (
                    <FieldRow
                      label="Venue" original={origVenue} proposed={propVenue}
                      changed={diff.venue || diff.court} t={t}
                    />
                  )}
                </DataCard>
              </div>

              {/* Date change */}
              {diff.date && propDate && (
                <div style={{
                  marginTop: 8, padding: "8px 12px",
                  borderRadius: 8, background: t.orange + "10",
                  border: "1px solid " + t.orange + "33",
                  fontSize: 12, color: t.textSecondary,
                }}>
                  <span style={{ color: t.orange, fontWeight: 600 }}>Date changed · </span>
                  {origDate} → {propDate}
                </div>
              )}
            </div>
          )}

          {/* ── Reason ────────────────────────────────────────────────────── */}
          {match.disputeReasonCode && (
            <div style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: t.bgTertiary,
              border: "1px solid " + t.border,
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Their reason
              </div>
              <div style={{ fontSize: 13, color: t.text }}>
                {REASON_LABELS[match.disputeReasonCode] || match.disputeReasonCode}
              </div>
              {match.disputeReasonDetail && (
                <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 4, fontStyle: "italic" }}>
                  "{match.disputeReasonDetail}"
                </div>
              )}
            </div>
          )}

          {/* ── Auto-void warning ─────────────────────────────────────────── */}
          {wouldAutoVoid && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 14,
              background: t.orange + "15",
              border: "1px solid " + t.orange + "44",
            }}>
              <div style={{ fontSize: 12, color: t.orange, fontWeight: 600 }}>
                Max correction rounds reached
              </div>
              <div style={{ fontSize: 11, color: t.textSecondary, marginTop: 2 }}>
                Counter-proposing now will void the match automatically.
              </div>
            </div>
          )}

          {/* ── Error ─────────────────────────────────────────────────────── */}
          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 14,
              background: t.red + "15",
              border: "1px solid " + t.red + "44",
              fontSize: 12, color: t.red,
            }}>
              {error}
            </div>
          )}

          {/* ── Actions ───────────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>

            {/* Primary: Accept */}
            <button
              onClick={handleAccept}
              disabled={saving}
              style={{
                width: "100%", padding: "14px",
                borderRadius: 10, border: "none",
                background: saving && action === "accept" ? t.border : t.green,
                color: "#fff", fontSize: 14, fontWeight: 700,
                letterSpacing: "-0.1px", cursor: saving ? "default" : "pointer",
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
                  color: t.text, fontSize: 13, fontWeight: 600,
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
                  border: "1px solid " + t.red + "44",
                  background: "transparent",
                  color: t.red, fontSize: 13, fontWeight: 500,
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
