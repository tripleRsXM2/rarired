// src/features/notifications/types.js
//
// Module 11 (Slice 2) — central notification type registry.
//
// Single source of truth for every notification type's lifecycle
// behaviour. Replaces the four scattered sets that lived in
// notifUtils.js (ACTION_TYPES, IMPORTANT_TYPES, TYPE_URGENCY_BONUS,
// PUSH_TYPE_TO_CATEGORY) with one declarative table.
//
// Rules in this file are read by:
//   - notifUtils.isActionable() / isActiveForUser() (lifecycle filter)
//   - useNotifications hook (badge count + click behaviour)
//   - NotificationsPanel (rendering + click routing)
//   - notificationService dispatchPush (push allow-list mirror)
//
// The migration's SQL CASE statements (20260427_notification_lifecycle_v1.sql)
// are the SQL-side mirror of action_required + entity_type. When you
// add or change a type here you MUST also update the SQL CASE.

// Per-type lifecycle + behaviour declarations.
//
// Field meaning:
//   action_required  → true means recipient owes a response. The
//                      notification stays visible in the centre even
//                      after read, until resolved_at is set.
//   entity_type      → matches the entity_type column the migration
//                      writes. Used by reconcile sweep + UI helpers.
//   click            → routing hint consumed by NotificationsPanel:
//                       'review_drawer'  open ActionReviewDrawer
//                       'feed'           navigate to /home + highlight
//                       'profile'        navigate to /profile/:from
//                       'messages'       open conversation
//                       'challenges'     navigate to /tournaments/challenges
//                       'leagues'        navigate to /leagues
//                       'invite'         no in-app target (logger surface)
//   push_category    → notification_preferences category. Mirrors the
//                      send-push Edge Function's PUSH_TYPE_TO_CATEGORY
//                      map. null means in-app only (no push).
//   renotify_on_update → if true, a re-fired upsert (same active row
//                        bumped) should still trigger a fresh push.
//                        Default false: send-push's notification_push_log
//                        idempotency dedupes the second push.
//                        V1: nothing flagged true. Reserved for the
//                        future "dispute escalation" pattern where each
//                        bump genuinely needs a new device alert.
//
// Types not present in this map are treated as 'unknown' — informational,
// no entity, no push, no special routing.

