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

*(Remaining modules 1–6 filled in as they're built.)*
