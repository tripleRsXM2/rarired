# Design Direction

## Purpose

The visual + structural compass for CourtSync. What the app should *feel* like, how each screen is composed, what we're moving away from, and the responsive principles that make it work on mobile + desktop without one being a degraded version of the other.

If a design decision can't be traced to this doc, it shouldn't ship.

## Visual reset (v2)

The first overhaul (slices 1–5) reorganised information architecture but preserved the existing visual primitives: bordered cards, 10–14px rounded corners, 720px center rail, micro-eyebrow labels, conservative type sizing. The result was a tidier dashboard, not a different product. This v2 pass replaces the visual language itself.

### What we are borrowing from Nike NRC / Nike App
- **Display typography carrying the page** — the Hero number is the largest thing on the screen by a wide margin, not a stat tucked in a card.
- **Borderless editorial composition** — content sits on the page, divided by negative space and hairline rules, not boxed cards.
- **Full-bleed visual bands** — one or two moments per surface that break the center rail (typically a near-black band with white type) for emotional emphasis.
- **Restrained color** — the accent appears in 1–2 places per screen at most. The rest of the page is monochrome (black / white / neutral grays). When the accent appears, it has meaning.
- **Generous vertical rhythm** — 64–96px between major sections on desktop, 40–56px on mobile.

### What we explicitly do not copy
- No Nike logos, names, or assets of any kind.
- No imagery scraped or fetched from Nike or any other brand.
- No literal recreation of NRC screens or layouts.
- No copyrighted photography. Premium feel rests on type + spacing + contrast.

### What was wrong with the v1 visual language
- Every section was a bordered card. The page read as "stack of rectangles".
- Theme tokens like `bgCard`, `border`, and `r2:10` were applied to every new component.
- Typography topped out at 38px. The Hero number was bigger than before but still timid for an athletic identity product.
- Every component lived inside the 720px center rail. Nothing escaped it for emphasis.
- Section labels stayed at 11px uppercase tracking — the existing eyebrow micro-label rhythm. Editorial section titles never appeared.
- Spacing was tightened (slice 5A) but never expanded for breathing room.

### New visual principles
1. **Display typography is the chrome.** A hero number set at 88–96px with the right weight and tracking is more "product" than any decorative panel.
2. **Borderless by default.** A card has to earn its border (e.g. a feed item with social actions). The Hero, the week strip, the activity list — all live on the page directly.
3. **Full bleed for emotion.** One or two sections per surface escape the center rail and use a near-black band with white type. Sparingly used.
4. **Restraint with the accent.** Accent green appears in maybe two places per screen — the primary CTA and the form-W chip. Everything else is ink black, neutral grays, and white.
5. **Hairline dividers, not boxes.** When sections need separation, a 1px rule does it. Not a border, not a card.
6. **Generous vertical rhythm.** Empty space communicates intention. Cramped layouts read as "SaaS dashboard"; spacious layouts read as "product I want to open".

### New typography principles
- **Display** — the hero metric. 80–96px desktop, 56–72px mobile. Weight 800. Tight tracking (-1px or tighter). `font-variant-numeric: tabular-nums`.
- **Section title** — editorial section header. 22–28px desktop, 20–22px mobile. Weight 700. Used instead of the legacy 11px uppercase eyebrow when the section deserves emphasis.
- **Eyebrow** — kept for true micro-labels (caption text under a number). 10–11px, weight 700, uppercase, 0.08em tracking.
- **Body** — 14–15px desktop, 14px mobile. Weight 500.
- **Caption / meta** — 11–12px, weight 500, textTertiary.

### New spacing principles
- **Major sections**: 64–96px between them on desktop, 40–56px on mobile.
- **Inside a section**: 16–24px between blocks.
- **Inside a row** (e.g. a feed list item): 8–12px.
- **Above-the-fold mobile**: ONLY the Hero (greeting + number + form chips + primary CTA). Everything else is below the fold.
- **Above-the-fold desktop**: Hero + the first hairline + the start of the next section.

### New card / section principles
| Treatment | Used for | Rules |
|---|---|---|
| Borderless section | Hero, week strip, activity list, league band | No border. No background fill. Lives on the page background. Optional hairline rule above or below. |
| Full-bleed band | League moment, future "Today" prompt | Escapes the center rail. Near-black background (`#0A0A0A`). White type. Constrained inner content (max-width 720). |
| Card with border | Feed-item with social actions, ScoreModal body, modals | Earns its border because it has its own internal interactivity. Stays bordered. |
| Hairline divider | Section separator within a constrained block | 1px solid `t.border`, full-width-of-the-rail. Used instead of a card boundary when both sides of the rule belong to the same conceptual flow. |

