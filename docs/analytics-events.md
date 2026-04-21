# Analytics Events

## Purpose
The event taxonomy registry. Every event the client writes to the `public.events` table lives here, with its trigger, props schema, and how it maps to a loop-stage metric. New events MUST be registered here in the same module that fires them. Analogous to `notification-taxonomy.md`, but for analytics.

## Current Product Rule

### Pipeline
- **Storage**: single Supabase table `public.events` — `id`, `user_id`, `event`, `props` (jsonb), `session_id`, `created_at`.
- **Write path**: `track(name, props)` from `src/lib/analytics.js`. Fire-and-forget, wrapped in try/catch + `.catch` — instrumentation never blocks or throws.
- **Session ID**: UUID per tab, stored in `sessionStorage`. Survives reloads within a tab, not across tabs.
- **User ID**: looked up via `supabase.auth.getUser()` at flush time. `null` for anonymous events.
- **RLS**: insert-only for authenticated + anon. **Reads are not possible from the client** — only service_role (SQL editor, BI) can query the table. This is intentional: nobody browses other users' behaviour.

### Copy principles for event names
- **snake_case**, verb-noun form. `match_logged`, not `logMatch` or `LoggedMatch`.
- **Past tense**. The event represents something that happened.
- **Subject is implied to be the user who fired it.** A `friend_request_sent` is always sent by the user in `user_id`; the recipient is in `props.target_user_id`.
- **Event names are stable forever.** Renaming requires a migration + dashboard updates. Think before you commit one.

### Registered events

