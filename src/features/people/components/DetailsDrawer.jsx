// src/features/people/components/DetailsDrawer.jsx
//
// Right-hand conversation details pane. Handles both 1:1 and group
// conversations from a single component:
//
//   • 1:1 — single rich identity card (avatar, presence, location,
//     skill/style chips, stats line, View profile button).
//   • Group — composed title + participant count, then a vertical stack
//     of participant cards. Each card mirrors the 1:1 layout but
//     compacted; tapping a non-self participant opens their profile.
//
// Layout adapts to viewport. On desktop (≥700px) it renders flush as a
// right-anchored 320px aside. On mobile it portals to a bottom-sheet
// overlay (so the group-header tap target on a phone — the primary
// mobile entry point — gets a usable drawer instead of a 300px column
// on a 390px viewport). The 1:1 toggle button stays desktop-only via
// CSS in providers.jsx, but the drawer itself doesn't assume that.
//
// Rich profile data: conversations carry only a partner/participant
// stub (id, name, avatar, skill, suburb, presence fields). For the
// drawer we re-fetch the full profile rows so style/ranking_points/
// wins/losses surface. usePlayerProfiles is keyed on the id list and
// no-ops when the same set is requested twice in a row.

import { createPortal } from "react-dom";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { PresenceDot } from "./PresenceIndicator.jsx";
import { getPresence } from "../services/presenceService.js";
import { displayLocation } from "../../../lib/utils/avatar.js";
import { usePlayerProfiles } from "../../profile/hooks/usePlayerProfiles.js";

function isDesktopViewport() {
  return typeof window !== "undefined" && window.innerWidth >= 700;
}

// Compose the group thread title locally so the drawer header doesn't
// depend on a helper that lives only in Messages.jsx. Mirrors that
// helper's behaviour exactly (1 → name, 2 → "A & B", 3+ → "A, B & N
// other(s)").
function composeGroupTitle(participants, me) {
  var others = (participants || []).filter(function (p) { return p && p.id !== me; });
  if (others.length === 0) return "Group";
  if (others.length === 1) return others[0].name || "Player";
  if (others.length === 2) return (others[0].name || "Player") + " & " + (others[1].name || "Player");
  var rest = others.length - 2;
  return (others[0].name || "Player") + ", " + (others[1].name || "Player") +
    " & " + rest + " other" + (rest === 1 ? "" : "s");
}

// Merge the conversation stub with the freshly-fetched full profile so
// missing fields fall back to whatever the conv carried. The stub may
// have come through realtime before the profile fetch resolved.
function enrich(stub, fullById) {
  if (!stub) return stub;
  var full = stub.id ? fullById[stub.id] : null;
  if (!full) return stub;
  return Object.assign({}, stub, full);
}

export default function DetailsDrawer({
  t, conv, me, onOpenProfile, onClose,
}) {
  if (!conv) return null;

  var isGroup = !!conv.isGroup;
  var rawList = isGroup
    ? (conv.participants || [])
    : (conv.partner ? [conv.partner] : []);
  var ids = rawList.map(function (p) { return p && p.id; }).filter(Boolean);

  var fetched = usePlayerProfiles(ids);
  var enrichedList = rawList.map(function (p) { return enrich(p, fetched.profiles); });
  var partner = !isGroup ? (enrichedList[0] || {}) : null;

  var desktop = isDesktopViewport();

  var headerTitle = isGroup ? composeGroupTitle(enrichedList, me) : "Details";
  var headerSub = isGroup
    ? (enrichedList.length + " participant" + (enrichedList.length === 1 ? "" : "s"))
    : null;

  var body = (
    <>
      {/* Header row — title + close */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "14px 16px", borderBottom: "1px solid " + t.border,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {headerTitle}
          </div>
          {headerSub && (
            <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>{headerSub}</div>
          )}
        </div>
        <button
          type="button" onClick={onClose}
          aria-label="Close details"
          style={{ background: "transparent", border: "none", color: t.textTertiary, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4, flexShrink: 0 }}>✕</button>
      </div>

      {isGroup ? (
        <div style={{ padding: "12px 12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {enrichedList.map(function (p) {
            return (
              <ParticipantCard
                key={(p && p.id) || (p && p.name) || Math.random()}
                t={t}
                profile={p || {}}
                isSelf={!!(p && p.id === me)}
                onOpenProfile={onOpenProfile}
              />
            );
          })}
        </div>
      ) : (
        <RichIdentityCard
          t={t}
          profile={partner || {}}
          onOpenProfile={onOpenProfile}
        />
      )}
    </>
  );

  if (desktop) {
    return (
      <aside
        aria-label={isGroup ? "Group details" : "Conversation details"}
        role={isGroup ? "dialog" : undefined}
        aria-modal={isGroup ? "true" : undefined}
        style={{
          width: 320, flexShrink: 0,
          background: t.bgCard, borderLeft: "1px solid " + t.border,
          display: "flex", flexDirection: "column",
          overflowY: "auto",
        }}>
        {body}
      </aside>
    );
  }

  // Mobile — portal as a bottom-sheet overlay. Mirrors the previous
  // GroupDetailsDrawer styling so the group thread-header tap target
  // keeps its expected feel.
  return createPortal((
    <div
      role="dialog" aria-modal="true"
      aria-label={isGroup ? "Group details" : "Conversation details"}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 320,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}>
      <div
        onClick={function (e) { e.stopPropagation(); }}
        style={{
          width: "100%",
          background: t.bgCard,
          borderRadius: "20px 20px 0 0",
          paddingBottom: "env(safe-area-inset-bottom)",
          maxHeight: "80vh",
          overflowY: "auto",
        }}>
        <div style={{ width: 32, height: 4, borderRadius: 2, background: t.border, margin: "10px auto 4px" }} />
        {body}
      </div>
    </div>
  ), document.body);
}

