// src/features/notifications/utils/notifUtils.js
// Phase 2 — type classification, priority scoring, smart demotion, grouping,
// copy, and clearing rules. No React, no side-effects.

// ── Type classification ────────────────────────────────────────────────────────
var ACTION_TYPES = new Set([
  "match_tag",
  "match_disputed",
  "match_correction_requested",
  "match_counter_proposed",
  "match_reminder",
  "friend_request",
  "message_request",
  // Module 4: incoming challenge needs a yes/no response.
  "challenge_received",
]);

var IMPORTANT_TYPES = new Set([
  "request_accepted",
  "message_request_accepted",
  "match_confirmed",
  "match_voided",
  "match_expired",
  // Module 4: outcomes of a challenge you sent.
  "challenge_accepted",
  "challenge_declined",
  "challenge_expired",
]);

export function getNotifType(n) {
  if (ACTION_TYPES.has(n.type)) return "action";
  if (IMPORTANT_TYPES.has(n.type)) return "important";
  return "activity";
}

// getEffectiveType respects smart demotion (_demoted flag set by applySmartDemotion).
export function getEffectiveType(n) {
  if (n._demoted) return "important";
  return getNotifType(n);
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
    case "match_expired":              return "Your match with " + name + " expired unconfirmed — it doesn't count towards stats.";
    case "match_reminder":             return "A pending match is expiring soon — check your feed.";
    case "like":                       return name + " liked your match.";
    case "comment":                    return name + " commented on your match.";
    case "challenge_received":         return name + " challenged you to a match.";
    case "challenge_accepted":         return name + " accepted your challenge — log the result when you've played.";
    case "challenge_declined":         return name + " declined your challenge.";
    case "challenge_expired":          return "Your challenge to " + name + " expired without a response.";
    default:                           return "New notification.";
  }
}

// Compact label for thread context lines (no trailing punctuation for readability).
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

// ── Priority scoring ───────────────────────────────────────────────────────────
// Replaces pure bucket + date sort. Keeps natural action → important → activity
// grouping while elevating urgency and recency within buckets.

var TYPE_BASE_SCORE = { action: 3000, important: 2000, activity: 1000 };

var TYPE_URGENCY_BONUS = {
  match_disputed:             450,
  match_counter_proposed:     400,
  match_correction_requested: 380,
  match_tag:                  320,
  match_reminder:             280,
  friend_request:             220,
  message_request:            180,
  message_request_accepted:   60,
  match_confirmed:            50,
  match_voided:               40,
  match_expired:              30,
  // Module 4
  challenge_received:        300,  // ranked just below match_tag — needs response
  challenge_accepted:         70,  // positive, prompts log-result
  challenge_declined:         20,
  challenge_expired:          15,
};

export function computePriorityScore(n) {
  var effectiveType = getEffectiveType(n);
  var base    = TYPE_BASE_SCORE[effectiveType] || 1000;
  var urgency = TYPE_URGENCY_BONUS[n.type] || 0;
  var unread  = n.read ? 0 : 80;
  // Recency decay over 7 days (0–200 points)
  var ageMs   = Date.now() - new Date(n.created_at || Date.now()).getTime();
  var ageDays = ageMs / (1000 * 60 * 60 * 24);
  var recency = Math.max(0, Math.round(200 * (1 - Math.min(ageDays / 7, 1))));
  return base + urgency + unread + recency;
}

// ── Sorting ────────────────────────────────────────────────────────────────────
export function sortNotifications(notifications) {
  return notifications.slice().sort(function (a, b) {
    return computePriorityScore(b) - computePriorityScore(a);
  });
}

// ── Match key helper ──────────────────────────────────────────────────────────
// Notifications use match_id for match-related types, entity_id for social
// (friend_request, conversation). Use this everywhere to avoid confusion.
export function matchKey(n) {
  return n.match_id || n.entity_id || null;
}

// ── Smart demotion ─────────────────────────────────────────────────────────────
// When a match has been confirmed or voided, lingering dispute notifications
// for the same match are demoted from "action" to "important". They remain
// visible (for context) but no longer assert urgency.

var DEMOTABLE_DISPUTE_TYPES = new Set([
  "match_disputed",
  "match_correction_requested",
  "match_counter_proposed",
]);

export function applySmartDemotion(notifications) {
  var resolvedIds = new Set();
  notifications.forEach(function (n) {
    if ((n.type === "match_confirmed" || n.type === "match_voided") && matchKey(n)) {
      resolvedIds.add(matchKey(n));
    }
  });
  if (!resolvedIds.size) return notifications;
  return notifications.map(function (n) {
    if (matchKey(n) && resolvedIds.has(matchKey(n)) && DEMOTABLE_DISPUTE_TYPES.has(n.type)) {
      return Object.assign({}, n, { _demoted: true });
    }
    return n;
  });
}

