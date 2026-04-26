# Opponent Invite Flow (Module 9)

## Purpose

Turn match logging into the activation loop. When a CourtSync user logs a match against someone who isn't on the platform yet, they generate a **secure share-link invite**. The recipient signs in / signs up, claims the invite, then explicitly confirms or disputes the result.

This single flow does five jobs:
1. **User acquisition** — every logged match is a potential new signup.
2. **Match verification** — the existing dispute / confirm pipeline validates the result.
3. **Social graph creation** — claimed matches link two real users.
4. **Rating / trust foundation** — only confirmed claimed matches feed CourtSync Rating.
5. **Retention** — the logger has a reason to come back (check whether the opponent claimed yet).

> **Naming reminder.** This module never creates fake users. The claim attaches an existing real CourtSync account to the match — nothing else.

## Match status lifecycle (extended)

```
NEW (Module 9):
  pending_opponent_claim
    ├─ invite claimed (claim_match_invite)  → pending_confirmation
    ├─ invite revoked (revoke_match_invite) → (status unchanged; logger
    │                                          may re-issue or void manually)
    └─ invite expires (default 30 days)     → (status unchanged; logger
                                               may re-issue)

then existing (unchanged):
  pending_confirmation → confirmed | disputed | expired (72h)
  disputed             → confirmed | pending_reconfirmation | voided
  pending_reconfirmation → same
```

