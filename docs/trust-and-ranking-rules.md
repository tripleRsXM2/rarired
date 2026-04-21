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

### Current ranking formula (placeholder)

`ranking_points = 1000 + wins*15 − losses*10`

This is a **linear placeholder**, not real ELO. It lives in `useCurrentUser.bumpMatchStats` and runs whenever a confirmed match increments the counters. Real ELO (rating K-factor, opponent strength, provisional periods) is **Module 5**.

### Dispute windows

- **72 hours** — pending → expired if the opponent never confirms.
- **48 hours** — disputed / pending_reconfirmation → voided (timeout) if nobody responds.
- Both are enforced by the `expire_stale_matches()` RPC running every 15 min under `pg_cron`.

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

3. **RPCs own the state machine.** The client never writes `status`, `result`, `sets`, or `current_proposal` directly. Every state transition goes through a named RPC (`confirm_match_and_update_stats`, `accept_correction_and_update_stats`, `void_match`, `propose_match_correction`, `expire_stale_matches`). This keeps the invariants enforceable in one place.

4. **Time-bounded disputes.** 72h to confirm is long enough that you don't annoy casual opponents but short enough that stale matches don't pollute the feed forever. 48h for dispute rounds keeps fights from dragging.

5. **Three rounds is enough.** Real disagreement rarely takes more than 3 back-and-forths. Beyond that, the match is more likely to be faked than actually contested → auto-void preserves trust.

6. **Stats are bumped, not recomputed.** The `bump_stats_for_match` RPC increments `wins` / `losses` / `matches_played` / `ranking_points` in place. Total recomputation from scratch is not supported; if counters drift, we fix server-side.

## Anti-abuse assumptions (current)

- **Symmetric match hash.** A `match_hash` (sorted user ids + date + score) prevents both sides accidentally logging the same match twice. The `23505` unique-violation surfaces to the user as "This match is already logged."
- **RLS on profiles SELECT.** Default open (any signed-in user can read any profile row). If that changes, the trust badge surfacing breaks — flag it before tightening.
- **Fire-and-forget notifications.** Notification inserts don't retry on failure. Accepted cost.
- **pg_cron runs every 15 min.** Between runs, expired/voided transitions happen late. Acceptable slack.

## Open Questions

- **Real ELO.** Module 5 replaces the linear formula. Target shape: 32-point K-factor for first 20 matches (provisional), 16 after; opponent strength factored; no rating movement below 5 games played total. Not final.
- **Provisional rating period.** Should new accounts have a "this rating is still settling" badge for their first N confirmed matches?
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

## Last Updated By Module
- v0 — initialised from shipped state at end of Module 3. Pending updates for Module 5 (real ELO) and Module 4 (challenge/rematch integration with match logging).
