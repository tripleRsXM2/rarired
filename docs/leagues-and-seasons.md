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

### What a season is (V1, Module 12 lifecycle model)

A league's lifetime moves through one of five statuses. The state machine
is owned server-side by SECURITY DEFINER lifecycle RPCs in
`supabase/migrations/20260427_league_lifecycle_v1.sql` and
`20260427_league_lifecycle_v2_notifications.sql`. The owner is the only
caller permitted to drive a transition.

| Status | Meaning | Allowed source(s) | Standings | Final flag | Visible in normal lists |
|---|---|---|---|---|---|
| `active`    | Currently running — matches can be logged, standings recompute on every confirmed match. | (creation) | live | false | yes (Active section) |
| `completed` | Owner marked the season finished. Standings frozen as the **FINAL** table. | active | locked | **true** | yes (Past section) |
| `archived`  | Historical record — kept for browsing but the league has run its course. Standings frozen but **not** marked final. | active or completed | locked | false (or pre-existing) | yes (Past section) |
| `cancelled` | Stopped before completion. Standings frozen but explicitly not final. | active | locked | false | yes (Past section) |
| `voided`    | Wrong setup / test data / integrity issue. Hidden from normal surfaces; match history stays in personal feeds. | active (V1 owner rule) | locked | false | **no** (app-level filter; admin/audit only) |

Lifecycle metadata on `leagues`:
- `status` — current state (CHECK: one of the five values)
- `status_reason` — short enum tag (CHECK-constrained: `season_finished`, `inactive`, `cancelled_by_creator`, `created_by_mistake`, `wrong_rules`, `wrong_players`, `integrity_issue`, `test_league`, `other`)
- `status_note` — optional free-text the owner can leave for members
- `status_changed_at` — timestamp of the most recent transition (NOT `completed_at`; see below)
- `status_changed_by` — uuid of the actor (always the owner in V1)
- `completed_at` — strictly the moment the league was marked **completed**. Archive / cancel / void do not touch this field. Legacy archived rows had their old `completed_at` migrated to `status_changed_at` and `completed_at` cleared.

Standings freeze on `league_standings`:
- `standings_locked_at` — set on every transition out of `active`. The `recalculate_league_standings_inner` function early-returns when this is set on any standings row in the league, so a late trigger fire after a transition can't repopulate frozen standings.
- `is_final` + `finalized_at` — set **only** by `complete_league`. UI uses these to label "Final standings" vs "Frozen at archive".

Audit trail:
- `league_status_events` — one row per transition (`from_status`, `to_status`, `reason`, `note`, `changed_by`, `created_at`). RLS: members + creator can SELECT; INSERT/UPDATE/DELETE are blocked at the policy layer (SECURITY DEFINER RPCs are the only writers).

### Lifecycle RPCs
All four are `SECURITY DEFINER`, owner-only. Each accepts an optional `reason` (validated by the `leagues_status_reason_check` constraint) and an optional free-text `note`. Side effects:
- locks standings (stamps `standings_locked_at`),
- writes a `league_status_events` row,
- emits to `audit_log` (best-effort),
- fans an in-app notification (`league_completed` / `league_archived` / `league_cancelled` / `league_voided`) out to every active member except the actor (see `_emit_league_lifecycle_notifs`),
- resolves any pending `league_invite` notifications for the league (the league is no longer joinable).

| RPC | Allowed source | Sets `completed_at`? | Sets `is_final`? | Owner-V1 |
|---|---|---|---|---|
| `complete_league(uuid, reason, note)` | `active` | yes | yes | always |
| `archive_league(uuid, reason, note)`  | `active` or `completed` | no (preserves existing) | no | always |
| `cancel_league(uuid, reason, note)`   | `active` | no | no | always |
| `void_league(uuid, reason, note)`     | `active` only (V1) | no | no | always — voiding non-active leagues is admin-only, deferred |

### UI surfaces (Slice 2)
- The leagues panel splits into **Active** (active + pending invites) and **Past** (completed / archived / cancelled). Voided leagues are filtered out at the `useLeagues` hook so every consumer sees the same view.
- The detail view header shows a status pill with a per-state colour and label (`active`, `completed`, etc.). When `status_note` is set on a non-active league, a small "Owner note" panel surfaces it.
- Owners get a 3-dot menu next to the status pill (`LeagueLifecycleMenu`). Each item opens a confirm modal (`LeagueLifecycleModal`) with a reason dropdown + optional note. The DB CHECK constraint enforces the reason enum; the UI mirrors it via `LIFECYCLE_REASONS` in `src/features/leagues/utils/leagueLifecycle.js`.
- Voiding takes the league out of the recipient's normal list immediately (the hook filters it). The `league_voided` notification is the only signal members receive — without it the league would appear to silently vanish.

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
2. **Season lifecycle automation** — manual transitions are now landed (Module 12: `complete_league` / `archive_league` / `cancel_league` / `void_league`). Auto-flip from `active` → `completed` when `end_date` passes is still deferred: would need a pg_cron job that calls `complete_league(league_id, 'season_finished')` on overdue rows. Worth wiring once we have data on whether owners actually mark seasons complete or just let them drift. Re-opening a non-active league (transition back to active, clear `standings_locked_at`) is also out of V1 — a one-way door for now; document this in copy.
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
- Module 7.8 — Set tie-breaks (2026-04-27). League submissions inherit the new rule — a ranked-mode league requires valid inner tie-break details on any 7-6 / 6-7 set; a casual-mode league stays tolerant. League standings math is **unchanged** — tie-break points don't add to `games_won` / `games_lost` / `set_difference`; a 7-6 (7-4) set counts the same as any other 7-6 toward the per-league scoreboard. See `trust-and-ranking-rules.md` v8.2.
- Module 7.7 — CourtSync Rating foundation + match-format weight (2026-04-27). Ranked-mode leagues are unaffected at the league-standings layer (per-league points / set-diff / game-diff math is unchanged). At the **global rating** layer, a one-set ranked league match counts at 0.60× weight, a best-of-3 in 3 sets counts at 1.10×, and a super-tiebreak-final counts at 0.85× — same rule as any other ranked match. Casual-mode leagues remain rating-neutral. See `trust-and-ranking-rules.md` v8 + v8.1.
