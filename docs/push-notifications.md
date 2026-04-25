# Push Notifications (Module 8)

## Purpose

Get retention-critical events to the user's lock screen on Android and iPhone, even when the CourtSync tab/app is closed. Standards-based Web Push (VAPID), Service Worker delivered, fan-out from a Supabase Edge Function. No native iOS/Android app, no FCM/OneSignal SDK.

## Architecture

```
   ┌─────────────────────────────────────────────────────────────┐
   │ User taps Confirm / Submit / Accept in the React app        │
   └────────────────────┬────────────────────────────────────────┘
                        │ insertNotification(payload)
                        ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ notificationService.insertNotification:                     │
   │   1. INSERT into public.notifications  (or emit_notification │
   │      RPC for cross-user — RLS gated)                        │
   │   2. fire-and-forget supabase.functions.invoke('send-push', │
   │      { notification_id })                                   │
   └────────────────────┬────────────────────────────────────────┘
                        │ JWT-auth POST (Supabase client SDK)
                        ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Edge Function send-push (Deno):                             │
   │   - verify caller is from_user_id or user_id of notif       │
   │   - idempotency check vs notification_push_log              │
   │   - load recipient's notification_preferences (default-on)  │
   │   - look up recipient's enabled push_subscriptions          │
   │   - sign + encrypt payload (VAPID + AES-128-GCM)            │
   │   - POST to each device's push endpoint                     │
   │   - prune 404/410, increment failure_count, log device_count│
   └────────────────────┬────────────────────────────────────────┘
                        │ encrypted Web Push protocol
                        ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ User's browser/OS push service (FCM / APNs / Mozilla AS)    │
   └────────────────────┬────────────────────────────────────────┘
                        ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Service worker /sw.js:                                      │
   │   - 'push' event → showNotification(title, body, ...)       │
   │   - 'notificationclick' → focus existing tab + postMessage  │
   │     'navigate', or openWindow(url)                          │
   └─────────────────────────────────────────────────────────────┘
```

## Service worker scope

| Path | Purpose |
|---|---|
| `/sw.js` | Served from `public/sw.js` at the site root so its scope covers the whole app (`/`). |
| Registration | `src/main.jsx` registers in `import.meta.env.PROD` only — dev mode skips it so Vite HMR isn't intercepted. |
| Lifecycle | `skipWaiting()` + `clients.claim()` on activate — newest version takes over without a tab close. |

## Supabase tables

### `push_subscriptions`
One row per (user, device-endpoint). All RLS-gated to `auth.uid() = user_id`. Service role bypasses RLS so the Edge Function can read across users.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK auth.users | ON DELETE CASCADE |
| `endpoint`, `p256dh`, `auth` | text | Web Push subscription material |
| `user_agent`, `device_type`, `browser`, `is_standalone_pwa` | text/bool | Debug + future "manage devices" UI |
| `enabled` | bool | flips false on unsubscribe / 404 / 410 |
| `created_at`, `updated_at`, `last_success_at`, `last_failure_at` | timestamptz | |
| `failure_count` | int | |
| UNIQUE `(user_id, endpoint)` | | |

### `notification_preferences`
Per-user category toggles. Defaults to all-true via the `get_notification_prefs(p_user_id)` helper so a user who's never opened settings still gets push.

8 categories: `match_invites` / `match_updates` / `result_reviews` / `league_updates` / `tournament_updates` / `ranking_changes` / `court_bookings` / `system_updates`. `quiet_hours_*` fields are forward-compat (no UI yet).

### `notification_push_log`
Idempotency ledger. PK = `notification_id`. Re-firing for the same `notification_id` is a no-op.

## RLS model

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `push_subscriptions` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `notification_preferences` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | — |
| `notification_push_log` | service_role only | service_role only | service_role only | — |

Other users' push endpoints are never visible through any client query.

## Backend push sender

**Location:** `supabase/functions/send-push/index.ts` — Supabase Edge Function (Deno runtime).

**Why Edge Function (not Vercel serverless or in-DB):**
- One env-var surface (Supabase project), one deploy command, native `service_role` access.
- No introduction of a new Node hosting surface (the rest of the app is client-only against Supabase).
- Deno has stable VAPID + payload-encryption support via `@negrel/webpush`.

