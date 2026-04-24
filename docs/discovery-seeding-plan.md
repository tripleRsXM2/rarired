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

### Location rule (v1.3 — home-zone-only)

**Home zone is now the sole declared location signal.** The freetext `profiles.suburb` field is no longer a user input — it's been replaced in the Edit Profile form with a dropdown of the six zones that writes `profiles.home_zone`. The `suburb` column is preserved in the DB so existing data isn't lost, but nothing writes to it going forward and nothing reads from it for new users.

Display rule (unchanged): the subtitle under a user's name is their **home zone** name when set, falling back to suburb for legacy profiles, else blank.

**Implication for discovery:** `useSocialGraph.fetchSuggestedPlayers` still queries by suburb exact-match, which won't find matches for new users. This needs to be switched to home-zone matching in a follow-up — "Players near you" becomes "Players in your zone" (same UX intent, different column). Until then, the played-opponents and same-skill discovery sections still work; the suburb section silently returns empty for new users.

### Map tab (Module 4) — zone-based spatial discovery

A fourth top-level surface. Full-bleed Leaflet map of Sydney divided into **six hand-curated matchmaking zones** (CBD, East, Inner West, Lower North Shore, Northern Beaches, South/Bayside). Each zone:

- Renders as a colored polygon on a Carto basemap
- Lists its curated public / bookable tennis venues (~27 real courts)
- Surfaces "Players here" — anyone who has declared this zone via `profiles.home_zone`

Tapping a court marker opens a **CourtInfoCard** modal with the court name, suburb, zone, court count, and two outbound links: a "Book a court" button for venues where we have a verified booking URL, and a "View on Google Maps" link for everything else. No imagery is embedded — operator photos aren't licensed to us, so we link out rather than host.

Tapping a zone opens a right-hand side panel with the zone name + blurb, courts nearby (count + list), and players in the zone. Two actions:
- **Set as home area** — writes `profiles.home_zone`. The map then draws a home pin on that zone and the user is listed in that zone's "Players here" section. Toggleable from the same button (switches to "Clear") and from Settings → Home zone.
- **Browse players here** — routes to the existing People / Discover surface for now (zone-filtered Discover is deferred).

Why zones instead of real suburb boundaries: zones are a compression layer between the brittle `profiles.suburb` field (every user types differently) and a map surface that needs a small, memorable set of regions. Six zones are the right count — readable, each has recognisable landmarks, aligned with how Sydneysiders already talk about the city.

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
- v1 — Module 6 (polish, Mikey): suburb match upgraded to case-insensitive + trimmed via `ilike`. Partly superseded by the home-zone migration below — kept in place for legacy `profiles.suburb` rows.
- v2 — Map tab (Mdawg workstream): added the zone-based spatial discovery surface, `profiles.home_zone`, and the home-pin interaction.
- v2.1 — avatar upload + location display rule: `profiles.avatar_url` + `avatars` storage bucket; name subtitle prefers home-zone over suburb everywhere.
- v2.2 — CourtInfoCard: tapping a court marker opens an info modal that links out to Google Maps and (where known) the operator's own booking page. No embedded imagery. Street-name labels removed from map base tiles.
- v2.3 — Suburb removed as a user-facing input; Edit Profile now uses a home-zone dropdown. `profiles.suburb` retained in DB for legacy data only. **Open follow-up**: `fetchSuggestedPlayers` still queries `suburb` via `ilike` — needs migrating to `home_zone` matching for the Discover surface to benefit from the zone model. Tracked as a known gap here.
- v2.4 — **Map activity signal**. The map now surfaces *where the game is actually happening*, not just where people have claimed home. A 7-day confirmed-match count renders as a 🔥 flame badge on each zone label and as a third stat column in the side panel. `CourtInfoCard` adds a "Recently played here" section (up to 6 players from the last 60 days) with a one-tap Challenge CTA per row, wiring the map directly into the challenge composer. Service layer adds `fetchZoneActivity` + `fetchRecentPlayersAtCourt` in `map/services/mapService.js`; match→zone mapping keys off the curated courts list (court-name text match) because `match_history.venue` is free text today. A proper `court_id` column is explicit future work. Full analytics suite landed with it (see `analytics-events.md` v3): `map_opened`, `zone_selected`, `court_opened`, `home_zone_set`, `home_zone_cleared`, `profile_opened_from_map`, `challenge_from_map`. Hypothesis: map-viewers send challenges at ≥ 2× the rate of non-viewers; will measure on the new events.
