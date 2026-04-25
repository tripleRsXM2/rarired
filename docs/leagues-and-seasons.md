# Leagues & Seasons

## Purpose

A **league** is a lightweight private season container for a small group of friends to compete against each other. Leagues exist to increase retention: they give users a recurring reason to log matches, check standings, and return to the app.

Leagues are a first-class CourtSync surface, but they are **additive** — they do not change the app's primary promise (verified social tennis identity). Global ELO, ranking points, confirmations and disputes all behave exactly the same whether a match is league-tagged or not. A league is a scoped view on top of the existing match truth system, not a replacement for it.

## Current Product Rule (V1)

### What a league is
- A named group of friends (members) playing matches against each other over an explicit or implicit period
- Invite-only. Private by default. Public / discoverable leagues are deferred to a later version
- One league = one season in V1. "Create next season from this league" is out of scope
- Created by any signed-in user, who becomes the `owner`
- Has a **mode** — `'ranked'` or `'casual'` — locked at creation. Determines which `match_type` can be tagged into the league (see "League mode" below)

### League mode (Module 7.5)

A league's `mode` column is a hard partition between two flavours:

| Mode | Accepts match_type | Affects global Elo? | Has per-league standings? |
|---|---|---|---|
| `ranked` | only `'ranked'` matches | ✅ yes (via the global `apply_match_outcome` RPC, same as any ranked match) | ✅ yes |
| `casual` | only `'casual'` matches | ❌ no (casual matches short-circuit `apply_match_outcome`) | ✅ yes |

**Why per-league standings exist for casual leagues:** the league's own scoreboard (win_points / set_diff / game_diff) is a separate, scoped computation from global Elo. A casual league still has internal stakes — bragging rights inside the friend group — without touching anyone's global rating. Casual = "this counts within this league, not anywhere else."

**Why a league can't accept both modes:** a league's leaderboard would be incoherent if some matches counted toward Elo and others didn't. The `validate_match_league` BEFORE-INSERT trigger rejects any match whose `match_type` doesn't equal the league's `mode`. UI filters the league selector by the same rule (defence in depth).

**Mode is locked at creation.** Allowing it to flip post-hoc would change the meaning of every match already tagged with that league. If a user wants the other mode, they create a new league.

### How league mode appears in the log-match flow (Module 7.5)

Inside ScoreModal:

1. **Opponent linkage**: linked friend → match-type toggle visible (Ranked / Casual, default Ranked). Freetext (non-friend) opponent → no toggle, match is implicitly casual, no league selector.
2. **Match type chosen**: the league selector populates from a 4-condition filter:
   - `league.status === 'active'`
   - viewer is an `active` member of the league (lg.my_status)
   - opponent is an `active` member of the league (looked up via `fetchOpponentActiveLeagueIds` against `league_members`)
   - `league.mode === effectiveMatchType`
3. **No eligible league**: the selector is hidden entirely (no empty dropdown clutter).
4. **User flips Ranked ↔ Casual**: any previously selected `leagueId` is cleared on the next render if it's no longer eligible (e.g. picked a Ranked league, then switched to Casual — the league disappears from the dropdown and the pick is silently dropped).

This is enforced server-side too: the `validate_match_league` trigger rejects any insert where `match_type !== league.mode`.

### What a season is (V1)
- The lifetime of a single league, from creation to archive
- A league has three states:
  - `active` — matches can be logged; standings update continuously
  - `completed` — owner marks the season as concluded; no new matches accepted but standings remain visible
  - `archived` — historical record; read-only

### What counts toward standings
A match contributes to a league's standings **only if**:
- `match_history.league_id` equals the target league's id
- `match_history.status` is exactly `'confirmed'`
- Both participants (`user_id` and `opponent_id`) are currently `active` members of the league

### What does not count
- `pending_confirmation` — submitter is still waiting on the opponent. Not a finalized match
- `disputed` — correction in flight. Not a finalized match
- `pending_reconfirmation` — counter-proposal in flight. Not a finalized match
- `voided` — reversed by mutual action or system timeout. Explicitly excluded
- `expired` — 72h confirmation window elapsed without response. Explicitly excluded
- Matches where either participant is no longer an `active` member (e.g. removed, declined, invited but not accepted) — excluded from the current standings view. The match rows themselves are preserved; they just stop being summed.

### How standings are calculated
Persisted in `league_standings` as one row per `(league_id, user_id)`. Recomputed by `recalculate_league_standings(league_id)`, which runs:
- On every `INSERT`, `UPDATE`, or `DELETE` on `match_history` where the row has (or had) a `league_id` — via the `trg_match_history_recalc_league_standings` AFTER trigger
- On member acceptance (so their zeroed row appears) and member removal (so they drop out of the active set)
- On explicit admin / server call (RPC `EXECUTE` is revoked from clients — server only)

Recalculation is **full and idempotent**. V1 prefers clarity over incremental mutation.