**Two invocation modes:**
1. `{ self_test: true, payload: {...} }` — caller's own subscriptions only. Powers the "Send test" button in Settings.
2. `{ notification_id: "<uuid>" }` — server-side fan-out from the in-app notification. Caller must be the notification's `from_user_id` (cross-user emit) OR `user_id` (self-emit). Anything else returns `403 forbidden`.

## Env vars

| Name | Where | Public? | Purpose |
|---|---|---|---|
| `VITE_VAPID_PUBLIC_KEY` | Vercel (preview + prod) + `.env.local` | ✅ public — bundled into client | Used by `PushManager.subscribe(applicationServerKey)`. |
| `VAPID_PUBLIC_KEY` | Supabase secrets | (same as VITE_) | Required by the Edge Function for signing. |
| `VAPID_PRIVATE_KEY` | Supabase secrets | ❌ NEVER expose | Signs VAPID JWTs. |
| `VAPID_SUBJECT` | Supabase secrets | — | `mailto:ops@courtsync.app` or an https URL — VAPID contact info. |

`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the Edge runtime.

## VAPID key generation

```bash
node scripts/gen-vapid-keys.mjs
```

Prints both keys + a ready-to-paste `supabase secrets set` command. Run **once per environment** (you can reuse keys across preview/prod if you want, but separate keys per env makes revocation cleaner).

```bash
SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase/access-token)" \
  /tmp/supabase secrets set --linked \
    VAPID_PUBLIC_KEY=BLh… \
    VAPID_PRIVATE_KEY=Yh… \
    VAPID_SUBJECT=mailto:ops@courtsync.app
```

Then deploy:

```bash
SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase/access-token)" \
  /tmp/supabase functions deploy send-push --linked