| Event | Triggered by | Props |
|---|---|---|
| `app_open` | `useAuthController` mount (once per tab session) | — |
| `auth_signup_completed` | Fresh SIGNED_IN event where `loadProfile` created the row | — |
| `auth_login_completed` | Fresh SIGNED_IN event where profile already existed | — |
| `profile_viewed` | `ProfileTab` or `PlayerProfileView` renders with a loaded profile | `target_user_id`, `is_self` |
| `match_logged` | `submitMatch` successfully inserts a new match | `match_id`, `is_ranked`, `has_opponent_linked`, `sets` (count), `result` |
| `match_confirmed` | Opponent calls `confirmOpponentMatch` successfully | `match_id`, `role` ("opponent") |
| `match_correction_accepted` | `acceptCorrection` succeeds (either party accepting the other's proposal) | `match_id`, `round` |
| `match_disputed` | `_submitProposal` with `isOpponentView=true` (initial dispute + correction) | `match_id`, `reason`, `round` |
| `match_counter_proposed` | `_submitProposal` with `isOpponentView=false` | `match_id`, `reason`, `round` |
| `match_voided` | `voidMatchAction` succeeds | `match_id`, `reason` |
| `feed_like` | User toggles like ON (not OFF), feed_likes insert succeeds | `match_id`, `participants_notified` |
| `feed_comment` | `CommentModal` insert succeeds | `match_id`, `body_len` |
| `notification_opened` | A deep-link CTA in `NotificationsPanel` is clicked (goFeed / goMessages / goProfile) | `type` (notif type), `deep_link_target` ("feed" \| "messages" \| "profile") |
| `search_executed` | `searchUsers` returns a result set | `query_len`, `result_count` |
| `friend_request_sent` | `sendFriendRequest` succeeds | `target_user_id` |
| `friend_request_accepted` | `acceptRequest` succeeds | `requester_user_id` |
| `discover_tab_viewed` | Entering the `/people/suggested` sub-tab | `played_opponents_count`, `suburb_suggestions_count`, `skill_suggestions_count` |
| `leaderboard_viewed` | Leaderboard query resolves (mount or scope-change) | `scope` ("all" \| "suburb"), `has_suburb` |
| `leaderboard_filter_changed` | User toggles between scope buttons | `from_scope`, `to_scope` |

### Module 4 events (now fired)

| Event | Triggered by | Props |
|---|---|---|
| `challenge_sent` | `useChallenges.sendChallenge` after insert | `target_user_id`, `has_proposed_time`, `has_venue`, `has_message`, `source` ("profile" \| "rematch") |
| `challenge_accepted` | `useChallenges.acceptChallenge` after status update | `challenger_user_id`, `days_since_sent` |
| `challenge_declined` | `useChallenges.declineChallenge` | `challenger_user_id` |
| `rematch_converted_to_match` | `useMatchHistory.submitMatch` when `scoreModal.sourceChallengeId` is set | `challenge_id`, `match_id`, `days_since_accepted` |

### Reserved (defined but not fired until later modules)

*(Currently empty — all reserved events have been promoted by Module 4.)*

### Event → loop-stage mapping

This is why these events were chosen. Each is the proof-point for one stage of the primary loop defined in `core-loop.md`.

| Loop stage | Proof event(s) |
|---|---|
| Activation — user shows up | `app_open`, `auth_signup_completed` |
| Activation — first meaningful action | `match_logged` (filter `is_ranked=true`) |
| Primary loop — log → confirm | `match_logged` → `match_confirmed` |
| Primary loop — dispute resolution | `match_disputed` → `match_correction_accepted` OR `match_voided` |
| Re-entry trigger works | `notification_opened` grouped by `type` |
| Identity / profile value | `profile_viewed` (filter `is_self=false` for social-reward signal) |
| Social reward | `feed_like`, `feed_comment` |
| Graph density | `friend_request_sent` → `friend_request_accepted` |
| Discovery works | `discover_tab_viewed` → (same user then) `friend_request_sent` within session |
| Challenge → match conversion | `challenge_sent` → `challenge_accepted` → `rematch_converted_to_match` → `match_logged` (linked via `props.challenge_id` / `props.match_id`) |

### Key metric queries (example SQL, run as service_role)

```sql
-- Time from signup to first match logged
select
  u.id,
  s.created_at           as signed_up_at,
  m.created_at           as first_match_at,
  m.created_at - s.created_at as time_to_first_match
from events s
join events m on m.user_id = s.user_id and m.event = 'match_logged'
where s.event = 'auth_signup_completed'
  and m.created_at > s.created_at
order by s.created_at desc;

-- Notification tap-through rate by type (last 30d)
select
  props->>'type'                        as notif_type,
  count(*)                              as taps,
  count(*) filter (where props->>'deep_link_target' = 'feed')     as feed_taps,
  count(*) filter (where props->>'deep_link_target' = 'profile')  as profile_taps,
  count(*) filter (where props->>'deep_link_target' = 'messages') as message_taps
from events
where event = 'notification_opened'
  and created_at > now() - interval '30 days'
group by 1
order by taps desc;

-- Confirmation rate within 72h (last 30d)
with logged as (
  select (props->>'match_id')::uuid as mid, created_at as logged_at
  from events where event = 'match_logged' and (props->>'is_ranked')::bool = true
    and created_at > now() - interval '30 days'
),
confirmed as (
  select (props->>'match_id')::uuid as mid, min(created_at) as confirmed_at
  from events where event = 'match_confirmed'
  group by 1
)
select
  count(*) as total_ranked,
  count(*) filter (where c.confirmed_at is not null and c.confirmed_at - l.logged_at < interval '72 hours') as confirmed_in_72h,
  round(100.0 * count(*) filter (where c.confirmed_at is not null and c.confirmed_at - l.logged_at < interval '72 hours') / nullif(count(*),0), 1) as pct
from logged l left join confirmed c using (mid);
```

## Design / Decision Principles

1. **Fire-and-forget, always.** Analytics writes never block the UI, never throw, never retry. If an event is dropped by a flaky network it's dropped. We don't build durable client queues for this.
2. **One event per user action.** Don't double-fire. If two code paths both do the same action, one of them is wrong — refactor so only the final success path fires.
3. **Props should answer the next question.** For every event, imagine the follow-up question. `match_logged` → "was it ranked?" Props must carry the answer without another DB join.
4. **Never log PII in props.** No names, no emails, no message content, no freetext the user typed. IDs and counts only. The `body_len` on `feed_comment` is fine; the body itself is not.
5. **Write events, not pageviews.** This is a behaviour log, not a web analytics funnel. Prefer meaningful outcomes over "they scrolled 40%".
6. **Event names are permanent.** No renames, no deletes. Adding props is fine, removing props is fine, changing semantic is a new event name.
7. **Service_role only reads.** No UI surfaces another user's events. This is a learning tool for us, not a feature for users.

## Anti-abuse / cost assumptions

- Low write volume expected at seed scale (single suburb cluster, ~50 users, couple thousand events/day). Fire-and-forget inserts are fine.
- No rate limiting on the client side. A malicious actor could spam `track()` to fill the table. Accepted at this scale; add a simple per-session rate limit in-helper if it ever matters.
- RLS restricts authenticated users to inserting only their own events (`user_id = auth.uid() OR user_id IS NULL`). They can't impersonate other users in the event log.
- `session_id` is client-generated and unverified. Trust nothing except `user_id` + `created_at`.

## Open Questions

- **Event retention.** We never delete events today. At 1000 users × 50 events/day × 365 = ~18M rows/year. Do we prune after 90 days? Keep forever? Open — probably keep forever at this scale, revisit at 100k users.
- **Client-side batching.** Single-row insert per event is fine at seed scale. If it becomes noticeable in cost / perf, batch with `sendBeacon` on unload.
- **External sink.** When / if we add PostHog or Amplitude as a secondary consumer, do we dual-write from the client, or stream from Postgres? Probably stream — keep `track()` as the single write point.
- **Anonymous / pre-auth events.** We allow `user_id IS NULL` but the app currently requires auth for every visible action, so no `app_open` without auth happens. Worth testing once we add a real landing page.
- **De-anonymisation before auth.** If a visitor reloads the app three times then signs up, can we stitch their pre-auth `app_open` sessions to their new user_id? Not now.
- **Cross-device session joining.** Users switching between desktop and phone have different `session_id`s. Worth stitching? Only if a metric genuinely needs it.

## Out of Scope (for now)

- External analytics sinks (PostHog, Amplitude, Mixpanel, Segment).
- Realtime dashboards / in-product analytics UI.
- User-facing "your activity" timeline.
- Event replay or behaviour-test tooling.
- A/B experiment framework on top of events.
- Conversion funnels UI.
- Session-stitching across tabs or devices.
- Client-side retry queues for failed event inserts.

## Last Updated By Module
- v0 — introduced by Module 3.5 (analytics foundation) with 16 registered events covering the full core loop + 4 reserved for Module 4.
- v1 — Module 4 promoted all 4 reserved events (`challenge_sent`, `challenge_accepted`, `challenge_declined`, `rematch_converted_to_match`) to fired with concrete props. Total registered events: 20 fired, 0 reserved.
- v2 — Module 5 added 2 new events: `leaderboard_viewed`, `leaderboard_filter_changed`. Total: 22 fired.
