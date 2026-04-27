# Player Trust & Reliability (Module 10)

## Purpose

Make CourtSync feel like a place with real, responsive, trustworthy tennis players. Users challenge or invite each other with confidence that the other side is likely to respond, show up, and confirm results fairly.

This is a **background trust and reliability layer** with lightweight positive-only public surfaces. It is not a public star-rating system, not a public "bad player" label, not a moderation dashboard.

If you're tempted to add a public "0/5 stars" widget or a "this user has been flagged" warning, **stop** — the product principle is "improve the experience without feeling heavy or suspicious."

## The three concepts (kept separate)

| Concept | Definition | Stored as |
|---|---|---|
| **Trust** | Quality of match-truth signals — does this player log honestly? | `trust_score` 0–100, default 50 |
| **Reliability** | Quality of follow-through signals — do they respond, show up, stay civil? | `reliability_score` 0–100, default 50 |
| **Confidence** | How much evidence we have. Independent of the scores. | `confidence_level` text: `low` / `medium` / `high` |

A new user is `trust=50, reliability=50, confidence=low` — **neutral, not suspicious.** No negative inferences from absence of data.

## Source-of-truth tables (existing, reused)

The Slice 1 implementation derives every signal from these tables. **No copies**, no separate event log.

| Table | Signals derived |
|---|---|
| `match_history` | Confirmed / disputed / voided / expired counts and rates per user. Repeated-opponent / suspicious-match flags. |
| `challenges` | Sent → response time + rate. Accepted / declined / completed counts. Decline counts as a response, cancel does not count as ignored. |
| `match_invites` (Module 9) | Claim rate (positive responsiveness only). Unclaimed invites do **not** penalize anyone — recipient may not be a CourtSync user. |

## Net-new tables (Slice 1)

### `post_match_feedback`
The only NEW user-generated table. Private feedback rows tied to a match.

| Column | Notes |
|---|---|
| `id`, `match_id`, `reviewer_id`, `reviewed_user_id` | Standard. UNIQUE `(match_id, reviewer_id)` blocks duplicates. CHECK `reviewer_id <> reviewed_user_id`. |
| `would_play_again`, `showed_up`, `score_felt_fair` | Positive-signal booleans. Nullable (allow partial answers). |
| `sportsmanship_issue`, `no_show_report` | Negative-signal booleans, default false. |
| `private_note` | Optional text, capped at 500 chars. **Never publicly visible.** |

