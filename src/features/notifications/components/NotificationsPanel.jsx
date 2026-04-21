// src/features/notifications/components/NotificationsPanel.jsx
// Phase 2 — smart grouping, dispute threading, priority ordering,
// inline friend-request actions, swipe-to-dismiss on mobile.

import { useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { avColor } from "../../../lib/utils/avatar.js";
import {
  getEffectiveType,
  getNotifLabel,
  getThreadContextLabel,
  groupNotifications,
  getItemSection,
  getItemIds,
  canDismissItem,
  notifAccentColor,
  notifTimeLabel,
} from "../utils/notifUtils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function Avatar({ name, size, overlap }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: avColor(name || "?"),
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.32, fontWeight: 700, color: "#fff",
      flexShrink: 0,
      marginLeft: overlap ? -size * 0.28 : 0,
    }}>
      {(name || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

function ctaButton(t, color, subtle, label, onClick) {
  return (
    <button
      onClick={function (e) { e.stopPropagation(); onClick(e); }}
      style={{
        display: "inline-block",
        marginTop: 8, padding: "5px 13px",
        borderRadius: 6,
        border: "1px solid " + color + "55",
        background: subtle ? color + "18" : "transparent",
        color: color, fontSize: 11, fontWeight: 600,
        cursor: "pointer", transition: "opacity 0.13s",
      }}
      onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.75"; }}
      onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
    >{label}</button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dismiss button (× used across all row types)
// ─────────────────────────────────────────────────────────────────────────────

function DismissBtn({ t, onDismiss }) {
  return (
    <button
      onClick={function (e) { e.stopPropagation(); onDismiss(); }}
      title="Dismiss"
      style={{
        background: "none", border: "none",
        color: t.textTertiary, fontSize: 16, lineHeight: 1,
        padding: "2px 5px", cursor: "pointer",
        borderRadius: 4, opacity: 0.5,
        transition: "opacity 0.13s, color 0.13s",
        flexShrink: 0,
      }}
      onMouseEnter={function (e) { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = t.text; }}
      onMouseLeave={function (e) { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.color = t.textTertiary; }}
    >×</button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ label, t }) {
  return (
    <div style={{
      padding: "9px 16px 6px",
      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
      textTransform: "uppercase", color: t.textTertiary,
      background: t.bg, borderBottom: "1px solid " + t.border,
    }}>{label}</div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single notification row (with swipe-to-dismiss)
// ─────────────────────────────────────────────────────────────────────────────

function NotifRow({
  n, t, dismissable,
  onRead, onDismiss,
  onReviewMatch,
  acceptMatchTag, declineMatchTag,
  onAcceptFriendRequest, onDeclineFriendRequest,
  setShowNotifications, refreshHistory, openConvById,
}) {
  var navigate     = useNavigate();
  var effectiveType = getEffectiveType(n);
  var accent       = notifAccentColor(n, t);
  var isUnread     = !n.read;

  // ── Swipe state ──────────────────────────────────────────────────────────
  var [swipeX, setSwipeX]       = useState(0);
  var [isSwiping, setIsSwiping] = useState(false);
  var startXRef                 = useRef(0);

  function onTouchStart(e) {
    if (!dismissable) return;
    startXRef.current = e.touches[0].clientX;
    setIsSwiping(false);
  }
  function onTouchMove(e) {
    if (!dismissable) return;
    var delta = e.touches[0].clientX - startXRef.current;
    if (delta > 0) { setSwipeX(0); return; } // only leftward
    setIsSwiping(true);
    setSwipeX(Math.max(delta, -110));
  }
  function onTouchEnd() {
    if (!isSwiping) return;
    if (swipeX < -80) {
      onDismiss();
    } else {
      setSwipeX(0);
    }
    setIsSwiping(false);
  }

  // ── Navigation helpers ──────────────────────────────────────────────────
  function handleRowClick() {
    if (!n.read) onRead(n.id);
  }
  function goFeed(e) {
    if (e) e.stopPropagation();
    if (refreshHistory) refreshHistory();
    navigate("/home");
    setShowNotifications(false);
    if (!n.read) onRead(n.id);
  }
  function goMessages(e) {
    if (e) e.stopPropagation();
    if (openConvById) openConvById(n.entity_id, n.from_user_id);
    else navigate("/people/messages");
    setShowNotifications(false);
    if (!n.read) onRead(n.id);
  }

  // Swipe hint: show a red strip behind the row when swiped
  var swipeProgress = Math.min(Math.abs(swipeX) / 80, 1);

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      {/* Swipe-reveal delete strip */}
      {dismissable && (
        <div style={{
          position: "absolute", right: 0, top: 0, bottom: 0,
          width: 72,
          background: "#ef4444",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: swipeProgress,
          transition: isSwiping ? "none" : "opacity 0.25s",
        }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 5h10M7 5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M6 5l.5 9h5l.5-9"
              stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      {/* Main row */}
      <div
        onClick={handleRowClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          display: "flex", alignItems: "flex-start", gap: 11,
          padding: "13px 14px 13px 13px",
          borderBottom: "1px solid " + t.border,
          borderLeft: "3px solid " + (isUnread ? accent : "transparent"),
          background: isUnread
            ? (effectiveType === "action" ? accent + "0c" : t.accentSubtle)
            : "transparent",
          cursor: "default",
          transform: "translateX(" + swipeX + "px)",
          transition: isSwiping ? "none" : "transform 0.25s cubic-bezier(0.32,0.72,0,1), background 0.15s",
          willChange: "transform",
        }}
      >
        {/* Avatar + type badge */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Avatar name={n.fromName} size={34} />
          {effectiveType === "action" && isUnread && (
            <div style={{
              position: "absolute", bottom: -2, right: -2,
              width: 13, height: 13, borderRadius: "50%",
              background: accent, border: "2px solid " + t.modalBg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 7, fontWeight: 900, color: "#fff",
            }}>!</div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, lineHeight: 1.45,
            color: isUnread ? t.text : t.textSecondary,
            fontWeight: isUnread ? 600 : 400,
          }}>
            {getNotifLabel(n)}
          </div>

          {/* Message preview */}
          {n.type === "message" && n.metadata && n.metadata.preview && (
            <div style={{
              fontSize: 12, color: t.textTertiary, marginTop: 3,
              fontStyle: "italic", overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              "{n.metadata.preview}"
            </div>
          )}

          <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 4 }}>
            {notifTimeLabel(n.created_at)}
          </div>

          {/* ── Inline CTAs ── */}

          {/* match_tag */}
          {n.type === "match_tag" && !n.tag_status && (
            <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
              <button
                onMouseDown={function (e) { e.stopPropagation(); acceptMatchTag(n); }}
                style={{
                  padding: "5px 14px", borderRadius: 6, border: "none",
                  background: t.green, color: "#fff",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.82"; }}
                onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
              >Confirm</button>
              <button
                onMouseDown={function (e) { e.stopPropagation(); declineMatchTag(n); }}
                style={{
                  padding: "5px 12px", borderRadius: 6,
                  border: "1px solid " + t.border, background: "transparent",
                  color: t.textSecondary, fontSize: 12, fontWeight: 500,
                  cursor: "pointer", transition: "opacity 0.15s",
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

          {/* friend_request — inline accept/decline if handlers provided */}
          {n.type === "friend_request" && (
            <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
              {onAcceptFriendRequest
                ? <button
                    onMouseDown={function (e) { e.stopPropagation(); onAcceptFriendRequest(n); }}
                    style={{
                      padding: "5px 14px", borderRadius: 6, border: "none",
                      background: t.accent, color: "#fff",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                      transition: "opacity 0.15s",
                    }}
                    onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.82"; }}
                    onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
                  >Accept</button>
                : ctaButton(t, t.accent, false, "View requests →", function () { navigate("/people/requests"); setShowNotifications(false); })
              }
              {onDeclineFriendRequest && (
                <button
                  onMouseDown={function (e) { e.stopPropagation(); onDeclineFriendRequest(n); }}
                  style={{
                    padding: "5px 12px", borderRadius: 6,
                    border: "1px solid " + t.border, background: "transparent",
                    color: t.textSecondary, fontSize: 12, fontWeight: 500,
                    cursor: "pointer", transition: "opacity 0.15s",
                  }}
                  onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.7"; }}
                  onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
                >Decline</button>
              )}
            </div>
          )}

          {/* message / message_request */}
          {(n.type === "message" || n.type === "message_request" || n.type === "message_request_accepted") && (
            ctaButton(t, t.accent, false, "View message →", goMessages)
          )}

          {/* match reminder */}
          {n.type === "match_reminder" && ctaButton(t, t.orange, true, "View in feed →", goFeed)}

          {/* dispute / correction — opens in-context review drawer, no navigation */}
          {(n.type === "match_disputed" || n.type === "match_correction_requested" || n.type === "match_counter_proposed") && (
            <button
              onClick={function (e) {
                e.stopPropagation();
                if (!n.read) onRead(n.id);
                if (onReviewMatch) onReviewMatch(n);
              }}
              style={{
                display: "inline-block", marginTop: 8,
                padding: "5px 14px", borderRadius: 6,
                border: "none",
                background: t.accent, color: "#fff",
                fontSize: 11, fontWeight: 700,
                cursor: "pointer", transition: "opacity 0.13s",
                letterSpacing: "0.01em",
              }}
              onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.82"; }}
              onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
            >Review →</button>
          )}

          {/* voided / demoted — soft CTA */}
          {(n.type === "match_voided" || n._demoted) && (
            ctaButton(t, t.textSecondary, false, "View in feed →", goFeed)
          )}

          {/* match_confirmed: positive feedback */}
          {n.type === "match_confirmed" && (
            <div style={{ fontSize: 11, color: t.green, marginTop: 5, fontWeight: 600 }}>
              Stats updated ✓
            </div>
          )}
        </div>

        {/* Right col: unread dot + dismiss */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {isUnread && (
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: accent, marginTop: 2 }} />
          )}
          {dismissable && <DismissBtn t={t} onDismiss={onDismiss} />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Thread row — dispute thread with primary action + compact context
// ─────────────────────────────────────────────────────────────────────────────

function ThreadRow({ item, t, onRead, onDismiss, onReviewMatch, panelProps }) {
  var { primary, context } = item;
  var accent      = notifAccentColor(primary, t);
  var effectiveType = getEffectiveType(primary);
  var isUnread    = !primary.read;
  var dismissable = canDismissItem(item);

  // Swipe state (same logic as NotifRow)
  var [swipeX, setSwipeX]       = useState(0);
  var [isSwiping, setIsSwiping] = useState(false);
  var startXRef                 = useRef(0);

  function onTouchStart(e) {
    if (!dismissable) return;
    startXRef.current = e.touches[0].clientX;
    setIsSwiping(false);
  }
  function onTouchMove(e) {
    if (!dismissable) return;
    var delta = e.touches[0].clientX - startXRef.current;
    if (delta > 0) { setSwipeX(0); return; }
    setIsSwiping(true);
    setSwipeX(Math.max(delta, -110));
  }
  function onTouchEnd() {
    if (!isSwiping) return;
    if (swipeX < -80) onDismiss();
    else setSwipeX(0);
    setIsSwiping(false);
  }

  var swipeProgress = Math.min(Math.abs(swipeX) / 80, 1);

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      {dismissable && (
        <div style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: 72,
          background: "#ef4444",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: swipeProgress,
          transition: isSwiping ? "none" : "opacity 0.25s",
        }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 5h10M7 5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M6 5l.5 9h5l.5-9"
              stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      <div
        onClick={function () { if (!primary.read) onRead(primary.id); }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          padding: "13px 14px 0 13px",
          borderBottom: context.length ? "none" : "1px solid " + t.border,
          borderLeft: "3px solid " + (isUnread ? accent : "transparent"),
          background: isUnread
            ? (effectiveType === "action" ? accent + "0c" : t.accentSubtle)
            : "transparent",
          transform: "translateX(" + swipeX + "px)",
          transition: isSwiping ? "none" : "transform 0.25s cubic-bezier(0.32,0.72,0,1), background 0.15s",
          willChange: "transform",
        }}
      >
        {/* Primary event — same layout as NotifRow */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Avatar name={primary.fromName} size={34} />
            {effectiveType === "action" && isUnread && (
              <div style={{
                position: "absolute", bottom: -2, right: -2,
                width: 13, height: 13, borderRadius: "50%",
                background: accent, border: "2px solid " + t.modalBg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 7, fontWeight: 900, color: "#fff",
              }}>!</div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, lineHeight: 1.45,
              color: isUnread ? t.text : t.textSecondary,
              fontWeight: isUnread ? 600 : 400,
            }}>
              {getNotifLabel(primary)}
            </div>
            <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 4, marginBottom: 10 }}>
              {notifTimeLabel(primary.created_at)}
            </div>
            {/* CTAs for primary action — opens review drawer directly */}
            {(primary.type === "match_disputed" || primary.type === "match_correction_requested" || primary.type === "match_counter_proposed") && (
              <div style={{ marginBottom: 10 }}>
                <button
                  onClick={function (e) {
                    e.stopPropagation();
                    if (!primary.read) onRead(primary.id);
                    if (onReviewMatch) onReviewMatch(primary);
                  }}
                  style={{
                    padding: "5px 14px", borderRadius: 6,
                    border: "none",
                    background: accent, color: "#fff",
                    fontSize: 11, fontWeight: 700,
                    cursor: "pointer", transition: "opacity 0.13s",
                  }}
                  onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.82"; }}
                  onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
                >Review →</button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {isUnread && <div style={{ width: 7, height: 7, borderRadius: "50%", background: accent, marginTop: 2 }} />}
            {dismissable && <DismissBtn t={t} onDismiss={onDismiss} />}
          </div>
        </div>

        {/* Thread context — compact timeline */}
        {context.length > 0 && (
          <div style={{
            marginLeft: 45, // align with text column
            marginBottom: 10,
            paddingLeft: 10,
            borderLeft: "1px solid " + t.border,
          }}>
            {context.slice(0, 3).map(function (cn, i) {
              return (
                <div key={cn.id} style={{
                  display: "flex", alignItems: "baseline", gap: 6,
                  padding: "3px 0",
                }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: t.textTertiary, flexShrink: 0,
                    marginTop: 2,
                  }} />
                  <span style={{ fontSize: 11, color: t.textTertiary, lineHeight: 1.4 }}>
                    {getThreadContextLabel(cn)}
                    <span style={{ marginLeft: 5, opacity: 0.65 }}>
                      · {notifTimeLabel(cn.created_at)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Separator after thread */}
      {context.length > 0 && (
        <div style={{ borderBottom: "1px solid " + t.border }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Like group row — stacked avatars + summary
// ─────────────────────────────────────────────────────────────────────────────

function LikeGroupRow({ item, t, onDismiss }) {
  var { items } = item;
  var first  = items[0];
  var others = items.length - 1;
  var names  = items.slice(0, 3).map(function (n) { return n.fromName || "?"; });
  var label  = others > 0
    ? first.fromName + " and " + others + " other" + (others > 1 ? "s" : "") + " liked your match."
    : first.fromName + " liked your match.";

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      {/* Swipe hint strip */}
      <div style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: 72,
        background: "#ef4444",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M4 5h10M7 5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M6 5l.5 9h5l.5-9"
            stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 14px 12px 16px",
        borderBottom: "1px solid " + t.border,
        borderLeft: "3px solid transparent",
        background: "transparent",
      }}>
        {/* Stacked avatars */}
        <div style={{ display: "flex", flexShrink: 0 }}>
          {names.map(function (name, i) {
            return <Avatar key={i} name={name} size={28} overlap={i > 0} />;
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.4 }}>
            {label}
          </div>
          <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 3 }}>
            {notifTimeLabel(first.created_at)}
          </div>
        </div>

        <DismissBtn t={t} onDismiss={onDismiss} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

export default function NotificationsPanel({
  t,
  notifications,
  markAllRead,
  markNotificationsRead,   // legacy alias
  markOneRead,
  dismissNotification,
  dismissNotifications,
  acceptMatchTag,
  declineMatchTag,
  onAcceptFriendRequest,
  onDeclineFriendRequest,
  onReviewMatch,
  setShowNotifications,
  refreshHistory,
  openConvById,
}) {
  var navigate     = useNavigate();
  var _markAllRead = markAllRead || markNotificationsRead;

  // Group + sort once per render (cheap — O(n) passes)
  var displayItems = useMemo(function () {
    return groupNotifications(notifications);
  }, [notifications]);

  // Split into sections
  var actionItems    = displayItems.filter(function (i) { return getItemSection(i) === "action"; });
  var importantItems = displayItems.filter(function (i) { return getItemSection(i) === "important"; });
  var activityItems  = displayItems.filter(function (i) { return getItemSection(i) === "activity"; });

  var hasMarkable = notifications.some(function (n) {
    return !n.read && getEffectiveType(n) !== "action";
  });

  // ── Shared helpers passed into sub-rows ──────────────────────────────────
  function handleRead(id) { if (markOneRead) markOneRead(id); }

  function handleDismissItem(item) {
    var ids = getItemIds(item);
    if (ids.length === 1) {
      if (dismissNotification) dismissNotification(ids[0]);
    } else {
      if (dismissNotifications) dismissNotifications(ids);
    }
  }

  function goFeed(n) {
    if (refreshHistory) refreshHistory();
    navigate("/home");
    setShowNotifications(false);
    if (n && markOneRead && !n.read) markOneRead(n.id);
  }

  // ── Render a display item ────────────────────────────────────────────────
  function renderItem(item) {
    var key = item.kind === "single" ? item.n.id
            : item.kind === "thread" ? "thread-" + item.primary.id
            : "likes-" + item.items[0].id;

    if (item.kind === "like_group") {
      return (
        <LikeGroupRow
          key={key} item={item} t={t}
          onDismiss={function () { handleDismissItem(item); }}
        />
      );
    }

    if (item.kind === "thread") {
      return (
        <ThreadRow
          key={key} item={item} t={t}
          onRead={handleRead}
          onDismiss={function () { handleDismissItem(item); }}
          onReviewMatch={onReviewMatch}
          panelProps={{ goFeed: goFeed }}
        />
      );
    }

    // kind === "single"
    var n = item.n;
    return (
      <NotifRow
        key={key} n={n} t={t}
        dismissable={canDismissItem(item)}
        onRead={handleRead}
        onDismiss={function () { handleDismissItem(item); }}
        onReviewMatch={onReviewMatch}
        acceptMatchTag={acceptMatchTag}
        declineMatchTag={declineMatchTag}
        onAcceptFriendRequest={onAcceptFriendRequest}
        onDeclineFriendRequest={onDeclineFriendRequest}
        setShowNotifications={setShowNotifications}
        refreshHistory={refreshHistory}
        openConvById={openConvById}
      />
    );
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 45 }}
      onClick={function () { setShowNotifications(false); }}
    >
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
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: "16px 16px 13px",
          borderBottom: "1px solid " + t.border,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: t.text, letterSpacing: "-0.2px" }}>
            Notifications
          </span>
          {hasMarkable && (
            <button
              onClick={_markAllRead}
              style={{
                background: "none", border: "none",
                color: t.accent, fontSize: 12, fontWeight: 600,
                cursor: "pointer", padding: "2px 0",
                transition: "opacity 0.13s",
              }}
              onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.7"; }}
              onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
            >Mark all read</button>
          )}
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {displayItems.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: "52px 24px", gap: 10,
            }}>
              <div style={{ fontSize: 28, lineHeight: 1 }}>🎾</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>You're all caught up.</div>
              <div style={{ fontSize: 12, color: t.textTertiary, textAlign: "center", maxWidth: 200 }}>
                New activity, match results, and requests will show up here.
              </div>
            </div>
          ) : (
            <>
              {actionItems.length > 0 && (
                <>
                  <SectionLabel label="Needs your attention" t={t} />
                  {actionItems.map(renderItem)}
                </>
              )}
              {importantItems.length > 0 && (
                <>
                  <SectionLabel label="Updates" t={t} />
                  {importantItems.map(renderItem)}
                </>
              )}
              {activityItems.length > 0 && (
                <>
                  <SectionLabel label="Activity" t={t} />
                  {activityItems.map(renderItem)}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
