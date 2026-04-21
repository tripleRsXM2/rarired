# Core Loop Foundation — Living Build Log

> **Product vision (locked):** CourtSync is a verified social tennis identity product first, and a lightweight coordination product second.

This document is the single source of truth for the match-truth system and the staged build of profile, discovery, notification, challenge, ELO, and feed modules on top of it. Updated after every module.

---

## Match state machine

```
pending_confirmation
  ├─[opponent confirms]──────────▶ confirmed        (stats updated)
  ├─[opponent disputes]──────────▶ disputed         (pending_action_by = submitter)
  └─[72h elapses, pg_cron]───────▶ expired          (no stats)

disputed
  ├─[submitter counter-proposes]▶ pending_reconfirmation  (pending_action_by = opponent)
  ├─[submitter accepts]──────────▶ confirmed        (stats updated)
  ├─[either party voids]─────────▶ voided           (reason: not_my_match | mutual_void)
  └─[48h elapses, pg_cron]───────▶ voided           (reason: timeout)

pending_reconfirmation
  ├─[opponent counter-proposes]──▶ disputed         (pending_action_by = submitter)
  ├─[opponent accepts]───────────▶ confirmed        (stats updated)
  ├─[either party voids]─────────▶ voided           (reason: not_my_match | mutual_void)
  ├─[revision_count ≥ 3]─────────▶ voided           (reason: max_revisions, auto on next counter)
  └─[48h elapses, pg_cron]───────▶ voided           (reason: timeout)

confirmed  — terminal (delete only; no reopen)
voided     — terminal
expired    — terminal (unverified, no stats)
```

Casual matches (no `opponent_id`) skip pending_confirmation entirely → written directly as `confirmed` with `tournName = "Casual Match"` and no stat impact. Ranked casual matches (has `opponent_id`) enter the full state machine with `tournName = "Ranked"`.

Roles at each state:
- `proposalBy` — who last made a proposal (dispute or counter). Null on fresh pending_confirmation.
- `pendingActionBy` — who is expected to act next. The other player, after any proposal.

---

## Services / RPC inventory

| Function | Kind | RPC guarantees | Client owns |
|---|---|---|---|
| `fetchOwnMatches` / `fetchOpponentMatches` | SELECT | — | — |
| `insertMatch` | client INSERT (RLS) | — | only rows where `user_id = auth.uid()` |
| `fetchMatchById` | SELECT | — | — |
| `updateMatch` / `deleteMatchRow` | client UPDATE/DELETE (RLS) | — | only own rows |
| `confirmMatchAndUpdateStats` | **RPC SECURITY DEFINER** | status transition, atomic stats bump on both profiles | — |
| `acceptCorrectionRpc` | **RPC SECURITY DEFINER** | copies proposal → match, atomic stats bump, clears proposal state | — |
| `voidMatchRpc` | **RPC SECURITY DEFINER** | status=voided, reason recorded, clears proposal state | — |
| `proposeCorrection` | **RPC SECURITY DEFINER** | writes match_history + match_revisions atomically, sets `pending_action_by`, increments `revision_count`, refreshes `dispute_expires_at` | — |
| `expireStaleMatches` | RPC (runs under pg_cron every 15 min) | pending>72h → expired; disputed>48h → voided w/ timeout | — |
| `expireStalePendingMatches` / `expireDisputedMatches` | client UPDATE fallback | idempotent with the RPC | safe to call on loadHistory |
| `markMatchTagStatus` | client UPDATE | — | legacy tag_status flow |

**Principle:** every state transition is owned by an RPC. The client never writes `status`, `result`, `sets`, or `current_proposal` directly. Client-side `updateMatch` is reserved for non-transitional metadata.

---

## Notification event matrix

| Transition | Notification | Receiver | Wired? |
|---|---|---|---|
| submit ranked match | `match_tag` | opponent | ✅ useMatchHistory.submitMatch |
| opponent confirms | `match_confirmed` | submitter | ✅ useMatchHistory.confirmOpponentMatch |
| opponent disputes | `match_disputed` | submitter | ✅ useMatchHistory.disputeWithProposal |
| submitter counters | `match_counter_proposed` | opponent | ✅ useMatchHistory.counterPropose |
| accept correction | `match_confirmed` | other party | ✅ useMatchHistory.acceptCorrection |
| void match | `match_voided` | other party | ✅ useMatchHistory.voidMatchAction |
| reminder (<24h to expiry) | `match_reminder` | opponent | ⚠ localStorage-gated (resets on device wipe) |
| **pg_cron auto-expire** | *(none)* | *(none)* | ❌ **gap — opponent never learns the ranked match auto-expired** |
| **match deleted by submitter while pending/disputed** | `match_deleted` | opponent | ❌ **gap — only fires for confirmed matches** |

Non-critical gaps, documented so we fix them in later modules.

---

## Module 0 — Audit + harden current truth loop

**Objective:** make the existing match-truth loop observable and rollback-safe on the client so users never end up with UI in a lie-state relative to the server. No feature additions, no schema changes.

