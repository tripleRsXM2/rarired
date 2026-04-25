# Trust and Ranking Rules

## Purpose
Source of truth for what "counts" on CourtSync. A match's validity, its effect on a player's stats, the dispute process, and the anti-abuse guardrails all live here. If any code changes match state, stat behaviour, or the ELO formula, this doc must be updated in the same module.

## Match types — the core rule (2026-04-25)

> **Casual = "this happened". Ranked = "this counts".**

Every match row carries an explicit `match_type` column:

| Type | Affects Elo? | Affects leaderboard? | Affects ranked W/L? | Lives in feed/profile? |
|---|---|---|---|---|
| **`ranked`** | ✅ yes | ✅ yes | ✅ yes | ✅ yes |
| **`casual`** | ❌ no | ❌ no | ❌ no | ✅ yes |

Both types still flow through the full confirmation lifecycle (pending → confirmed / disputed / voided / expired). Both still appear in the feed, the profile, the per-user history, and (for league-tagged ranked matches) the league standings.

The single point of control is the server-side `apply_match_outcome(p_match_id)` SECURITY DEFINER RPC. It checks `match_type` and returns immediately for casual matches — every Elo write goes through this function, so no client path can accidentally bump ranking points on a casual match.

### How match_type is decided
The client sets `match_type` explicitly on insert based on whether the opponent is a linked CourtSync user:

| Submission path | match_type |
|---|---|
| Linked-opponent ranked submission (`opponent_id` set) | `ranked` |
| Tournament flow (always against linked opponent) | `ranked` |
| Freetext-opponent submission (`opponent_id` null) | `casual` |

Defaults are layered — DB column default = `'casual'` so a missing tag from any future client never accidentally affects Elo. Explicit > default > safe.

### Leagues are ranked-only
Any match tagged with a `league_id` must have `match_type = 'ranked'`. Enforced at the DB layer by the `validate_match_league` BEFORE-INSERT trigger. Casual league matches don't make sense — league standings derive from confirmed ranked matches; a casual one would silently fail to count, which is more confusing than rejecting it at insert time.

### Backwards compatibility
The 2026-04-25 migration backfilled every legacy `match_history` row using the previous heuristic (linked-opponent OR a non-casual `tourn_name` → `ranked`). Existing player records (Elo, W/L, matches_played) are unaffected by the migration; we just made the column explicit. Going forward, `tourn_name` is for **display** ("Sunday Crew"), `match_type` is for **policy**.

## Current Product Rule

### What counts as a match
A match is a row in the `match_history` table with at least:
- a `submitter` (the user who logged it),
- at least one set score,
- a `status` (see state machine below),
- a `match_type` (`'ranked'` or `'casual'`),
- either a `tourn_name` (display label) or a `tournament_id`.

Two flavours:

| Flavour | Condition | Status on log | match_type | Affects stats? |
|---|---|---|---|---|
| **Ranked** | Opponent is a real linked user (`opponent_id` set) | `pending_confirmation` | `ranked` | Only after opponent **confirms** |
| **Casual** | Freetext opponent name only (no `opponent_id`) | `confirmed` immediately | `casual` | **Never** — stat columns stay untouched |
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

### CourtSync Rating — formula (Module 7.7)

> **Naming rule** — this is "CourtSync Rating", **not** UTR or any official tennis-federation ranking. The product never claims to be governed by an external rating body.

Standard Elo, single source of truth: `apply_match_outcome(p_match_id text)` SECURITY DEFINER RPC. Both `bump_stats_for_match(uuid)` and `confirm_match_and_update_stats(text)` delegate to it.

```
expected_A   = 1 / (1 + 10^((rating_B - rating_A) / 400))
score_A      = 1 if A won else 0
new_rating_A = max(0, rating_A + K_A * (score_A - expected_A))   (rounded int)
```

Each player applies their **own K** independently — a provisional winner moves more than the established loser they just beat. This is the calibration-without-destabilising-veterans rule.

#### Opponent-strength asymmetry

Because the formula is opponent-strength-weighted (the `(rating_B - rating_A)` term), the same `K` produces asymmetric movement based on who you played:
- **Upset win** (lower beats higher) → larger gain
- **Expected win** (higher beats lower) → smaller gain
- **Unexpected loss** (higher loses to lower) → larger loss
- **Expected loss** (lower loses to higher) → smaller loss

