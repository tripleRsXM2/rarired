# Privacy & Storage

## Purpose

Engineering reference for what CourtSync stores in the user's browser, why, how long, and how it's cleared. Companion to the user-facing disclosure rendered by `PrivacyStorageCard.jsx` in Settings — when this doc changes, update both.

CourtSync is a privacy-clean product by construction:

- **No cookies are set by app code.** Verified via grep — no `document.cookie` references in `src/` or `public/`. The Supabase JS client uses localStorage (not cookies) by default for the auth session.
- **No third-party scripts** in `index.html`.
- **No marketing pixels** (no FB / GA / TikTok / LinkedIn / etc).
- **No tracking SDKs** (no PostHog, Amplitude, Segment, Mixpanel, etc).
- **No fingerprinting.**
- **First-party analytics only** — writes to `public.events` on the same Supabase project, RLS-gated so users can only insert rows for themselves (or `null` for anonymous events).

A generic GDPR-style cookie banner would be both inaccurate (no cookies to consent to) and product-harmful. Instead we ship an in-app Privacy & Storage card with a single user-facing toggle (analytics opt-out).

## Storage inventory

| Type | Key | Purpose | Class | Lifetime | User control |
|---|---|---|---|---|---|
| localStorage | `sb-{ref}-auth-token` | Supabase auth session (JWT + refresh token) | Essential | until logout / token expiry | Settings → Sign out |
| localStorage | `theme` | Selected colour theme | Preference | until cleared | Settings → Appearance |
| localStorage | `cs.map.layers.v1` | Map layer toggles | Preference | until cleared | Map → Layers panel |
| localStorage | `cs:hiddenMsgs:{userId}` | "Delete for me" hidden DM ids (per user) | Preference | until cleared | Conversation context menu |
| localStorage | `cs_recent_emojis` | Recent emoji picks for picker | Preference | until cleared | (no UI today) |
| localStorage | `cs_analytics_opt_out` | Analytics opt-out flag, "1" if opted out | Preference | until toggled | Settings → Privacy & Storage |
| sessionStorage | `cs_session_id` | Tab-scoped analytics session UUID | Analytics (first-party) | tab close | n/a (random, not personal) |
| sessionStorage | `cs_auth_next` | Post-auth redirect URL (invite flow) | Temporary | tab close OR consumed by AuthModal | n/a (cleared after one use) |
| browser PushManager | (subscription) | Web Push device endpoint + keys | Essential (when enabled) | until disabled / unsubscribed | Settings → Phone alerts |
| Supabase DB `events` | row | First-party product analytics | Analytics (first-party) | retained per Supabase | Settings → Privacy & Storage opt-out |
| Supabase DB `push_subscriptions` | row | Server copy of push endpoint per user/device | Essential (push) | until disabled | Settings → Phone alerts |
| Supabase DB `notification_preferences` | row | Per-user push category mute flags | Preference | persists | Settings → Phone alerts toggles |

**Not used:** cookies, IndexedDB, Cache Storage. Service worker is push-only (no caching, no API interception — see `public/sw.js`).

## Classifications

- **Essential** — required for login, security, app functionality, push setup, or user-requested features.
- **Preference** — UI / product choices (theme, hidden rows, opt-outs).
- **Analytics** — measures usage, product behaviour, funnels. First-party only.
- **Temporary** — short-lived flow state (post-auth redirect, etc).

No **Marketing** category exists in this codebase. If that ever changes, add a real consent flow before shipping.

## Cookie banner decision

**No cookie banner.** Justified by all of:
- No cookies set by app code.
- No third-party tracking.
- No cross-site tracking.
- No pre-consent loading of marketing scripts.
- First-party analytics with opt-out toggle satisfies APP / GDPR legitimate-interest standards for a privately-targeted product.

If this changes (e.g. third-party SDK added, retargeting added, EU launch), revisit and add a real consent flow. Do not silently ship a banner — it's a real architectural change.

## Logout cleanup

`useAuthController.signOutAndCleanup()` is the sanctioned sign-out path. Every UI that ends a session funnels through it. Sequence:

1. **`disablePush()`** — unsubscribes the browser-level PushSubscription AND flips the DB `push_subscriptions` row to `enabled=false`. Best-effort: a network failure here doesn't block sign-out, but the browser-level unsubscribe runs first inside `disablePush()` so the device stops receiving pushes immediately even on partial failure.
2. **`supabase.auth.signOut()`** — clears the Supabase localStorage session, fires the `SIGNED_OUT` auth-state event.
3. **`coordRef.reset()`** (subscriber-driven) — clears in-memory caches: profile, match history, social graph, DMs, notifications, challenges, leagues. Resets transient UI state (profile sub-tab, settings sheet, review drawer).