export var NOTIF_TYPES = {
  // ─── Match lifecycle ────────────────────────────────────────────
  match_tag: {
    action_required:    true,
    entity_type:        "match",
    click:              "review_drawer",
    push_category:      "result_reviews",
    renotify_on_update: false,
  },
  match_disputed: {
    action_required:    true,
    entity_type:        "match",
    click:              "review_drawer",
    push_category:      "result_reviews",
    renotify_on_update: false,
  },
  match_correction_requested: {
    action_required:    true,
    entity_type:        "match",
    click:              "review_drawer",
    push_category:      "result_reviews",
    renotify_on_update: false,
  },
  match_counter_proposed: {
    action_required:    true,
    entity_type:        "match",
    click:              "review_drawer",
    push_category:      "result_reviews",
    renotify_on_update: false,
  },
  match_reminder: {
    action_required:    true,
    entity_type:        "match",
    click:              "feed",
    push_category:      "result_reviews",
    renotify_on_update: false,
  },
  match_confirmed: {
    action_required:    false,
    entity_type:        "match",
    click:              "feed",
    push_category:      "match_updates",
    renotify_on_update: false,
  },
  match_voided: {
    action_required:    false,
    entity_type:        "match",
    click:              "feed",
    push_category:      "match_updates",
    renotify_on_update: false,
  },
  match_expired: {
    action_required:    false,
    entity_type:        "match",
    click:              "feed",
    push_category:      "match_updates",
    renotify_on_update: false,
  },
  match_corrected: {
    action_required:    false,
    entity_type:        "match",
    click:              "feed",
    push_category:      null,         // in-app only
    renotify_on_update: false,
  },
  match_deleted: {
    action_required:    false,
    entity_type:        "match",
    click:              "feed",
    push_category:      null,
    renotify_on_update: false,
  },

  // Module 9.1.5 — informational casual heads-up
  casual_match_logged: {
    action_required:    false,
    entity_type:        "match",
    click:              "feed",
    push_category:      "match_updates",
    renotify_on_update: false,
  },

  // Match-invite (Module 9 — opponent invite flow)
  match_invite_claimed: {
    action_required:    false,
    entity_type:        "match",       // deep-link via match_id, not invite id
    click:              "feed",
    push_category:      "match_updates",
    renotify_on_update: false,
  },
  match_invite_declined: {
    action_required:    false,
    entity_type:        "match",
    click:              "feed",
    push_category:      "match_updates",
    renotify_on_update: false,
  },

  // ─── Friend graph ───────────────────────────────────────────────
  friend_request: {
    action_required:    true,
    entity_type:        "friend_request",
    click:              "profile",
    push_category:      "system_updates",
    renotify_on_update: false,
  },
  request_accepted: {
    action_required:    false,
    entity_type:        "friend_request",
    click:              "profile",
    push_category:      "system_updates",
    renotify_on_update: false,
  },

  // ─── Conversations / DMs ─────────────────────────────────────────
  message_request: {
    action_required:    true,
    entity_type:        "conversation",
    click:              "messages",
    push_category:      "match_updates",
    renotify_on_update: false,
  },
  message_request_accepted: {
    action_required:    false,
    entity_type:        "conversation",
    click:              "messages",
    push_category:      "match_updates",
    renotify_on_update: false,
  },
  // 'message' is filtered out of the centre (DM unread surfaces via
  // the People nav badge) — kept here so the registry is complete.
  message: {
    action_required:    false,
    entity_type:        "conversation",
    click:              "messages",
    push_category:      null,
    renotify_on_update: false,
  },
  // group_added — fired by create_group_conversation to every
  // non-creator participant the moment a group is materialised, so
  // recipients see "Alex started a group with you" before the first
  // message. Informational (the user can't action it from the tray —
  // tapping it opens the conversation), but visible in the centre
  // (unlike 'message') because it's a lifecycle event, not chat
  // chatter. Push: in-app only in V1 — the first DM in the group
  // already pushes via 'message_request' / message-family flows.
  group_added: {
    action_required:    false,
    entity_type:        "conversation",
    click:              "messages",
    push_category:      null,
    renotify_on_update: false,
  },

  // ─── Challenges ─────────────────────────────────────────────────
  challenge_received: {
    action_required:    true,
    entity_type:        "challenge",
    click:              "challenges",
    push_category:      "match_invites",
    renotify_on_update: false,
  },
  challenge_accepted: {
    action_required:    false,
    entity_type:        "challenge",
    click:              "challenges",
    push_category:      "match_updates",
    renotify_on_update: false,
  },
  challenge_declined: {
    action_required:    false,
    entity_type:        "challenge",
    click:              "challenges",
    push_category:      "match_updates",
    renotify_on_update: false,
  },
  challenge_expired: {
    action_required:    false,
    entity_type:        "challenge",
    click:              "challenges",
    push_category:      "match_updates",
    renotify_on_update: false,
  },

  // ─── Leagues ────────────────────────────────────────────────────
  league_invite: {
    action_required:    true,
    entity_type:        "league",
    click:              "leagues",
    push_category:      "league_updates",
    renotify_on_update: false,
  },
  league_joined: {
    action_required:    false,
    entity_type:        "league",
    click:              "leagues",
    push_category:      "league_updates",
    renotify_on_update: false,
  },
  // Module 12 Slice 2 — owner lifecycle transitions, fanned out to
  // every active member except the actor by the SECURITY DEFINER
  // lifecycle RPCs (see supabase/migrations/20260427_league_lifecycle_v2_notifications.sql).
  // All four are non-action: members can't undo a transition, they're
  // just being told it happened.
  //
  // **In-app only in V1.** push_category=null on all four. Lifecycle
  // events on a private league aren't lock-screen-grade urgent, and
  // league_voided in particular shouldn't surface as a push (a voided
  // league is often a mistake the owner is trying to make quietly go
  // away — a system-wide "league voided" lock-screen would defeat
  // that). Re-enable per-type when there's a clear retention reason
  // to push.
  league_completed: {
    action_required:    false,
    entity_type:        "league",
    click:              "leagues",
    push_category:      null,
    renotify_on_update: false,
  },
  league_archived: {
    action_required:    false,
    entity_type:        "league",
    click:              "leagues",
    push_category:      null,
    renotify_on_update: false,
  },
  league_cancelled: {
    action_required:    false,
    entity_type:        "league",
    click:              "leagues",
    push_category:      null,
    renotify_on_update: false,
  },
  // league_voided fires even though the league disappears from
  // recipients' lists. The notif itself is the only signal — without
  // it, members would just silently lose the league with no
  // explanation. Click-target is 'leagues' but the deep-link will
  // land on an empty list (the league no longer renders) — that's
  // by design; the notif body carries the reason.
  league_voided: {
    action_required:    false,
    entity_type:        "league",
    click:              "leagues",
    push_category:      null,
    renotify_on_update: false,
  },

  // ─── Activity (informational, in-app only) ──────────────────────
  like: {
    action_required:    false,
    entity_type:        "match",
    click:              "feed",
    push_category:      null,
    renotify_on_update: false,
  },
  comment: {
    action_required:    false,
    entity_type:        "match",
    click:              "feed",
    push_category:      null,
    renotify_on_update: false,
  },
};

// Default registry entry for unknown types. Prevents render crashes
// on legacy rows whose type isn't in the current registry (rare —
// pact_* rows are migrated to resolved_at by Slice 1, but defence
// is cheap).
export var UNKNOWN_TYPE = {
  action_required:    false,
  entity_type:        null,
  click:              "feed",
  push_category:      null,
  renotify_on_update: false,
};

// Single resolver. Always returns an object (never undefined) so
// call sites can read fields without defensive `?.`.
export function getTypeMeta(type) {
  return NOTIF_TYPES[type] || UNKNOWN_TYPE;
}

// Convenience accessors. Thin wrappers — using these instead of
// reading the registry inline keeps the dependency surface obvious
// and the call sites readable.
export function isActionRequired(type) {
  return getTypeMeta(type).action_required === true;
}

export function isPushWorthy(type) {
  return getTypeMeta(type).push_category != null;
}

// 'message' is intentionally filtered out of the centre everywhere
// (the People nav badge surfaces unread DM count instead). Keep the
// rule in one place.
export function isVisibleInCentre(type) {
  return type !== "message";
}
