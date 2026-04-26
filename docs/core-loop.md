# Core Loop

## Purpose
Defines the product heartbeat — the repeating sequence of actions that makes CourtSync sticky. Every module either strengthens this loop or justifies why it doesn't.

## Current Product Rule

### Primary loop

```
play a match (IRL)
  → log it in CourtSync (tag opponent if real user)
    → opponent confirms (or disputes → resolve)
      → stats + ranking visibly update on both profiles
        → match appears on both feeds
          → friends like/comment
            → you come back to see reactions → loop restarts on next match
```

Every arrow in this chain is currently shipped. Modules 0–3 hardened the chain end to end: confirmations are reliable, notifications fire and deep-link, profiles show the resulting trust / stat / form, and discovery keeps the graph topped up.

### Secondary loops

1. **Social browse loop** — open app → scroll feed → see friend's match → like or comment → friend gets notified → friend returns. This loop does NOT require the user to log anything, which is how we hold engagement on days without a match.
2. **Discovery loop** — open People tab (Discover) → see played / near-you / same-skill suggestions → follow one → their future matches appear in friends feed → you engage. Grows graph density.
2a. **Spatial browse loop** (Module 4) — open Map tab → scan the six zones → tap a zone → see courts + players who've set this zone as home → tap a profile → add friend. Same discovery outcome as loop 2, different entry point — and the visible *density per zone* works as a motivator to declare a home zone yourself.
3. **Dispute loop** (edge case but critical for trust) — submitter logs → opponent disputes with correction → submitter accepts or counters → resolution → stats fire. Without this loop reliable, the whole ranking trust story collapses.
4. **Reminder loop** — pending match, <24h to expiry → reminder notification → opponent confirms → loop completes. Rescues matches from silently expiring.
5. **Challenge loop** (Module 4) — viewer opens friend's profile or a confirmed match card → taps Challenge / Rematch → sends a `challenge_received` notification with optional time/venue/message → other party accepts/declines from notification or `/tournaments/challenges` → on Accept the challenge sits in "Ready to play" → after IRL match, either party taps "Log result" to convert directly into the standard `match_logged → match_confirmed` flow with `tournName='Ranked'`. Closes the gap between "I want to play this person again" and the actual match cycle. The only coordination surface in the product — intentionally not chat, not a calendar.
6. **League loop** (Module 7, schema layer) — a small group of friends join a private league → members log league-tagged matches against each other → each confirmed match updates a shared leaderboard in `league_standings` → users return to check rank, see last result, decide who to challenge next. The league is a **recurring reason to return** — even on days without a match, the standings tab is a reward surface. Crucially, league matches are **not** a parallel match system: they flow through the exact same `pending_confirmation → confirmed | disputed | voided | expired` state machine as every other match. The league is a tag + a read-side lens. Full spec in `docs/leagues-and-seasons.md`.

### Activation path (new user)

The path a brand-new account takes to become a healthy active user:

1. Sign up.
2. Set name + suburb + skill (onboarding modal).
3. **Log their first match.** If they do this with a real linked opponent, they're on the ranked path; if freetext, they're on the casual path.
4. Opponent confirms (ranked) — both see stats update, both see each other's profile.
5. They like or comment on a friend's match at least once.
6. They add at least one new friend via Discover or search.

A user who completes 3 + 4 + 6 is "activated" — they've seen the core loop close at least once and are plugged into the graph.

### The aha moment

**Seeing your own ranking points change after a confirmed win.**

This is the single moment that most viscerally proves the app "means something." It's why Module 0 hardened the truth loop before anything else — if the stats don't move reliably, nothing else matters.

Secondary aha: seeing your H2H record against a specific player build up over time (Module 1 H2H widget).

### Retention triggers (in priority order)

These are the reasons a user opens the app on a day they didn't originally plan to:

