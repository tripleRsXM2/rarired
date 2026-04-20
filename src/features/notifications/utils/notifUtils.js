// src/features/notifications/utils/notifUtils.js
// Type classification, copy, sorting, and clearing rules for notifications.
// Imported by both the hook and the panel — no React, no side-effects.

// ── Type classification ────────────────────────────────────────────────────────
// "action"    — requires user response; persists in badge until resolved
// "important" — meaningful update; can be read/dismissed
// "activity"  — passive update; cleared most easily

var ACTION_TYPES = new Set([
  "match_tag",
  "match_disputed",
  "match_correction_requested",
  "match_counter_proposed",
  "match_reminder",
  "friend_request",
  "message_request",
]);

var IMPORTANT_TYPES = new Set([
  "request_accepted",
  "message_request_accepted",
  "match_confirmed",
  "match_voided",
]);

export function getNotifType(n) {
  if (ACTION_TYPES.has(n.type)) return "action";
  if (IMPORTANT_TYPES.has(n.type)) return "important";
  return "activity";
}

// ── Human-readable copy ────────────────────────────────────────────────────────
export function getNotifLabel(n) {
  var name = n.fromName || "Someone";
  switch (n.type) {
    case "friend_request":             return name + " sent you a friend request.";
    case "request_accepted":           return name + " accepted your friend request.";
    case "message_request":            return name + " wants to message you.";
    case "message_request_accepted":   return name + " accepted your message request.";
    case "message":                    return name + " sent you a message.";
    case "match_tag":                  return name + " logged a match with you — confirm or dispute.";
    case "match_confirmed":            return name + " confirmed your match result.";
    case "match_disputed":             return name + " disputed the match result — response needed.";
    case "match_correction_requested": return name + " proposed a score correction.";
    case "match_counter_proposed":     return name + " counter-proposed a correction — review needed.";
    case "match_voided":               return "The disputed match with " + name + " was voided.";
    case "match_deleted":              return name + " removed a shared match from your feed.";
    case "match_reminder":             return "A pending match is expiring soon — check your feed.";
    case "like":                       return name + " liked your match.";
    case "comment":                    return name + " commented on your match.";
    default:                           return "New notification.";
  }
}

// ── Sorting ────────────────────────────────────────────────────────────────────
// action → important → activity, newest-first within each group.
var TYPE_ORDER = { action: 0, important: 1, activity: 2 };

export function sortNotifications(notifications) {
  return notifications.slice().sort(function (a, b) {
    var ta = TYPE_ORDER[getNotifType(a)];
    var tb = TYPE_ORDER[getNotifType(b)];
    if (ta !== tb) return ta - tb;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

// ── Clearing rules ─────────────────────────────────────────────────────────────
// Action items cannot be silently dismissed — they have no × button.
export function canDismiss(n) {
  return getNotifType(n) !== "action";
}

// ── Type accent colour (returns a theme token value) ──────────────────────────
export function notifAccentColor(n, t) {
  var type = getNotifType(n);
  if (type === "action")    return t.accent;
  if (type === "important") return t.green;
  return t.border;
}

// ── Relative time label ────────────────────────────────────────────────────────
export function notifTimeLabel(isoString) {
  var now  = Date.now();
  var then = new Date(isoString).getTime();
  var diff = Math.floor((now - then) / 1000); // seconds
  if (diff < 60)   return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
  return new Date(isoString).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
