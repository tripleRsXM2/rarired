// src/features/people/utils/messaging.js
//
// Pure helpers for the DM UI. Extracted so they can be unit-tested without
// spinning up React / Supabase. All functions here must be deterministic and
// side-effect-free (except `hideMessageForMe` which touches localStorage).

// ── Time formatting ────────────────────────────────────────────────────────
// Relative within the hour, time-of-day within today, short date otherwise.
// Stable against bad inputs — empty / null / invalid dates return "".
export function formatMessageTime(iso, now) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  var nowD = now ? new Date(now) : new Date();
  var diff = Math.floor((nowD - d) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (d.toDateString() === nowD.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

// ── Conversation preview helpers ───────────────────────────────────────────

// Unified truncation for message previews in the conversation list + reply bar.
// Collapses runs of whitespace and hard-caps length.
export function previewify(text, max) {
  if (!text) return "";
  var m = max || 80;
  var s = String(text).replace(/\s+/g, " ").trim();
  return s.length > m ? s.slice(0, m - 1) + "…" : s;
}

// ── Thread helpers ─────────────────────────────────────────────────────────

// Index of the first message from *the other person* that arrived after my
// lastReadAt. Used to render the "Unread Messages" divider. Returns -1 if
// there's no unread boundary to draw.
export function computeUnreadDividerIdx(messages, myId, lastReadAt) {
  if (!lastReadAt || !messages || !messages.length) return -1;
  var at = new Date(lastReadAt);
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    if (m.sender_id !== myId && new Date(m.created_at) > at) return i;
  }
  return -1;
}

// Index of the most recent message I sent that my partner has confirmed read
// (their last_read_at >= message.created_at). -1 if they haven't read any of
// mine. Deleted messages don't carry a "Seen" receipt.
export function computeLastSeenByPartnerIdx(messages, myId, partnerLastReadAt) {
  if (!partnerLastReadAt || !messages || !messages.length) return -1;
  var at = new Date(partnerLastReadAt);
  for (var j = messages.length - 1; j >= 0; j--) {
    var m = messages[j];
    if (m.sender_id === myId && !m.deleted_at && new Date(m.created_at) <= at) return j;
  }
  return -1;
}

// Reactions are stored as flat rows; group them by emoji for the bubble row.
// Returns { "👍": ["uidA","uidB"], ... } preserving insertion order.
export function groupReactions(rows) {
  var out = {};
  (rows || []).forEach(function (r) {
    if (!r || !r.emoji) return;
    if (!out[r.emoji]) out[r.emoji] = [];
    out[r.emoji].push(r.user_id);
  });
  return out;
}

// Dedupe-and-append helper for realtime message INSERTs. Accepts an existing
// array and a new row; returns either a new array with the row appended (id
// not already present) or the existing array (reference-stable so React can
// short-circuit re-renders).
export function appendMessageIfNew(messages, row) {
  if (!row || !row.id) return messages;
  for (var i = 0; i < messages.length; i++) {
    if (messages[i].id === row.id) return messages;
  }
  return messages.concat([row]);
}

// Apply a patch (partial row) to a message by id. Returns the original array
// reference if no matching id, so state setters can bail on no-op updates.
export function patchMessageById(messages, patch) {
  if (!patch || !patch.id) return messages;
  var changed = false;
  var next = messages.map(function (m) {
    if (m.id !== patch.id) return m;
    changed = true;
    return Object.assign({}, m, patch);
  });
  return changed ? next : messages;
}

// ── Hidden-for-me (client-only soft hide) ─────────────────────────────────

export function hiddenMsgsKey(userId) {
  return "cs_hidden_msgs_" + (userId || "anon");
}

export function readHiddenMsgs(userId) {
  if (typeof localStorage === "undefined") return {};
  try {
    var raw = localStorage.getItem(hiddenMsgsKey(userId)) || "{}";
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function writeHiddenMsgs(userId, map) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(hiddenMsgsKey(userId), JSON.stringify(map || {}));
  } catch (e) { /* storage full / private mode — silent */ }
}

export function filterHiddenMessages(messages, hiddenMap) {
  if (!hiddenMap || !Object.keys(hiddenMap).length) return messages || [];
  return (messages || []).filter(function (m) { return !hiddenMap[m.id]; });
}

// ── Context menu positioning ──────────────────────────────────────────────

// Given the anchor rect + viewport, return a clamped {top, left} for a
// popup of approx `menuW x menuH`. Prefers below-and-centered; falls back to
// above if below would overflow, then clamps to the viewport with 8px inset.
export function computeContextMenuPos(rect, vw, vh, menuW, menuH) {
  var w = menuW || 200, h = menuH || 280;
  var below = rect.bottom + 4;
  var above = rect.top - h - 4;
  var top = (below + h > vh) ? above : below;
  if (top < 8) top = 8;
  if (top + h > vh - 8) top = Math.max(8, vh - h - 8);
  var mid = rect.left + rect.width / 2 - w / 2;
  var left = Math.max(8, Math.min(mid, vw - w - 8));
  return { top: top, left: left };
}

// ── Draft validation ──────────────────────────────────────────────────────

// Trim + max-length guard (matches `direct_messages.content` text column —
// we don't enforce server-side, so the client is the only stop). Returns
// { ok, value, reason } for use by sendMessage.
export var MESSAGE_MAX = 4000;
export function validateDraft(draft) {
  var v = (draft == null ? "" : String(draft)).trim();
  if (!v) return { ok: false, value: "", reason: "empty" };
  if (v.length > MESSAGE_MAX) {
    return { ok: false, value: v.slice(0, MESSAGE_MAX), reason: "too_long" };
  }
  return { ok: true, value: v, reason: null };
}

// ── Date separators in a thread ───────────────────────────────────────────
// Returns a label like "Today", "Yesterday", "Sunday", or "17 Apr" for the
// given ISO date, compared against `now`. Stable in any timezone.
export function dateSeparatorLabel(iso, now) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  var nowD = now ? new Date(now) : new Date();
  // Compare by LOCAL calendar day.
  function startOfDay(x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); }
  var diffDays = Math.round((startOfDay(nowD) - startOfDay(d)) / (24 * 3600 * 1000));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

// Given a sorted-ascending messages array, return a Set of message ids
// that should display a date-separator row ABOVE them (the first message
// of each calendar day). Pure — O(n).
export function computeDateSeparatorIds(messages) {
  var out = new Set();
  var lastDayKey = null;
  (messages || []).forEach(function (m) {
    if (!m || !m.created_at) return;
    var d = new Date(m.created_at);
    if (isNaN(d.getTime())) return;
    var key = d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
    if (key !== lastDayKey) {
      out.add(m.id);
      lastDayKey = key;
    }
  });
  return out;
}
