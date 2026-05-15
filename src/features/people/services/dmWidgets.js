// src/features/people/services/dmWidgets.js
//
// Helpers for emitting structured-widget DMs into 1:1 conversations.
// Slice B of the v2 widget wiring — match-log and challenge-create
// auto-emit a DM into the conversation between the actor and the
// counterparty so the v2 MessagesScreen can render the live widget
// inline (Confirm / Dispute, Accept / Reschedule).
//
// The 20260516_dm_structured_payload migration added `kind`, `payload`,
// and `entity_id` columns to `direct_messages` — these helpers populate
// them. `entity_id` carries the authoritative entity id (match_history
// or challenges) so widget action buttons can read live state without
// the DM row needing its own state column.
//
// Every helper is non-fatal — failures only emit `console.warn` so the
// parent action (match log / challenge create) doesn't roll back if
// the conversation/RPC race fails. The notification path is still
// authoritative for "did the recipient learn about this."
//
// Why a `fallbackText` for every structured row? Inbox previews,
// notification copy, and any future SMS/email mirror need plain text.
// The bubble dispatcher in MessagesScreen drops back to the text path
// if `kind` is unknown or the row is tombstoned (see v2MessageAdapter).

import { supabase } from "../../../lib/supabase.js";

// ── Core: get-or-create conv + structured insert ──────────────────────────────

// Resolve or create the canonical 1:1 conv between authUser and the
// other party, then insert the structured DM. Returns the inserted
// row on success, or { error } on failure.
async function ensureConvAndInsert(senderId, recipientId, fields) {
  if (!senderId || !recipientId) return { data: null, error: new Error("missing ids") };
  // 1. Resolve the canonical conv. The RPC is race-safe — guaranteed
  //    one row per pair regardless of who calls first.
  var cr = await supabase
    .rpc("get_or_create_conversation", { other_id: recipientId })
    .single();
  if (cr.error) return { data: null, error: cr.error };
  var convRow = cr.data;
  var convId = convRow && convRow.id;
  if (!convId) return { data: null, error: new Error("get_or_create_conversation returned no id") };
  // 2. Insert the structured DM. RLS is satisfied because the caller
  //    is a participant of the conv we just resolved.
  var payload = {
    conversation_id: convId,
    sender_id: senderId,
    content: fields.content,
    kind: fields.kind,
    payload: fields.payload,
  };
  if (fields.entity_id) payload.entity_id = fields.entity_id;
  var ins = await supabase
    .from("direct_messages")
    .insert(payload)
    .select("*")
    .single();
  return ins;
}

// ── Match → confirm-card DM (ranked path) ─────────────────────────────────────
//
// Fires when a ranked match is logged with a linked opponent. The
// opponent sees a Confirm / Dispute card in their thread mirroring
// the `match_tag` notification. `match_id` is the canonical entity
// for state lookup — the buttons in ConfirmCardBubble call
// confirm_match_and_update_stats / propose_match_correction against
// this id (Slice C).
export async function emitMatchConfirmDM(senderId, opponentId, opts) {
  if (!senderId || !opponentId || !opts || !opts.matchId) {
    return { data: null, error: new Error("missing required match-confirm fields") };
  }
  var sets = Array.isArray(opts.sets) ? opts.sets : [];
  var setStr = sets.map(function (s) { return (s[0] || 0) + "-" + (s[1] || 0); }).join(", ");
  var widget = {
    league: opts.leagueName || (opts.isRanked ? "Ranked" : "Casual"),
    p1: opts.submitterName || "You",
    p2: opts.opponentName || "Opponent",
    sets: sets,
  };
  var fallback = "Logged " + (setStr || "match") +
    ". Confirm or dispute in the thread.";
  return ensureConvAndInsert(senderId, opponentId, {
    content: fallback,
    kind: "confirm",
    payload: widget,
    entity_id: opts.matchId,
  });
}

// ── Match → score-card DM (casual path) ───────────────────────────────────────
//
// Fires when a casual match is logged with a linked opponent. Casual
// matches auto-confirm (no rating impact, no dispute path) so we ship
// a read-only score card rather than a confirm card. Still entity-
// linked so the opponent can tap through to the match in History.
export async function emitMatchScoreDM(senderId, opponentId, opts) {
  if (!senderId || !opponentId || !opts || !opts.matchId) {
    return { data: null, error: new Error("missing required match-score fields") };
  }
  var sets = Array.isArray(opts.sets) ? opts.sets : [];
  var setStr = sets.map(function (s) { return (s[0] || 0) + "-" + (s[1] || 0); }).join(", ");
  var widget = {
    surface: opts.surface || "hard",
    duration: opts.duration || "",
    p1: opts.submitterName || "You",
    p2: opts.opponentName || "Opponent",
    sets: sets,
  };
  var fallback = "Casual match logged · " + (setStr || "final score");
  return ensureConvAndInsert(senderId, opponentId, {
    content: fallback,
    kind: "score",
    payload: widget,
    entity_id: opts.matchId,
  });
}

// ── Challenge → invite-card DM ────────────────────────────────────────────────
//
// Fires when a challenge is proposed. Recipient sees an Accept /
// Reschedule card. The buttons (Slice C) call updateChallengeStatus
// against the entity_id (challenges.id) so accept/decline state stays
// canonical on the `challenges` table.
export async function emitChallengeInviteDM(senderId, recipientId, opts) {
  if (!senderId || !recipientId || !opts || !opts.challengeId) {
    return { data: null, error: new Error("missing required challenge-invite fields") };
  }
  var widget = {
    round: opts.round || "Friendly",
    date: opts.date || "TBC",
    court: opts.court || (opts.venue || "TBC"),
    vs: opts.opponentName || "Opponent",
  };
  var fallback = "Match invite · " + widget.date + " · " + widget.court;
  return ensureConvAndInsert(senderId, recipientId, {
    content: fallback,
    kind: "invite",
    payload: widget,
    entity_id: opts.challengeId,
  });
}

// ── Players "Invite to play" — rating-match invite ────────────────────────────
//
// Used by the v2 Play → Players → Invite-to-play button (Slice D).
// There's no `challenges` row yet at this point — the user is just
// proposing a rating match to someone from the directory. We emit an
// invite-shaped DM with NO entity_id so the recipient widget shows
// generic Accept / Reschedule that triggers the challenge flow on
// click.
export async function emitRatingMatchInviteDM(senderId, recipientId, opts) {
  if (!senderId || !recipientId) {
    return { data: null, error: new Error("missing required rating-invite fields") };
  }
  var widget = {
    round: (opts && opts.round) || "Rating match",
    date: (opts && opts.date) || "Anytime",
    court: (opts && opts.court) || "Open to suggestions",
    vs: (opts && opts.opponentName) || "you",
  };
  var fallback = "Want to play a rating match? Tap to set a time.";
  return ensureConvAndInsert(senderId, recipientId, {
    content: fallback,
    kind: "invite",
    payload: widget,
    // No entity_id — accept handler creates the challenge then.
  });
}