Example at K=24: equal ratings → ±12. 1100 beats 1500 → +21 / -21. 1500 beats 1100 → +3 / -3. The bigger the upset, the bigger the swing.

#### K-factor table (per player, calibration-aware)

| `confirmed_ranked_match_count` | Status | K |
|---|---|---|
| 0–2 | provisional | **40** |
| 3–4 | provisional | **32** |
| 5+ | established | **24** |
| (future tier, not in V1) | highly established | 16 |

#### Initial rating bands (per skill level)

| Self-assessed skill | Starting rating | Band (when displayed level is derived from rating) |
|---|---|---|
| Beginner 1     | **800**  | < 900 |
| Beginner 2     | **1000** | 900–1099 |
| Intermediate 1 | **1200** | 1100–1299 |
| Intermediate 2 | **1400** | 1300–1499 |
| Advanced 1     | **1600** | 1500–1699 |
| Advanced 2     | **1800** | 1700+ |

A user picks one of these levels during onboarding. The `initialize_rating(p_skill text)` SECURITY DEFINER RPC validates the choice and writes `starting_skill_level` + `initial_rating` + `ranking_points` + `skill` in one go. Errors with "already initialized" if called twice.

#### Match-format weight (Module 7.7 supplement)

Not every ranked match changes the rating equally. After expected-score and per-player K, a **format weight** is applied:

| Sets played | Format | Weight |
|---|---|---|
| 1 | One-set ranked | **0.60** |
| 2 (one player won both) | Best-of-3, finished in 2 sets | **1.00** |
| 3 (last set is normal) | Best-of-3, finished in 3 sets | **1.10** |
| 3 (last set is match-tiebreak: hi ≥ 10, win-by-2) | Best-of-3 with super-tiebreak final | **0.85** |
| anything incomplete / corrupted | — | **0** (defensive) |

So:
```
weightedDelta = round(K * (actual - expected) * weight)
```

A one-set ranked 6-4 between two 1500-rated players moves both ratings ±7 instead of ±12. A best-of-3 that goes the distance moves them ±13 instead of ±12 (more sets played = more signal). A match-tiebreak final-set is shorter than a normal third set, so it sits at 0.85.

The weight is **inferred** from the sets jsonb, not stored on `match_history` — there's no `match_format` column. The validator already accepts only the four valid completed shapes, so by the time `apply_match_outcome` runs we just classify. Inference logic mirrors between SQL (`_match_format_weight(p_sets jsonb)`) and JS (`getMatchFormatWeight(sets)` in `ratingSystem.js`).

One-set ranked matches still require everything a best-of-3 requires:
- valid completed set score (6-0..6-4, 7-5, 7-6)
- both players are real CourtSync users
- opponent confirmation
- not disputed / voided / expired
- not time-limited / retired

#### Set tie-breaks (Module 7.8 — V1)

A normal set ending **7-6** or **6-7** must record the inner tie-break score for ranked + completed submissions. The tie-break input row reveals inline beneath the set score in the log-match flow whenever the games resolve to 7-6 / 6-7, and clears + drops its data the moment the set score moves away.

Validity rules for the inner tie-break (set tie-breaks, 7-point game):
- Winner reaches **at least 7** points
- Winner leads by **at least 2** points
- Tie-break winner **must match** the games winner — a 7-6 set must be won on the tie-break by the side with 7 games

Examples:
- ✅ 7-6 (7-4) — valid
- ✅ 7-6 (8-6) — valid (win-by-2 ≥ 7)
- ✅ 7-6 (10-8) — valid
- ✅ 6-7 (4-7) — valid
- ❌ 7-6 (7-6) — not won by 2
- ❌ 7-6 (5-3) — winner didn't reach 7
- ❌ 7-6 (6-4) — winner didn't reach 7
- ❌ 6-7 (7-4) — inner winner mismatches games winner