1. **Match tag** — "X logged a match with you — confirm or dispute." Single biggest trigger in the system. Never silenced, highest priority.
2. **Dispute / correction / counter-proposal** — the response-required trigger set.
3. **Match reminder** — <24h to pending expiry. Rescues the primary loop.
4. **Friend request / request accepted** — graph-growth trigger.
5. **Like / comment on your match** — social reward trigger.
6. **Match confirmed** — positive feedback + implicit "you earned points" signal.
7. **Match expired / voided** — bad news, but closes an open loop.

### What should happen after key actions

| Action | Immediate feedback | Notification to the other party | Stat update? |
|---|---|---|---|
| Log ranked match | Match card appears on own feed (status `pending_confirmation`) | `match_tag` to opponent | No (yet) |
| Opponent confirms | Status flips to `confirmed`, stats bump locally | `match_confirmed` to submitter | **Yes** — both profiles |
| Opponent disputes with correction | Diff block appears on submitter's card | `match_disputed` to submitter | No |
| Submitter accepts correction | Status `confirmed`, diff applied | `match_confirmed` to opponent | **Yes** |
| Void match | Card shows "Voided" with reason | `match_voided` to other party | No (frozen → terminal) |
| Match auto-expires | Card shows "Unverified" | `match_expired` to both parties (Module 3 migration) | No |
| Like a match | Heart + count bump, rollback on DB error | `like` to every match participant except the liker | No |
| Comment on match | Inline preview, new row in feed_comments | `comment` to every match participant except commenter | No |
| Add friend | Inline "Pending" state | `friend_request` to target | No |
| Accept friend request | Both sides see each other as friends | `request_accepted` to sender | No |
| Send challenge | Inline "Awaiting response" pill on `/tournaments/challenges` Sent | `challenge_received` to target | No |
| Accept challenge | Row moves to "Ready to play" for both sides | `challenge_accepted` to challenger | No |
| Decline challenge | Row terminal, removed from challenger's pending list | `challenge_declined` to challenger | No |
| Convert challenge → match | Standard ScoreModal opens prefilled (opponent linked, venue/court from challenge); challenge row flips to `completed` and links `match_id` | `match_tag` to opponent (existing path) | After opponent confirms — yes |
| Auto-expire challenge (7d, pg_cron) | Row terminal, removed from challenger's pending list | `challenge_expired` to challenger | No |

## Design / Decision Principles

1. **The loop closes in minutes, not days.** Log → tag → confirm should be able to complete in a single sitting if both parties are online. The 72h window is a fallback for real life, not the intended pace.

2. **Every action produces visible feedback within 300ms on the actor's screen.** Optimistic updates + rollback on failure (Module 0). This is why a laggy confirm button is such a trust killer.

3. **Every meaningful event generates exactly one notification to exactly one recipient.** The notification is the re-entry point. No event without a notification means a broken loop arrow. No duplicate notifications for the same event.

4. **Notifications deep-link to the object, not a list.** Tap "match disputed" → opens the review drawer on *that* match, not the feed. (Module 3.)

5. **Self-service first.** A user never needs to contact support to resolve a match state. Dispute / counter / void / accept all live on the card itself.

6. **Casual path exists for bootstrap, not as a parallel product.** Casual matches keep new users from bouncing off the friction of "my opponent isn't on CourtSync yet." But casual matches don't earn stats, so the ranked path remains the identity story.

7. **Match weight is a column, not a heuristic.** Every match row has an explicit `match_type` (`'ranked'` or `'casual'`) — the single signal that determines whether confirmation triggers Elo / leaderboard / W/L updates. Casual matches still flow through the full lifecycle (pending → confirmed / disputed / voided), they just no-op the stats RPC. See `trust-and-ranking-rules.md` → "Match types" for the rule.

## Key product metrics tied to the loop

Every metric here is now **measurable via the `events` table** (Module 3.5). See `analytics-events.md` for the full event catalogue and sample queries.

### Activation
- **Time from signup to first match logged** (target: <7 days median) — `auth_signup_completed` → `match_logged`.
- **% of signups that log a match within 14 days** (target: >50%) — same events.
- **% of first matches that are ranked (linked opponent)** vs casual (target: >30% ranked) — `match_logged` filtered by `props.is_ranked`.
- **% of ranked matches confirmed within 72h** (target: >70%) — `match_logged(is_ranked=true)` → `match_confirmed` delta.

