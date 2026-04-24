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

### Match weight has two settings — and only two
Every logged match carries an explicit `match_type`:
- **Ranked**: this counts. Affects Elo, leaderboard, ranked W/L. Requires a linked opponent and confirmation. The identity story.
- **Casual**: this happened. Lives in feed/profile/history but never moves a stat. The bootstrap path.

Casual exists so first-time users don't bounce off the friction of "my opponent isn't on CourtSync yet." Ranked is the primary product loop. The line is hard-coded at the DB layer — `apply_match_outcome` short-circuits for casual matches, so no client path can accidentally bump Elo on a non-ranked match. See `trust-and-ranking-rules.md` → "Match types" for the implementation.

### What we are explicitly NOT building
- **A full booking platform.** No court reservations, no timeslot commerce, no payment flows. Two surfaces reinforce this line:
  - The **challenge surface** (Mikey Module 4) is intentionally just a notification + freetext venue / time / message — not a booking product.
  - The **Map tab** (Mdawg Map workstream) lists public courts but does not book them — it's a *discovery* surface, not a *reservation* surface. Tapping a court opens an info card that **links out** to Google Maps and (where verified) the operator's own booking page; CourtSync never processes the booking itself.
- **Venue operations.** Not a tool for clubs to manage their members or courts.
- **Tournament operations.** The tournament surface we have is intentionally minimal; we're not competing with Matchtag / PlayByPoint on ladder ops.
- **A generic chat app.** DMs exist to support rematch coordination and light banter between friends — they are not a messaging product on their own. Challenges deliberately don't have a comment thread; if users want to negotiate, they DM.

## Design / Decision Principles

These are the three locked product lenses (also in `CLAUDE.md`). Every feature passes all three or doesn't ship:

### 1. The Cold Start Problem — density over scale
Build for local density first. A feature that helps 100 players in Bondi find each other beats a feature that scales to 100k users nationally. We are in atomic-network mode.

### 2. Hooked — design the loop
For every feature: trigger → action → reward → investment. Prioritise notifications as triggers, one-tap actions, visible stat/profile deltas as rewards, and actions that make the app more valuable next time. If a feature has no obvious re-entry hook, explain why before building.

### 3. The Mom Test — instrument, don't guess
Every meaningful module ships with event tracking so we can learn from real behaviour. No feature is "done" without at least one measurable outcome. Self-reported UX is lying UX — we need the data.

**How we instrument (from Module 3.5):** a single `public.events` table, a client-side `track(name, props)` helper (fire-and-forget, never blocks UX), and the event registry in `analytics-events.md`. Every new module adds its events to that registry in the same commit as the code. Reads are service_role only — nobody browses other users' behaviour in-app.

## Key trade-offs already made (and why)

| Decision | Rejected alternative | Reason |
|---|---|---|
| Friend graph is **mutual** (accepted friend_request = connection) | Asymmetric follow (Twitter-style) | Tennis is played *between* two people. Mutual-confirm matches the domain; one extra table + RLS channel wasn't worth it yet. |
| Only **confirmed** matches affect stats | All logged matches count | Integrity > data volume. A product that says "verified identity" must enforce that via the stat math. |
| **Casual** matches allowed (freetext opponent) but can't earn stats | Require all matches to be ranked | Lowers friction for onboarding and off-platform opponents; preserves the identity bar for ranked stats. |
| **Local-first suburb** matching | National / interest-based discovery | Density beats reach at this stage. |
| **Non-blocking toast** for mutation errors / success | Native `alert()` (legacy) | Module 6 shipped this — no more modal alert that interrupts the flow. Tap-to-dismiss; auto-clears. |

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
- v0 — initialised from shipped state at end of Module 3.
- v1 — Module 3.5 (analytics foundation). Added the "how we instrument" note under the Mom Test lens.
- v2 — Module 4 (challenge / rematch). Sharpened the "NOT building" section: challenge is the lightweight coordination surface, not a booking product or chat thread.
- v3 — Module 6 (polish): toast system replaces blocking alerts in the tradeoffs table. Adjusted to reflect shipped state.
- v4 — Map tab (Mdawg workstream): added as a second reinforcement of the no-booking line — map surfaces public courts but links out to Google Maps / operator sites; CourtSync never processes bookings. CourtInfoCard exemplifies this pattern.
- v5 — **Operator deep-link policy** (documented after a user question about Jensens Tennis links). CourtSync may link out to any operator's public booking URL — same legal posture as an ordinary hyperlink. Rules: (a) public URLs only, no scraping, no content embedding, no auth bypass; (b) nominative venue-name use only (we identify the venue, we don't imply partnership); (c) one operator per court gets the primary bookingUrl — prefer the operator's own direct booking engine over aggregator pages when both exist; (d) **no monetization via these links ever without a signed commercial deal with the operator** — no affiliate codes, no revshare, no tracking pixels. The moment any revenue flows the posture changes from hyperlink to commercial relationship and we'd need terms from every listed operator. Keeping the product strictly link-out-only keeps us inside the same legal box we've been in since day 1.
- v6 — **Map pivot (2026-04-25)**. Product frame sharpened after a user conversation: CourtSync is a spatial matchmaking + messaging product, not a structured-commitment product. Tindis (match pacts) was shipped as an experiment in structured coordination (proposed → confirmed → booked → played state machine with optional cost split). User feedback and team debate concluded that: (a) tennis coordination already happens in messaging — forcing users into a pact state machine is friction without a matching reward; (b) the *discovery* problem (finding the right person who plays where you do, at a time that overlaps yours) is the actual unsolved need; (c) map-centric matchmaking with one-tap DM prefill serves that discovery loop more honestly than a pact lifecycle. **Consequence**: Tindis tab hidden from nav in Phase 0. /tindis route still resolves so existing notification deep-links + bookmarks don't 404. match_pacts DB schema, RLS, RPCs (claim_open_pact, sweep_stale_pacts), and usePacts hook all STAY — no migration, no deletion. Future phases move pact creation into the map (click court → prefill venue; click player → prefill partner → DM composer with proposed slot + template picker). Structured pact rows become opt-in power-user behaviour rather than the primary coordination surface. **No monetization line is crossed** (v5 rule still applies — no affiliate links, no revshare, app stays strictly link-out-only). **Aha-moment redefined**: no longer "you scheduled a pact"; now "you got a DM thread going with a real player near you about a real court." The core loop is unchanged at its ends — challenge/discover → play → log → confirm → rematch — the middle just stops pretending it needs structured commitment metadata.
- v7 — **Match-type as a column (2026-04-25)**: formalised the ranked-vs-casual rule. Added "Match weight has two settings" section under "What we optimise for". Casual = "this happened", Ranked = "this counts". Enforced at the DB layer via `match_history.match_type` + a gated `apply_match_outcome` RPC, so no client path can accidentally affect Elo on a casual match.