| Path | Tie-break details |
|---|---|
| Ranked + Completed 7-6 / 6-7 | **required** — submit blocked otherwise (`TIEBREAK_DETAILS_REQUIRED`) |
| Ranked + Time-limited / Retired | tolerated — partial scores are casual-only anyway |
| Casual + any | optional — users may enter tie-break detail but aren't forced |
| Resubmit (after dispute) | always required (resubmit lands as ranked+completed) |
| Counter-proposal (DisputeModal) | tie-break inputs revealed; round-trips through `current_proposal` jsonb verbatim |

#### Storage shape

`match_history.sets jsonb` is **additively** extended:

```jsonc
// Pre-V1 row — still valid, renders as "7-6" (no parenthesis)
{ "you": 7, "them": 6 }

// V1+ row — renders as "7-6 (7-4)"
{ "you": 7, "them": 6, "tieBreak": { "you": 7, "them": 4 } }

// Match-tiebreak final set — unchanged from before; the games column
// itself carries the match-tiebreak points (e.g. 10-8 stored as you:10).
{ "you": 10, "them": 8 }
```

No `match_format` column, no `score_schema_version`, no migration. Rows missing `tieBreak` render cleanly everywhere.

`serializeSetForDb(set)` is the single chokepoint for all writes — strips half-filled or non-numeric `tieBreak` halves so `{tieBreak: {you:'7', them:''}}` never reaches the DB. `normalizeSetFromDb(set)` is the single chokepoint for all reads (identity today; gives us a place to live-migrate later if the shape ever changes).

#### Stats / standings impact

Tie-break **points** are NOT added to `games_won` / `games_lost` / `set_difference` / `game_difference`. League standings treat a 7-6 (7-4) set the same as any 7-6 — `games += 7` for the winner, `games += 6` for the loser, regardless of inner tie-break score. `recalculate_league_standings` reads `s.you` / `s.them` only.

#### Centralised utility

All tie-break logic lives in `src/features/scoring/utils/tennisScoreValidation.js`:
- `validateTiebreakScore(tieBreak, { pointsToWin, expectedWinner })` → `{ ok, code, message }`
- `validateSetScore(set, { requireTiebreakDetails })` — re-runs the tie-break check on a 7-6/6-7 set; surfaces `TIEBREAK_DETAILS_REQUIRED` / `INVALID_TIEBREAK_DETAILS` / `TIEBREAK_WINNER_MISMATCH` codes
- `validateMatchScore(sets, { matchType, completionType, requireTiebreakDetails, ... })` — top-level validator the UI + service-layer both call
- `formatSetScore(set)` / `formatMatchScore(sets)` — display formatters routed by every UI surface (feed cards, profile, dispute drawer, notifications, share text)
- `isTiebreakSet(set)` — UI predicate to decide when to reveal the inline tiebreak input row
- `serializeSetForDb` / `normalizeSetFromDb` — DB chokepoints

#### DB-layer note + follow-up

The `validate_match_score` BEFORE-INSERT trigger validates **games patterns only** (6-0..6-4 / 7-5 / 7-6 / 10-8 final). It doesn't re-check inner tie-break scores. The JS validator + service-layer guard remain canonical for tie-break details — sufficient for V1 because every legitimate insert path (ScoreModal, DisputeModal, resubmit) routes through them. **Follow-up (V1.1):** harden the trigger to verify `set.tieBreak` shape on ranked confirmed/pending rows so a forced REST POST can't sneak a malformed inner pair past.

#### Out of scope for V1

Intentionally not implemented:
- no-ad scoring
- Fast4
- 8-game pro sets
- advantage / 9-7 sets
- doubles-specific scoring
- point-by-point capture
- per-tournament custom formats beyond `match_format` + `tiebreak_format` already supported by leagues


