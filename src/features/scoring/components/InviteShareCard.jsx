// src/features/scoring/components/InviteShareCard.jsx
//
// Module 9 — Post-log share card. Renders inside the ScoreModal's
// finish-moment surface when a freetext-opponent match was logged
// with the "Invite to confirm" toggle on.
//
// Three affordances:
//   1. Native Web Share (primary) — opens the OS share sheet so the
//      logger can pick WhatsApp / Messages / Mail / etc. Available on
//      modern Android, iOS Home-Screen PWAs, and desktop Chrome/Edge.
//   2. Copy link (always shown as a fallback). Drops the URL on the
//      clipboard via the modern Clipboard API; falls back to a hidden
//      textarea + execCommand for legacy browsers.
//   3. WhatsApp deep-link as an explicit secondary because it's the
//      most-used messaging app among amateur tennis players in our
//      seed market.
//
// The card NEVER auto-dismisses while the invite hasn't been shared —
// the share is the activation moment. The user closes manually with
// "Done" once they've sent the link.

import { useState } from "react";
import { buildInviteUrl, buildShareText } from "../utils/inviteUrl.js";
import { track } from "../../../lib/analytics.js";

function copyToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for older browsers.
  return new Promise(function (resolve, reject) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error("copy failed"));
    } catch (e) { reject(e); }
  });
}

export default function InviteShareCard({
  t,
  matchId,
  invite,            // { inviteId, token, expiresAt }
  loggerName,
  invitedName,
  onClose,
}) {
  var [copied, setCopied]   = useState(false);
  var [shared, setShared]   = useState(false);
  var [error, setError]     = useState("");

  var url       = buildInviteUrl(invite && invite.token);
  var shareText = buildShareText(loggerName, invitedName, url || "");
  var canWebShare = typeof navigator !== "undefined"
    && typeof navigator.share === "function";

  function fireShared(channel) {
    setShared(true);
    if (track) track("opponent_invite_shared", {
      match_id: matchId, channel: channel,
    });
  }

  async function handleNativeShare() {
    setError("");
    if (!canWebShare || !url) return;
    try {
      await navigator.share({
        title: "CourtSync — confirm match",
        text:  shareText,
        url:   url,
      });
      fireShared("web_share");
    } catch (e) {
      // AbortError = user cancelled. Anything else is real.
      if (e && e.name === "AbortError") return;
      setError("Couldn't open the share sheet. Try Copy link instead.");
    }
  }

  async function handleCopy() {
    setError("");
    if (!url) return;
    try {
      await copyToClipboard(url);
      setCopied(true);
      fireShared("copy");
      setTimeout(function () { setCopied(false); }, 2200);
    } catch (e) {
      setError("Couldn't copy. Long-press the link below to copy manually.");
    }
  }

  function whatsappUrl() {
    if (!shareText) return null;
    return "https://wa.me/?text=" + encodeURIComponent(shareText);
  }

  if (!url) {
    return (
      <div style={cardStyle(t)}>
        <div style={Object.assign({}, eyebrowStyle(t.red), { marginBottom: 6 })}>
          Couldn't create invite
        </div>
        <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5 }}>
          The match was saved but we couldn't generate the invite link. Open the match from your feed and try again.
        </div>
        <button onClick={onClose} style={primaryBtnStyle(t)}>Done</button>
      </div>
    );
  }

  return (
    <div style={cardStyle(t)}>
      {/* Header */}
      <div style={Object.assign({}, eyebrowStyle(t.orange), { marginBottom: 8 })}>
        Awaiting opponent
      </div>
      <div style={{
        fontSize: 22, fontWeight: 800, color: t.text,
        letterSpacing: "-0.6px", lineHeight: 1.05, marginBottom: 6,
      }}>
        Invite {invitedName || "your opponent"}
      </div>
      <div style={{
        fontSize: 13, color: t.textSecondary,
        lineHeight: 1.5, letterSpacing: "-0.1px", marginBottom: 18,
      }}>
        Send this link so they can confirm or dispute the result. The match doesn't affect your rating until they confirm.
      </div>

      {/* Primary: native share */}
      {canWebShare && (
        <button onClick={handleNativeShare} style={primaryBtnStyle(t)}>
          Share via…
        </button>
      )}

      {/* Always-on: copy link */}
      <button onClick={handleCopy} style={secondaryBtnStyle(t)}>
        {copied ? "Link copied ✓" : "Copy link"}
      </button>

      {/* Secondary: WhatsApp */}
      <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer"
         onClick={function () { fireShared("whatsapp"); }}
         style={Object.assign({}, secondaryBtnStyle(t), { textDecoration: "none", textAlign: "center" })}>
        Open in WhatsApp
      </a>

      {/* Long-press fallback URL — visible so the user can verify what
          they're sharing. */}
      <div style={{
        marginTop: 14,
        paddingTop: 12,
        borderTop: "1px solid " + t.border,
      }}>
        <div style={Object.assign({}, eyebrowStyle(t.textTertiary), { marginBottom: 6 })}>
          Link
        </div>
        <div style={{
          fontSize: 12, color: t.text,
          lineHeight: 1.4, letterSpacing: "-0.1px",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          wordBreak: "break-all",
          padding: "8px 10px",
          background: t.bgTertiary,
          border: "1px solid " + t.border,
          borderRadius: 6,
        }}>
          {url}
        </div>
      </div>

      {error && (
        <div style={{
          marginTop: 10,
          fontSize: 11, color: t.red,
          letterSpacing: "-0.1px",
        }}>{error}</div>
      )}
      {shared && !error && (
        <div style={{
          marginTop: 10,
          fontSize: 11, color: t.green,
          letterSpacing: "0.04em",
          textTransform: "uppercase", fontWeight: 800,
        }}>Shared ✓</div>
      )}

      <button onClick={onClose} style={{
        marginTop: 14,
        width: "100%", padding: "10px",
        background: "transparent", border: "none",
        color: t.textTertiary,
        fontSize: 10, fontWeight: 800,
        letterSpacing: "0.12em", textTransform: "uppercase",
        cursor: "pointer",
      }}>
        Done
      </button>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────

function cardStyle(t) {
  return {
    width: "100%",
    padding: "20px",
  };
}
function eyebrowStyle(color) {
  return {
    fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
    textTransform: "uppercase", color: color,
  };
}
function primaryBtnStyle(t) {
  return {
    width: "100%", padding: "13px",
    borderRadius: 10, border: "none",
    background: t.accent, color: "#fff",
    fontSize: 11, fontWeight: 800,
    letterSpacing: "0.12em", textTransform: "uppercase",
    cursor: "pointer",
    marginBottom: 8,
  };
}
function secondaryBtnStyle(t) {
  return {
    width: "100%", padding: "13px",
    borderRadius: 10, border: "1px solid " + t.border,
    background: "transparent", color: t.text,
    fontSize: 11, fontWeight: 800,
    letterSpacing: "0.12em", textTransform: "uppercase",
    cursor: "pointer",
    marginBottom: 8,
    display: "block",
    boxSizing: "border-box",
  };
}