// ── Rich identity card (1:1) ──────────────────────────────────────────────

function RichIdentityCard({ t, profile, onOpenProfile }) {
  var presence = getPresence(profile);
  var loc = displayLocation(profile);
  var ranking = profile.ranking_points;
  var wins = profile.wins;
  var losses = profile.losses;
  var hasRecord = (typeof wins === "number" && typeof losses === "number")
    && (wins + losses > 0 || profile.matches_played > 0);

  return (
    <div style={{ padding: "20px 16px 16px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div style={{ position: "relative" }}>
        <PlayerAvatar name={profile.name} avatar={profile.avatar} avatarUrl={profile.avatar_url} size={72} />
        <PresenceDot profile={profile} t={t} size={12} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: t.text, letterSpacing: "-0.02em", marginTop: 10 }}>
        {profile.name || "Player"}
      </div>
      {loc && (
        <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>{loc}</div>
      )}
      {presence.label && (
        <div style={{ fontSize: 11, color: presence.online ? t.green : t.textTertiary, marginTop: 4 }}>
          {presence.label}
        </div>
      )}

      {/* Chips — skill + style */}
      {(profile.skill || profile.style) && (
        <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {profile.skill && (
            <span style={{ fontSize: 11, fontWeight: 700, color: t.accent, background: t.accentSubtle, padding: "3px 9px", borderRadius: 20 }}>
              {profile.skill}
            </span>
          )}
          {profile.style && (
            <span style={{ fontSize: 11, fontWeight: 600, color: t.green, background: t.greenSubtle, padding: "3px 9px", borderRadius: 20 }}>
              {profile.style}
            </span>
          )}
        </div>
      )}

      {/* Stats line — ranking · W-L */}
      {(ranking != null || hasRecord) && (
        <div style={{
          marginTop: 14, width: "100%",
          display: "flex", alignItems: "stretch",
          borderTop: "1px solid " + t.border,
          borderBottom: "1px solid " + t.border,
          padding: "10px 0",
        }}>
          {ranking != null && (
            <Stat t={t} label="Rating" value={String(ranking)} />
          )}
          {hasRecord && (
            <Stat t={t} label="Record" value={(wins || 0) + "-" + (losses || 0)} />
          )}
        </div>
      )}

      {/* View profile */}
      {onOpenProfile && profile.id && (
        <button type="button"
          onClick={function () { onOpenProfile(profile.id); }}
          style={{
            marginTop: 14, width: "100%",
            padding: "10px 12px",
            background: "transparent",
            border: "1px solid " + t.border,
            borderRadius: 10,
            color: t.text, fontSize: 12, fontWeight: 600,
            cursor: "pointer", textAlign: "center",
          }}>
          View profile
        </button>
      )}
    </div>
  );
}

function Stat({ t, label, value }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: t.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── Participant card (group) ──────────────────────────────────────────────

function ParticipantCard({ t, profile, isSelf, onOpenProfile }) {
  var presence = getPresence(profile);
  var canOpen = !isSelf && onOpenProfile && profile && profile.id;
  var loc = displayLocation(profile);

  return (
    <button
      type="button"
      onClick={canOpen ? function () { onOpenProfile(profile.id); } : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        width: "100%",
        padding: "10px 12px",
        background: t.bgTertiary || "transparent",
        border: "1px solid " + t.border,
        borderRadius: 12,
        textAlign: "left",
        cursor: canOpen ? "pointer" : "default",
        color: t.text,
      }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <PlayerAvatar name={profile.name} avatar={profile.avatar} avatarUrl={profile.avatar_url} size={42} />
        <PresenceDot profile={profile} t={t} size={10} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {(profile.name || "Player") + (isSelf ? " (you)" : "")}
        </div>
        <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[profile.skill, loc].filter(Boolean).join(" · ") || (presence.label || "")}
        </div>
      </div>
      {canOpen && (
        <span aria-hidden="true" style={{ color: t.textTertiary, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>›</span>
      )}
    </button>
  );
}