What's deliberately **not** cleared on logout:
- `theme` — device preference, not per-user.
- `cs.map.layers.v1` — device preference.
- `cs_recent_emojis` — device preference.
- `cs:hiddenMsgs:{userId}` — namespaced by userId, doesn't leak across users naturally.
- `cs_analytics_opt_out` — user's deliberate device-level choice.
- Theme + map prefs survive intentionally so a device used by one regular user stays consistent.

## Shared-device safety

Verified scenarios after `signOutAndCleanup()`:

| Concern | Mitigation |
|---|---|
| Previous user's profile / match / notification data visible | `coordRef.reset()` clears all in-memory caches before next user signs in |
| Previous user's Supabase session reused | Supabase JS clears its own localStorage entries on `signOut()` |
| Previous user's hidden DM map visible | Key is namespaced by `userId` — next user reads their own (or empty) map |
| Previous user's push subscription delivers to next user's device | **Fixed by Module 9.2** — `disablePush()` runs before `signOut()`, so the browser endpoint is unsubscribed and the DB row is flipped to `enabled=false`. Next user gets a fresh subscription tied to their own user_id. |
| Previous user's analytics events tagged to next user | `track()` calls `supabase.auth.getUser()` at flush time, so events emitted *after* logout write `user_id=null`, not the previous user's id |

**Known minor risks:**
- Theme survives logout — by design (device preference). If the previous user picked a theme the new user dislikes, they re-pick it in Settings → Appearance. Not a privacy issue.
- `cs:hiddenMsgs:{userId}` — survives logout but is namespaced. The previous user's hidden DM list is effectively orphaned in storage until the same user signs back in. Could be cleaned up at logout but the namespacing means no leak; leaving as-is.

## Push notifications

See `docs/push-notifications.md` for the full architecture. Privacy-relevant points:

- VAPID **public** key only is shipped to the client (`VITE_VAPID_PUBLIC_KEY`). The private key is a Supabase Edge Function secret.
- `push_subscriptions` table is RLS-gated: users can only see/modify their own rows. The Edge Function runs as service-role and reads cross-user but never exposes one user's endpoints to another.
- Push subscriptions are **device-specific**. Disabling on one device doesn't disable on another. Users see this in the Privacy & Storage card.
- Sign-out invalidates this device's subscription (see Logout cleanup above). Module 9.2 fixed the cross-user leak that existed before this funnel was wired.
- `refreshSubscription(userId)` runs on every signed-in session start — reconciles silently-rotated browser endpoints (key rotation, GCM → FCM migration, crash recovery). Idempotent: a no-op when the endpoint already matches.

## Analytics

- Provider: first-party only. Writes via `lib/analytics.js → track(event, props)` to `public.events` on the same Supabase project.
- Identifier: `user_id = auth.uid()` when signed in, `null` when anonymous. `session_id` is a tab-scoped UUID with no link to user identity.
- ~78 distinct event call sites (counted via `grep`). Full taxonomy in `docs/analytics-events.md`.
- Events do **not** carry private content: no DM bodies, no full invite tokens, no match notes, no raw push subscription details.
- **Opt-out** — `localStorage.cs_analytics_opt_out = "1"` short-circuits `track()` before it touches sessionStorage or hits the network. Wired to a toggle in Settings → Privacy & Storage.
- The opt-out is device-scoped (no DB column, no cross-device sync). Keeps the implementation surface minimal for V1; reconsider if/when the user base grows.

## Invite / auth-redirect flow state

`cs_auth_next` (sessionStorage) carries the path the user was on when they clicked Sign in / Sign up — used to land them back on the original page (e.g. an invite link) after authentication.

- **Tab-scoped** — clears on tab close.
- **Single-use** — `AuthModal` reads it, immediately removes it, then navigates.
- Stores **only the path**, never invite tokens or user identifiers.
- `InviteMatchPage` writes it before redirecting unauthenticated users to login; `AuthModal:235` clears it after consume.

See `docs/opponent-invite-flow.md` for the invite-token side of this flow (server-hashed, never persisted client-side beyond the URL itself).

## Environments

- Dev (Vite localhost): service worker NOT registered — registration in `main.jsx` is gated on `import.meta.env.PROD`. Avoids HMR conflicts.
- Preview / production (Vercel): SW registers on `load`, scoped to `/`. Same auth + storage behaviour as dev otherwise.
- Vite env split: only `VITE_*` keys land in client bundle (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`). VAPID **private** key is a Supabase Edge Function secret only — never set as `VITE_*`. Confirmed in `.env.example` warnings.

## Future work (deferred — not blocking)

- Server-side analytics opt-out (column on `profiles`). Would persist the choice across devices. Today's localStorage-only opt-out applies to the device it was set on.
- "Manage devices" UI for `push_subscriptions` (the `listMyPushSubscriptions` helper is already in `pushService.js` — UI not built).
- Logout-time clear of `cs:hiddenMsgs:{userId}`. Currently survives logout but is namespaced by user — no leak risk, just orphaned storage.
- Cookie-based auth — would only matter if SSR or server route handlers were added. Not on the roadmap.