The 5-3 path remains **invalid** as a completed ranked match — it can only be saved as casual time-limited (which doesn't affect rating).

#### Casual matches and other exclusions

`apply_match_outcome` only touches rating when **all** of the following are true:
- `match_type = 'ranked'`
- `status = 'confirmed'`
- `opponent_id` is set (real CourtSync user on both sides)
- the match is not voided / expired
- (when `completion_type` is wired into the DB layer in a follow-up: `completion_type` is not `'time_limited'` or `'retired'`)

Today the time-limited / retired path is enforced upstream by ScoreModal Slice E — partial scores are filed as `match_type='casual'` so they never reach the rating engine. The JS `isRatingEligibleMatch(match)` helper in `src/features/rating/utils/ratingSystem.js` documents the full predicate.

**Concurrency**: the RPC takes `FOR UPDATE` on both profile rows in id-order before reading the current ratings. Two concurrent confirmations involving the same player can't race; deadlocks between two matches involving the same pair are avoided.

### Calibration / provisional period (Module 7.7)

A profile is *provisional* while `confirmed_ranked_match_count < 5`. The first 5 rating-eligible matches are **calibration matches** — K is higher (40 / 32) so a player whose self-assessment was off recovers fast. After 5, `rating_status` flips to `'established'` and K drops to 24.

Surfaces:
- ProfileHero / HomeHero show an orange `CALIBRATION X / 5` strip below the rating.
- `provisionalLabel(profile)` returns `Provisional · N match(es) to calibrate` for the legacy text caption.
- `RatingInfoModal` explains the rule under the "Calibration" + "Provisional vs Established" sections.

Constants live in `src/features/rating/constants.js` (`PROVISIONAL_THRESHOLD = 5`, `K_FACTORS = { 40, 32, 24, 16 }`); legacy `profileStats.js` re-exports the same threshold so older callers keep working.

### Skill-level lock (Module 7.7)

The user's `starting_skill_level` is set once during onboarding and **locks** automatically the first time `apply_match_outcome` runs against a confirmed ranked match in which they participated. The lock is enforced two ways:

1. **DB layer** — `profiles_locked_columns_guard` rejects client UPDATEs to `starting_skill_level` / `initial_rating` / `skill_level_locked` / `skill_level_locked_at` / `rating_status` / `confirmed_ranked_match_count` always, and rejects UPDATEs to `skill` once `skill_level_locked = true`. SECURITY DEFINER paths bypass.
2. **UI layer** — `SettingsScreen` greys out the skill picker when locked and shows a "WHY LOCKED" hairline-strip explanation. The save handler omits `skill` from the upsert when locked so even a drift bug couldn't accidentally fire the guard.

The user can NEVER manually edit their starting skill level after lock. The displayed level (the `skill` column) does still move with their rating, but it's server-derived from `ranking_points` via the rating-band table inside `apply_match_outcome` — not user-editable.

### Displayed-level derivation + hysteresis

The displayed skill (`profile.skill`) is recomputed inside `apply_match_outcome` after every rating-eligible match using the band table above + `_derive_displayed_skill(p_rating int, p_prev_skill text)`. **Promotion** is immediate the moment rating crosses the next band's floor. **Demotion** is buffered: the displayed level only falls if the new rating is more than **50 points** below the previous band's floor. This prevents ping-ponging between levels on a single unlucky result. The JS mirror is `getDisplayedSkillLevelFromRating(rating, prevDisplayed)` in `ratingSystem.js`.

### Uninitialised profile rule

A user whose `initial_rating IS NULL` has not yet picked a starting skill. ProfileHero / HomeHero render a "SET YOUR STARTING LEVEL" hairline strip instead of a fake `1000` number, and `useMatchHistory.submitMatch` returns `{ error: 'rating_uninitialised', message }` for any ranked submission attempt. Casual logging is unaffected.

### Deferred follow-ups (P1 — required before "production-ready" rating)

The Module 7.7 foundation deliberately ships without these. Each is a known gap:

- **Rating-event ledger.** `apply_match_outcome` mutates `ranking_points` in place; there's no audit trail of which match contributed which delta. A `rating_events` table (player_id, match_id, old_rating, new_rating, rating_delta, reason, created_at) is required before we can trustfully recalculate or roll back.
- **Recalc-on-rollback.** When a previously-confirmed match is later voided / disputed back to a non-final state, the rating impact is **not** rolled back today. Mirrors the existing v1 ELO behaviour. Fix follows the ledger.
- **Admin reset path.** A future `admin_reset_rating(p_user_id, p_starting_skill text)` RPC for clearly-mis-rated accounts. Not exposed to normal users; not in V1.

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

## Score validity (Module 7.6, 2026-04-25)

> **Casual is the place for messy reality. Ranked is the place for completed tennis.**

The log-match form now validates set scores against real tennis rules before they reach the database, with three defensive layers so a forced REST POST can't bypass the UI gate.

### What counts as a valid completed set

A *completed* set must match one of these patterns (`hi` = the higher score, `lo` = the lower):

| Pattern | Allowed | Notes |
|---|---|---|
| `hi=6`, `lo` in `0..4` | ✅ | Standard set won at 6 |
| `hi=7`, `lo=5` | ✅ | Set won 7-5 (no tiebreak) |
| `hi=7`, `lo=6` | ✅ | Set won via tiebreak. Tiebreak details (e.g. 7-3) are optional metadata only — not required for a valid score |
| `hi≥10`, `hi-lo≥2` | ✅ **only as the final set** of a `best_of_3` decider when prior sets are 1-1 | Match-tiebreak (super tiebreak). Replaces the third regular set when a league's `tiebreak_format='super_tiebreak_final'` |

Anything else is **not a valid completed set**. Common rejected examples:
- `6-5` — must continue to 7-5 or 7-6
- `5-3`, `3-2` — partial / unfinished, only valid as casual time-limited
- `8-6` — ATP-style "long" set, not a recognised completion in current rules
- `10-8` as a regular set (not the final decider in a 1-1 match) — match-tiebreak only goes in the final set slot
- negative numbers, non-integers, strings — rejected at all layers

### What counts as a complete *match*

After every set passes the per-set check, the match must have a clear winner:

| Format | Rule |
|---|---|
| `one_set` | exactly 1 completed set with one player ahead |
| `best_of_3` (default) | one player won ≥2 sets and outscored the other in set count |
| `custom` (no league) | falls back to `best_of_3` rule |

### Completion type — the casual escape hatch

Casual matches expose a completion-type toggle on the score form:

| Completion type | Set rules | Effect |
|---|---|---|
| `completed` | full validity check (above) | Default. The match is treated as a completed casual game; appears on profile and feed |
| `time_limited` | per-set non-negative integers only; no winner check | "We played for an hour, ran out of time at 5-3 / 4-2." Saved as casual; never affects Elo (already true for all casual matches) |
| `retired` | per-set non-negative integers only; no winner check | "Opponent twisted an ankle mid-set." Saved as casual; never affects Elo |

Ranked matches **cannot** be saved as `time_limited` or `retired`. The flow:
1. The user enters partial scores under a ranked submission
2. The validator fails at save with a tennis-specific message ("A completed set can't end 6-5…")
3. An orange "Save as casual time-limited" CTA appears below the error
4. Tapping it overrides `match_type → casual` and `league_id → null` on insert and re-runs the validator under casual rules

This makes the ranked vs casual choice explicit at the moment a partial score is submitted, instead of silently downgrading or silently rejecting.

### Three-layer enforcement

1. **Client validator** — `src/features/scoring/utils/tennisScoreValidation.js` is the canonical rules engine. Pure functions, 74 unit tests, returns a discriminated `{ ok, code, message, perSet, winner, completionStatus, invalidIndex }` shape. The `CODES` constant is the stable contract for callers.
2. **Service-layer guard** — `useMatchHistory.submitMatch` and `resubmitMatch` re-run the validator after the match-type has been clamped, so the submission is rejected with a `{ error: 'invalid_score', code, message }` even if the modal's gate was bypassed.
3. **DB trigger** — `validate_match_score` BEFORE-INSERT trigger on `match_history` (migration `20260425_validate_match_score.sql`) mirrors the same rules in PL/pgSQL. Strict for `match_type='ranked' AND status IN ('confirmed','pending_confirmation')`; permissive (only non-negative integers) for casual + pending non-confirmed states. A forced REST POST with garbage scores is rejected by the database itself.

The three layers share one set of rules — the client validator is canonical; service-layer and trigger mirror it. If the rules change, all three layers move together.

### League interaction

Leagues participate via two existing knobs (no new schema):

- `leagues.match_format` (`one_set` | `best_of_3`) — picked up by the validator's match-winner check. The trigger reads it directly via `SELECT match_format FROM leagues WHERE id = NEW.league_id`. Default if no league: `best_of_3`.
- `leagues.tiebreak_format` (`standard` | `super_tiebreak_final`) — when `super_tiebreak_final`, the validator allows a match-tiebreak as the final set of a 1-1 best-of-3 decider. Otherwise the final set must be a normal set.

A league does **not** change the per-set patterns themselves (6-0..6-4, 7-5, 7-6 are universal); it only narrows which match-shape and final-set type are accepted.

### What still affects Elo

Unchanged: only `match_type='ranked' AND status='confirmed'` matches feed `apply_match_outcome`. The score validator is upstream of Elo — it controls *whether the row gets inserted at all* — but it doesn't introduce any new "this affected Elo / this didn't" branching. Casual matches with partial scores never affect Elo because casual matches never affect Elo.

### Why this matters

Without server-side validation, a determined user (or a bug in a future client) could insert `5-3 5-3` as a "ranked confirmed" match and silently corrupt their own Elo + a league's standings. The trigger closes that hole at the lowest layer; the modal gate makes the rules visible at the highest.

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

**Module 7.5 update — leagues now have a mode.** `leagues.mode` is `'ranked'` or `'casual'`, locked at creation. The `validate_match_league` trigger rejects any match whose `match_type` doesn't equal the league's `mode`. So:

- A `mode='ranked'` league only accepts `match_type='ranked'` matches → behaves exactly as before (Elo-bearing).
- A `mode='casual'` league only accepts `match_type='casual'` matches → no Elo impact (`apply_match_outcome` short-circuits casual matches), but the per-league leaderboard still updates via `recalculate_league_standings`.

The two modes share the entire match-truth + dispute + standings pipeline. They differ only in whether the match feeds global Elo. ScoreModal filters its league selector by `lg.mode === effectiveMatchType` plus viewer- and opponent-active-member checks; the trigger validates the same rules at insert time.

See `docs/leagues-and-seasons.md` for the full spec.

## Last Updated By Module
- v0 — initialised from shipped state at end of Module 3.
- v1 — Module 4 (challenges) noted as the conversion path from intent → ranked match log; no trust math change.
- v2 — Module 5 (real ELO). Linear placeholder replaced by ELO with provisional period. Single-source-of-truth `apply_match_outcome` RPC. Provisional + confirmation-rate trust pills surfaced on profile UI.
- v3 — Scoreboard + ScoreModal sanity: feed card winner-arrow + row-bold are now derived from **set scores**, not the stored `result` field. If the sets unambiguously pick a winner we trust that. This self-heals the classic "user tapped Loss but entered winning sets" data-entry bug without touching the stored row. Stored `result` still drives the outer resultColor border + share text. ScoreModal now warns once at save time when the selected Win/Loss disagrees with the set math, but does not block (retirement / incomplete matches are valid).
- v4 — Module 7 (leagues V1 schema). Added `match_history.league_id` nullable column + persisted `league_standings` as read-side lens. No change to match truth flow, global ELO, confirmation, dispute, or void rules.
- v5 — Match-type separation (2026-04-25). Made the ranked-vs-casual distinction explicit via `match_history.match_type` ('ranked' | 'casual') instead of inferring it from `tourn_name` + `opponent_id`. Server `apply_match_outcome` short-circuits for casual matches — single point of control for "what affects Elo". `validate_match_league` now requires `match_type='ranked'` for league matches. Backfilled every legacy row via the prior heuristic so player Elo / W/L numbers are unchanged.
- v6 — League mode (2026-04-25). Replaced the hardcoded `match_type='ranked'` requirement on league matches with a per-league `leagues.mode` column (`'ranked'` | `'casual'`). Trigger now compares `match_type` against `league.mode`, allowing casual leagues to host casual matches with their own per-league standings (no global Elo impact). ScoreModal filters its league selector by mode + viewer + opponent membership; CreateLeagueModal exposes the mode choice (locked at creation).
- v7 — Score validity (2026-04-25, Module 7.6). Added a three-layer score validator: pure client utility (`tennisScoreValidation.js`, 74 unit tests, canonical rules), service-layer guard (`submitMatch` / `resubmitMatch` re-run the validator after match-type clamping), and DB BEFORE-INSERT trigger (`validate_match_score`, mirrors the rules in PL/pgSQL, strict for ranked confirmed/pending, permissive for casual). Introduced explicit `completion_type` UI toggle (Completed / Time-limited / Retired) on casual matches so partial scores can be intentionally logged. Ranked attempts with partial scores surface a "Save as casual time-limited" CTA instead of being silently downgraded or silently rejected. League `match_format` and `tiebreak_format` columns now drive validator behaviour (final-set match-tiebreak gated to `super_tiebreak_final` leagues).
- v8.2 — Set tie-breaks (2026-04-27, Module 7.8). 7-6 / 6-7 sets now collect the inner tie-break score inline in ScoreModal + DisputeModal (revealed on the set's games shape, dropped automatically when the score moves away). Validator hardening: new `TIEBREAK_WINNER_MISMATCH` code rejects a 7-6 set whose inner pair was won by the wrong side; new public `validateTiebreakScore`, `formatSetScore`, `formatMatchScore`, `normalizeSetFromDb`, `serializeSetForDb`, `isTiebreakSet` helpers. Display: every set-score surface (feed scoreboard cells, dispute drawer, notification scorecard, recent-activity preview, share text) now routes through `formatSetScore` / `formatMatchScore`, so a 7-6 (7-4) set renders consistently with a small superscript on the loser's cell. Storage stays jsonb-additive — old rows without `tieBreak` render as `7-6`. No DB migration; `validate_match_score` trigger continues to validate games only (V1.1 follow-up). Tie-break points do not inflate `games_won` / `set_difference`. 109 score tests + 246 total passing.
- v8.1 — Match-format weight (2026-04-27, Module 7.7 supplement). Added explicit format-weight multipliers to rating math: one-set 0.60, best-of-3 in 2 sets 1.00, best-of-3 in 3 sets 1.10, best-of-3 with super-tiebreak final 0.85, incomplete 0. Weight is **inferred** from the sets jsonb (no new column on `match_history`); JS classifier `getMatchFormatWeight(sets)` mirrors SQL `_match_format_weight(p_sets jsonb)`. `apply_match_outcome` applies `round(K * (actual - expected) * weight)`. UI: `ScoreModal` surfaces a "ONE SET" notice with the reduced-weight copy for ranked single-set submissions; `RatingInfoModal` gains an 11th section "Match format weight" with the same table. Docs updated. One-set ranked is now formally valid + rating-eligible; the 5-3 path stays casual-only.
- v8 — CourtSync Rating foundation (2026-04-27, Module 7.7). Renamed "Ranking points" → "CourtSync Rating" in user-facing copy (NOT UTR / NOT a federation ranking). Replaced the flat 1000-for-everyone initial rating with six per-skill bands (800 / 1000 / 1200 / 1400 / 1600 / 1800). Replaced the 20-match settled period with a 5-match calibration window using a 40 / 32 / 24 K-table (provisional 0–2 / provisional 3–4 / established 5+). Each player still applies their own K, so opponent-strength asymmetry stays intact (upset wins gain more, expected wins gain less, etc). New profile columns: `starting_skill_level` / `initial_rating` / `skill_level_locked` / `skill_level_locked_at` / `rating_status` / `confirmed_ranked_match_count`, all locked from client writes. New `initialize_rating(p_skill text)` SECURITY DEFINER RPC bootstraps a profile from onboarding. `apply_match_outcome` rewritten to read the new K-table, increment `confirmed_ranked_match_count`, flip `rating_status` at 5, auto-lock skill on first confirmed ranked match, and derive the displayed `skill` column from `ranking_points` using the band table + 50-point demotion hysteresis (immediate promotion). Pure-JS mirror in `src/features/rating/utils/ratingSystem.js` (80 unit tests). New `RatingInfoModal` (10 sections including the "Opponent strength" section per supplement) is reachable via a `(i)` icon next to the rating eyebrow on Profile + Home heroes. Onboarding step 1 now drives `initialize_rating`. Settings disables skill editing once locked. Uninitialised profiles never display a fake rating and can't log ranked matches. Deferred follow-ups documented inline: rating-event ledger, recalc-on-rollback, admin reset path.
