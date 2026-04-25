# Design Direction

## Purpose

The visual + structural compass for CourtSync. What the app should *feel* like, how each screen is composed, what we're moving away from, and the responsive principles that make it work on mobile + desktop without one being a degraded version of the other.

If a design decision can't be traced to this doc, it shouldn't ship.

## Design north star

> **"My tennis world, calm and clear."**

CourtSync is not a list of stuff happening. It's a place where I can see who I am as a tennis player, what's progressing, and what to do next.

We are moving CourtSync from a **functional utility layout** toward a **performance-lifestyle product**.

## Inspiration translation

We borrow from **Nike Run Club / Nike App** the *rhythm* and *emotional feel* — not the visual literalisms. Specifically:
- Personalized landing experience over generic feed
- Strong hero moments at first open
- Visible progress and progression, not buried in stats tabs
- Premium spacing + typography contrast
- Fewer, stronger modules
- Clear single next action per screen

We **explicitly do not borrow from Strava**:
- No equal-weight stacked widgets fighting for attention
- No over-dense above-the-fold layout
- No noisy utility-social grid as the homepage
- No cluttered landing dashboard

## Three product lenses (applied to design)

These extend the existing product principles into visual + structural rules.

### 1. Identity over utility
Every screen leads with **who the user is**, not what they can do. The Hero comes before the action; the action comes before the activity.

### 2. One thing matters most per screen
Each screen has a single hero element, a single primary action, and a single primary metric. Everything else is supporting cast. We resist the urge to make secondary modules visually equal-weight to the hero.

### 3. Calm hierarchy beats density
We use whitespace, typography contrast, and editorial card composition to create rhythm. We explicitly do NOT pack more above the fold. Less above-the-fold + a clear CTA outperforms more above-the-fold every time.

## Screen hierarchy principles

1. **Identity first.** Avatar, name, the one signature metric. Big enough to feel intentional, not decorative.
2. **Progress visible.** Recent form, streaks, league rank, ranking points — surfaced *before* deep stats.
3. **One strong next action per screen.** Contextual to the user's state, never generic.
4. **Fewer, stronger sections.** Three editorial sections > eight equal-weight cards.
5. **Editorial cards over dashboard grids.** A card has one job and tells one story.
6. **Calm hierarchy and whitespace.** Spacing communicates importance.
7. **Retention surfaces feel motivating, not administrative.** Standings show movement, not just a table; rivalries are visible; "next match" is suggested.
8. **Social/feed supports identity, it doesn't overwhelm it.** Feed is a section *within* Home, not the entire Home.

## Top-level information architecture

No route changes. The redesign is structural inside each surface.

| Route | Today | After redesign |
|---|---|---|
| `/home` | Feed-as-home (a list of friend matches with a "+ Log match" header) | **Hero + Next Action + Leagues + Feed (condensed)** |
| `/profile` | Stats dump under a hero header | **Identity hero + signature metric + rivalry + deep stats** |
| `/profile/:id` | Public stats | Mirror own-profile structure with appropriate trust pills |
| `/people/...` | OK structurally | Light density pass |
| `/tournaments/...` | OK structurally | Leagues detail gets the retention treatment |
| `/map` | Map tab | No changes in this overhaul |

## Home screen structure (post-redesign)

Top-to-bottom on every viewport:

1. **Hero** — viewer's tennis identity right now. Big avatar, name, suburb/skill, one signature metric (current ranking), recent form (last 5 confirmed). Premium feel via spacing + typography, not photographic chrome.
2. **Next Action** — single contextual card. Priority order:
   - Match in dispute needing my response (red urgency)
   - Pending match needing confirmation (orange urgency)
   - Accepted challenge with a date in next 14d (accent)
   - League rank moved in last 7d (green positive)
   - Default: "Log a match" (neutral)
3. **Your leagues** — up to 2 active leagues, each showing rank + last result + member count
4. **Friend activity** — condensed feed, max 5 cards, "See all matches" link to the full feed