### Desktop vs mobile rules (v2)
**Mobile (<1024px)**
- Hero greeting at 28–32px, hero metric at 56–72px.
- Single column. No center rail constraint at the page level — sections opt-in to constrained vs full-bleed.
- One primary CTA per screen, generous tap target (≥44px height), centered or left-aligned with the metric.
- Activity preview is max 3 rows, not 5. The full feed lives one tap away.

**Desktop (≥1024px)**
- Hero greeting 32–36px, hero metric 88–96px.
- Constrained sections wrap at 720px with 24–32px horizontal padding.
- Full-bleed bands extend the full width of `cs-center-col` (between sidebar and right-panel).
- More vertical rhythm than mobile — 96px between major sections instead of 56.

### Screens that need the biggest visual reset (in order)
1. **Home** — currently the worst offender (stack of cards). Single biggest before/after impact.
2. **Profile** — close second; ProfileHero and the leagues strip can adopt the same editorial language.
3. **Log Match** — modal can be cleaner (display-sized score input, less form-feel).
4. **League detail** — standings table is fine; the retention cards above can adopt editorial framing.
5. **Feed (full view)** — borderless list with hairlines instead of bordered cards. FeedCard stays cardlike for the social-action context, but row spacing in the list view tightens.

This v2 pass starts with **Home only** and stops there. Verification on a real device decides whether to roll the same language out to Profile / Log Match / League / Feed. We do not ship the same mistake of "redesign everything in one uncontrolled pass."

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
- v1 (2026-04-25) — **Slice 1 (Home) shipped.** `HomeHero`, `HomeNextAction`, `HomeLeaguesStrip` landed; `NextChallengeBanner.jsx` retired. Feed is now condensed to 5 cards by default with an inline "See all" expand. The generic "+ Log match" header CTA is replaced by a contextual `HomeNextAction` card (priority: dispute → pending confirmation → next accepted challenge → log-a-match default). League rank-moved priority deferred (needs per-match Elo snapshot deltas — see open question #2). **Slice 2 (Profile) shipped:** shared `ProfileHero` (own + public), `ProfileRivalry` highlight (≥3 plays vs same linked opponent), reuses `HomeLeaguesStrip` on Profile, `ProfileStatsAccordion` (default-collapsed) replaces the legacy Ranking + Achievements card AND the 4-col quick-stats strip AND the 2x2 Performance grid. Single trust pill replaces the row of three (provisional state takes precedence; confirmation rate moved into the accordion). **Slice 3 (Log Match finish-moment) shipped:** new `MatchFinishMoment` component renders inside ScoreModal for ~1.5s after a successful save, then auto-dismisses and the modal closes. Two states: confirmed (casual — green check + Won/Lost pill + "Match logged") and pending_confirmation (ranked — orange clock + "Sent for confirmation · once <opponent> confirms, this counts toward your rank"). Resubmit path uses the same moment. No ranking-point delta is shown — open question #2 (per-match Elo snapshots) remains the gating work for that. **Slice 4 (League surfaces) shipped:** `LeagueDetailView` becomes a retention surface with three new beats — (a) standings rows show a `+N` "this week" pill computed from points earned in the last 7 days from `detail.recent` (uses each league's own win/loss point scheme; works for casual leagues too), (b) `LeagueNextOpponent` card surfaces the most-overdue league member to challenge (prefers never-played, then longest-gap; respects `max_matches_per_opponent`), (c) `LeagueRivalryCallout` surfaces the closest H2H within the league (≥2 matches, within 1 of being tied; tone is orange/red/green based on whether the viewer is tied/behind/ahead). Both retention cards reuse the existing `openChallenge` composer with appropriate analytics intents (`league_next_opponent`, `league_rivalry`). True rank-delta arrows on standings remain deferred behind the per-week snapshot question (#2). **Slice 5 (Feed polish) shipped:** mobile-only vertical-spacing tighten on FeedCard via three new utility classes (`.cs-feed-card`, `.cs-feed-card-header`, `.cs-feed-card-footer`) — desktop ≥1024px keeps the previous rhythm. Subtle accent "Rivalry" pill on FeedCards where the viewer has played the other side ≥5 confirmed times (computed once at HomeTab level via a memoized `viewerRivalsSet` and threaded through `feedCardProps`); third-party matches in friends' feed don't qualify because viewer-side history can't classify pairs the viewer isn't in. The "See all matches → full feed view" affordance from the original spec was already covered by slice 1's inline-expand toggle on Home; a dedicated `/feed` route stays an open question (no concrete value yet beyond the inline expand).
