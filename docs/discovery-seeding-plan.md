# Discovery and Seeding Plan

## Purpose
The network-density and launch plan. Defines the *atomic network* we need to exist for the product to feel alive, how Discovery behaves at low density, and how we seed the graph to get there. Every feature that touches player search, follows, local discovery, or empty states updates this doc.

## Current State (shipped)

### Atomic network target
A **single Sydney suburb + its surrounding clubs** — approximately 20–50 active players who play each other regularly. Target seed: Bondi + Moore Park + Rushcutters Bay as one dense sub-graph; repeatable pattern for other suburb clusters later.

### Discovery surfaces

Three sources feed the Discover tab (`/people/suggested`), stacked in this order:

1. **People you've played** — derived in `useSocialGraph.loadPlayedOpponents(history)` from the viewer's own confirmed match history. Returns up to 8 unique opponent IDs (most recent first), minus friends / pending / blocked / self.
2. **Players near you** — `fetchSuggestedPlayers(userId, suburb, excludeIds)` — exact match on `profiles.suburb`. Limit 6.
3. **Similar skill level** — `fetchSameSkillPlayers(userId, skill, excludeIds, 6)` — exact match on `profiles.skill` ("Intermediate" / "Advanced" / etc.). Excludes IDs already surfaced by the suburb query.

All three queries filter out the viewer's existing friends, pending requests, and blocked users.

### Search

`searchProfilesByName(userId, query)` — server-side `ilike('name', '%q%').neq('id', userId).limit(10)`. Debounced 400ms on input. Dropdown surfaces name, suburb, skill; clickable rows jump to profile; inline Add button for non-friends.

### Feed discovery widget

At the bottom of the Home feed, a live mini-widget surfaces up to 3 players with inline Add / Pending / Friends pills and a "See all →" deep-link to `/people/suggested`. Prefers played-before opponents; falls back to suburb-matched suggestions.

### Empty states

- **New user (zero matches, zero friends)** — Home feed: "Nothing here yet" + "Log your first match" CTA. People > Friends: "No friends yet" + "See suggestions" CTA.
- **Friends filter on feed with zero matches from friends** — empty state directs to Discover.
- **Discover with all three sections empty** — single "No suggestions yet. Log a match or check back as more players join your area." state.

### Invite flow

Share-link button on the Discover tab. Uses `navigator.share` when available, falls back to `clipboard.writeText`. URL hard-coded to `https://rarired.vercel.app`.

## Current Product Rule

### Local relevance — what "near" means today

**Case-insensitive, trimmed `ilike` on `profiles.suburb` (Module 6).** Equivalent to exact string match but ignoring case + whitespace, so "Bondi", "bondi", and " Bondi " all match each other. Still does NOT match "Bondi Beach" against "Bondi" — that needs a normalised lookup or alias table, deferred. At seed scale this is enough; real users in a single suburb will converge on the same spelling once the cluster forms.

### How Discovery behaves at low density

Ordered fallbacks:
1. **If you've played matches** — played-opponents section leads. This is the strongest signal (you already know these people IRL).
2. **If no match history** — suburb-based players lead. Still relevant because atomic networks are suburb-local.
3. **If suburb matching finds nothing** — skill-matched players. Weakest signal but non-zero.
4. **If all three empty** — single empty state that directs the user to log a match or invite a friend.

A user should never see "no players in your area" without at least a suggestion to create one via logging a match or sharing the invite link.

### Discovery rules when the graph is sparse

- **Show freshly-signed-up players prominently.** A profile with 0 matches is still surfaced (they show up in suburb / skill queries). This is intentional — at low density, every new user is a potential opponent.
- **Never surface blocked users.** `blockedUsers` is filtered out in every section and the search dropdown.
- **Never surface the viewer's own pending outbound requests back as "suggestions".** Added to the exclude list in `loadSocial` so we don't look dumb ("Add X" when the user already hit Add).
- **Suburbs are not hierarchical.** "Bondi" does not roll up to "Sydney Eastern Suburbs." If we want cluster-level fallback, that's a new feature.

## Design / Decision Principles

1. **Density beats reach.** 50 people in Bondi who play each other beats 5000 users scattered nationally. Every discovery heuristic assumes this.
2. **The strongest signal leads.** Played-before > same suburb > same skill. Don't dilute by mixing them into a single ranked list; stack them as distinct sections so users understand *why* each suggestion exists.
3. **Trust the graph's self-healing.** When a user adds a friend, they automatically disappear from Discover on next effect fire (`loadPlayedOpponents` re-runs when `friends.length` changes). Don't build cron jobs to maintain discovery freshness — let it fall out of the data.
4. **Invite friction is the main growth lever at seed scale.** Share URL lives on Discover, is one tap, copies to clipboard on fallback. Any further complication (landing pages, referral codes) is out of scope until we have a reason.
5. **Log-a-match is also a discovery action.** At low density, the freetext-opponent path surfaces a new name into your history, which becomes a suggestion the moment that opponent signs up and gets a profile row.