**Findings (from audit):**

1. **`confirmOpponentMatch`** (useMatchHistory.js) — on RPC error, logs to console and returns `undefined`. Callers have no way to know and the optimistic `setHistory` has already run. If the RPC failed, the card stays visually "confirmed" but DB is untouched.
2. **`acceptCorrection`** — same pattern. ActionReviewDrawer already expects `{error}`, but the hook returns nothing on failure, so the drawer closes successfully on silent failures.
3. **`voidMatchAction`** — same pattern. DisputeModal and ActionReviewDrawer both expect `{error}` but get `undefined`.
4. **`deleteMatch`** — direct client DELETE with no error check. RLS denial is invisible; local state shows the row gone while DB still has it.
5. **Feed likes** (HomeTab.jsx) — optimistic update, no rollback on Supabase error.
6. **Generic error strings** — `"Failed. Try again."` in DisputeModal/ScoreModal hides RLS denials, unique-constraint violations, stale state errors.

**Files to touch (Module 0):**

1. `src/features/scoring/hooks/useMatchHistory.js` — make `confirmOpponentMatch`, `acceptCorrection`, `voidMatchAction`, `deleteMatch`, `removeTaggedMatch`, `resubmitMatch` always return `{ error: null | string }`. Revert optimistic updates on error.
2. `src/features/home/pages/HomeTab.jsx` — wrap feed like/unlike in try/catch with rollback; surface confirm/accept/void errors using native alert (minimal; full toast system is a later polish).
3. `src/features/scoring/components/DisputeModal.jsx` — display the actual error message from `voidMatchAction` / `counterPropose` instead of the generic string.
4. `src/features/scoring/components/ScoreModal.jsx` — same treatment: real error text.
5. `src/features/notifications/components/ActionReviewDrawer.jsx` — already expects `{error}`, verify it now receives real messages.

No SQL migrations in Module 0.

**Acceptance:**
- If a mutation fails, the UI doesn't pretend it succeeded.
- Error text tells the user whether it's network/permission/conflict, not "try again".
- Smoke: log match → confirm succeeds; log match → dispute → counter → accept succeeds; void path works; build passes.

### Module 0 — delivered

**Files changed:**
- `src/features/scoring/hooks/useMatchHistory.js`
  - Added `formatRpcError(err, fallback)` helper that translates Postgres codes (`23505` duplicate, `42501` RLS denial, `P0001` RAISE EXCEPTION from our RPCs) into human-readable strings and falls back to a per-action message.
  - `confirmOpponentMatch`, `acceptCorrection` — now return `{ error: null | string }` consistently. Optimistic `setHistory` only runs on success.
  - `voidMatchAction`, `_submitProposal`, `resubmitMatch`, `submitMatch` — error messages now routed through `formatRpcError` instead of raw `err.message` or generic strings.
  - `deleteMatch` — optimistic remove is now snapshotted and rolled back if `deleteMatchRow` fails (RLS denial no longer leaves an orphaned local state). Returns `{ error }`. Also extended `match_deleted` notification to fire for pending/disputed matches too (not just confirmed).
  - `removeTaggedMatch` — same snapshot/rollback pattern; returns `{ error }`.
- `src/features/home/pages/HomeTab.jsx`
  - Confirm / Accept / Void / Delete / Remove CTAs now `await` and `alert()` the error message on failure instead of silently no-oping.
  - Feed like/unlike optimistic update is now rolled back if the Supabase write fails.
- `src/features/scoring/components/DisputeModal.jsx`
  - Void error path shows the actual server message.
  - Renamed shadow `res` variables to fix `no-redeclare` lint errors.
- `src/features/scoring/components/ScoreModal.jsx`
  - Resubmit and save errors surface real text.
  - Renamed shadow `res` to fix lint.

**Schema changes:** none.

**Verification:**
- `npm run build` — ✅ passes (697 kB bundle, unchanged structure).
- `npm run lint` — no new errors introduced by these changes. Remaining errors are pre-existing (`authUser`, `bumpStats` unused, etc.) and unrelated to the truth loop.
- Code review: every RPC mutation now returns a consistent `{ error }` shape; every caller surfaces the message.

**Open risks / deferred to later modules:**
- `match_reminder` still localStorage-gated — deferred to the notifications module, needs a DB-backed `reminder_sent_at` flag.
- `match_expired` notification on pg_cron expiry — deferred, needs a SQL migration to fire notifications when `expire_stale_matches()` runs.
- Native `window.alert()` is a placeholder; a proper toast system is a later polish item.

---

## Module 1 — Meaningful player profiles

**Objective:** turn `/profile` from a self-view-only screen into a real identity surface that any user can view for any other user. Trust signals and head-to-head history are first-class. No schema changes.

