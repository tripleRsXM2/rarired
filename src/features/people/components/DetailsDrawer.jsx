// src/features/people/components/DetailsDrawer.jsx
//
// Right-hand conversation details pane. Opt-in via the ⋯ button in the
// thread header. Desktop-only by default (mobile already has the gear
// bottom-sheet for settings; a second drawer on a 390px viewport is
// cramped). Shows partner identity, presence, pin toggle, "View profile"
// deep-link, and a block of shared stats lifted from the profile data
// we already have on conv.partner.

import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { PresenceDot } from "./PresenceIndicator.jsx";
import { getPresence } from "../services/presenceService.js";
import { displayLocation } from "../../../lib/utils/avatar.js";

export default function DetailsDrawer({
  t, conv, isPinned,
  onPin, onUnpin, onOpenProfile, onClose,
}) {
  if (!conv) return null;
  var partner = conv.partner || {};
  var presence = getPresence(partner);

  return (
    <aside
      aria-label="Conversation details"
      style={{
        width: 300, flexShrink: 0,
        background: t.bgCard, borderLeft: "1px solid " + t.border,
        display: "flex", flexDirection: "column",
        overflowY: "auto",
      }}>
      {/* Header row — name + close */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "14px 16px", borderBottom: "1px solid " + t.border,
      }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: t.text, letterSpacing: "-0.01em" }}>
          Details
        </div>
        <button
          type="button" onClick={onClose}
          aria-label="Close details"
          style={{ background: "transparent", border: "none", color: t.textTertiary, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
      </div>

      {/* Identity block */}
      <div style={{ padding: "20px 16px 14px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ position: "relative" }}>
          <PlayerAvatar name={partner.name} avatar={partner.avatar} avatarUrl={partner.avatar_url} size={68} />
          <PresenceDot profile={partner} t={t} size={12} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: t.text, letterSpacing: "-0.02em", marginTop: 10 }}>
          {partner.name || "Player"}
        </div>
        {displayLocation(partner) && (
          <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>
            {displayLocation(partner)}
          </div>
        )}
        {presence.label && (
          <div style={{ fontSize: 11, color: presence.online ? t.green : t.textTertiary, marginTop: 4 }}>
            {presence.label}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        {onOpenProfile && partner.id && (
          <button type="button"
            onClick={function () { onOpenProfile(partner.id); }}
            style={actionBtn(t)}>View profile</button>
        )}
        {isPinned
          ? <button type="button" onClick={onUnpin} style={actionBtn(t)}>Unpin conversation</button>
          : <button type="button" onClick={onPin}   style={actionBtn(t)}>Pin conversation</button>
        }
      </div>

      {/* Partner chips — skill + style if present */}
      {(partner.skill || partner.style) && (
        <div style={{ padding: "6px 16px 16px", display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {partner.skill && (
            <span style={{ fontSize: 11, fontWeight: 700, color: t.accent, background: t.accentSubtle, padding: "3px 9px", borderRadius: 20 }}>
              {partner.skill}
            </span>
          )}
          {partner.style && (
            <span style={{ fontSize: 11, fontWeight: 600, color: t.green, background: t.greenSubtle, padding: "3px 9px", borderRadius: 20 }}>
              {partner.style}
            </span>
          )}
        </div>
      )}
    </aside>
  );
}

function actionBtn(t) {
  return {
    display: "block", width: "100%",
    padding: "9px 12px",
    background: "transparent",
    border: "1px solid " + t.border,
    borderRadius: 8,
    color: t.text, fontSize: 12, fontWeight: 600,
    cursor: "pointer", textAlign: "center",
  };
}