Per-match contributions:
- `played` += 1
- `wins` / `losses` += 1 on winner / loser
- `points` += league's `win_points` / `loss_points` (default 3 / 0)
- `sets_won` / `sets_lost` from counting sets in each player's frame
- `games_won` / `games_lost` from summing game scores per set
- `set_difference` = `sets_won − sets_lost`
- `game_difference` = `games_won − games_lost`
- `last_result` = the most recent confirmed match's result for that player

### Tiebreak order (actually implemented in V1)
1. `points` (desc)
2. `set_difference` (desc)
3. `game_difference` (desc)
4. stable fallback by `user_id` (asc)

> **Deferred to V1.1**: head-to-head among tied players. Correct head-to-head tiebreak requires a recursive pass (if A beats B but B beats C and A beats C, then in a tie between all three, A wins by H2H; but if only A and B are tied, C's results don't matter). SQL-level recursive resolution is fragile and was deferred from slice 1. The `leagues.tie_break_order` jsonb column stores the **intended** final order (`["points","head_to_head","set_difference","game_difference"]`) so the V1.1 implementation has a pre-declared contract.

### League rules configured per-league
- `mode`: `'ranked'` | `'casual'` (locked at creation; controls accepted `match_type`)
- `match_format`: `one_set` | `best_of_3`
- `tiebreak_format`: `standard` | `super_tiebreak_final`
- `max_matches_per_opponent`: `null` (unlimited), `1`, `2`, or any positive integer
- `win_points` / `loss_points` / `draw_points`: integer, default 3 / 0 / 0
- `start_date` / `end_date`: optional date hints
- `max_members`: optional integer cap

### Membership lifecycle
- `invited` — owner invited this user via `invite_to_league` RPC. A `league_invite` notification is sent.
- `active` — user accepted via `respond_to_league_invite(true)`. A `league_joined` notification is fired to existing active members. User can now log league matches.
- `declined` — user declined via `respond_to_league_invite(false)`.
- `removed` — owner removed this user via `remove_league_member`. Historical confirmed matches the user played are **preserved in `match_history`** but **drop out of the current standings view** because the recalc filters to currently-`active` members only. This is a deliberate choice: the league's historical audit trail stays intact, but the current scoreboard reflects the current active roster.

### Integrity (enforced in the database)
- `match_history.league_id` is immutable post-insert. The `validate_match_league` BEFORE trigger rejects any `UPDATE` that tries to change it.
- A match with `league_id` set is rejected unless:
  - The league exists and is `active`
  - Both submitter and opponent are `active` members
  - The `max_matches_per_opponent` cap is not exceeded (counts all non-voided matches between the pair, both directions)
- A match with `match_type='ranked'` and confirmed/pending status is also subject to the `validate_match_score` BEFORE-INSERT trigger, which rejects invalid set patterns and incomplete matches per the league's `match_format` + `tiebreak_format`. See [Score validity in `trust-and-ranking-rules.md`](./trust-and-ranking-rules.md#score-validity-module-76-2026-04-25) for the full rule set.
- Direct writes to `league_members` and `league_standings` are denied by RLS. All member mutations go through `invite_to_league` / `respond_to_league_invite` / `remove_league_member`. Standings are written only by the `recalculate_league_standings` SECURITY DEFINER function.

### Confirmation / dispute / void / expiry flow is unchanged
A match with `league_id` still goes through the exact same truth flow as any other match:
- Logged by one player → `pending_confirmation` with 72h expiry
- Opponent confirms → `confirmed` (stats applied)
- Opponent disputes → `disputed` with counter-proposal flow, up to 3 rounds
- Expiry / void → match transitions to `expired` / `voided`

None of these RPCs were modified. The league standings simply observe the outcome via the AFTER trigger and recompute automatically. This is the key property of V1: **one source of truth (`match_history`), one truth flow, one ranking system. Leagues are a read-side lens.**

## Design / Decision Principles

1. **No parallel match system.** A league match is a normal match with a `league_id` tag. Zero duplication of confirmation/dispute/ELO logic.
2. **Single source of truth.** Standings are persisted for performance but are a pure function of `match_history` rows. Full idempotent recomputation means drift is self-healing.
3. **Server-owned standings.** Clients cannot write to `league_standings` directly. All writes route through the recalculation function, which the AFTER trigger invokes.
4. **Defense in depth at the DB layer.** Membership and cap rules are enforced by a BEFORE trigger, not just in app code. Even a future admin tool that bypasses the UI can't create an invalid league match.
5. **V1.1-ready but not V1.1-greedy.** `tie_break_order`, `role` enum, `max_members`, `draw_points`, `completed_at` all exist so future versions don't need migrations; but the V1 code only uses the subset it can validate.
6. **Lean invite model.** `league_members` is the existing `friend_requests`-style invite pattern generalized to (league, user). No new primitives.

## Open Questions

