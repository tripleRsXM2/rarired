// src/features/notifications/components/NotificationsPanel.jsx
// Phase 1 — typed, sorted, state-aware notification tray.
// Rendered as a fixed overlay; positioning is handled by .cs-notif-panel CSS class.

import { useNavigate } from "react-router-dom";
import { avColor } from "../../../lib/utils/avatar.js";
import {
  getNotifType,
  getNotifLabel,
  sortNotifications,
  canDismiss,
  notifAccentColor,
  notifTimeLabel,
} from "../utils/notifUtils.js";

// ── Type pill ──────────────────────────────────────────────────────────────────
var TYPE_META = {
  action:    { label: "Action needed", icon: "!" },
  important: { label: "Update",        icon: "✓" },
  activity:  { label: "Activity",      icon: "·" },
};

// ── Individual notification row ───────────────────────────────────────────────
function NotifRow({ n, t, onRead, onDismiss, acceptMatchTag, declineMatchTag, setShowNotifications, refreshHistory, openConvById }) {
  var navigate = useNavigate();
  var type    = getNotifType(n);
  var label   = getNotifLabel(n);
  var accent  = notifAccentColor(n, t);
  var isUnread = !n.read;

  function handleRowClick() {
    if (!n.read) onRead(n.id);
  }

  function goFeed() {
    if (refreshHistory) refreshHistory();
    navigate("/home");
    setShowNotifications(false);
  }

  function goMessages() {
    if (openConvById) openConvById(n.entity_id, n.from_user_id);
    else navigate("/people/messages");
    setShowNotifications(false);
    if (!n.read) onRead(n.id);
  }

  return (
    <div
      onClick={handleRowClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 16px",
        borderBottom: "1px solid " + t.border,
        background: isUnread ? (type === "action" ? t.accent + "0a" : t.accentSubtle) : "transparent",
        cursor: "default",
        transition: "background 0.15s",
        position: "relative",
        // Left type border
        borderLeft: "3px solid " + (isUnread ? accent : "transparent"),
        paddingLeft: 14,
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: avColor(n.fromName || "?"),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        color: "#fff",
        flexShrink: 0,
        position: "relative",
      }}>
        {(n.fromAvatar || n.fromName || "?").slice(0, 2).toUpperCase()}
        {/* Type badge on avatar */}
        {type === "action" && isUnread && (
          <div style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: t.accent,
            border: "2px solid " + t.modalBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 7,
            fontWeight: 900,
            color: "#fff",
          }}>!</div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          lineHeight: 1.45,
          color: isUnread ? t.text : t.textSecondary,
          fontWeight: isUnread ? 600 : 400,
        }}>
          {label}
        </div>

        {/* Message preview */}
        {n.type === "message" && n.metadata && n.metadata.preview && (
          <div style={{
            fontSize: 12,
            color: t.textTertiary,
            marginTop: 3,
            fontStyle: "italic",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            "{n.metadata.preview}"
          </div>
        )}

        {/* Timestamp */}
        <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 4 }}>
          {notifTimeLabel(n.created_at)}
        </div>

        {/* ── CTAs ── */}

        {/* match_tag: inline confirm/decline */}
        {n.type === "match_tag" && !n.tag_status && (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button
              onMouseDown={function (e) { e.stopPropagation(); acceptMatchTag(n); }}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: "none",
                background: t.green,
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.82"; }}
              onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
            >Confirm</button>
            <button
              onMouseDown={function (e) { e.stopPropagation(); declineMatchTag(n); }}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid " + t.border,
                background: "transparent",
                color: t.textSecondary,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.7"; }}
              onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
            >Decline</button>
          </div>
        )}
        {n.type === "match_tag" && n.tag_status === "accepted" && (
          <div style={{ fontSize: 11, color: t.green, marginTop: 5, fontWeight: 600 }}>✓ Confirmed</div>
        )}
        {n.type === "match_tag" && n.tag_status === "declined" && (
          <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 5 }}>Declined</div>
        )}

        {/* message / message_request */}
        {(n.type === "message" || n.type === "message_request" || n.type === "message_request_accepted") && (
          <button
            onClick={function (e) { e.stopPropagation(); goMessages(); }}
            style={ctaStyle(t, t.accent, false)}
          >View message →</button>
        )}

        {/* match_reminder */}
        {n.type === "match_reminder" && (
          <button
            onClick={function (e) { e.stopPropagation(); goFeed(); }}
            style={ctaStyle(t, t.orange, true)}
          >View in feed →</button>
        )}

        {/* dispute / correction / counter */}
        {(n.type === "match_disputed" || n.type === "match_correction_requested" || n.type === "match_counter_proposed" || n.type === "match_voided") && (
          <button
            onClick={function (e) { e.stopPropagation(); goFeed(); }}
            style={ctaStyle(t, t.accent, false)}
          >Review in feed →</button>
        )}

        {/* match_confirmed: positive feedback line only */}
        {n.type === "match_confirmed" && (
          <div style={{ fontSize: 11, color: t.green, marginTop: 5, fontWeight: 600 }}>Stats updated ✓</div>
        )}
      </div>

      {/* Right side: unread dot + dismiss */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {isUnread && (
          <div style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: accent,
            marginTop: 2,
          }} />
        )}
        {canDismiss(n) && (
          <button
            onClick={function (e) { e.stopPropagation(); onDismiss(n.id); }}
            title="Dismiss"
            style={{
              background: "none",
              border: "none",
              color: t.textTertiary,
              fontSize: 14,
              lineHeight: 1,
              padding: "2px 4px",
              cursor: "pointer",
              borderRadius: 4,
              transition: "color 0.13s",
              opacity: 0.6,
            }}
            onMouseEnter={function (e) { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = t.text; }}
            onMouseLeave={function (e) { e.currentTarget.style.opacity = "0.6"; e.currentTarget.style.color = t.textTertiary; }}
          >×</button>
        )}
      </div>
    </div>
  );
}

