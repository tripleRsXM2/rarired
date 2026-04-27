// src/features/notifications/utils/notifUtils.js
//
// Module 11 (Slice 2) — single canonical lifecycle filter + grouping.
//
// Replaces the prior category-classification / smart-demotion / priority-
// scoring logic with a much smaller surface. The whole "what's in the
// notification centre" question now collapses to: isActiveForUser(n).
//
// Read paths:
//   - useNotifications hook (badge count + tray rendering filter)
//   - NotificationsPanel (single newest-first list, grouping inside)
//
// Removed:
//   - ACTION_TYPES / IMPORTANT_TYPES sets (replaced by NOTIF_TYPES registry)
//   - applySmartDemotion (server-side resolved_at handles this now)
//   - getEffectiveType / _demoted flag (no longer needed)
//   - computePriorityScore + sortNotifications (replaced by sortByCreatedAt)
//   - TYPE_BASE_SCORE / TYPE_URGENCY_BONUS (registry-driven)
//
// What stays:
//   - getNotifLabel / getThreadContextLabel / notifTimeLabel (copy)
//   - groupNotifications (dispute-thread + like_group + comment_group
//     collapsing, per Slice 2 product sign-off)
//   - matchKey / canDismiss / canDismissItem / getItemIds (helpers)

import { getTypeMeta, isVisibleInCentre } from "../types.js";

// ─── Lifecycle helpers ───────────────────────────────────────────────────────

// True if this notification owes the recipient an action (and that
// action hasn't been resolved). Action_required is read from the
// central registry; resolved_at comes from Slice 1's lifecycle column.
export function isActionable(n) {
  if (!n) return false;
  if (n.resolved_at) return false;
  return getTypeMeta(n.type).action_required === true;
}

// THE canonical "is this row visible in the notification centre right
// now?" filter. Used by the panel render, the badge count, every
// future "active notifications" surface. If you need a different
// filter somewhere, talk to the team — duplicating the rule here is
// the single biggest source of badge / inbox mismatch.
//
// Returns true when:
//   - row is for the currently-relevant audience (not the filtered-out 'message')
//   - row is not resolved (server-side action complete)
//   - row is not dismissed (user manually hid it)
//   - row is not expired (time window passed)
//   - row is either:
//       (a) an unresolved actionable (stays visible past read), OR
//       (b) an unread informational (hides on first read)
//
// Note: read_at takes precedence over the legacy `read` boolean.
// During Slice 2's transition we write both — `read = true` plus
// `read_at = now()` — but reads only consult read_at so a row whose
// `read` was set by old code without read_at still behaves correctly
// once it's read by new code.
export function isActiveForUser(n) {
  if (!n) return false;
  if (!isVisibleInCentre(n.type)) return false;     // 'message' never shows
  if (n.dismissed_at) return false;
  if (n.resolved_at) return false;
  if (n.expires_at && new Date(n.expires_at) <= new Date()) return false;

  if (isActionable(n)) {
    // Actionable + unresolved: always visible (read or unread).
    return true;
  }
  // Informational: visible only until first read.
  // Treat legacy `read = true` rows without read_at as read for safety.
  return !n.read_at && !n.read;
}

// True if the row counts toward the unread badge. Slightly different
// from isActiveForUser:
//   - actionable + unresolved: counts as "needs attention" forever,
//     even after the user has opened it (read_at set)
//   - informational: counts only while unread
// Resolved / dismissed / expired rows never count.
export function countsAsUnread(n) {
  if (!n) return false;
  if (!isVisibleInCentre(n.type)) return false;
  if (n.dismissed_at) return false;
  if (n.resolved_at) return false;
  if (n.expires_at && new Date(n.expires_at) <= new Date()) return false;

  if (isActionable(n)) return true;          // unresolved action always counts
  return !n.read_at && !n.read;              // informational counts while unread
}

