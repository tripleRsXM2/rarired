# Product Principles

## Purpose
The product compass. What CourtSync is, who it serves, what we optimise for, and what we refuse to build. Every module, feature, and trade-off must be consistent with this doc.

## Current Product Rule

**CourtSync is a verified social tennis identity product first, and a lightweight coordination product second.**

### Who it's for (first)
- Local recreational and amateur tennis players in Sydney.
- Age roughly 16–45, plays 1–4 times a week, cares about progress.
- People who log their matches want them to **mean something** — they want opponents to verify, stats to move, opponents to become friends, rivalries to build over time.

### What we optimise for (in priority order)
1. **Verified identity** — a profile that represents a real player, with stats only the DB can corroborate.
2. **Social graph density in a small local area** — so when you open the app there's someone you know on the feed.
3. **Lightweight coordination** — just enough to line up another match (rematch, challenge). Not a booking platform.

### What we are explicitly NOT building
- **A full booking platform.** No court reservations, no timeslot commerce, no payment flows. The Map tab (v1 shipped in Module 4) lists public courts but does not book them — it's a *discovery* surface, not a *reservation* surface. This line stays bright.
- **Venue operations.** Not a tool for clubs to manage their members or courts.
- **Tournament operations.** The tournament surface we have is intentionally minimal; we're not competing with Matchtag / PlayByPoint on ladder ops.
- **A generic chat app.** DMs exist to support rematch coordination and light banter between friends — they are not a messaging product on their own.

## Design / Decision Principles

These are the three locked product lenses (also in `CLAUDE.md`). Every feature passes all three or doesn't ship:

### 1. The Cold Start Problem — density over scale
Build for local density first. A feature that helps 100 players in Bondi find each other beats a feature that scales to 100k users nationally. We are in atomic-network mode.

### 2. Hooked — design the loop
For every feature: trigger → action → reward → investment. Prioritise notifications as triggers, one-tap actions, visible stat/profile deltas as rewards, and actions that make the app more valuable next time. If a feature has no obvious re-entry hook, explain why before building.

### 3. The Mom Test — instrument, don't guess
Every meaningful module ships with event tracking so we can learn from real behaviour. No feature is "done" without at least one measurable outcome. Self-reported UX is lying UX — we need the data.

## Key trade-offs already made (and why)

| Decision | Rejected alternative | Reason |
|---|---|---|
| Friend graph is **mutual** (accepted friend_request = connection) | Asymmetric follow (Twitter-style) | Tennis is played *between* two people. Mutual-confirm matches the domain; one extra table + RLS channel wasn't worth it yet. |
| Only **confirmed** matches affect stats | All logged matches count | Integrity > data volume. A product that says "verified identity" must enforce that via the stat math. |
| **Casual** matches allowed (freetext opponent) but can't earn stats | Require all matches to be ranked | Lowers friction for onboarding and off-platform opponents; preserves the identity bar for ranked stats. |
| **Local-first suburb** matching | National / interest-based discovery | Density beats reach at this stage. |
| **Inline alert / native confirm** for mutations | Toast / snackbar system | Minimal UX, correct signal. A proper toast system is a Module 6 polish item. |

## Open Questions

- **Expansion timing.** When do we loosen the Sydney-first constraint? Gated on density signal (e.g. % of matches involving a linked opponent hitting a threshold per suburb)?
- **Asymmetric follow later?** If we ever add pro players / coaches / clubs as followable entities, the mutual-friendship model needs to extend. Tracked but not urgent.
- **Monetisation shape.** Clubs / tournaments / skill-level memberships / premium profile? Not decided. Do NOT let it bleed into design choices until it is.
- **Coach / doubles modelling.** Currently a match has two players. Doubles and coaching relationships are future questions; don't warp the data model for them yet.
- **Verification tiers.** Is there a "verified coach" / "verified club" tier? Open. Out of scope until a concrete partnership asks for it.

## Out of Scope (for now — revisit when explicitly needed)

- Court booking / payment.
- Club-side admin tooling (manage members, courts, events).
- Full tournament bracket ops beyond the current read-mostly surface.
- Push notifications via native/APNS/FCM. (Web + tray only right now.)
- Public profile visibility controls beyond a simple privacy flag. Current assumption: profiles are public.
- Coach / pro tier accounts.
- Integrations with external rating systems (USTA, UTR, NTRP import).
- Translation / i18n. English-AU only for now.

## Last Updated By Module
- v0 — initialised from shipped state at end of Module 3. Future module deltas append here.
- v1 — Module 4 (Map tab): clarified that the map surfaces public courts without booking them — Map is a *discovery* surface, not a *reservation* surface. Line held.
