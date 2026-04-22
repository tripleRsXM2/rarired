# Trust and Ranking Rules

## Purpose
Source of truth for what "counts" on CourtSync. A match's validity, its effect on a player's stats, the dispute process, and the anti-abuse guardrails all live here. If any code changes match state, stat behaviour, or the ELO formula, this doc must be updated in the same module.

## Current Product Rule

### What counts as a match
A match is a row in the `match_history` table with at least:
- a `submitter` (the user who logged it),
- at least one set score,
- a `status` (see state machine below),
- either a `tourn_name` ("Ranked", "Casual Match", or a specific tournament), or a `tournament_id`.

Two flavours:

| Flavour | Condition | Status on log | Affects stats? |
|---|---|---|---|
| **Ranked casual** | Opponent is a real linked user (`opponent_id` set) | `pending_confirmation` | Only after opponent **confirms** |
| **Casual** | Freetext opponent name only (no `opponent_id`) | `confirmed` immediately | **Never** — stat columns stay untouched |
| **Tournament match** | `tournament_id` set | Follows the tournament's own flow | Via existing tournament code path, not the casual/ranked split |

The word "Casual" in the UI means "no stat impact, no confirmation loop". "Ranked" means "linked opponent, confirmation required, stats update on accept."

### State machine (ranked matches only)

```
pending_confirmation
  ├─ opponent confirms        → confirmed                (stats update)
  ├─ opponent disputes        → disputed                 (pending_action_by = submitter)
  └─ 72h elapses (pg_cron)    → expired                  (no stats, notifications sent)

disputed
  ├─ submitter counter-props  → pending_reconfirmation   (pending_action_by = opponent)
  ├─ submitter accepts        → confirmed                (stats update)
  ├─ either party voids       → voided                   (reason: not_my_match | mutual_void)
  └─ 48h elapses (pg_cron)    → voided                   (reason: timeout)

pending_reconfirmation
  ├─ opponent counter-props   → disputed                 (pending_action_by = submitter)
  ├─ opponent accepts         → confirmed                (stats update)
  ├─ either party voids       → voided                   (reason: not_my_match | mutual_void)
  ├─ revision_count ≥ 3       → voided                   (reason: max_revisions, auto on next counter)
  └─ 48h elapses (pg_cron)    → voided                   (reason: timeout)

confirmed → terminal        (delete only; no reopen)
voided    → terminal
expired   → terminal        (unverified, no stats)
```

### Which states affect ranking and stats

| State | Affects stats? | Affects win/loss counters? | Shown on profile as "confirmed"? |
|---|---|---|---|
| `pending_confirmation` | No | No | No |
| `disputed` | No (frozen while disputed) | No | No |
| `pending_reconfirmation` | No (frozen) | No | No |
| `confirmed` | **Yes** | **Yes** | **Yes** (counts toward trust badge) |
| `voided` | No | No | No |
| `expired` | No | No | No |

### Current ranking formula — ELO (Module 5)

Real ELO. Standard formula, single source of truth (`apply_match_outcome(p_match_id text)` SECURITY DEFINER RPC). Both `bump_stats_for_match(uuid)` and `confirm_match_and_update_stats(text)` delegate to it.

```
expected_A   = 1 / (1 + 10^((rating_B - rating_A) / 400))
score_A      = 1 if A won else 0
new_rating_A = max(0, rating_A + K_A * (score_A - expected_A))   (rounded int)
```

Where:
- `K_A = 32` if A's `matches_played < 20` (provisional)
- `K_A = 16` once A has 20+ confirmed matches (settled)

Each player has their own K-factor. A settled veteran vs a brand-new player both move at their own appropriate pace — the new player's rating shifts more, the veteran's less.

**Initial rating** is 1000 (set at signup via `defaultProfile`).

**Casual matches** (no `opponent_id`) are no-ops in `apply_match_outcome` — no rating change ever. Only ranked matches (linked opponent + confirmed) move the number.

**Concurrency**: the RPC takes `FOR UPDATE` on both profile rows in id-order before reading the current ratings. Two concurrent confirmations involving the same player can't race; deadlocks between two matches involving the same pair are avoided.

### Provisional rating period