// ─── Copy ────────────────────────────────────────────────────────────────────

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
    case "match_expired":              return "Your match with " + name + " expired unconfirmed — it doesn't count towards stats.";
    case "match_reminder":             return "A pending match is expiring soon — check your feed.";
    case "like":                       return name + " liked your match.";
    case "comment":                    return name + " commented on your match.";
    case "challenge_received":         return name + " challenged you to play.";
    case "challenge_accepted":         return name + " accepted your challenge — log the result when you've played.";
    case "challenge_declined":         return name + " declined your challenge.";
    case "challenge_expired":          return "Your challenge to " + name + " expired without a response.";
    case "league_invite":              return name + " invited you to a league.";
    case "league_joined":              return name + " joined your league.";
    case "match_invite_claimed":       return name + " joined CourtSync and claimed the match — they'll confirm or dispute next.";
    case "match_invite_declined":      return name + " marked your invite as 'not me' — you can re-issue or void the match.";
    case "casual_match_logged":        return name + " logged a casual match with you.";
    default:                           return "New notification.";
  }
}

export function getThreadContextLabel(n) {
  var name = n.fromName || "Someone";
  switch (n.type) {
    case "match_tag":                  return name + " logged the match";
    case "match_confirmed":            return name + " confirmed the result";
    case "match_disputed":             return name + " disputed the result";
    case "match_correction_requested": return name + " proposed a correction";
    case "match_counter_proposed":     return name + " counter-proposed";
    case "match_voided":               return "Match was voided";
    default:                           return getNotifLabel(n);
  }
}

// Match-id helper — handles the legacy match_id column + the newer
// entity_id uuid column transparently. Used to bucket notifications
// by the match they relate to.
export function matchKey(n) {
  return n.match_id || n.entity_id || null;
}

// ─── Sorting ──────────────────────────────────────────────────────────────────
//
// Slice 2 collapses the prior priority-scored sort to "newest first".
// Unresolved actionables get a soft pin to the top so they don't drift
// behind a flurry of recent informational rows — but the visual
// remains a single list, no section headers.
function sortByActiveThenDate(notifications) {
  return notifications.slice().sort(function (a, b) {
    var aPin = isActionable(a) ? 1 : 0;
    var bPin = isActionable(b) ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    var aT = a.created_at ? new Date(a.created_at).getTime() : 0;
    var bT = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bT - aT;
  });
}

// ─── Grouping ────────────────────────────────────────────────────────────────
//
// Same display-item shapes as before — the panel keeps thread / like_group
// / comment_group collapsing inside the unified list (per Slice 2 sign-off:
// "keep grouping if it reduces noise, but inside the single list").
//
// Filter happens FIRST: only active rows can group.

var DISPUTE_FAMILY = {
  match_tag: 1, match_disputed: 1, match_correction_requested: 1,
  match_counter_proposed: 1, match_voided: 1, match_confirmed: 1,
};