Pre-claim, `pending_opponent_claim` rows are **unverified**:
- `match_type='ranked'` is allowed (the match is meant to become rated).
- `apply_match_outcome` only ever fires on `status='confirmed'` rows, so no rating impact.
- `recalculate_league_standings` filters to `status='confirmed'` — no league standings impact.
- `validate_match_score` BEFORE-INSERT trigger applies its strict rules to this status alongside `pending_confirmation` / `confirmed` (so a forced REST POST can't seed a malformed pre-claim row).
- Stats helpers (`profileStats.js`, `HomeWeekStrip`) all gate on `status === 'confirmed'`, so the pre-claim match never inflates anything.

## Token security

| Property | Value |
|---|---|
| Token entropy | 32 cryptographic random bytes (`extensions.gen_random_bytes`) |
| Encoding | base64url (no `+`, no `/`, no padding) → 43 chars |
| At-rest form | SHA-256 hex hash (`extensions.digest`) — raw token never persisted |
| Generation | Server-side inside `create_match_invite` SECURITY DEFINER |
| Default expiry | 30 days (configurable via `p_expires_in_hours`, max 1 year) |
| Reuse | Single-use — claimed/declined/revoked tokens fail subsequent claim attempts |
| Visibility | Raw token returned exactly once from `create_match_invite`; never SELECT-able |

## Schema

### `match_invites` (Module 9)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `match_id` | text FK `match_history(id)` | ON DELETE CASCADE |
| `invited_by` | uuid FK `auth.users(id)` | ON DELETE CASCADE |
| `invited_name` | text | freetext name as typed by the logger |
| `invited_contact` | text | optional, RLS-private |
| `token_hash` | text | SHA-256 hex of the raw token |
| `status` | text | `pending` \| `claimed` \| `declined` \| `expired` \| `revoked` |
| `claimed_by` | uuid | claimer's `auth.uid()` |
| `claimed_at` | timestamptz | |
| `declined_by` | uuid | |
| `declined_at` | timestamptz | |
| `expires_at` | timestamptz | required |
| `revoked_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

**Indexes:** `token_hash`, partial `(match_id) where status='pending'`, `invited_by`.
**RLS:** owner-only SELECT (`invited_by | claimed_by | declined_by`); no INSERT/UPDATE/DELETE policies for clients — every transition flows through SECURITY DEFINER RPCs.

### `match_history.status` widen
CHECK constraint `valid_status` adds `'pending_opponent_claim'` to the allowed set.

## RPCs

All SECURITY DEFINER. `search_path = public, extensions` so `pgcrypto` calls resolve.

| RPC | Auth | Purpose |
|---|---|---|
| `create_match_invite(p_match_id, p_invited_name, p_invited_contact, p_expires_in_hours)` | logger only | Revokes any prior pending invite for the match, generates a fresh token + hash, returns `(invite_id, token, expires_at)` once. |
| `preview_match_invite(p_token)` | public (anon + auth) | Returns safe preview jsonb — `{ status, invite_id, match_id, logger_name, invited_name, match_date, sets, result, venue, court, expires_at, caller_is_logger, caller_is_claimer }`. Auto-flags `pending` rows whose `expires_at` is past as `expired`. Returns `{ status: 'not_found' }` on bogus tokens (no exception). |
| `claim_match_invite(p_token)` | authenticated | Rejects self-claim. Atomically sets invite to `claimed` + match to `pending_confirmation` + `opponent_id = auth.uid()` + fresh 72h confirmation window. Inserts `match_invite_claimed` notification; failure is non-fatal. |
| `decline_match_invite(p_token)` | authenticated | Marks invite declined; does NOT touch match (logger may re-issue or void). Inserts `match_invite_declined` notification. |
| `revoke_match_invite(p_invite_id)` | inviter only | Marks pending invite revoked. Match status untouched. |

## Client routing

`/invite/match/:token` — top-level path branch in `src/app/App.jsx` BEFORE the regular shell. `parseInvitePath(pathname)` validates the token shape (43-char base64url, tolerant of trailing `/` / `?query` / `#fragment`).

`<InviteMatchPage>` handles every state from the spec:
| State | View |
|---|---|
| `not_found` | "This link doesn't go anywhere." |
| `expired` | "This invite expired." |
| `revoked` | "This invite was withdrawn." |
| `declined` | "You marked this invite as 'not me'." |
| `claimed` (other user) | "This invite has been claimed." |
| `claimed` (current user) | "Confirm or dispute it from your feed." → `/home?highlightMatchId=...` |
| `pending` + logged out | safe preview + "Sign in to claim" → AuthModal |
| `pending` + logger | "You logged this — share the link" |
| `pending` + third party | preview + **Claim and review** + **This wasn't me** |

After successful `claim_match_invite`, the page navigates to `/home` with `state.highlightMatchId` so the existing `ActionReviewDrawer` (Confirm / Dispute / Not my match) takes over. **No parallel review UI.**

## Auth-redirect preservation

When a logged-out user opens an invite link, `InviteMatchPage` calls the App's `openAuth({ next })` helper which:
1. Stashes the invite path (e.g. `/invite/match/abc...`) in `sessionStorage` under key `cs_auth_next`.
2. Opens the existing `<AuthModal>`.

After successful sign-in / sign-up, the AuthModal email-form handler reads `sessionStorage.cs_auth_next`, clears it, and navigates back via `history.pushState + PopStateEvent` so BrowserRouter picks up the URL without a hard reload.

**Known limitation:** cross-device magic-link auth doesn't preserve sessionStorage. If we ever ship email magic-links, the recipient lands on `/home` instead of the invite — they'd need to re-paste the link. P2 follow-up.

**Privacy:** `cs_auth_next` is tab-scoped sessionStorage (cleared on tab close), single-use (cleared after consumption), and stores only the path — never invite tokens, never user identifiers. See `docs/privacy-and-storage.md` "Invite / auth-redirect flow state" for the broader storage classification.

## Notifications

Two new types, registered in `notifUtils.js`, `notificationService.js` (push allow-list), and the `send-push` Edge Function (`PUSH_TYPE_TO_CATEGORY` + `buildPayloadForType`):

| Type | Recipient | Category | Effective | Push? |
|---|---|---|---|---|
| `match_invite_claimed` | logger | `match_updates` | important | ✅ |
| `match_invite_declined` | logger | `match_updates` | important | ✅ |

Both deep-link to `/home?highlightMatchId=...`. Standing-check in `emit_notification` requires the caller to be the claimer/decliner of an invite whose inviter is the recipient.

## ScoreModal "Invite to confirm" toggle

Renders only when:
- The match is being newly logged (not a resubmit)
- The user typed a freetext opponent name
- No friend is linked (`!casualOppId`)

When ON:
- `scoreDraft.inviteOpponent = true`
- `submitMatch` clamps `matchType = 'ranked'` and `status = 'pending_opponent_claim'`
- Skips match-hash dedupe (no opponent uuid yet)
- Skips the 72h `expires_at` (the invite has its own 30-day expiry; claim restarts the 72h clock)
- After successful `insertMatch`, calls `createMatchInvite` and surfaces the token to ScoreModal's finish moment via `res.invite`
- ScoreModal's finish moment hands off to `<InviteShareCard>` instead of the auto-dismissing `<MatchFinishMoment>`

When OFF: the existing casual-record-only behaviour is preserved verbatim. No regressions for the quick-log workflow.

## Share UX

`<InviteShareCard>` offers three sharing affordances:
1. **Native Web Share** (primary, when `navigator.share` is available)
2. **Copy link** (always shown; uses `navigator.clipboard` with execCommand fallback)
3. **WhatsApp deep link** (`wa.me/?text=...`) — explicit secondary because of seed-market usage patterns.

The card does **not** auto-dismiss. The user closes manually with "Done" once they've sent the link — sharing is the activation moment.

## Analytics

| Event | Where |
|---|---|
| `opponent_invite_created` | `useMatchHistory.submitMatch` after `createMatchInvite` succeeds |
| `opponent_invite_shared` | `InviteShareCard` after Web Share / Copy / WhatsApp success |
| `opponent_invite_opened` | `InviteMatchPage` mount when preview returns pending/claimed |
| `opponent_invite_claimed` | `InviteMatchPage` after `claim_match_invite` succeeds |
| `opponent_invite_declined` | `InviteMatchPage` after `decline_match_invite` succeeds |

Planned (not yet wired): `opponent_invite_signup_started`, `opponent_invite_confirmed`, `opponent_invite_disputed`, `opponent_invite_expired`, `opponent_invite_revoked`, `opponent_invite_reissued`. Add when the next analytics module ships.

## Privacy rules

- `invited_contact` is RLS-private (owner SELECT only).
- `token_hash` is never exposed to clients (RLS hides it; service_role only).
- `preview_match_invite` returns ONLY safe-preview fields — no contact info, no internal ids beyond `match_id`, no token, no hash.
- Push payloads concise — sender display name + action verb, no private match details.

## Rating / league rules (recap)

A `pending_opponent_claim` match:
- ❌ Does NOT affect CourtSync Rating
- ❌ Does NOT count toward calibration progress
- ❌ Does NOT count toward `confirmed_ranked_match_count`
- ❌ Does NOT count toward competitive league standings
- ❌ Does NOT count as a verified match

After claim AND opponent confirmation:
- ✅ Becomes rating-eligible (subject to all the existing match_type='ranked' + completion + valid score + linked opponent gates)
- ✅ Counts toward calibration if rating is initialised
- ✅ Counts toward league standings if league_id is set and league.mode='ranked'

## Verification checklist (manual)

| # | Scenario | Expected |
|---|---|---|
| 1 | Linked-friend match | Existing tagged-opponent flow unchanged; no invite created |
| 2 | Freetext name + Invite toggle OFF | Casual record only; no invite created (existing behaviour) |
| 3 | Freetext name + Invite toggle ON | Match goes in as pending_opponent_claim; share card shown |
| 4 | Web Share / Copy / WhatsApp | Each fires opponent_invite_shared with correct channel |
| 5 | Open link logged out | Sign-in modal; after auth lands back on InviteMatchPage |
| 6 | Logger opens own link | "You logged this — share the link" view; no claim affordance |
| 7 | Third-party logged-in claim | Match flips to pending_confirmation; landing redirects to /home with highlightMatchId |
| 8 | Claim → Confirm via ActionReviewDrawer | Match goes to confirmed; `apply_match_outcome` fires; rating updates |
| 9 | Claim → Dispute via ActionReviewDrawer | Match goes to disputed; counter-proposal flow works as before |
| 10 | "This wasn't me" | Invite declined; match stays pending_opponent_claim; logger gets `match_invite_declined` |
| 11 | Re-open declined link | Lands on declined view |
| 12 | Re-claim claimed link | Rejected with "invite is claimed" |
| 13 | Backdated invite (expired) | Preview returns expired; claim returns "invite expired" |
| 14 | Revoke pending invite (logger) | Status flips revoked; preview shows revoked; new create_match_invite issues a fresh token |
| 15 | Bogus token | Preview returns not_found; no crash |
| 16 | Mobile share sheet | Web Share opens correct OS sheet on iOS PWA + Android Chrome |
| 17 | Pending row in feed | Shows "AWAITING OPPONENT" pill; no rating impact |

## Out of scope (V1)

- Rate limiting (per-user pending invites per day) — invite-spam abuse vector
- SMS / email invites with stored contacts — V1 uses share-link only
- "Re-issue" affordance from the feed card — V1 requires user to open the match's invite block manually
- Cross-device magic-link auth-redirect preservation
- Auto-pruning expired/revoked invites — they sit in the table forever; periodic cleanup is a future cron

## Last updated

2026-04-28 — Module 9 V1 ship. 6 slices: schema + RPCs / validator widen + service / ScoreModal toggle + submitMatch / InviteShareCard / InviteMatchPage + AuthModal next-url / notifications + display + docs.