```

Set `VITE_VAPID_PUBLIC_KEY` in Vercel (preview + production) and trigger a redeploy.

## Client enable / disable flow

`src/lib/pushClient.js` exposes:

- `getPermission()` — `'default' | 'granted' | 'denied' | 'unsupported'`
- `enablePush(userId)` — register SW → request permission → `PushManager.subscribe` with VAPID public key → upsert into `push_subscriptions`. Returns `{ ok }` or `{ error: 'permission_denied' | 'subscribe_failed' | 'missing_vapid' | 'unsupported' | 'save_failed', message }`.
- `disablePush()` — unsubscribe in browser first (so push stops immediately) → flip the row's `enabled=false`.
- `refreshSubscription(userId)` — call on app boot; reconciles silent endpoint rotations.

`src/features/notifications/components/PushSettingsCard.jsx` consumes this and renders the right state for the device:

| State | UI |
|---|---|
| iOS < 16.4 | "Phone alerts on iPhone require iOS 16.4 or later." |
| iOS 16.4+ in Safari tab | "Add to Home Screen first" + step-by-step instructions. No Enable button. |
| Browser without push | "This browser doesn't support web push." |
| Permission `denied` | "Notifications are blocked. Re-enable in browser/device settings." |
| Push capable, no sub | "Enable phone alerts" primary action. |
| Push capable, subscribed | "Enabled on this device" + Turn off + Send test buttons. |

## iPhone install flow (expected user steps)

1. Open CourtSync in Safari on iOS 16.4+.
2. Tap the Share icon → **Add to Home Screen** → Add.
3. Open CourtSync from the new Home Screen icon (the standalone PWA — no Safari chrome).
4. Sign in.
5. Tap the avatar → Settings → Phone alerts → **Enable phone alerts**.
6. Approve the iOS permission prompt.

Lock-screen notifications will arrive even when the PWA is closed.

## Android flow

1. Open CourtSync in Chrome / Edge / Samsung Internet on Android.
2. (Optional) Use the in-browser "Add to Home Screen" prompt for app-icon delivery; not required for push.
3. Sign in → Settings → Phone alerts → **Enable phone alerts**.
4. Approve the permission prompt.

## Notification categories + payload taxonomy

| In-app type | Push category | Default URL |
|---|---|---|
| `match_tag` | `result_reviews` | `/home?highlightMatchId=…` |
| `match_disputed` / `match_correction_requested` / `match_counter_proposed` | `result_reviews` | `/home?highlightMatchId=…` |
| `match_reminder` | `result_reviews` | `/home?highlightMatchId=…` |
| `match_confirmed` / `match_voided` / `match_expired` | `match_updates` | `/home?highlightMatchId=…` |
| `challenge_received` | `match_invites` | `/tournaments/challenges?highlightChallengeId=…` |
| `challenge_accepted` / `challenge_declined` / `challenge_expired` | `match_updates` | `/tournaments/challenges?highlightChallengeId=…` |
| `friend_request` | `system_updates` | `/people/requests` |
| `request_accepted` | `system_updates` | `/profile` |
| `league_invite` / `league_joined` | `league_updates` | `/tournaments/leagues?highlightLeagueId=…` |
| `pact_proposed` / `pact_claimed` / `pact_confirmed` | `match_invites` | `/tindis/active?highlightPactId=…` |
| `pact_booked` | `match_updates` | `/tindis/active?highlightPactId=…` |
| `pact_cancelled` | `match_updates` | `/tindis/history?highlightPactId=…` |
| `message_request` / `message_request_accepted` | `match_updates` | `/people/messages` |

**Not push-worthy** (in-app only): `like`, `comment`, `match_deleted`, `message`, system noise.

## Privacy rules

- Push payloads are concise — sender display name + the action verb only. Match scores, opponent details, and free-text content are never in the payload (lock-screen visibility).
- The full content lives in the in-app row; the SW deep-links there on tap.
- Push subscription endpoints + keys are RLS-gated; never readable cross-user.
- VAPID private key is in Supabase secrets only; never bundled into the Vite client.

## Testing checklist

| Scenario | Expected |
|---|---|
| Android Chrome — Enable | Permission prompt → row in `push_subscriptions` → "Enabled on this device" status. |
| Android — Send test | System notification arrives. Tap → opens `/home`. |
| iOS 16.4+ Safari tab | Sees "Add to Home Screen first" guidance. No Enable button. |
| iOS 16.4+ standalone PWA | Enable button visible → permission prompt → row in `push_subscriptions`. |
| iOS 15.x | "iOS too old" message. |
| Permission denied | "Blocked" state with re-enable instructions. |
| Sign out + sign back in | Old subscription enabled status persists; on app boot `refreshSubscription` re-saves if endpoint rotated. |
| Multi-device | Two browsers / phones each have their own `push_subscriptions` row; pushes go to both. |
| Stale endpoint | 404/410 from push service flips `enabled=false`. |
| Re-emit same notification | `notification_push_log` PK collision → no duplicate push. |
| Recipient muted category | Edge Function logs `muted_by_recipient`, no push, ledger row written so re-emits no-op. |
| App already open at click | SW posts `navigate` → `history.pushState + popstate` lands on the deep-link without losing React state. |

## Known limitations

1. **Ranking-change push not yet wired.** The `ranking_changes` category exists in `notification_preferences` and `apply_match_outcome` writes the ranking, but no `notifications` row is emitted on rating change yet. Future slice: emit a `ranking_change` row from `apply_match_outcome` (or a follow-up trigger).
2. **No quiet hours UI.** Schema supports it (`quiet_hours_start` / `_end` / `_tz`); UI deferred until users ask.
3. **Stale-disabled rows aren't auto-purged.** Once a sub goes `enabled=false`, it sits there forever. Cheap, but a periodic "delete enabled=false WHERE updated_at < now() - 30 days" cleanup is a future cron.
4. **iOS push delivery latency.** APNs can throttle Web Push to a few minutes during heavy load — out of our control.
5. **Notification-click in already-open desktop tabs.** Works on Chrome / Edge; Safari sometimes opens a new tab regardless because of how the focus flag interacts with multiple windows.
6. **Service worker only handles push, not offline caching.** Adding offline support is a separate slice that has to be careful about asset versioning and stale-content bugs.

## Future native-app considerations

If we ever ship a native iOS / Android app:
- The Web Push subscription becomes irrelevant on those clients (APNs/FCM device tokens replace them). The schema is still useful: rename the table, add a `provider` column, fan out from the same Edge Function with provider-specific payloads.
- The notification taxonomy + per-category prefs carry over unchanged.
- The PushSettingsCard and the iOS install flow disappear; native permission prompts replace them.

## Last updated

2026-04-27 — Module 8 (push notifications V1 foundation).