export function groupNotifications(rawNotifications) {
  // 1. Drop everything that's not active in the centre right now.
  var visible = (rawNotifications || []).filter(isActiveForUser);

  // 2. Stable sort: actionables on top, otherwise newest first.
  var sorted = sortByActiveThenDate(visible);

  var threadBuckets  = {};
  var likeBuckets    = {};
  var commentBuckets = {};
  var singles        = [];

  sorted.forEach(function (n) {
    var key = matchKey(n);
    if (DISPUTE_FAMILY[n.type] && key) {
      if (!threadBuckets[key]) threadBuckets[key] = [];
      threadBuckets[key].push(n);
    } else if (n.type === "like" && key) {
      if (!likeBuckets[key]) likeBuckets[key] = [];
      likeBuckets[key].push(n);
    } else if (n.type === "comment" && key) {
      if (!commentBuckets[key]) commentBuckets[key] = [];
      commentBuckets[key].push(n);
    } else {
      singles.push({ kind: "single", n: n });
    }
  });

  // Threads: primary = first row (already sorted with actionables on top),
  // rest become context.
  var threadItems = Object.values(threadBuckets).map(function (group) {
    var primary = group[0];
    var context = group.slice(1);
    return { kind: "thread", primary: primary, context: context };
  });

  // Likes / comments: collapse multiple-on-same-match into a group;
  // a single one stays as a normal row.
  var likeItems = Object.values(likeBuckets).map(function (group) {
    if (group.length === 1) return { kind: "single", n: group[0] };
    return { kind: "like_group", items: group };
  });
  var commentItems = Object.values(commentBuckets).map(function (group) {
    if (group.length === 1) return { kind: "single", n: group[0] };
    return { kind: "comment_group", items: group };
  });

  // Merge into one list. Use the primary row's date for thread/group
  // sort so groups float with their newest content, with the same
  // actionable-pin rule applied at the item level.
  function itemSortKey(item) {
    var refRow = item.kind === "single"        ? item.n
              : item.kind === "thread"         ? item.primary
              : /* like_group / comment_group */  item.items[0];
    return refRow;
  }
  var merged = singles.concat(threadItems).concat(likeItems).concat(commentItems);
  return merged.sort(function (a, b) {
    var aRow = itemSortKey(a);
    var bRow = itemSortKey(b);
    var aPin = isActionable(aRow) ? 1 : 0;
    var bPin = isActionable(bRow) ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    var aT = aRow.created_at ? new Date(aRow.created_at).getTime() : 0;
    var bT = bRow.created_at ? new Date(bRow.created_at).getTime() : 0;
    return bT - aT;
  });
}

// ─── Display-item helpers (kept for panel) ───────────────────────────────────

export function canDismiss(n) { return !!n; }

export function canDismissItem(item) {
  if (item.kind === "single")        return canDismiss(item.n);
  if (item.kind === "thread")        return canDismiss(item.primary);
  if (item.kind === "like_group")    return true;
  if (item.kind === "comment_group") return true;
  return false;
}

export function getItemIds(item) {
  if (item.kind === "single")        return [item.n.id];
  if (item.kind === "thread")        return [item.primary].concat(item.context).map(function (n) { return n.id; });
  if (item.kind === "like_group")    return item.items.map(function (n) { return n.id; });
  if (item.kind === "comment_group") return item.items.map(function (n) { return n.id; });
  return [];
}

// ─── Per-row visual accent ───────────────────────────────────────────────────
// Keep a single function so the panel can stay declarative. Drives the
// left-edge bar colour: actionable → accent (draw the eye), informational
// → muted.
export function notifAccentColor(n, t) {
  if (!t) return null;
  return isActionable(n) ? t.accent : t.border;
}

// ─── Time label ──────────────────────────────────────────────────────────────
export function notifTimeLabel(isoString) {
  if (!isoString) return "";
  var now  = Date.now();
  var then = new Date(isoString).getTime();
  var diff = Math.floor((now - then) / 1000);
  if (diff < 60)     return "just now";
  if (diff < 3600)   return Math.floor(diff / 60)   + "m ago";
  if (diff < 86400)  return Math.floor(diff / 3600) + "h ago";
  if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
  return new Date(isoString).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ─── Backward-compat shims ───────────────────────────────────────────────────
//
// Keep these tiny surface-area exports so legacy imports don't break
// while NotificationsPanel finishes migrating.
//
// All three reduce to: "is this an unresolved actionable?".

export function getNotifType(n) {
  // Coarse legacy 3-bucket label. Dispute family + action types → "action".
  // Everything else is "activity" because we no longer surface
  // "important" as a separate UI bucket. Kept only for any third-party
  // import that hasn't migrated yet.
  return isActionable(n) ? "action" : "activity";
}
export function getEffectiveType(n) { return getNotifType(n); }
export function getItemSection(item) {
  if (item.kind === "single")  return getNotifType(item.n);
  if (item.kind === "thread")  return getNotifType(item.primary);
  return "activity";
}
