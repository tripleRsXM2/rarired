// src/v2/features/messages/v2MessageAdapter.js
//
// Maps V1's useDMs hook shapes into the V2 MessagesScreen prototype
// shapes. V2 originally rendered from a hardcoded MESSAGES_SEED array;
// PR1 swaps that out for real Supabase data while leaving the visual
// component tree (Inbox / ConvoRow / Avatar / Bubble) untouched.
//
// V1 conversation row shape (post-enrichment in useDMs.loadConversations):
//   { id, isGroup, status, participants[], partner|null,
//     last_message_at, last_message_preview, last_message_sender_id,
//     hasUnread, user1_id, user2_id }
//
// V1 direct_messages row shape (from D.fetchThread):
//   { id, conversation_id, sender_id, content, created_at,
//     deleted_at, reply_to_id, ... }
//
// V2 conversation shape (consumed by ConvoRow):
//   { id, type:"dm"|"group", name, initials, color, activeNow, unread,
//     pinned, typing, lastTime, lastSender, lastPreview }
//
// V2 message shape (consumed by Bubble):
//   { id, from, text, t, side:"me"|"them", avatar }
//
// Widget kinds (score/invite/confirm) are deferred to PR2 — the schema
// doesn't carry them yet. Plain text bubbles only here.

import { avColor, initials as deriveInitials } from "../../../lib/utils/avatar.js";
import { getPresence } from "../../../features/people/services/presenceService.js";

// V1 has a `convTitle` helper inside Messages.jsx — duplicated here so
// the v2 adapter stays out of the v1 component import tree. Same rules:
// 1:1 → partner name; group → up to 2 names + "& N others".
export function convTitle(conv, me) {
  if (!conv) return "";
  // Group custom-name wins when present (set via rename_conversation
  // RPC, migration 20260516_group_dedupe_and_rename). Falls back to
  // the participant-list label so un-renamed groups still read well.
  if (conv.isGroup && conv.name) return conv.name;
  if (!conv.isGroup) return (conv.partner && conv.partner.name) || "Conversation";
  var others = (conv.participants || []).filter(function (p) { return p && p.id !== me; });
  if (others.length === 0) return "Group";
  if (others.length === 1) return others[0].name || "Player";
  if (others.length === 2) return (others[0].name || "Player") + " & " + (others[1].name || "Player");
  return (others[0].name || "Player") + ", " + (others[1].name || "Player") +
    " & " + (others.length - 2) + " other" + (others.length - 2 === 1 ? "" : "s");
}

// Relative time for inbox rows: "now", "11:42", "Yesterday", "Mon",
// "Apr 30". Mirrors the visual cadence of the prototype seed data.
export function formatRelativeTime(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  var now = new Date();
  var sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    var hh = d.getHours();
    var mm = d.getMinutes();
    var pad = mm < 10 ? "0" + mm : mm;
    var h12 = ((hh + 11) % 12) + 1;
    var ampm = hh >= 12 ? "PM" : "AM";
    // Match prototype: bare 24h-style "11:42" for the row time. Keep
    // it terse — the inbox column is narrow.
    return h12 + ":" + pad + " " + ampm;
  }
  var yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  var diffMs = now.getTime() - d.getTime();
  if (diffMs < 7 * 86400 * 1000) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

// Bubble timestamp — "10:54", "Yesterday 5:14 PM". A bit more granular
// than the inbox row stamp.
export function formatTimestamp(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  var hh = d.getHours();
  var mm = d.getMinutes();
  var pad = mm < 10 ? "0" + mm : mm;
  var h12 = ((hh + 11) % 12) + 1;
  var ampm = hh >= 12 ? "PM" : "AM";
  var now = new Date();
  var sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return h12 + ":" + pad + " " + ampm;
  var yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday " + h12 + ":" + pad + " " + ampm;
  var diffMs = now.getTime() - d.getTime();
  if (diffMs < 7 * 86400 * 1000) return d.toLocaleDateString([], { weekday: "short" }) + " " + h12 + ":" + pad + " " + ampm;
  return d.toLocaleDateString([], { day: "numeric", month: "short" }) + " " + h12 + ":" + pad;
}

// Look up a participant inside a conv. Returns null if not found.
function findParticipant(conv, userId) {
  if (!conv || !userId) return null;
  if (Array.isArray(conv.participants)) {
    var hit = conv.participants.find(function (p) { return p && p.id === userId; });
    if (hit) return hit;
  }
  if (conv.partner && conv.partner.id === userId) return conv.partner;
  return null;
}