**Removed from Home:** the "+ Log match" header button (replaced by Next Action's default state — single CTA per screen). The standalone NextChallengeBanner is folded into Next Action (one concept, one component).

## Profile structure (slice 2 — not yet implemented)

Hero on Profile is the crown jewel:
- Big avatar + name + suburb + skill + style pills
- One signature metric (ranking points, prominent)
- Recent form chips
- Trust badge (confirmed count) — single, not a row of three

Below the hero:
- Rivalry highlight (top H2H, last result, "rematch" CTA)
- Active leagues strip (mirrors Home)
- Deeper stats accordion (W/L breakdown, match formats, surfaces)
- Match history (existing ProfileMatchRow, untouched in slice 2)

## Log Match flow (slice 3 — not yet implemented)

Open question. Direction: keep current ScoreModal logic but add a "completion moment" — subtle reveal of stats movement on save. Not a confetti animation; a brief "+12 ranking points" or "your form is now W-W-W-L-W" surface for 1.5s before the modal closes. Goal: make the act of logging feel like an achievement, not a form completion.

## League surfaces (slice 4 — not yet implemented)

Detail view becomes a retention surface:
- Standings table gets "this week" deltas (who climbed/dropped)
- "Next opponent" card suggesting your most-overdue league pair
- Rivalry callout if you have a tied or escalating H2H within the league
- Recent activity stays as-is

## Feed polish (slice 5 — not yet implemented)

Existing FeedCard is the cleanest part of the app already. Polish pass:
- Tighten vertical spacing on mobile
- Possibly add a subtle "rivalry" highlight when it's a match between two players who've played each other 5+ times
- "See all" affordance from Home Feed section to a full feed view

## Card system principles

A card has **one job**. If a card is showing 4 stats + 2 actions + a status pill + a delete affordance + a footer with social actions, it's doing the work of a screen.

| Card type | Job |
|---|---|
| Hero card | Establish identity. One metric. |
| Next Action card | Single CTA, single state. |
| League card | Rank + last result + tap to detail. |
| FeedCard | Match outcome + social interactions. |
| Profile match row | Compact match summary in a list context. |

If a card needs more, it should split into multiple cards or become a screen.

## Spacing + rhythm principles

- **Hero sections:** 24-32px vertical padding. Generous.
- **Module sections:** 14-20px between sections.
- **Cards inside a list:** 8-12px between cards.
- **Inside a card:** content's own internal padding (12-16px), no external margins inside the card.
- **Above-the-fold on mobile:** Hero + Next Action visible. Nothing else needed.
- **Above-the-fold on desktop:** Hero + Next Action + first league card visible.

## Typography hierarchy

Using existing theme tokens. The hierarchy is rhythm-based, not new font sizes:

| Use | Scale |
|---|---|
| Hero title (signature metric) | 32-40px, 800 weight, tight tracking |
| Hero name | 22-26px, 800 weight |
| Section header | 11px, 700, uppercase, 0.07em tracking |
| Card title | 15-16px, 700 |
| Body | 13-14px, 500-600 |
| Meta / subtitle | 10.5-12px, 500, textTertiary |

## Visual tone direction

- **No new colors yet.** Existing theme tokens (accent, green, red, orange, textTertiary) communicate state. Premium feel comes from spacing + hierarchy + content choices.
- **Sharp corners on cards** (continuing the recent direction — `borderRadius: 0` for feed-style cards, `10` for the home-page hero / next action where softness reads as premium).
- **Avatars are the photographic anchor.** The recent avatar plumbing (real `avatar_url` everywhere, deterministic colour + initials fallback) is the closest thing we have to "lifestyle photography" — we lean on that.
- **No icons for icon's sake.** SVG icons are functional (rematch, lock, check, x). Decorative icons are out.

## Responsive principles

Each major screen has a **deliberate desktop layout** AND a **deliberate mobile layout**, not a degraded version of the other.

### What this means concretely

- Mobile is **not** a single column of stacked-everything. Sections that have "list" affordance (leagues, friend activity) use mobile-appropriate patterns: horizontal scroll for leagues, condensed feed for activity.
- Desktop is **not** a wider mobile. Where horizontal real estate is available (≥1440px), the right panel surfaces additional context — but mobile must carry every primary surface in its own column.
- Above-the-fold mobile shows **Hero + Next Action**. That's it. Everything else is below the fold and reachable via scroll.
- Above-the-fold desktop shows **Hero + Next Action + first League card**. Right panel adds context, never replaces center column.

### Breakpoints (existing, unchanged)

- `<1024px` → mobile (single center column)
- `≥1024px` → desktop (sidebar + center)
- `≥1200px` → sidebar shows labels
- `≥1440px` → right panel visible

The redesign respects these. New components on Home are mobile-first, then enhance for desktop.

## What we are moving away from

- Feed-as-home. The feed is one section, not the entire surface.
- "+ Log match" as a generic header CTA. Replaced by contextual Next Action.
- Equal-weight cards. The Hero is visibly dominant.
- 6+ small modules per screen. Three editorial sections.
- The right panel as critical surface that mobile users miss. Right panel is enhancement, not load-bearing.
- Trust signals as a row of three pills. Single trust signal in Hero.
- Form-feel for the Log Match flow. Will gain a finish moment in slice 3.

## What this isn't

- Not a tokens overhaul. We're not introducing a new color palette, new font, or a new icon set.
- Not a backend redesign. All data flows through existing hooks unchanged.
- Not new routes. IA stays the same.
- Not a feature add. Slice 1 ships fewer surfaces visible at once, not more.

## Open design questions

1. **Hero photographic chrome.** V1 has no background photo or lifestyle imagery. If we ever want a Nike-style photo overlay, where does the imagery come from (user-uploaded? abstracted court textures?). Out of scope for now.
2. **Ranking-point delta on Hero.** Requires storing per-match Elo snapshots. Skipped in slice 1; future migration if it becomes valuable.
3. **Rivalry surface on Home vs Profile.** Both deserve it. Slice 1 puts it nowhere. Slice 2 (Profile) probably owns it; if Home ever shows it, it's as a fourth section below leagues.
4. **"Today's plan" Nike-style header.** Tempting but premature. Tennis isn't a daily-mandate sport like running. Hold for V2.

## Last updated

- v0 (2026-04-25) — initial spec for the design overhaul. First implementation slice = Home redesign (Hero + Next Action + Leagues strip + condensed Feed).
- v1 (2026-04-25) — **Slice 1 (Home) shipped.** `HomeHero`, `HomeNextAction`, `HomeLeaguesStrip` landed; `NextChallengeBanner.jsx` retired. Feed is now condensed to 5 cards by default with an inline "See all" expand. The generic "+ Log match" header CTA is replaced by a contextual `HomeNextAction` card (priority: dispute → pending confirmation → next accepted challenge → log-a-match default). League rank-moved priority deferred (needs per-match Elo snapshot deltas — see open question #2). **Slice 2 (Profile) shipped:** shared `ProfileHero` (own + public), `ProfileRivalry` highlight (≥3 plays vs same linked opponent), reuses `HomeLeaguesStrip` on Profile, `ProfileStatsAccordion` (default-collapsed) replaces the legacy Ranking + Achievements card AND the 4-col quick-stats strip AND the 2x2 Performance grid. Single trust pill replaces the row of three (provisional state takes precedence; confirmation rate moved into the accordion).