### Retention
- **% of users who return on Day 1 / Day 7 / Day 30** after signup — cohort on `auth_signup_completed.user_id`, presence of `app_open` in the window.
- **Session frequency** — distinct `session_id` per `user_id` per week.
- **Return-after-notification rate** — % of notifications that result in an `app_open` within 24h of delivery — join `notifications.created_at` against `app_open` event timestamps.
- **Notification tap-through rate by type** — `notification_opened` grouped by `props.type`, divided by notifications created in the same window.

### Loop health
- **Median time from match-log → confirmed** (target: <24h for ranked) — `match_logged` → `match_confirmed` delta.
- **Dispute rate** — % of ranked matches that fire `match_disputed`. (Too high = trust issue; too low = rubber-stamp confirmations.)
- **Expiry rate** — % of `match_logged(is_ranked=true)` that never see a `match_confirmed` within 72h (target: <20%).
- **Repeat-opponent rate** — derived from `match_history` directly (confirmed matches where both players have played each other before). No event needed — this is a query on the match table.

### Density
- **Ratio of ranked matches to total matches** — `match_logged` grouped by `props.is_ranked`.
- **% of feed cards that belong to a friend** — derived from `match_history` joined against `friend_requests`. No event needed.
- **Friends per active user** (distribution, not mean) — derived from `friend_requests`.
- **Discovery → follow conversion** — users who fire `discover_tab_viewed` then fire `friend_request_sent` in the same session.

### Social reward
- **Average likes per confirmed match** among friends — derived from `feed_likes` (or `feed_like` events).
- **Average comments per confirmed match** — `feed_comment` events grouped by `props.match_id`.
- **Tap-through rate on `like` / `comment` / `match_confirmed` notifications** — `notification_opened` filtered by `props.type`.

## Open Questions

- **When does a user become "activated" for internal metrics?** Proposal: first confirmed ranked match + at least one friend. Not final.
- **How long is the activation window?** 14 days seems right; need data.
- **Should freshly-signed-up users be prompted to log a "last match I played" retroactively** to prime the loop? Maybe — it would give them instant stats. Tradeoff: false-positive matches pollute trust.
- **Should we nudge users who have a confirmed match but no friends?** Yes, probably, via a Discover CTA in the feed. Not yet implemented.
- **Is 72h the right confirmation window?** Unknown until we see real expiry rates. Tuneable.
- **What triggers re-engagement after 7+ days of silence?** Currently only an incoming notification. A weekly digest ("3 friends played this week") is tempting but out of scope now.

## Out of Scope (for now)

- Push notifications (native / APNS / FCM). Tray + email only right now.
- Weekly / monthly summary emails.
- Proactive re-engagement campaigns based on churn probability.
- Streak-risk push ("you haven't played in 6 days").
- Daily / weekly challenges.
- Any scheduled content (drip notifications on a timer rather than event-driven).

