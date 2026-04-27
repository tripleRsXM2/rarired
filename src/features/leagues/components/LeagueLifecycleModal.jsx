// src/features/leagues/components/LeagueLifecycleModal.jsx
//
// Module 12 Slice 2 — shared confirm modal for the four owner-only
// league lifecycle transitions: complete / archive / cancel / void.
//
// Renders the same shape for every action (title + body + reason
// dropdown + optional note + cancel/confirm pair); only the copy and
// the destructive flag differ. Source-of-truth copy + reasons live in
// `../utils/leagueLifecycle.js`.
//
// Portal-mounted to document.body for the same reason CreateLeagueModal
// does it: the People tab wraps content in a `.fade-up` div whose
// transform creates a containing block that breaks position:fixed.

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  LIFECYCLE_ACTION_COPY,
  LIFECYCLE_REASONS,
} from "../utils/leagueLifecycle.js";

export default function LeagueLifecycleModal({
  t,
  // Required:
  league,                  // the league row (for the title)
  action,                  // 'complete' | 'archive' | 'cancel' | 'void'
  onConfirm,               // async (reason, note) => { error? }
  onClose,                 // () => void
  // Optional:
  toast,                   // (msg, kind) — used for error surface
}) {
  var copy    = LIFECYCLE_ACTION_COPY[action] || {};
  var reasons = LIFECYCLE_REASONS[action]      || [];

  var [reason, setReason] = useState(reasons.length ? reasons[0].value : "other");
  var [note,   setNote]   = useState("");
  var [busy,   setBusy]   = useState(false);

  function report(msg) { if (toast) toast(msg, "error"); else window.alert(msg); }

  async function handleConfirm() {
    setBusy(true);
    var r = await onConfirm(reason, note.trim() || null);
    setBusy(false);
    if (r && r.error) {
      report(r.error.message || ("Could not " + (copy.verb || "do that") + "."));
      return;
    }
    onClose();
  }

  // Destructive actions get a red primary button so the visual
  // hierarchy matches the consequence — cancel/void are harder to
  // reverse than complete/archive.
  var primaryBg     = copy.destructive ? t.red : t.accent;
  var primaryHover  = copy.destructive ? t.red : t.accent;

  return createPortal((
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 220, padding: "0 16px",
      }}>
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="pop"
        style={{
          background: t.modalBg,
          border: "1px solid " + t.border,
          borderRadius: 16,
          padding: "22px 22px 20px",
          width: "100%", maxWidth: 460,
          boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
        }}>
        {/* Title */}
        <div style={{ fontSize: 16, fontWeight: 800, color: t.text, letterSpacing: "-0.2px", marginBottom: 4 }}>
          {copy.title || "Confirm"}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>
          {league.name}
        </div>

        {/* Body */}
        {copy.body && (
          <div style={{ fontSize: 12.5, color: t.textSecondary, lineHeight: 1.55, marginBottom: 16 }}>
            {copy.body}
          </div>
        )}

        {/* Reason dropdown */}
        {reasons.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
              Reason
            </div>
            <select
              value={reason}
              disabled={busy}
              onChange={function (e) { setReason(e.target.value); }}
              style={{
                width: "100%", padding: "9px 10px",
                background: t.bgCard,
                color: t.text,
                border: "1px solid " + t.border,
                borderRadius: 0,
                fontSize: 13, fontWeight: 500,
                cursor: busy ? "default" : "pointer",
              }}>
              {reasons.map(function (r) {
                return <option key={r.value} value={r.value}>{r.label}</option>;
              })}
            </select>
          </div>
        )}

        {/* Optional note */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
            Note <span style={{ fontWeight: 500, color: t.textTertiary, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
          </div>
          <textarea
            value={note}
            disabled={busy}
            placeholder="Anything members should know"
            onChange={function (e) { setNote(e.target.value); }}
            rows={2}
            style={{
              width: "100%", padding: "9px 10px",
              background: t.bgCard,
              color: t.text,
              border: "1px solid " + t.border,
              borderRadius: 0,
              fontSize: 12.5, lineHeight: 1.45,
              resize: "vertical",
              fontFamily: "inherit",
            }}/>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: "9px 14px",
              background: "transparent",
              border: "1px solid " + t.border,
              color: t.text,
              borderRadius: 0,
              fontSize: 12, fontWeight: 600,
              letterSpacing: "0.03em", textTransform: "uppercase",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}>
            Back
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            style={{
              padding: "9px 14px",
              background: primaryBg,
              border: "none",
              color: "#fff",
              borderRadius: 0,
              fontSize: 12, fontWeight: 700,
              letterSpacing: "0.03em", textTransform: "uppercase",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}>
            {busy ? "…" : (copy.confirmLabel || "Confirm")}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