**RLS.** SELECT only by `reviewer_id` (a user can read their own submissions to know they've already reviewed a match). INSERT/UPDATE/DELETE blocked for clients — INSERT goes through the `submit_post_match_feedback` SECURITY DEFINER RPC.

### `player_trust_profiles`
Server-owned aggregate cache. One row per user, derived on every recalc.

Columns split into four groups:
- **Counters** — confirmed / disputed / voided / expired match counts.
- **Rates** — `dispute_rate`, `void_rate`, `expired_rate`, `challenge_response_rate`, etc. NULL until sample size threshold (5 ranked / 3 challenges / 5 weighted feedback) is met.
- **Aggregates** — challenge response time (avg minutes), distinct-reporter counts, internal flag counts.
- **Computed** — `trust_score`, `reliability_score`, `trust_level`, `reliability_level`, `confidence_level`, `public_badge`.

**RLS.** SELECT for self only (full row). Other users read only the public-facing columns through the `player_trust_public` view (see below).

### `player_trust_public` view
Public-readable. Returns only:
- `user_id`
- `public_badge` — one of `new` / `building` / `responsive` / `reliable` / `confirmed`
- `confidence_level` — `low` / `medium` / `high`
- `confirmed_matches_count`, `ranked_confirmed_matches_count` — counts already public via `match_history`
- `last_calculated_at`

**Numerical `trust_score` / `reliability_score` are deliberately NOT exposed.** The view is the only way clients learn anything about another user's trust state.

## V1 scoring model (locked)

**Every score is fully derived on each recalc.** "One-time penalty" means the condition is applied in the *current* recalculated profile — not subtracted forever. Recalc is idempotent and self-healing.

### Trust score derivation (starts at 50)

| Signal | Effect | Gate |
|---|---|---|
| Confirmed ranked matches | +2 each for first 10, +1 each after, **capped at +30 total** | per match |
| Dispute rate > 0.20 | −10 | requires `confirmed + disputed ≥ 5` |
| Void rate > 0.20 | −10 | requires `confirmed + voided ≥ 5` |
| Expired rate > 0.30 (you didn't confirm as opponent) | −5 | requires `confirmed + expired ≥ 5` |
| Score-felt-fair rate > 0.85 | +5 | requires `effective_feedback_weight ≥ 5` |

Final clamped to `[0, 100]`. **Repeated-opponent farming does NOT reduce trust_score in V1** — it only demotes confidence.

### Reliability score derivation (starts at 50)

| Signal | Effect | Gate |
|---|---|---|
| Challenge responses (any of accept/decline/complete) | +1 each, capped +30 | accept and decline both qualify |
| Accepted-and-completed challenges | +2 each, capped +20 | |
| Invites claimed (in-app users) | +2 each, capped +10 | |
| ≥ 2 distinct no-show reporters | −15 | requires 2+ reporters, never one |
| ≥ 2 distinct sportsmanship reporters | −15 | requires 2+ reporters, never one |
| Would-play-again rate > 0.85 | +5 | requires `effective_feedback_weight ≥ 5` |
| Challenge expired rate > 0.40 (sent to you, no response) | −10 | requires `challenges_received ≥ 5` |

Final clamped to `[0, 100]`.

### Confidence level

| Level | Trigger |
|---|---|
| `high` | `confirmed ≥ 10` AND `chal_received ≥ 5` AND `feedback_received ≥ 3` |
| `medium` | `confirmed ≥ 3` OR `chal_received ≥ 5` |
| `low` | otherwise |

**Demotion:** if `repeated_opponent_flag_count > 0`, drop one tier (`high → medium`, `medium → low`).

### Public badges (positive/neutral only)

Highest qualifying tier wins, evaluated in order:

| Badge | Requirement |
|---|---|
| **Confirmed player** | `ranked_confirmed ≥ 10` AND `dispute_rate ≤ 0.20` (or null) AND `void_rate ≤ 0.20` (or null) AND no serious internal flags (distinct reporters < 2 each) |
| **Reliable player** | `reliability_score ≥ 60` AND `confidence ∈ {medium, high}` |
| **Responsive** | `chal_responded ≥ 3` AND `chal_response_rate ≥ 0.70` |
| **Building history** | any confirmed match OR any challenge response |
| **New player** | default (no signals at all) |

**No public negative labels.** No `unreliable`, `flagged`, `bad player`, no numerical scores, no no-show count, no sportsmanship warning. The whole UX leans positive — the absence of a badge is the worst public signal.

## Anti-retaliation weighting (locked)

Each post-match feedback row is weighted at recalc time based on the **current** status of the related match:

| Match status | Feedback weight |
|---|---|
| `voided` | **0.0×** — match was thrown out, feedback can't stand |
| `disputed` / `pending_reconfirmation` (open dispute) | **0.5×** |
| `confirmed` AND `dispute_reason_code IS NOT NULL` (dispute happened, then resolved) | **0.75×** |
| `confirmed` clean / `expired` | **1.0×** |

Weights apply to the rate computations (`would_play_again_rate`, `fair_score_rate`).

**Distinct-reporter counts (the threshold rule for negative penalties) are NOT weighted** but they exclude reporters whose match is currently `voided`. This means:
- A single retaliatory negative report cannot alone cross the ≥ 2 reporters threshold.
- A disputed feedback does not trigger a public badge change by itself — even at full count, the threshold rule still requires 2+ distinct reporters.
- Once a match is voided, all feedback tied to it falls off the rate computations.

## Internal flags (V1 — confidence demotion only)

### `repeated_opponent_flag_count`
Number of distinct opponents who account for > 50% of the user's confirmed ranked matches over a sample of ≥ 10 ranked matches. Two real friends playing each other often is not abuse — this signal is treated as a confidence demotion (one tier down) and a queryable flag for future review. **Does NOT subtract from trust_score in V1. Does NOT affect Elo.**

### `suspicious_match_flag_count`
V1 simplified definition: count of confirmed ranked matches that are BOTH (a) confirmed within 10 minutes of submission AND (b) part of a 2+ ranked-match burst between the same pair within 7 days. Internal-only. **Does NOT subtract from trust_score in V1. Does NOT affect Elo.**

The full spec also mentions "both users have < 3 confirmed ranked matches" and "high share of each other's early ranked history" as composite signals — those are documented as future work to keep the V1 SQL maintainable.

## Recalculation (server-owned)

### `recalculate_player_trust_profile(user_id uuid)` — SECURITY DEFINER
Reads source-of-truth tables, derives every counter/rate/score/level/badge from scratch, upserts the row. Idempotent: running 10 times produces the same result as running once.

**Not user-callable.** EXECUTE revoked from PUBLIC / anon / authenticated. Triggers + the `submit_post_match_feedback` RPC invoke it under the postgres role.

### Trigger fan-in
| Source | Fires recalc on |
|---|---|
| `match_history` AFTER INSERT/UPDATE | when status / dispute_reason_code / opponent_id changed → recalc both parties (+ old opponent if it changed) |
| `challenges` AFTER INSERT/UPDATE | when status / responded_at / completed_at changed → recalc both parties |
| `match_invites` AFTER INSERT/UPDATE | when status / claimed_by / declined_by changed → recalc claimer/decliner |
| `post_match_feedback` AFTER INSERT | recalc reviewed_user_id |

Every trigger is wrapped in `EXCEPTION WHEN OTHERS THEN RAISE WARNING` so trust math can never block a match-truth write. If recalc fails, a future status change or scheduled recalc heals the row.

### `submit_post_match_feedback(...)` — SECURITY DEFINER, callable by `authenticated`
Eligibility checks (in order):
1. Caller authenticated (`auth.uid() IS NOT NULL`).
2. Caller != reviewed user (also enforced by table CHECK constraint).
3. Match exists.
4. Match status in `('confirmed', 'pending_reconfirmation')` — rejects `pending_confirmation`, `pending_opponent_claim`, `voided`, `expired`.
5. `opponent_id IS NOT NULL` — no feedback on freetext matches.
6. Caller is one of `(user_id, opponent_id)`.
7. `reviewed_user_id` is the OTHER party.
8. UNIQUE `(match_id, reviewer_id)` blocks duplicates.

On success: inserts the row, then calls `recalculate_player_trust_profile(reviewed_user_id)` so the new feedback is reflected immediately.

## What does NOT affect trust / Elo in V1

- Repeated-opponent farming → confidence demotion only, no trust_score change, no Elo change.
- Suspicious-match flag → internal count only, no trust_score change, no Elo change.
- Single negative feedback → counts toward `distinct_*_reporters` but cannot alone trigger a penalty (≥ 2 distinct reporters required).
- Negative feedback tied to a voided match → weighted to 0.0× during recalc → effectively excluded.
- Unclaimed invites → never penalize the inviter (recipient may not be a CourtSync user).
- Cancelled challenges → never count as "ignored."
- Trust score → never directly modifies Elo. Future work may apply rating-confidence weighting; documented separately.

## Eligibility — what feedback can be submitted on

| Match state | Feedback allowed? |
|---|---|
| `confirmed` (clean) | ✅ |
| `confirmed` (dispute resolved) | ✅ — feedback gets 0.75× weight in rates |
| `pending_reconfirmation` (counter-proposal in flight) | ✅ — 0.5× weight while open |
| `disputed` (active dispute) | ✅ — 0.5× weight while open (allows the dispute window to record perspective) |
| `pending_confirmation` | ❌ rejected (truth loop incomplete) |
| `pending_opponent_claim` (Module 9) | ❌ rejected (no claimer yet) |
| `voided` | ❌ rejected (match thrown out) |
| `expired` | ❌ rejected (no truth loop completed) |

A future "edit feedback" path (out of V1 scope) would let users update once a match status changes after they submitted.

## Privacy

- **Private notes are never public.** Only the reviewer can SELECT their own row; the reviewed user cannot read raw feedback. Service-role admin paths can read for moderation (no admin UI in V1).
- **Reviewer identity is never exposed for negative feedback.** The reviewed user sees their aggregate badge update; they do not see who reported them.
- **No notifications fire on negative feedback** or on a downward score change. The user does not learn they've been reported. This is deliberate — anti-drama.
- Feedback is not used in analytics events that include note text. The only analytic signal is "feedback was submitted" (count + boolean fields aggregated server-side, never the note).

## Discovery hook (Slice 2)

`fetchSuggestedPlayers` will join `player_trust_public` and rank candidates by:
1. Friend / league overlap (existing).
2. Skill tier proximity (existing).
3. **`reliability_score desc`** — boost responsive + reliable players (Slice 2 will read this from a server-side RPC, never from the public view, so the score itself stays private).
4. **`confidence_level` floor** — only boost users with confidence ≥ medium so brand-new accounts don't outrank reliable ones.

Low-confidence / new users still surface — they're not hidden. They just don't outrank reliable players with similar skill.

## Challenge composer hook (Slice 2)

When you're about to challenge someone, the composer can show a small positive tag ("Usually responds", "Confirmed player") if the target qualifies. **No negative tags.** If a target has poor reliability, the absence of a positive tag is the only signal — the composer never warns "this user often ignores challenges."

## Appeal / correction path (future, documented)

V1 does not build an appeal UI. Future work:
- Admin can DELETE a feedback row (service-role only); the trust profile recalc on next trigger fan-in will heal.
- Admin can mark a match `voided` retroactively; all feedback tied to it falls to weight 0 on next recalc.
- A user with a `repeated_opponent_flag` could be reviewed manually; the flag is queryable by admins.
- No automatic permanent penalties exist — every penalty is derived during recalc, so correcting source data heals the score.

## V1 analytics events (planned, fire from client)

The recalc itself fires on the server and is not analytics-tracked at the row level. Client should fire:

| Event | When |
|---|---|
| `post_match_feedback_prompt_shown` | When the feedback card mounts |
| `post_match_feedback_submitted` | After successful `submit_post_match_feedback` (track booleans only, never `private_note`) |
| `post_match_feedback_skipped` | User dismissed without submitting |
| `reliable_badge_earned` | (Slice 2) when a user observes their own badge transition to reliable / responsive / confirmed |
| `player_reported_no_show` | When a feedback with `no_show_report=true` is submitted |
| `trust_profile_recalculated` | (Slice 2) optional, only if observability becomes useful |

**Never include `private_note` text in analytics events.**

## Out of scope (V1)

- Public star ratings, public negative reviews, complex moderation dashboard.
- Hard bans, KYC, identity verification, fingerprinting.
- Automatic punishments from one bad signal.
- Trust-based Elo weighting.
- Cross-device / cross-account ban propagation.
- Appeal UI.
- Notifications on trust events.

## Schema-level guards

- `player_trust_profiles` — `trust_score` and `reliability_score` are `CHECK BETWEEN 0 AND 100`. `trust_level` / `reliability_level` / `confidence_level` / `public_badge` are CHECK-constrained to known values. UPDATE/INSERT/DELETE blocked at RLS for all clients.
- `post_match_feedback` — `private_note` length capped at 500. UNIQUE `(match_id, reviewer_id)` and CHECK `reviewer_id <> reviewed_user_id`. INSERT blocked at RLS; the only insertion path is the `submit_post_match_feedback` RPC.
- All trust-related RPCs are SECURITY DEFINER with `set search_path = public, extensions`.
- All triggers are wrapped in `EXCEPTION WHEN OTHERS THEN RAISE WARNING` — recalc failures cannot block the underlying match / challenge / invite write.

## Slice plan

### Slice 1 (this commit)
- ✅ Migration: tables + RLS + RPCs + triggers + view + backfill.
- ✅ Eligibility checks tested live.
- ✅ Recalc idempotency verified.
- ✅ Backfill seeded existing users.
- ✅ Docs.

### Slice 2 (next commit)
- `PostMatchFeedbackCard.jsx` — feedback prompt, mounted after opponent confirms (NOT after submitter logs).
- `ReliabilityBadge.jsx` — positive-only badge for profile + FeedCard.
- Discover ranking via `player_trust_public` view.
- Challenge composer subtle positive tag (if easy).
- Analytics event wires.

## Last updated

- v1 (2026-04-30) — initialised. Tables, RLS, RPCs, triggers, view, backfill, docs.
