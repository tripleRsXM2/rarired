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

import { avColor } from "../../../lib/utils/avatar.js";
import { inputStyle } from "../../../lib/theme.js";

export default function ChallengeModal({
  t, composer, draft, setDraft, loading, onSend, onClose,
}) {
  if (!composer) return null;
  var iStyle = inputStyle(t);
  var target = composer.targetUser;
  var sending = !!(loading && loading.send);
  var headline = composer.source === "rematch"
    ? "Rematch " + (target.name || "this player")
    : "Challenge " + (target.name || "this player");

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
          borderRadius: 16, padding: "24px 22px",
          width: "100%", maxWidth: 460, maxHeight: "92vh", overflowY: "auto",
        }}
      >
        {/* Header — target identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: avColor(target.name || "?"),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0,
          }}>
            {(target.avatar || target.name || "?").slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: t.text, margin: 0, letterSpacing: "-0.2px" }}>
              {headline}
            </h2>
            <div style={{ fontSize: 12, color: t.textTertiary, marginTop: 2 }}>
              {[target.suburb, target.skill].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: t.textTertiary,
              fontSize: 22, padding: "0 4px", lineHeight: 1, cursor: "pointer",
            }}>×</button>
        </div>

        {/* Friendly intent line */}
        <p style={{ fontSize: 13, color: t.textSecondary, marginTop: 0, marginBottom: 18, lineHeight: 1.5 }}>
          Send a quick challenge — they'll get a notification with your details.
          They can accept, decline, or you can chat in DMs.
        </p>

        {/* Optional message */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Message (optional)
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
          <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 4, textAlign: "right" }}>
            {(draft.message || "").length}/280
          </div>
        </div>

        {/* Optional time */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Proposed time (optional)
          </label>
          <input
            type="datetime-local"
            value={draft.proposed_at || ""}
            onChange={function (e) { setDraft(function (d) { return Object.assign({}, d, { proposed_at: e.target.value }); }); }}
            style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0 })}
          />
        </div>

        {/* Optional venue + court */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Venue
            </label>
            <input
              value={draft.venue || ""}
              placeholder="e.g. Moore Park"
              onChange={function (e) { setDraft(function (d) { return Object.assign({}, d, { venue: e.target.value }); }); }}
              style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0 })}
            />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Court
            </label>
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
              flex: 1, padding: "12px", borderRadius: 8,
              border: "1px solid " + t.border, background: "transparent",
              color: t.text, fontSize: 13, fontWeight: 500,
              cursor: sending ? "default" : "pointer", opacity: sending ? 0.5 : 1,
            }}
          >Cancel</button>
          <button
            onClick={onSend}
            disabled={sending}
            style={{
              flex: 2, padding: "12px", borderRadius: 8, border: "none",
              background: sending ? t.border : t.accent, color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: sending ? "default" : "pointer",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={function (e) { if (!sending) e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
          >
            {sending ? "Sending…" : "Send challenge"}
          </button>
        </div>
      </div>
    </div>
  );
}