1. **Head-to-head tiebreak** — planned for V1.1. Implementation options: (a) recursive SQL CTE; (b) compute in the `recalculate_league_standings` function using a post-pass over tied groups. (b) is simpler and correct. Will revisit when we have UI that exposes standings and players start asking why they're ranked below someone with the same record.
2. **Season lifecycle automation** — should `status` auto-flip from `active` → `completed` when `end_date` passes? Currently manual via `archive_league` (which goes straight to `archived`). Consider a `complete_league` RPC + cron.
3. **"Season ending soon" notification** — not implemented in V1. Would require a cron job that scans leagues where `end_date` is within N days and fans out notifications. Defer until we have UI signal that users are engaging with standings.
4. **Standings-changed notification** — if the user's rank dropped today, should we notify? Probably not as a push (risk of spam), but a passive badge on the People → Leagues tab would work. Defer to a retention-tuning pass.
5. **Cross-league match** — should one match count for two leagues (e.g. both a "Friends" league and a "Work" league)? V1 says no (single `league_id`). If this becomes a user request, we'd need a `match_leagues` join table and would have to rethink the `max_matches_per_opponent` semantics.
6. **Removed-member handling** — V1 keeps their historical matches in `match_history` but drops them from the current standings view. This could feel unfair to others ("I beat Alice 3 times and now it doesn't show"). Alternative: preserve removed-member rows in standings, flagged as "former member". Deferred; revisit after UI lands.
7. **Public leagues** — `visibility` enum is locked to `'private'` in V1 via a CHECK. Easy to extend by altering the check and adding a discovery policy. Not a V1 concern.

## Out of Scope (V1)

- Public or discoverable leagues
- Tournament-style brackets within a league
- Scheduled / timetabled matchups
- Automatic round-robin fixture generation
- Chat / group DMs inside leagues (general DMs are enough; leagues are not a messaging surface)
- Entry fees, prize pools, any payments
- Multi-season carryover ("create next season inheriting members")
- Per-user admin roles beyond owner (the `role` enum has `admin` but it's currently unused; only `owner` has privileges)

## Data model (V1)

### `leagues`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `name` | `text` | required, non-empty |
| `description` | `text` | optional |
| `created_by` | `uuid` | FK profiles, ON DELETE CASCADE |
| `visibility` | `text` | check: `'private'` only in V1 |
| `status` | `text` | check: `active` \| `completed` \| `archived` |
| `mode` | `text` | check: `'ranked'` \| `'casual'`; default `'ranked'`; locked at creation |
| `start_date` / `end_date` | `date` | optional; end >= start |
| `max_members` | `integer` | optional, >= 2 |
| `match_format` | `text` | `one_set` \| `best_of_3` |
| `tiebreak_format` | `text` | `standard` \| `super_tiebreak_final` |
| `max_matches_per_opponent` | `integer` | null = unlimited |
| `win_points` / `loss_points` / `draw_points` | `integer` | default 3 / 0 / 0 |
| `tie_break_order` | `jsonb` | V1.1 contract; unused in V1 recalc |
| `created_at` / `updated_at` / `completed_at` | `timestamptz` | |

### `league_members`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `league_id` | `uuid` | FK leagues, ON DELETE CASCADE |
| `user_id` | `uuid` | FK profiles, ON DELETE CASCADE |
| `role` | `text` | `owner` \| `admin` \| `member` (only `owner` is privileged in V1) |
| `status` | `text` | `invited` \| `active` \| `declined` \| `removed` |
| `invited_by` | `uuid` | FK profiles |
| `joined_at` | `timestamptz` | set when status → `active` |
| `created_at` | `timestamptz` | |
| UNIQUE `(league_id, user_id)` | | |

### `league_standings`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `league_id` / `user_id` | `uuid` | FK; UNIQUE together |
| `played` / `wins` / `losses` | `integer` | non-negative |
| `points` | `integer` | |
| `sets_won` / `sets_lost` / `games_won` / `games_lost` | `integer` | non-negative |
| `set_difference` / `game_difference` | `integer` | derived but persisted |
| `last_result` | `text` | `win` \| `loss` \| `draw` (V1 never uses `draw`) |
| `rank` | `integer` | 1-based |
| `updated_at` | `timestamptz` | |

### `match_history` (addition)
- `league_id uuid REFERENCES leagues(id) ON DELETE SET NULL` — nullable; set only for league matches. Immutable after INSERT.

## Last Updated By Module

- Module 7 — Leagues V1 (schema foundation, 2026-04-26).
- Module 7.5 — League mode (2026-04-25). New `leagues.mode` column (`'ranked'` | `'casual'`, locked at creation). `validate_match_league` trigger now compares `match_type` against `league.mode` per league instead of hardcoding `'ranked'`. CreateLeagueModal exposes the choice; ScoreModal filters its league selector by mode + viewer membership + opponent membership. Casual leagues have their own per-league standings (computed by the existing `recalculate_league_standings` function — unchanged) but never affect global Elo (the `match_type='casual'` short-circuit in `apply_match_outcome` still applies).
- Module 7.6 — Score validity (2026-04-25). League's `match_format` and `tiebreak_format` columns are now read by the new `validate_match_score` trigger to enforce real tennis rules at insert time on ranked confirmed/pending matches. No new columns; no change to standings math. See `trust-and-ranking-rules.md` v7.
