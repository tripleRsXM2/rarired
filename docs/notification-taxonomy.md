# Notification Taxonomy

## Purpose
The reference for every notification CourtSync fires. Keeps the tray coherent, stops duplicates, defines priority, and makes sure every type deep-links to the right object. Any new notification type must be added here in the same module that introduces it.

## Current Product Rule

### Categories (priority order)

Every notification belongs to exactly one category. Category drives ordering and UI treatment.

1. **action** — requires a response from the recipient. Red-accent bar, section header "Needs your attention". Not dismissable by swipe (can't silence unresolved disputes).
2. **important** — meaningful update, no action required, still wants to be noticed. Section header "Updates". Dismissable.
3. **activity** — passive social signal. Section header "Activity". Dismissable; likes + disputes get grouped.

A fourth soft state — **demoted** — exists: when a dispute is later confirmed or voided, the old `match_disputed` / `match_correction_requested` / `match_counter_proposed` rows are reclassified as `important` (no longer action-required) via `applySmartDemotion`.

### Event types

| Type | Category | Trigger | Recipient | Deep-link |
|---|---|---|---|---|
| `match_tag` | action | Submitter logs a ranked match | Linked opponent | `Review →` — opens `ActionReviewDrawer` (same flow as disputes); primary action is **Confirm**, secondary **Dispute score** (opens `DisputeModal` in dispute mode), tertiary **Not my match** (void). |
| `match_disputed` | action | Opponent disputes a pending match with a correction | Submitter | Opens `ActionReviewDrawer` (in-context, no page navigation) |
| `match_correction_requested` | action | *(reserved — currently fired as `match_disputed`; kept for labelling)* | Submitter | Opens `ActionReviewDrawer` |
| `match_counter_proposed` | action | Submitter counter-proposes a different correction | Opponent | Opens `ActionReviewDrawer` |
| `match_reminder` | action | <24h left on a pending match (DB-gated via `match_history.reminder_sent_at`) | Opponent | `View in feed →` |
| `friend_request` | action | Someone sends a friend request | Target | Inline Accept / Decline (or `View requests →` fallback) |
| `message_request` | action | Non-friend sends a DM | Target | `View message →` opens conversation |
| `request_accepted` | important | Target accepts your friend request | Original sender | `View profile →` — opens `/profile/:from_user_id` |
| `message_request_accepted` | important | Target accepts your DM request | Original sender | `View message →` |
| `match_confirmed` | important | Opponent confirms a pending match, OR either party accepts a correction | Other party | `View in feed →` + "Stats updated ✓" label |
| `match_voided` | important | Either party voids during dispute, or auto-void on max_revisions / timeout | Other party | `View in feed →` (soft CTA) |
| `match_expired` | important | pg_cron `expire_stale_matches()` flips a pending match to expired at 72h | Both parties | `View in feed →` |
| `match_deleted` | activity | Submitter deletes a non-voided, non-expired match | Opponent | `View in feed →` |
| `casual_match_logged` | activity | Submitter logs a `casual` match against a linked opponent | Linked opponent | `View in feed →` (soft, textSecondary) |
| `like` | activity | Someone hearts a match; fires to every participant except the liker | Match participants (minus liker) | `View match →` |
| `comment` | activity | Someone comments on a match; fires to every participant except commenter | Match participants (minus commenter) | `View match →` |
| `message` | activity | Someone sends a DM in an existing conversation | Other participant | `View message →` |
| `challenge_received` | action | Someone sends you a challenge / rematch | Challenged user | `Open challenge →` (lands on `/tournaments/challenges`) |
| `challenge_accepted` | important | Target accepted your challenge | Challenger | `Log result →` (lands on `/tournaments/challenges` ready-to-play row) |
| `challenge_declined` | important | Target declined your challenge | Challenger | `View challenges →` |
| `challenge_expired` | important | pg_cron auto-expires a 7-day-stale pending challenge | Challenger | `View challenges →` |

### Priority scoring

Live in `notifUtils.computePriorityScore(n)`. Final score drives sort order within the tray:

```
score = TYPE_BASE_SCORE[effectiveType]   (action 3000 / important 2000 / activity 1000)
      + TYPE_URGENCY_BONUS[n.type]        (match_disputed 450 … match_expired 30)
      + (n.read ? 0 : 80)                 (unread bump)
      + recency_decay                     (0–200 over 7 days)
```

Smart demotion (`applySmartDemotion`) runs *before* scoring: if a match has been `confirmed` or `voided`, any lingering dispute-family notifications for the same match are marked `_demoted = true` and scored as `important` instead of `action`.

### Read / unread / seen logic

Three layers, deliberately:

1. **Unread** — `notifications.read = false`. DB-backed. Survives reloads.
2. **Seen** — session-scoped `seenIds: Set<notifId>` in `useNotifications`. Added when the tray *opens*. Cleared on mount/reload.
3. **Read** — explicit DB flip to `read = true`. Happens when:
   - The user taps a single notification row.
   - The user hits "Mark all read" (skips action-type items so unresolved disputes aren't silenced).
   - The tray opens — **non-action** items auto-flip to read on the server (so they don't re-badge on reload), but action items stay unread until resolved.

Badge count = `count(n: !n.read && !seenIds.has(n.id))`. The `seenIds` bit is why opening the tray drops the badge to 0 for action items even though they remain unread in the DB.

### Grouping (anti-chaos)

`groupNotifications(notifications)` in `notifUtils.js` produces display items of three kinds:

1. **single** — one notification, one row.
2. **thread** — multiple dispute-family rows for the same `match_id`. Highest-priority item is the primary, the rest become context chips below.
3. **like_group** — multiple `like` notifications on the same match. Stacked avatars, single row ("A and 3 others liked your match").

Rules:
- **Action-required notifications are never hidden** inside a thread. They always appear as the primary of their thread or as a standalone single.
- `match_tag` / `match_disputed` / `match_correction_requested` / `match_counter_proposed` / `match_voided` / `match_confirmed` all belong to the **dispute family** and group by `match_id`.
- `like` groups by `match_id`. `comment` also groups by `match_id` (Module 6) into a `comment_group` display item with the same stacked-avatar UI.

### Deep-link destinations

From Module 3 — `NotificationsPanel.NotifRow`:

| Action | Helper |
|---|---|
| Open match in feed | `goFeed()` — reloads history, navigates `/home`, closes tray, marks read |
| Open conversation | `goMessages()` — calls `openConvById(entity_id, from_user_id)`, navigates `/people/messages` |
| Open sender's profile | `goProfile()` — calls `openProfile(from_user_id)`, navigates `/profile/:id` |
| Open in-context review drawer | `onReviewMatch(n)` — mounts `ActionReviewDrawer`, no navigation |

Sender avatar on every tray row is itself a tap target → sender's profile.

### Copy principles

- **Name the actor.** "Mikey sent you a friend request." not "You have a new request."
- **State the action, not the UI affordance.** "Confirm or dispute" not "Tap to open dispute modal."
- **Past tense for completed events.** "Mikey confirmed your match result." not "Mikey is confirming…"
- **Present tense + urgency for action required.** "Response needed." "Review needed."
- **Short.** One sentence. If you need two, you're probably trying to encode context that belongs in the deep-link target.
- **Avoid UI-internal jargon.** Users don't know what `pending_reconfirmation` means. Say "counter-proposed a correction."
- **No emoji in the label itself.** The section header and accent handle tone.
- All labels centralised in `notifUtils.getNotifLabel(n)`. Keep it there.

## Design / Decision Principles

1. **One event, one notification, one recipient.** If it fires twice, it's a bug.
2. **Never send yourself a notification.** All insertion sites filter `from_user_id === user_id` — if this is missed, the tray becomes spam.
3. **Action-category is sacred.** Nothing that doesn't genuinely require user action goes into `action`. No "celebrate your 10th match!" style noise; that's `activity`.
4. **Deep-link to the object, not a list.** Every notification resolves to one specific match, profile, or conversation. Tray + "View in feed" is the fallback when there's no better target.
5. **Batching before silencing.** A dispute thread of 4 rows should collapse to 1 primary + 3 context chips, not 4 rows and not 1 row with 3 hidden. Silent suppression breaks the "visible re-entry" contract.
6. **Server is the source of truth for `read`; client handles `seen`.** This is why opening the tray can instantly clear the badge even before the DB write completes.

## Open Questions

- ~~**Comment grouping.**~~ Done in Module 6: comments on the same match now collapse into `comment_group` display items.
- ~~**Rapid like/unlike dedupe.**~~ Done in Module 6: a `like` notification from the same user/match will not re-fire within 1 hour (client-side check before insert). The `feed_like` analytics event still fires every time so we don't lose the raw signal.
- **`match_correction_requested` vs `match_disputed`.** Currently we only ever fire `match_disputed` on the initial dispute. The `match_correction_requested` type is defined and labelled but unused. Either retire it or split the two (e.g. dispute = "I didn't play" flavour, correction_requested = "the score was wrong"). Decide before Module 5.
- **Notification settings.** No per-type mute / DND UI today. Unclear whether users will ask for it before we have scale.
- **Email / push channel.** Everything lives in the in-app tray. When do we add email digests? Native push? Probably Module 7+.
- **Auto-read action items on dismissal.** Currently action items that get resolved elsewhere (e.g. accepted via ActionReviewDrawer) are dismissed by `onDismissNotif`. If that path is missed, they linger. Worth a sweep.
- **Reminder cadence.** One reminder at <24h. Should we send a second at <6h? Open.

## Out of Scope (for now)

- Per-user notification preferences UI.
- Email / native push delivery channels.
- Digest-style notifications ("this week your matches…").
- Sound / haptic / badge tuning (no native layer yet).
- Separate notification-retention policies (e.g., auto-delete activity older than 30 days).
- Admin-issued system notifications.
- Friend-of-friend / reshare style notifications.

## Last Updated By Module
- v0 — initialised from shipped state at end of Module 3. Includes Module 3's deep-link + fire-gap work (like/comment fire to both participants, `match_expired` live, sender avatar clickable).
- v1 — Module 4 (challenges). 4 new types: `challenge_received` (action), `challenge_accepted` / `challenge_declined` / `challenge_expired` (important). New `goChallenges` deep-link target → `/tournaments/challenges`. Per-type urgency scores added in `notifUtils.TYPE_URGENCY_BONUS`.
- v2 — Module 6 (polish): comment grouping into `comment_group` display items + 1-hour dedupe on repeated `like` notifications from the same user/match. Both reduce tray noise without losing analytics signal (`feed_like` event still fires every toggle).
- v3 — Unified review flow: `match_tag` now uses the same `ActionReviewDrawer` surface as disputes/corrections (Review button replaces the inline Confirm/Decline). Drawer branches on `notifType` — `match_tag` calls `confirmOpponentMatch` and shows the logged match details; dispute family calls `acceptCorrection` and shows the diff comparison. Activity-category notifications (`like`, `comment`, `match_deleted`, `message`, `request_accepted`, `challenge_declined`, `challenge_expired`) now dismiss on tap-through (not just mark read) — tapping the CTA means "I acknowledged this, make it go away."
- v4 — Tindis (match pacts). Five new types: `pact_proposed` (action — partner must agree to move to confirmed), `pact_confirmed` (important — both agreed, booking unlocked), `pact_booked` (important — someone committed the slot), `pact_cancelled` (activity), `pact_claimed` (important — proposer hears their open court was taken). Entity id is the pact id; standing check in `emit_notification` requires both caller and target to be parties to the same pact row. No new deep-link target yet — notifications link to `/tindis/active` via a future `goTindis` handler (tracked as an open follow-up).
- v4.1 — Pact notifications deep-link into the Tindis tab. `pact_proposed` is action (primary "Review pact →" CTA); `pact_claimed` is important ("Re-affirm →"); `pact_confirmed`, `pact_booked`, `pact_cancelled` are important/activity with muted CTAs. All carry `entity_id = pact.id` into `location.state.highlightPactId` so TindisTab scroll-to + pulse via `useDeepLinkHighlight`. Sub-tab routing: cancelled → /tindis/history, everything else → /tindis/active. `pact_cancelled` added to dismiss-on-tap activity list.
- v6 — **Opponent-invite events (2026-04-28, Module 9)**. Two new types: `match_invite_claimed` (recipient claimed the share-link → flagged as `important`, deep-links to /home with the match highlighted; informational for the logger because the claimer will separately fire `match_tag` for confirm/dispute) and `match_invite_declined` (recipient marked invite as 'not me' → action-worthy: logger needs to re-issue or void). Both push-worthy under the `match_updates` category. Standing-check in `emit_notification` requires the caller to be the claimer/decliner of an invite whose inviter is the recipient. Full spec: `docs/opponent-invite-flow.md`.
- v5 — **Push notifications (Module 8, 2026-04-27)**. Every push-worthy in-app notification now also fans out to the recipient's enabled Web Push subscriptions on Android Chrome / Edge / Samsung, desktop Chrome / Edge / Firefox, and iPhone / iPad standalone PWAs on iOS 16.4+. Push category mapping (in `send-push` Edge Function): `result_reviews` (match_tag, match_disputed, match_correction_requested, match_counter_proposed, match_reminder), `match_updates` (match_confirmed, match_voided, match_expired, challenge_accepted/declined/expired, pact_booked/cancelled, message_request*), `match_invites` (challenge_received, pact_proposed/claimed/confirmed), `league_updates` (league_invite, league_joined), `system_updates` (friend_request, request_accepted). **Not push-worthy** (in-app only): `like`, `comment`, `match_deleted`, `message`, `match_corrected`. Per-recipient category mute via `notification_preferences`; idempotency via `notification_push_log`; stale-subscription pruning on 404/410. Full architecture, schema, route mapping, and testing checklist live in `docs/push-notifications.md`.
- v8 — **Privacy & Storage + sign-out push cleanup (2026-04-29, Module 9.2)**. Closes a cross-user device leak: previously `disablePush()` was only called from the manual "Disable" toggle, so signing out left the browser endpoint subscribed AND the `push_subscriptions` row `enabled=true`. Next user to sign in on the same device shared an endpoint with the previous user — pushes intended for one landed on the device of the other. Fix: new `useAuthController.signOutAndCleanup()` funnel that runs `disablePush()` (browser unsubscribe + DB row → enabled=false) BEFORE `supabase.auth.signOut()`. SettingsScreen sign-out routes through it; future sign-out call sites must too. Also wires `refreshSubscription(authUser.id)` once per signed-in session so silently-rotated browser endpoints reconcile against the current user. See `docs/privacy-and-storage.md` "Push notifications" for the threat model and "Logout cleanup" for the full sign-out sequence.
- v7 — **Casual-match heads-up (2026-04-29, Module 9.1.5)**. New `casual_match_logged` type closes the trust gap on casual matches with a linked opponent. Today casual matches with `opponent_id` set auto-confirm immediately and never notify the opponent — they could only discover the match by scrolling the feed. The new notification fires from the same `useMatchHistory.submitMatch` path that fires `match_tag` for ranked rows, gated by `matchType === 'casual' && opponentId && !inviteFlow`. Sits in the **activity** bucket (informational, urgency 35 — below `match_confirmed` at 50) and lands in the recipient's tray with a soft "View in feed →" CTA that scrolls/highlights the match via the existing `goFeed` deep-link. Push-worthy under the `match_updates` category — recipients with push enabled get a "Casual match logged" notification with `${name} logged a casual match with you. View it in your feed.` `emit_notification` standing rule is tighter than `match_tag`: caller must be the submitter, recipient must be `opponent_id`, and `m.match_type` must be `'casual'`. Cleanup trigger + orphan sweep both extended to drop `casual_match_logged` rows when the parent match goes terminal. No dispute affordance in V1 — recipient can object via voiding the match from the existing FeedCard right-click flow if needed; if dispute friction shows up in usage we'll add an inline "Looks wrong?" CTA on the notification row in a follow-up.

- v9 — **Lifecycle foundation (Module 11 Slice 1, 2026-04-27)**. Replaces the binary `read` boolean with a proper lifecycle. `notifications` table gains 7 new columns: `action_required` (derived from type at emit), `read_at`, `dismissed_at`, `resolved_at`, `entity_type`, `entity_key` (canonical entity reference: `coalesce(entity_id::text, match_id, metadata->>'entityId')`), and `expires_at`. Three lifecycle rules locked in this slice: **(1) Idempotent emission** via partial unique index `(user_id, type, entity_type, entity_key) WHERE resolved_at IS NULL AND dismissed_at IS NULL AND entity_key IS NOT NULL` — re-firing the same notification UPDATEs the existing active row in place (bumps `created_at`, clears `read_at`) instead of inserting a duplicate. NULL entity_key rows are deliberately NOT deduped to avoid collapsing unrelated entity-less notifications. **(2) Server-owned resolution** — `cleanup_match/challenge/league_invite_notifications` triggers convert from HARD DELETE to UPDATE `resolved_at = now()`. History is preserved for a future "View history" surface (not in V1). The `cleanup_conv_notifications` trigger keeps DELETE — a deleted conversation has no useful history target. **(3) Defensive reconciliation** via `reconcile_my_notifications()` (SECURITY DEFINER, no `p_user_id` arg — callers can only reconcile their own rows via `auth.uid()`). Sweeps stale rows: match notifications past pending status, challenge notifications past pending, league invites past invited, match invites past pending, and any row whose `expires_at < now()`. The `notifications_update_guard_trg` is loosened to allow authenticated clients to write `read_at` / `dismissed_at` on their own rows; `resolved_at` and `expires_at` stay server-only (`postgres` / `supabase_admin` / `service_role` bypass for trigger functions). Module 9.1.5's `casual_match_logged` is included in the cleanup sweep. **Backfills:** `entity_key` from coalesce of legacy `match_id` text + new `entity_id` uuid + `metadata->>'entityId'`; `read_at = created_at` for all `read = true` rows (legacy boolean preserved); `expires_at` defaults applied per type (`match_tag` 72h / `challenge_received` 7d / `match_reminder` 24h / `pact_proposed` 48h); retired `pact_*` rows resolved at migration apply; pre-existing duplicates per (user, type, entity_type, entity_key) keep the newest active row, older copies marked historical. **No UI changes in Slice 1.** The existing 3-section panel keeps working off the legacy `read` boolean. Slice 2 swaps to a single newest-first list, drops `getNotifType` / `applySmartDemotion` / category sections, adds the central type registry (`src/features/notifications/types.js`), retires the sessionStorage `seenIds` badge logic in favor of DB-driven counts, and extends the canonical lifecycle filter into one shared helper across panel + badge + future surfaces. **Push idempotency note:** because `emit_notification` upserts and returns the same `id` for a re-fired active row, the `send-push` Edge Function's `notification_push_log` already deduplicates re-fires. Slice 2 will introduce a `renotify_on_update` registry flag for types that should intentionally re-push on bump (e.g. dispute escalation). **Future cleanup migration (deferred):** a daily `pg_cron` purge of `resolved_at IS NOT NULL OR dismissed_at IS NOT NULL` rows older than 90 days, to keep table size bounded once the new history pattern accumulates volume.
- v10 — **Single-list centre + canonical lifecycle filter (Module 11 Slice 2, 2026-04-27)**. Replaces the 3-section panel ("Needs your attention" / "Updates" / "Activity") with one unified newest-first list. The whole "what's in the centre" question collapses to `isActiveForUser(n)` — a single filter exported from `notifUtils.js`, used by the panel render, the badge count (`countsAsUnread`), and any future "active notifications" surface. Internal categorisation is gone: `getNotifType` / `getEffectiveType` / `applySmartDemotion` / `TYPE_BASE_SCORE` / `TYPE_URGENCY_BONUS` are all retired (the registry knows what each type does, the lifecycle columns from Slice 1 know what state each row is in). Three small UX rules locked: **(1) Informational rows hide on first read** — `read_at` set ⟶ excluded from the centre filter ⟶ next render drops them. **(2) Actionable rows stay visible after read until resolved** — opening a `match_tag` doesn't silence it; only `resolved_at` does (set server-side by `cleanup_match_notifs_trg` when match goes terminal, or by the click-handler local patch). **(3) Soft-pin not categorisation** — unresolved actionables float to the top of the single list, but there's no section header. Read informational rows fall through.
- v10 details — **Central type registry** (`src/features/notifications/types.js`) is the single source of truth for `action_required` / `entity_type` / `click` / `push_category` / `renotify_on_update` per type. Mirrors the SQL `CASE` statements in `20260427_notification_lifecycle_v1.sql`. Adding or changing a type means updating both files in lockstep. **`renotify_on_update`** is reserved (false for every V1 type) — future "dispute escalation"-shaped types that genuinely need a fresh push on every bump will set it true; today's upserts dedupe push via `notification_push_log`. **`isVisibleInCentre('message')` is false** — DM unread surfaces via the People nav badge, so the centre filter drops `message` rows everywhere.
- v10 wiring — `useNotifications` retires `sessionStorage seenIds`. The badge count is now `notifications.filter(countsAsUnread).length` — DB-driven, no session state. `markOneRead` writes `read_at` (+ legacy `read = true` mirror) idempotently — `.is('read_at', null)` so re-tap is a no-op. `markSeen` (tray-open) bulk-marks **only informational** rows read; actionables are never silenced. `dismissNotification` writes `dismissed_at` instead of `DELETE` (history preserved). `acceptMatchTag` no longer hard-deletes the row — local `resolved_at` patch + the server cleanup trigger handle it on the next render. `loadNotifications` calls `reconcile_my_notifications()` on the way in to catch stale rows the cleanup triggers might have missed (deploy race, dropped realtime event). Empty state: **"You're all caught up."** — single line, no visual noise.