## Initial atomic network plan

The launch target is one dense suburb cluster. Concrete:

- **Cluster 1: Sydney Eastern Suburbs (Bondi / Moore Park / Rushcutters Bay / Rose Bay).**
  - Seed goal: 30 active users with at least 1 confirmed match each, within 4 weeks.
  - Social graph goal: average 5 friends per user, median 3, within 8 weeks.
  - Match goal: ≥50 confirmed matches total in the cluster within 4 weeks.

If the cluster hits those numbers, the model works at scale and we replicate (Cluster 2: Inner West, etc). If it doesn't, we debug the loop — probably activation or confirmation rate — before trying to grow.

## Empty-state strategy (by user state)

| User state | Current empty state | Target behaviour |
|---|---|---|
| Signed up, no profile detail | Onboarding modal | Already handled |
| Profile complete, 0 matches, 0 friends | "Log your first match" CTA on feed | Add: prominent Discover suggestion panel once basic profile is done |
| 1+ confirmed match, 0 friends | Feed shows own matches; Discover widget appears with played-before suggestions | Current behaviour is correct |
| Active, no matches from friends | Friends-filter empty state → Discover CTA | Current behaviour is correct |
| Prolonged inactivity (no signal) | *(none)* | Future: weekly digest or streak-at-risk nudge (Module 6+, not now) |

## Invite / seeding strategy

### What exists
- Single "Share invite link" button on Discover.
- `navigator.share` when supported, clipboard fallback.
- URL points to production root.

### What's missing (but tracked, not built)
- **Referral attribution.** We don't know who invited whom. If growth becomes organic-viral, we'll want this.
- **Invite UX at the activation moment.** After a user's first confirmed match, invite their off-platform opponents? Tempting. Not yet built.
- **Opponent freetext → latent profile.** Currently if I log a casual match with "Sam Williams", Sam has no row anywhere. Should we create a stub? No — would pollute the profile space. Keep freetext as a throwaway label.

## Seed metrics (for Module 3.5 analytics foundation)

Targets for the first atomic network. Once analytics lands, we track these weekly:

- **# of active users in the cluster** (at least 1 session in the last 14 days).
- **# of users with at least 1 confirmed match.**
- **% of users with ≥3 friends.**
- **Matches logged per week in the cluster.**
- **Confirmation rate** — % of ranked matches confirmed within 72h.
- **Repeat-opponent rate** — % of confirmed matches where both players have played each other before.
- **Discover tap-to-follow conversion** — % of profile-clicks from Discover that result in a friend request within 7 days.
- **Feed-to-activation conversion** — % of users who tap the "Log first match" empty-state CTA and follow through.

## Rollout assumptions

- Onboarding is self-serve via the existing auth flow + OnboardingModal. No invite-only gate currently.
- Vercel production at `https://rarired.vercel.app` serves the app globally. No geo-restriction; the local-first story is behavioural (via suburb fields) not technical.
- Supabase project is single-region. Latency acceptable for Sydney.
- Discovery is local by suburb *input*, not by device geo-location. A user lying about their suburb is not a priority abuse vector at seed scale.

## Open Questions

- **Should suburb be normalised?** Fuzzy match, alias table, hierarchical rollup? Current exact-string is simple and working; upgrade when it measurably hurts us.
- **Should we scrape a suburb list from AusPost / external source** and restrict profile suburbs to a fixed dropdown? Would fix the "Bondi" vs "Bondi Beach" issue at the source. Nice-to-have, not urgent.
- **Referral attribution** — which channel brought the user in? Needs an invite link that carries a code. Not built.
- **What's the correct Discover order** at medium density (say 200 active users)? Played > suburb > skill seems right at 50 users; might need re-ranking at 500+.
- **Do we want a "nearby clubs" concept** (profiles.club)? We have the field but no UI surfaces club-matched discovery yet. Worth considering once we have multiple clusters.
- **Friend-of-friend suggestions.** Currently no 2-hop graph surfacing. Would start to matter once average friend count is 10+.
- **Who gets surfaced to whom in the "Players near you" section?** Random within the limit(6) query, no ordering. Could order by recent activity, ranking proximity, or shared friends. Open.

## Out of Scope (for now)

- Geo-IP / device-location based discovery.
- Fuzzy / normalised suburb matching.
- Club hierarchy or club-based admin.
- Referral code / attribution system.
- Friend-of-friend (2-hop) suggestion layer.
- Cross-suburb cluster recommendations.
- Imported contact-list matching ("who's on CourtSync from your phone contacts").
- Any paid-acquisition tooling / tracking pixels.
- Public profile search engine indexing (SEO).

## Last Updated By Module
- v0 — initialised from shipped state at end of Module 3. Seed metrics are hypotheses, will be tracked live once Module 3.5 (analytics foundation) lands.
- v1 — Module 6 (polish): suburb match upgraded to case-insensitive + trimmed via `ilike`. Stops missing the obvious "Bondi" vs "bondi" / trailing-space cases.