// Sender display name for a message — "You" for self, partner.name for
// 1:1, participant.name for group. Falls back to "Player".
export function senderName(senderId, conv, meId) {
  if (!senderId) return "Player";
  if (senderId === meId) return "You";
  var p = findParticipant(conv, senderId);
  return (p && p.name) || "Player";
}

// First letter of the sender's name, used for the small avatar bubble
// next to "them"-side messages.
export function senderInitial(senderId, conv, meId) {
  var name = senderName(senderId, conv, meId);
  if (name === "You") return "Y";
  return (name[0] || "?").toUpperCase();
}

// V1 → V2 conversation row mapping. The V2 ConvoRow expects:
//   { id, type, name, initials, color, activeNow, unread, pinned,
//     typing, lastTime, lastSender, lastPreview }
//
// pinned + typing are sourced from the v1 dms object's pinnedConvIds /
// typingConvs maps. They live in dms, not the conv row, so we accept
// them as a second arg ("dmsState") rather than reach into the conv.
export function convToV2(conv, meId, dmsState) {
  if (!conv) return null;
  var pinned = dmsState && dmsState.pinnedConvIds
    ? dmsState.pinnedConvIds.indexOf(conv.id) >= 0
    : false;
  var typing = dmsState && dmsState.typingConvs
    ? !!dmsState.typingConvs[conv.id]
    : false;

  var isGroup = !!conv.isGroup;
  var name = convTitle(conv, meId);
  var partnerProfile = !isGroup ? conv.partner : null;

  // Active-now: 1:1 only, partner present + presence rules say so.
  var presence = partnerProfile ? getPresence(partnerProfile, false) : null;
  var activeNow = !isGroup && presence && presence.online;

  // Last sender label — "You" / partner first-name / group sender name.
  var lastSenderId = conv.last_message_sender_id;
  var lastSender = "";
  if (lastSenderId) {
    if (lastSenderId === meId) {
      lastSender = "You";
    } else if (isGroup) {
      var p = findParticipant(conv, lastSenderId);
      lastSender = (p && p.name) || "Someone";
    } else {
      lastSender = (partnerProfile && partnerProfile.name) || "Player";
    }
  }

  return {
    id: conv.id,
    type: isGroup ? "group" : "dm",
    name: name,
    initials: deriveInitials(name || "?"),
    color: avColor(name || "?"),
    activeNow: !!activeNow,
    unread: conv.hasUnread ? 1 : 0,
    pinned: pinned,
    typing: typing,
    lastTime: formatRelativeTime(conv.last_message_at),
    lastSender: lastSender,
    lastPreview: conv.last_message_preview || "",
    // Carried through so the thread screen can pull header sub-text.
    _raw: conv,
  };
}

// V1 direct_messages row → V2 bubble. text fallback is "Message deleted"
// when the row is tombstoned.
//
// Structured-widget rows (kind = 'score' | 'invite' | 'confirm', payload
// jsonb, entity_id uuid) are emitted by Slice B+D auto-emitters (match
// log, challenge create, Players "Invite to play"). The 20260516
// migration added these columns; this adapter unpacks them into the
// shape MessagesScreen's Bubble dispatcher already reads. Deleted
// structured rows fall back to the plain-text "Message deleted" bubble
// so a tombstoned card doesn't render as a live actionable widget.
export function msgToV2(row, conv, meId) {
  if (!row) return null;
  var deleted = !!row.deleted_at;
  var text = deleted ? "Message deleted" : (row.content || "");
  var out = {
    id: row.id,
    from: senderName(row.sender_id, conv, meId),
    text: text,
    t: formatTimestamp(row.created_at),
    side: row.sender_id === meId ? "me" : "them",
    avatar: senderInitial(row.sender_id, conv, meId),
    entity_id: row.entity_id || null,
  };
  // Only attach widget kind/payload when the row is alive and the
  // payload exists. The dispatcher treats unknown/missing `kind` as
  // plain text so a malformed structured row degrades gracefully.
  if (!deleted && row.kind && row.payload) {
    var k = row.kind;
    if (k === "score" || k === "invite" || k === "confirm") {
      out.kind = k;
      // Mirror payload onto the bubble prop name the dispatcher reads.
      // Each widget reads its own key:
      //   ScoreCardBubble    → m.score
      //   InviteCardBubble   → m.invite
      //   ConfirmCardBubble  → m.confirm
      if (k === "score")   out.score   = row.payload;
      if (k === "invite")  out.invite  = row.payload;
      if (k === "confirm") out.confirm = row.payload;
    }
  }
  return out;
}