## Last Updated By Module
- v0 — initialised from shipped state at end of Module 3.
- v1 — Module 3.5 (analytics foundation). Every metric in this doc is now mapped to a concrete event or a direct table query. See `analytics-events.md`.
- v2 — Module 4 (challenge / rematch). New secondary loop + 6 new post-action rows. Challenge is now the only coordination surface; it explicitly converts intent into a logged match via the existing flow.
- v3 — Module 5 (real ELO + leaderboard). The "aha moment" (rating change after confirmed win) is now backed by real ELO math with provisional period. Suburb-scoped leaderboard adds a local-network reinforcement signal.
- v4 — Module 6 (feed polish). Community-pulse one-liner above the feed surfaces "this week" activity (own + friends) as a glance-able social-proof signal — keeps users engaged on no-match days. Toasts replace alerts in the post-action UX. Tray noise reduced via like dedupe + comment grouping.
- v5 — Map tab (parallel workstream from the Mdawg branch): adds a spatial-browse secondary loop. Users can visually explore zones/courts as a discovery-plus-coordination aid. Integrates with the existing courts / zones data under `src/features/map/`.
- v6 — Live-feed heads-up: Supabase Realtime channel on `match_history` INSERT (filtered by viewer's `user_id` or `opponent_id`) drives a Strava-style "N new matches — tap to refresh" banner above the feed. We deliberately don't auto-splice new rows mid-scroll; users tap to opt into the refresh. Friend-of-friend feed updates are still refresh-on-load (open gap — would need a broader filter + more thought).
- v7 — Module 7 (leagues V1 schema). Added league loop as secondary loop 6. A league is a private, invite-only season container for friends with a shared leaderboard. Schema-only delivery in this commit: `leagues` + `league_members` + `league_standings` tables, nullable `match_history.league_id`, server-owned standings recomputation via AFTER trigger. No UI yet; UI lands in slice 2. Match truth flow unchanged — leagues are purely a read-side lens on confirmed matches.
- v7.1 — Messaging Phase 5 UI polish: pinned conversations as a light retention lever (per-user pins via `conversation_pins` table). Keeps a user's regular hitting partner at the top of the DM list without scrolling past dormant threads. Not a new loop — an affordance inside the existing rematch-coordination one.
- v8 — **Tindis (match pacts)**. New primary coordination surface at `/tindis`, slotted one tab ahead of Feed. A pact is the booking-receipt artifact for a planned match: proposer drafts it (direct to a friend OR as an open court post), partner agrees (bilateral gate — Book CTA locked until both tap Agree, 48h expiry on the proposed state), someone books externally and writes the operator confirmation # back in-app. Optional split ledger (50/50 / I'm shouting / they're shouting / custom) renders a per-side owed amount + a paid-toggle per party. CourtSync never holds money; when the partner has opted into a `payment_handle` + `payment_method` we render a deep-link (Venmo / PayPal.me) or a copy-to-clipboard (PayID / Beem / Zelle). AU-first. Open-court postings are zone-scoped + optionally skill-filtered; anyone eligible can claim via the `claim_open_pact` RPC which atomically flips the row to a mutual-but-unconfirmed pact. Shout-tracker is opt-in-per-pair and off by default. Core-loop impact: fills the "challenge → play" gap that today's app leaves implicit — pacts become the commitment device that pulls players back for logging on match day.
- v8.1 — Tindis stale-pact rule. Single SECURITY DEFINER RPC `sweep_stale_pacts()` handles the full lifecycle: (a) proposed past `expires_at` → expired; (b) confirmed past `scheduled_at + 24h` → expired (nobody booked, pact assumed played off-app or abandoned); (c) booked past `scheduled_at + 7d` with no `match_id` → expired (grace period to log score); (d) cancelled/expired/played rows older than 30 days → hard-delete (match_history keeps the real play record). Client in `usePacts` calls the RPC on mount + every 60s while the tab is visible, chained with the viewer-scoped `expireProposedPacts` belt-and-braces fallback. No server cron yet — current write volume is tiny, client coverage is enough.
- v9 — **Phase 2 map-centric matchmaking** shipped. `map/services/mapService.js` grew `fetchPlayersAtCourt(courtName, viewer, limit)` — combines self-reported `profiles.played_courts` with derived-from-`match_history` plays-here signal, then scores each candidate via `scorePlayerForCourt`: plays-here (+1000), skill distance (0 / 300 / 500 for different-tier / same-tier / exact-sub-level), availability overlap (+20 per shared day×block cell, capped +200). Ranked best-first. `CourtInfoCard` swaps the old "Recently played here" read-only list for "Players at this court" with per-row Message + Challenge buttons. `ZoneSidePanel` gets a Message button on each player row. Clicking Message fires `dms.openConversationWith(partner, { slot, draft })` (from Phase 1b) and routes to `/people/messages` — composer shows the ProposedSlotBar primed with the court as venue.
- v10 — **Match-type as a column (2026-04-25)**. Made the ranked-vs-casual distinction explicit via `match_history.match_type` instead of inferring it from `tourn_name` + `opponent_id`. New principle #7 on the core-loop list. Server-side `apply_match_outcome` short-circuits for casual matches; `validate_match_league` requires `match_type='ranked'` for league rows. Backfilled all legacy data via the prior heuristic so player Elo / W-L / matches_played are unchanged. Casual = "this happened", ranked = "this counts" is now enforced at the DB layer, not the client.
- v11 — **Smart log-match flow + league mode (2026-04-25)**. Two coupled changes: (1) the ScoreModal Match-type toggle (Ranked / Casual) is now only shown when the opponent is a linked friend — freetext opponents are casual-only, no toggle noise; (2) leagues now have a `mode` column (`'ranked'` | `'casual'`, locked at creation) and the ScoreModal league selector filters by `lg.mode === effectiveMatchType` AND viewer-active-member AND opponent-active-member (the last via `fetchOpponentActiveLeagueIds`). DB trigger `validate_match_league` enforces the same mode-vs-match_type rule defensively. Net effect: friend matches feel like an actual decision (social vs serious) and leagues only appear when they actually fit the match. Casual leagues get their own per-league standings without any Elo bleed.
- v12 — **Design overhaul slice 1 — Home (2026-04-25)**. Home is no longer feed-as-home. Restructured to four sections in priority order: (1) Hero — viewer's avatar + name + signature metric (ranking) + recent form; (2) Next Action — single contextual card prioritising disputes → pending confirmations → upcoming challenges → league movement → fallback "Log a match"; (3) Your leagues — up to 2 active leagues with rank + last result + member count; (4) Friend activity — condensed feed (max 5 cards) with "See all" link. Removes the standalone NextChallengeBanner (folded into Next Action) and the header "+ Log match" button (replaced by Next Action's default state). Rhythm + hierarchy change, not new features. Full spec in `docs/design-direction.md`.
- v14 — **Opponent-invite flow (2026-04-28, Module 9)**. Closes the activation loop. When a user logs a freetext-opponent match they can now toggle "Invite to confirm" — the match goes in as `pending_opponent_claim` and we generate a server-signed share link (32-byte base64url token, SHA-256 hashed, 30-day default expiry, single-use). Recipient signs in / signs up, claims the invite, then explicitly confirms or disputes via the existing ActionReviewDrawer. Pre-claim matches don't affect rating, calibration, league standings, or `confirmed_ranked_match_count`. New status: `pending_opponent_claim`. New table: `match_invites` (RLS owner-only, every transition through SECURITY DEFINER RPCs). New route: `/invite/match/:token`. Two new notification types: `match_invite_claimed` / `match_invite_declined`. Full spec in `docs/opponent-invite-flow.md`.
- v13.2 — **Set tie-breaks (2026-04-27, Module 7.8)**. The log-match flow now collects the inner tie-break score (7-4, 8-6, 10-8) on any 7-6 / 6-7 set. Required for ranked + completed; tolerated for casual / time-limited. Tie-break details round-trip through dispute / counter-proposal flows, render with a small superscript on the loser's cell in the feed, and don't inflate `games_won` in league standings. Full spec in `docs/trust-and-ranking-rules.md` v8.2.
- v13.1 — **Match-format weight (2026-04-27, Module 7.7 supplement)**. One-set ranked is now valid + rating-eligible at 0.60×; best-of-3 in 2 sets = 1.00×; in 3 sets = 1.10×; with super-tiebreak final = 0.85×. Encourages quick rallies as legitimate signal without making them feel as decisive as a full 3-setter. UI shows the reduced-weight notice in ScoreModal; the rating info modal explains the table.
- v16 — **Player Trust & Reliability foundation (2026-04-30, Module 10 Slice 1)**. New background trust/reliability/confidence layer with positive-only public surfaces. Two new tables — `player_trust_profiles` (server-owned aggregate cache, RLS to self) and `post_match_feedback` (private feedback, RLS to reviewer). Two new SECURITY DEFINER RPCs — `submit_post_match_feedback` (user-callable, eligibility-gated) and `recalculate_player_trust_profile` (private, fully derived, idempotent). Four AFTER triggers fan recalc out from source-of-truth state changes (match_history / challenges / match_invites / post_match_feedback) — all exception-wrapped so trust math can never block a match-truth write. Public-readable `player_trust_public` view returns ONLY `public_badge` + `confidence_level` + counts; numerical scores never exposed to other users. **No new loops, no notification noise — this is a quality-of-presence layer for the existing primary loop.** Slice 1 ships data model + recalc + docs only; Slice 2 will add the feedback prompt UI, badges in profile/feed, and Discovery boost. Full spec: `docs/player-trust-and-reliability.md`.
- v15.1 — **Casual-match heads-up (2026-04-29, Module 9.1.5)**. Closes the trust gap on linked-opponent casual matches. Today casual matches with `opponent_id` set auto-confirm and never notify the opponent — a friend could log fake casual matches against you and you'd only discover them via feed scroll-by. New `casual_match_logged` notification type fires from the same `useMatchHistory.submitMatch` path that fires `match_tag` for ranked rows, gated by `matchType === 'casual' && opponentId && !inviteFlow`. Activity-bucket informational (urgency 35, below `match_confirmed`); soft "View in feed →" CTA via existing `goFeed` deep-link. Push-worthy under `match_updates` category. SQL: emit_notification accepts the new type with a tighter standing rule than match_tag (caller=submitter, recipient=opponent_id, match_type='casual'); cleanup trigger + orphan sweep extended to drop the type when the parent match goes terminal. No dispute affordance in V1 — recipient can void through the existing FeedCard flow if needed. Full spec: `docs/notification-taxonomy.md` v7.
- v15 — **Log Match composer redesign (2026-04-28, Module 9.1)**. Restructured the 1030-line ScoreModal into a slim shell (~290 lines) + four focused body components: `MatchupHeader.jsx`, `OpponentPicker.jsx`, `ScoreboardInput.jsx`, `MatchComposer.jsx`. Score is now the visual hero (was 9th of 14 sections, now 2nd of 11) — actual scoreboard layout with players-as-rows × sets-as-columns. Three behaviour shifts on top of the structural lift: (1) **Score-derived winner** — manual Win/Loss buttons hide when the score is unambiguous + completed; the outcome strip shows "You win — 6-3, 6-4" and the result auto-syncs. Manual buttons stay for retired / time-limited / tied / empty. (2) **OpponentPicker 3-state UX** — input → friend chip ("VERIFIED", accent) → freetext chip ("WILL NEED INVITE", muted) with explicit commit on Enter / freetext-row tap; mid-typing never triggers chip mode. (3) **Contextual CTA copy** — `computeCtaLabel()` derives the save-button label from saving / resubmit / tournament-slot / casual+freetext+invite / casual+linked / matchType so it always says what tapping it will do. Date / venue / court are now collapsed behind "+ Add details" by default (auto-opens when a non-default value is present, e.g. resubmit). Validator + state shape + every existing flow (resubmit, invite, league, challenge-conversion, tournament) unchanged. Full spec in `docs/design-direction.md` "Log Match flow" section.
- v13 — **CourtSync Rating foundation (2026-04-27, Module 7.7)**. Onboarding step 1 now drives `initialize_rating(p_skill text)` — the user's skill choice maps to one of six band starts (800 / 1000 / 1200 / 1400 / 1600 / 1800) instead of the flat 1000-for-everyone seed. New "calibration" period of 5 confirmed ranked matches with K = 40 / 32 / 24 (replaces the old 20-match settled period at K = 32 / 16). Heroes display "COURTSYNC RATING" with a `(i)` icon that opens the 10-section RatingInfoModal. Profiles display a "Calibration X / 5" badge while provisional. Skill-level field auto-locks once a user plays a confirmed ranked match; SettingsScreen surfaces the lock with "WHY LOCKED" copy. New users can't log ranked matches until they've initialised their rating (uninitialised submissions return `error: 'rating_uninitialised'`). Naming rule: never call this UTR or imply a federation ranking. Full spec in `docs/trust-and-ranking-rules.md` v8.