function ctaStyle(t, color, hasSubtleBg) {
  return {
    display: "inline-block",
    marginTop: 8,
    padding: "4px 12px",
    borderRadius: 6,
    border: "1px solid " + color + "50",
    background: hasSubtleBg ? color + "15" : "transparent",
    color: color,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.13s",
  };
}

// ── Section divider ───────────────────────────────────────────────────────────
function SectionLabel({ label, t }) {
  return (
    <div style={{
      padding: "8px 16px 5px",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: t.textTertiary,
      background: t.bg,
      borderBottom: "1px solid " + t.border,
    }}>{label}</div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function NotificationsPanel({
  t,
  notifications,
  markAllRead,
  markNotificationsRead, // legacy alias
  markOneRead,
  dismissNotification,
  acceptMatchTag,
  declineMatchTag,
  setShowNotifications,
  refreshHistory,
  openConvById,
}) {
  // Accept legacy prop name from any call sites not yet updated
  var _markAllRead = markAllRead || markNotificationsRead;

  var sorted  = sortNotifications(notifications);
  var actions = sorted.filter(function (n) { return getNotifType(n) === "action"; });
  var importants = sorted.filter(function (n) { return getNotifType(n) === "important"; });
  var activity = sorted.filter(function (n) { return getNotifType(n) === "activity"; });

  var hasMarkable = notifications.some(function (n) {
    return !n.read && getNotifType(n) !== "action";
  });

  function handleRead(id) {
    if (markOneRead) markOneRead(id);
  }
  function handleDismiss(id) {
    if (dismissNotification) dismissNotification(id);
  }

  var rowProps = { t, onRead: handleRead, onDismiss: handleDismiss, acceptMatchTag, declineMatchTag, setShowNotifications, refreshHistory, openConvById };

  return (
    // Backdrop
    <div
      style={{ position: "fixed", inset: 0, zIndex: 45 }}
      onClick={function () { setShowNotifications(false); }}
    >
      {/* Panel */}
      <div
        className="cs-notif-panel"
        onClick={function (e) { e.stopPropagation(); }}
        style={{
          background: t.modalBg,
          border: "1px solid " + t.border,
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          zIndex: 46,
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 16px 14px",
          borderBottom: "1px solid " + t.border,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: t.text, letterSpacing: "-0.2px" }}>
            Notifications
          </span>
          {hasMarkable && (
            <button
              onClick={_markAllRead}
              style={{
                background: "none",
                border: "none",
                color: t.accent,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                padding: "2px 0",
                transition: "opacity 0.13s",
              }}
              onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.7"; }}
              onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
            >Mark all read</button>
          )}
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {notifications.length === 0 ? (
            // ── Empty state ──────────────────────────────────────────────────
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "52px 24px",
              gap: 10,
            }}>
              <div style={{ fontSize: 28, lineHeight: 1 }}>🎾</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>You're all caught up.</div>
              <div style={{ fontSize: 12, color: t.textTertiary, textAlign: "center", maxWidth: 200 }}>
                New activity, match results, and requests will show up here.
              </div>
            </div>
          ) : (
            <>
              {actions.length > 0 && (
                <>
                  <SectionLabel label="Needs your attention" t={t} />
                  {actions.map(function (n) {
                    return <NotifRow key={n.id} n={n} {...rowProps} />;
                  })}
                </>
              )}
              {importants.length > 0 && (
                <>
                  <SectionLabel label="Updates" t={t} />
                  {importants.map(function (n) {
                    return <NotifRow key={n.id} n={n} {...rowProps} />;
                  })}
                </>
              )}
              {activity.length > 0 && (
                <>
                  <SectionLabel label="Activity" t={t} />
                  {activity.map(function (n) {
                    return <NotifRow key={n.id} n={n} {...rowProps} />;
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
