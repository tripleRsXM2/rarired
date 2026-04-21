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
3. **Dispute loop** (edge case but critical for trust) — submitter logs → opponent disputes with correction → submitter accepts or counters → resolution → stats fire. Without this loop reliable, the whole ranking trust story collapses.
4. **Reminder loop** — pending match, <24h to expiry → reminder notification → opponent confirms → loop completes. Rescues matches from silently expiring.

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

## Design / Decision Principles

1. **The loop closes in minutes, not days.** Log → tag → confirm should be able to complete in a single sitting if both parties are online. The 72h window is a fallback for real life, not the intended pace.

2. **Every action produces visible feedback within 300ms on the actor's screen.** Optimistic updates + rollback on failure (Module 0). This is why a laggy confirm button is such a trust killer.

3. **Every meaningful event generates exactly one notification to exactly one recipient.** The notification is the re-entry point. No event without a notification means a broken loop arrow. No duplicate notifications for the same event.

4. **Notifications deep-link to the object, not a list.** Tap "match disputed" → opens the review drawer on *that* match, not the feed. (Module 3.)

5. **Self-service first.** A user never needs to contact support to resolve a match state. Dispute / counter / void / accept all live on the card itself.

6. **Casual path exists for bootstrap, not as a parallel product.** Casual matches keep new users from bouncing off the friction of "my opponent isn't on CourtSync yet." But casual matches don't earn stats, so the ranked path remains the identity story.

## Key product metrics tied to the loop

These are the metrics we should measure once the analytics foundation (Module 3.5) lands. Hypotheses first — numbers to validate them later.

### Activation
- **Time from signup to first match logged** (target: <7 days median).
- **% of signups that log a match within 14 days** (target: >50%).
- **% of first matches that are ranked (linked opponent)** vs casual (target: >30% ranked).
- **% of ranked matches confirmed within 72h** (target: >70%).

### Retention
- **% of users who return on Day 1 / Day 7 / Day 30** after signup.
- **Session frequency** — sessions per active user per week.
- **Return-after-notification rate** — % of notifications that result in an app open within 24h of delivery.

### Loop health
- **Median time from match-log → confirmed** (target: <24h for ranked).
- **Dispute rate** — % of ranked matches that enter `disputed` or `pending_reconfirmation`. (Too high = trust issue; too low might mean confirmations are rubber-stamped.)
- **Expiry rate** — % of pending matches that hit 72h without confirmation (target: <20%).
- **Repeat-opponent rate** — % of confirmed matches where both players have played each other before (proxy for rivalry / density).

### Density
- **Ratio of ranked matches to total matches** (up-and-to-the-right over time).
- **% of feed cards that belong to a friend** (vs yourself-only feed).
- **Friends per active user** (distribution, not mean).

### Social reward
- **Average likes per confirmed match** among friends.
- **Average comments per confirmed match.**
- **Tap-through rate on `like` / `comment` / `match_confirmed` notifications.**

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
- v0 — initialised from shipped state at end of Module 3. Metrics section awaits Module 3.5 (analytics foundation) to become real numbers instead of hypotheses.
