// src/features/challenges/components/ChallengeModal.jsx
//
// Lightweight composer for sending a challenge. Centred dialog (matches the
// Score modal style after Module 3.5/4 polish): all fields optional except
// the implicit "I want to play this person". Keep it short — this is not a
// scheduling tool.
//
// Use case 1: from a player's public profile → "Challenge".
// Use case 2: from a confirmed feed card → "Rematch" (prefills source match's
//             venue/court via the parent passing them through `draft`).
//
// Visual: editorial vocabulary — eyebrow + display headline, hairline
// dividers, ALL-CAPS labels at 0.12em letterspacing.

import { avColor } from "../../../lib/utils/avatar.js";
import { inputStyle } from "../../../lib/theme.js";

var EYEBROW = {
  fontSize: 10, fontWeight: 800, letterSpacing: "0.12em",
  textTransform: "uppercase", color: "var(--label, currentColor)",
};

export default function ChallengeModal({
  t, composer, draft, setDraft, loading, onSend, onClose,
}) {
  if (!composer) return null;
  var iStyle = inputStyle(t);
  var target = composer.targetUser;
  var sending = !!(loading && loading.send);
  var isRematch = composer.source === "rematch";
  var eyebrow = isRematch ? "Rematch" : "Challenge";
  var headline = target.name || "this player";

  // Per-label style — same shape as the rest of the redesigned modals.
  var labelStyle = {
    fontSize: 10, fontWeight: 800, color: t.textSecondary,
    display: "block", marginBottom: 6,
    letterSpacing: "0.12em", textTransform: "uppercase",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 220,
        background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "0 16px",
      }}
    >
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="pop"
        style={{
          background: t.modalBg, border: "1px solid " + t.border,
          borderRadius: 14, padding: "26px 22px",
          width: "100%", maxWidth: 460, maxHeight: "92vh", overflowY: "auto",
        }}
      >
        {/* Header — eyebrow + display headline */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: avColor(target.name || "?"),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0,
            letterSpacing: "0.04em",
          }}>
            {(target.avatar || target.name || "?").slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
              textTransform: "uppercase", color: t.text,
              marginBottom: 4,
            }}>
              {eyebrow}
            </div>
            <h2 style={{
              fontSize: 22, fontWeight: 800, color: t.text,
              margin: 0, letterSpacing: "-0.6px", lineHeight: 1.05,
            }}>
              {headline}
            </h2>
            {(target.suburb || target.skill) && (
              <div style={{
                fontSize: 11, color: t.textTertiary, marginTop: 4,
                letterSpacing: "0.04em",
              }}>
                {[target.suburb, target.skill].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: t.textTertiary,
              fontSize: 22, padding: "0 4px", lineHeight: 1, cursor: "pointer",
              fontWeight: 300,
            }}>×</button>
        </div>

        {/* Friendly intent line — under a hairline so it sits as a "kicker" */}
        <p style={{
          fontSize: 13, color: t.textSecondary,
          margin: 0, marginBottom: 18, lineHeight: 1.5,
          paddingTop: 12, borderTop: "1px solid " + t.border,
          letterSpacing: "-0.1px",
        }}>
          Send a quick challenge — they'll get a notification with your details. They can accept, decline, or chat in DMs.
        </p>

        {/* Optional message */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>
            Message <span style={{ color: t.textTertiary, fontWeight: 600, letterSpacing: "0.06em" }}>· optional</span>
          </label>
          <textarea
            value={draft.message || ""}
            placeholder="e.g. Saturday morning at Bondi?"
            maxLength={280}
            onChange={function (e) { setDraft(function (d) { return Object.assign({}, d, { message: e.target.value }); }); }}
            style={Object.assign({}, iStyle, {
              fontSize: 13, marginBottom: 0, minHeight: 60, resize: "vertical", lineHeight: 1.4,
            })}
          />
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: t.textTertiary, marginTop: 4, textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}>
            {(draft.message || "").length}/280
          </div>
        </div>

        {/* Optional time */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>
            Proposed time <span style={{ color: t.textTertiary, fontWeight: 600, letterSpacing: "0.06em" }}>· optional</span>
          </label>
          <input
            type="datetime-local"
            value={draft.proposed_at || ""}
            onChange={function (e) { setDraft(function (d) { return Object.assign({}, d, { proposed_at: e.target.value }); }); }}
            style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0 })}
          />
        </div>

        {/* Optional venue + court */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Venue</label>
            <input
              value={draft.venue || ""}
              placeholder="e.g. Moore Park"
              onChange={function (e) { setDraft(function (d) { return Object.assign({}, d, { venue: e.target.value }); }); }}
              style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0 })}
            />
          </div>
          <div>
            <label style={labelStyle}>Court</label>
            <input
              value={draft.court || ""}
              placeholder="e.g. Court 3"
              onChange={function (e) { setDraft(function (d) { return Object.assign({}, d, { court: e.target.value }); }); }}
              style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0 })}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            disabled={sending}
            style={{
              flex: 1, padding: "13px", borderRadius: 10,
              border: "1px solid " + t.border, background: "transparent",
              color: t.text,
              fontSize: 11, fontWeight: 800,
              letterSpacing: "0.12em", textTransform: "uppercase",
              cursor: sending ? "default" : "pointer", opacity: sending ? 0.5 : 1,
            }}
          >Cancel</button>
          <button
            onClick={onSend}
            disabled={sending}
            style={{
              flex: 2, padding: "13px", borderRadius: 10, border: "none",
              background: sending ? t.border : t.accent, color: "#fff",
              fontSize: 11, fontWeight: 800,
              letterSpacing: "0.12em", textTransform: "uppercase",
              cursor: sending ? "default" : "pointer",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={function (e) { if (!sending) e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
          >
            {sending ? "Sending…" : (isRematch ? "Send rematch" : "Send challenge")}
          </button>
        </div>
      </div>
    </div>
  );
}