// ── Smart grouping ─────────────────────────────────────────────────────────────
// Returns an array of "display items" for the panel renderer:
//
//   { kind: "single",     n,                       score }
//   { kind: "thread",     primary, context: [n…],  score }  ← dispute threads
//   { kind: "like_group", items: [n…],              score }  ← likes on same match
//
// Rules:
//   - action-required notifications are NEVER hidden — they always appear as
//     the primary of their thread or as a standalone single.
//   - Dispute-family types for the same entity_id form a thread; the highest-
//     priority item is the primary.
//   - Multiple likes on the same match collapse into one like_group item.

var DISPUTE_FAMILY = new Set([
  "match_tag",
  "match_disputed",
  "match_correction_requested",
  "match_counter_proposed",
  "match_voided",
  "match_confirmed",
]);

export function groupNotifications(rawNotifications) {
  var ns = applySmartDemotion(rawNotifications);
  var sorted = sortNotifications(ns);

  // Bucket into: threads, like groups, comment groups, singles
  var threadBuckets  = {};   // matchKey → [n]
  var likeBuckets    = {};   // matchKey → [n]
  var commentBuckets = {};   // matchKey → [n] (Module 6)
  var singles        = [];

  sorted.forEach(function (n) {
    var key = matchKey(n);
    if (DISPUTE_FAMILY.has(n.type) && key) {
      if (!threadBuckets[key]) threadBuckets[key] = [];
      threadBuckets[key].push(n);
    } else if (n.type === "like" && key) {
      if (!likeBuckets[key]) likeBuckets[key] = [];
      likeBuckets[key].push(n);
    } else if (n.type === "comment" && key) {
      if (!commentBuckets[key]) commentBuckets[key] = [];
      commentBuckets[key].push(n);
    } else {
      singles.push({ kind: "single", n: n, score: computePriorityScore(n) });
    }
  });

  // Flatten thread buckets → display items
  var threadItems = Object.values(threadBuckets).map(function (group) {
    // Primary = highest-priority notification in the thread
    var by_score = group.slice().sort(function (a, b) {
      return computePriorityScore(b) - computePriorityScore(a);
    });
    var primary = by_score[0];
    var context = by_score.slice(1); // older / lower-priority events for context
    return {
      kind: "thread",
      primary: primary,
      context: context,
      score: computePriorityScore(primary),
    };
  });

  // Flatten like buckets → display items
  var likeItems = Object.values(likeBuckets).map(function (group) {
    var byDate = group.slice().sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    if (byDate.length === 1) {
      return { kind: "single", n: byDate[0], score: computePriorityScore(byDate[0]) };
    }
    return { kind: "like_group", items: byDate, score: computePriorityScore(byDate[0]) };
  });

  // Module 6: comment groups — same shape as like_group but rendered with a
  // "comment" verb. Single comments stay as their own row.
  var commentItems = Object.values(commentBuckets).map(function (group) {
    var byDate = group.slice().sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    if (byDate.length === 1) {
      return { kind: "single", n: byDate[0], score: computePriorityScore(byDate[0]) };
    }
    return { kind: "comment_group", items: byDate, score: computePriorityScore(byDate[0]) };
  });

  // Merge and sort all display items by score
  return singles.concat(threadItems).concat(likeItems).concat(commentItems)
    .sort(function (a, b) { return b.score - a.score; });
}

// ── Clearing rules ─────────────────────────────────────────────────────────────
// Every notification is dismissable. Deleting the notification row never
// affects the underlying object (match, dispute, challenge) — it just
// removes the nag from the inbox. If the user has already resolved the
// action elsewhere (or simply wants to declutter), let them clear it.
export function canDismiss(n) { return !!n; }

// Can an entire display item be dismissed? All four kinds are dismissable.
export function canDismissItem(item) {
  if (item.kind === "single")        return canDismiss(item.n);
  if (item.kind === "thread")        return canDismiss(item.primary);
  if (item.kind === "like_group")    return true;
  if (item.kind === "comment_group") return true;
  return false;
}

// All notification IDs that make up a display item.
export function getItemIds(item) {
  if (item.kind === "single")        return [item.n.id];
  if (item.kind === "thread")        return [item.primary].concat(item.context).map(function (n) { return n.id; });
  if (item.kind === "like_group")    return item.items.map(function (n) { return n.id; });
  if (item.kind === "comment_group") return item.items.map(function (n) { return n.id; });
  return [];
}

// Section (action / important / activity) for a display item.
export function getItemSection(item) {
  if (item.kind === "single")        return getEffectiveType(item.n);
  if (item.kind === "thread")        return getEffectiveType(item.primary);
  if (item.kind === "like_group")    return "activity";
  if (item.kind === "comment_group") return "activity";
  return "activity";
}

// ── Type accent colour ─────────────────────────────────────────────────────────
export function notifAccentColor(n, t) {
  var type = getEffectiveType(n);
  if (type === "action")    return t.accent;
  if (type === "important") return t.green;
  return t.border;
}

// ── Relative time label ────────────────────────────────────────────────────────
export function notifTimeLabel(isoString) {
  var now  = Date.now();
  var then = new Date(isoString).getTime();
  var diff = Math.floor((now - then) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
  return new Date(isoString).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