A profile is *provisional* while `matches_played < 20`. Surfaced in the UI as an orange "⚖ Provisional · N matches to settle" pill on both own and public profiles. After 20 confirmed matches the pill disappears and the K-factor drops from 32 → 16. Constants in `src/features/profile/utils/profileStats.js` (`PROVISIONAL_THRESHOLD`).

### Confirmation rate (trust signal)

Shown on own profile only (since a viewer's `match_history` is the only side they can read under RLS). Computed by `computeConfirmationRate(history)` in `profileStats.js`:
- numerator: confirmed ranked matches submitted by user
- denominator: confirmed + voided + expired ranked matches submitted by user
- displayed only when denominator ≥ 3 (avoids noisy single-digit %s)

A 100% confirmation rate is a strong "this player logs real matches that opponents agree with" signal. A low rate signals disputes / no-shows / fake submissions.

### Dispute windows

- **72 hours** — pending → expired if the opponent never confirms.
- **48 hours** — disputed / pending_reconfirmation → voided (timeout) if nobody responds.
- Both are enforced by the `expire_stale_matches()` RPC running every 15 min under `pg_cron`. The RPC is `SECURITY DEFINER` and **not callable from the client** — EXECUTE was REVOKEd from `anon` and `authenticated` in migration `20260425_restrict_expire_stale_matches.sql` to close a global-mutation-via-anon-key hole. Only the `postgres` role (cron owner) and `service_role` retain EXECUTE.
- Clients still get near-realtime accuracy via two *user-scoped* helpers invoked on history load — `expireStalePendingMatches(userId)` and `expireDisputedMatches(userId)` — which UPDATE only rows where the viewer is a participant (enforced by both an explicit `.or(user_id|opponent_id = me)` filter and the RLS UPDATE policy on `match_history`).

### Maximum revisions

A single match may go through **3 correction rounds** before it is auto-voided with `voided_reason = 'max_revisions'`. Round counter lives in `match_history.revision_count`.

### Void reasons

| Reason | Triggered by |
|---|---|
| `not_my_match` | Either party declares "I didn't play this" |
| `mutual_void` | Either party hits the Void button during a dispute |
| `max_revisions` | Auto on the 4th counter-proposal |
| `timeout` | pg_cron after 48h of no response |

### Trust signal shown to others

A player's **"N confirmed matches"** badge (green tick, shown on own and public profile) is derived from `profiles.matches_played`, which is **only** bumped by the confirm RPCs. It is the public signal that this account plays real matches with real people.

## Design / Decision Principles

1. **Only confirmed matches count.** No exceptions. A disputed or voided match never affects ranking, even temporarily. This is the keystone trust promise.

2. **Both parties must agree to change the record.** The `propose_match_correction` RPC is SECURITY DEFINER so the write bypasses RLS and happens atomically alongside the `match_revisions` audit row — no client can fake a state transition.

3. **RPCs own the state machine.** The client never writes `status`, `result`, `sets`, or `current_proposal` directly. State-transition RPCs (`confirm_match_and_update_stats`, `accept_correction_and_update_stats`, `void_match`, `propose_match_correction`) are SECURITY DEFINER but scoped to a single match the caller participates in, so the `authenticated` role keeps EXECUTE. The *global* sweep RPC (`expire_stale_matches`) is cron/service-role only — see the Dispute Windows section — and clients expire their own rows via the user-scoped helpers.

4. **Time-bounded disputes.** 72h to confirm is long enough that you don't annoy casual opponents but short enough that stale matches don't pollute the feed forever. 48h for dispute rounds keeps fights from dragging.

5. **Three rounds is enough.** Real disagreement rarely takes more than 3 back-and-forths. Beyond that, the match is more likely to be faked than actually contested → auto-void preserves trust.

6. **Stats are bumped, not recomputed.** The `bump_stats_for_match` RPC increments `wins` / `losses` / `matches_played` / `ranking_points` in place. Total recomputation from scratch is not supported; if counters drift, we fix server-side.

## Anti-abuse assumptions (current)

- **Symmetric match hash.** A `match_hash` (sorted user ids + date + score) prevents both sides accidentally logging the same match twice. The `23505` unique-violation surfaces to the user as "This match is already logged."
- **RLS on profiles SELECT.** Default open (any signed-in user can read any profile row). If that changes, the trust badge surfacing breaks — flag it before tightening.
- **Fire-and-forget notifications.** Notification inserts don't retry on failure. Accepted cost.
- **pg_cron runs every 15 min.** Between runs, expired/voided transitions happen late. Acceptable slack.

## Open Questions

- **K-factor tuning.** 32→16 at 20 matches is a sensible starting point but probably needs a third tier (8) for tournament-grade settled players (200+ matches?). Wait for data.
- **Provisional length.** 20 matches is currently hardcoded. Plausible range 15–30. Tune based on how long it takes ratings to converge for real users.
- **Off-peer voiding.** Should an admin be able to manually void a match flagged by a third party (e.g., both players colluding on a fake result)? Not yet.
- **Match-not-played window.** If a match is logged but never played IRL, the current `not_my_match` void covers it. Do we need an explicit "I played this but the score is very wrong" path beyond the existing dispute/correction flow? Probably not.
- **Stats backfill on account link.** If a freetext opponent signs up later, do we retroactively link prior casual matches to their account? **No**, for now — keeps the casual/ranked distinction clean. Open if it becomes a user complaint.
- **Doubles.** Current model is singles only. Out of scope.
- **Stat corrections after confirmed.** Once a match is confirmed, correcting it retroactively is not supported — only **deletion** is. Is that OK? Yes for now.

## Out of Scope (for now)

- Real opponent-strength-weighted ELO (Module 5 target).
- Provisional / settled rating badges on profiles.
- Admin override for voiding matches.
- Retroactive linking of casual matches to new sign-ups.
- Doubles match schema.
- External rating imports (UTR, USTA, NTRP).
- Post-confirmation stat corrections.
- Match expiry time tuning per-user / per-suburb.

## League standings (Module 7)

Leagues are a **read-side lens** on the existing match truth system. A league adds a private, scoped leaderboard for a group of friends without changing anything about how global matches are verified, confirmed, disputed, or ranked via ELO.

**Key rules for league standings:**
- Only matches with `match_history.status = 'confirmed'` count toward a league's standings. Pending, disputed, pending_reconfirmation, voided, and expired matches are never summed.
- The existing confirmation / dispute / void / expiry RPCs are **unchanged**. An AFTER trigger on `match_history` invokes the `recalculate_league_standings` function whenever a league-tagged row changes state.
- Standings are persisted in `league_standings` for fast reads but are a pure function of current `match_history` rows. Full idempotent recomputation means drift is self-healing.
- League participation does **not** affect global ELO or `profiles.ranking_points`. Global rating is computed from every confirmed match regardless of league tagging; leagues are scoped stats that live alongside, not inside, the global system.
- `match_history.league_id` is immutable post-insert. A match's league membership cannot be rewritten after the fact.
- Both participants must be active league members for a match to be accepted with a league tag. Enforced at the DB layer via the `validate_match_league` BEFORE trigger.

**What this means for the confirmation flow:** nothing. A league match goes through the exact same `pending_confirmation → confirmed | disputed → ...` state machine as every other match. Standings just observe the outcome.

See `docs/leagues-and-seasons.md` for the full spec.

## Last Updated By Module
- v0 — initialised from shipped state at end of Module 3.
- v1 — Module 4 (challenges) noted as the conversion path from intent → ranked match log; no trust math change.
- v2 — Module 5 (real ELO). Linear placeholder replaced by ELO with provisional period. Single-source-of-truth `apply_match_outcome` RPC. Provisional + confirmation-rate trust pills surfaced on profile UI.
- v3 — Scoreboard + ScoreModal sanity: feed card winner-arrow + row-bold are now derived from **set scores**, not the stored `result` field. If the sets unambiguously pick a winner we trust that. This self-heals the classic "user tapped Loss but entered winning sets" data-entry bug without touching the stored row. Stored `result` still drives the outer resultColor border + share text. ScoreModal now warns once at save time when the selected Win/Loss disagrees with the set math, but does not block (retirement / incomplete matches are valid).
- v4 — Module 7 (leagues V1 schema). Added `match_history.league_id` nullable column + persisted `league_standings` as read-side lens. No change to match truth flow, global ELO, confirmation, dispute, or void rules.