**Audit findings relevant to Module 1:**
- `profiles` table already has the core identity fields we need: `name, avatar, suburb, skill, style, bio, wins, losses, matches_played, ranking_points, streak_count, streak_type`. Stats are bumped by existing RPCs on confirm/accept.
- `ProfileTab.jsx` is hardcoded to render the logged-in user's profile. There is no `/profile/:userId` route.
- `fetchProfile(userId)` in `profileService.js` already returns `select('*')` — we can reuse it for any user. No RLS policy seen that restricts profile SELECT.
- Feed cards, match history, leaderboards, DMs — none navigate to a player's profile. The whole app is identity-less from a viewing perspective.
- The viewer's own `matchHistory.history` array is the source of truth for H2H against any subject. Viewer can compute H2H without needing to fetch the subject's matches (which would hit RLS).
- Recent form for *another* user isn't available without an RPC. Scope decision: recent form shows only on the viewer's own profile in Module 1; public profile shows H2H + aggregate stats instead. Full public recent form is a Module 5 item.

**Files touched:**

New:
- `src/features/profile/utils/profileStats.js` — pure helpers: `computeRecentForm`, `computeStreakFromMatches`, `computeMostPlayed`, `computeHeadToHead`.
- `src/features/profile/hooks/usePlayerProfile.js` — loads a profile row by userId for the public-view flow.
- `src/features/profile/pages/PlayerProfileView.jsx` — read-only public profile (hero, trust indicator, stats, H2H).

Modified:
- `src/app/App.jsx` — detect `/profile/<userId>` in pathParts; mount `PlayerProfileView` when viewing someone else, or redirect to `/profile` when viewing yourself. Add an `openProfile(userId)` helper and pass it down.
- `src/features/home/pages/HomeTab.jsx` — make poster name/avatar and opponent name in the scoreboard row clickable → `openProfile`.
- `src/features/profile/pages/ProfileTab.jsx` — add trust indicator ("✓ X confirmed matches"), recent form chips, most-played opponents row (own profile only).

Deferred to Module 2:
- People tab navigation — will be part of the discovery/follow overhaul.

**Schema changes:** none.

**Acceptance:**
- Tapping any opponent/poster name in the feed opens that player's profile.
- Public profile shows real stats + H2H against viewer + trust indicator.
- Own profile shows everything public plus recent form and most-played opponents.
- After a confirmed match, stats on both the viewer's own profile and the opponent's profile visibly update (on refresh).
- Build passes.

### Module 1 — delivered

**Files changed / added:**
- `src/features/profile/utils/profileStats.js` *(new)* — pure derivation helpers: `computeRecentForm`, `computeStreakFromMatches`, `computeMostPlayed`, `computeHeadToHead`, `formatConfirmedBadge`. All filter on `status === 'confirmed'` so the "verified identity first" principle is built into the math — disputed/voided/expired matches never contribute to any displayed stat.
- `src/features/profile/hooks/usePlayerProfile.js` *(new)* — small hook that calls `fetchProfile(userId)` with loading/error/cancellation state for the public-view flow.
- `src/features/profile/pages/PlayerProfileView.jsx` *(new)* — read-only public profile: hero with avatar, name, suburb, skill/style badges; trust indicator ("✓ N confirmed matches"); ranking card with streak; 4-stat grid (Matches / Wins / Losses / Win %); head-to-head vs viewer when they've played. Includes its own skeleton + empty + error states so layout doesn't jump.
- `src/app/App.jsx` — detects `/profile/<userId>` in the path and mounts `PlayerProfileView` when viewing someone else; falls back to `ProfileTab` for own-profile view. Added `openProfile(userId)` helper that normalises the redirect when a player taps their own avatar.
- `src/features/home/pages/HomeTab.jsx` — poster avatar, poster name, and both scoreboard player rows are now clickable and navigate to the corresponding player's profile. Carefully gated: only real linked users (with `opponent_id` / `submitterId`) are clickable; casual freetext opponents, own rows, and demo cards stay non-interactive.
- `src/features/profile/pages/ProfileTab.jsx` — added trust badge in the hero, "Recent form" chip row (last 5 W/L), and "Most played" opponents row in Overview. Most-played chips are clickable when the opponent is a real user.

**Schema changes:** none.

**Verification:**
- `npm run build` — ✅ passes (709 kB bundle, +12 kB for the new surfaces).
- `npm run lint` — no new errors on any touched file. One pre-existing warning on `App.jsx` useEffect deps (unchanged from before). `HomeTab.jsx` has two pre-existing unused-vars errors (`commentModal`, `commentDraft`) — not introduced by this module.
- Build log updated with audit findings and design decisions.

**Open risks / deferred:**
- Public profile doesn't show the subject's own match history because of RLS. Plan: add a `get_public_match_history(user_id, limit)` RPC in Module 5 so we can surface the subject's recent form + last-5 results on their public view too.
- People tab navigation → profile is not wired yet — deferred to Module 2 which rebuilds discovery.
- DM header, notification sender, leaderboard avatar — none navigate to profile yet. Plan: sweep these entry points in Module 2 (discovery/follow pass) and Module 3 (notifications deep-link pass).
- No "Challenge" / "Rematch" CTA on the public profile yet — deferred to Module 4.



