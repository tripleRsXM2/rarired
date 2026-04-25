# CourtSync — Claude Project Context

## Product compass — read these, don't duplicate them here

The product rules live in `/docs/` and are the source of truth. Do not paraphrase them in this file — re-read the relevant doc when a question arises:

| Concern | Doc |
|---|---|
| What CourtSync is / isn't, scope, tradeoffs | `docs/product-principles.md` |
| Match validity, confirmation, dispute, void, ranking | `docs/trust-and-ranking-rules.md` |
| Primary loop, activation, retention triggers, metrics | `docs/core-loop.md` |
| Notification types, triggers, deep-links, copy | `docs/notification-taxonomy.md` |
| Local discovery, atomic network, invite flow | `docs/discovery-seeding-plan.md` |
| Tracked events + props + loop-stage mapping | `docs/analytics-events.md` |
| Visual / structural design rules | `docs/design-direction.md` |

Headline rule (everything else flows from this): **CourtSync is a verified social tennis identity product first, lightweight coordination second.** Never let scheduling/coordination tooling bleed into the design.

Three locked product lenses applied to every change: **(1) cold-start density** over scale, **(2) Hooked loop** trigger→action→reward→investment, **(3) Mom-test telemetry** — every meaningful module ships with at least one tracked event.

## Working process per module

1. State which `/docs/` files this change touches and what product rule (if any) is changing.
2. Implement.
3. Update the affected docs in the same commit.
4. Summarise: code changes + product-rule changes + docs touched + open questions.

## Icon rule (locked — never regress)

**No emoji as icons.** Every UI affordance uses an SVG line-art icon with `stroke="currentColor"`, `strokeWidth="1.5"`, 18×18 viewBox.

- Shared set: `src/lib/constants/navIcons.jsx` (`NAV_ICONS.home`, `.map`, `.tournaments`, `.people`, `.profile`, `.admin`, `.notifications`, `.rematch`, …).
- Feed-local: `src/features/home/pages/HomeTab.jsx` `ICONS` (`like`, `likeFilled`, `comment`, `rematch`, `share`, `tennisBall`).
- Add to one of those sets — never inline a one-off SVG, never reach for emoji.
- Exception: large decorative hero illustrations inside empty-states (e.g. 🎾 in "no matches yet") at 28px+ are OK as illustration.

## Git Workflow

### Branch ownership
- **`Mikey` / `Mikey/<feature>`** — your branches. All Claude work goes here.
- **`Mdawg` / `Mdawg/*`** — the other developer's branches. **Never touch — not checkout, not merge, not push.**
- **`main`** — shared production. Only merge in when explicitly instructed.

### Rules
- Never push directly to `main` unless the user explicitly says to.
- Pull latest `main` before starting new work.
- One feature per branch: `Mikey/<feature-name>`.
- When merging `main` into a feature branch and conflicts arise, keep `main`'s version unless told otherwise.

### Standard flow
```bash
git checkout main && git pull origin main
git checkout -b Mikey/feature-name
# … work + commit …
git checkout main && git pull origin main && git checkout Mikey/feature-name && git merge main
git push origin Mikey/feature-name
# Merge to main only when instructed:
git checkout main && git merge Mikey/feature-name && git push origin main
```

## Tech Stack

- **Framework**: React 18 + Vite
- **Backend**: Supabase (Postgres, Auth, Realtime, Storage)
- **Styling**: Inline styles with theme tokens (`t` passed as prop everywhere); no CSS framework
- **State**: Local React state + custom hooks (no Redux/Zustand)
- **Deploy**: Vercel

## Key Infrastructure

- `src/lib/supabase.js` — Supabase client singleton (import this, not the raw package)
- `src/lib/db.js` — Shared db helpers (`fetchProfilesByIds`)
- `src/lib/theme.js` — `makeTheme(name)` returns all design tokens
- `src/app/App.jsx` — Root; owns all hooks, wires them into pages via props
- `src/app/providers.jsx` — Global CSS / keyframes injected via `<style>`

## Supabase CLI access

Personal access token at `~/.supabase/access-token` (`chmod 600`, never commit, never echo).

```bash
SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase/access-token)" /tmp/supabase db query --linked -f path/to/file.sql
```

Project linked already (ref `yndpjabmrkqclcxeecei`). Prefer `db query --linked -f <file>` over `db push --linked` (the latter re-runs untracked older migrations).

## Coordinator Pattern

`App.jsx` uses a `coordRef` to break circular hook dependencies — auth callbacks call `coordRef.current.bootstrap(user)` so they reach hooks declared after `useAuthController` without stale closures.

```js
var coordRef = useRef({});
// after all hooks declared:
coordRef.current = { bootstrap, reset };
```

## Key custom hooks (all in `src/features/`)

| Hook | Owns |
|---|---|
| `useAuthController` | session, sign-in/out lifecycle |
| `useCurrentUser` | profile load/save/draft |
| `useMatchHistory` | match history, tag flow, friends-feed RPC |
| `useSocialGraph` | friends, requests, blocks, search |
| `useDMs` | conversations, messages, realtime |
| `usePresenceHeartbeat` | heartbeat to last_active |
| `useNotifications` | notification list, realtime |
| `useTournamentManager` | tournament CRUD, draws, results |
| `useLeagues` | league memberships, standings, detail cache |
| `useChallenges` | challenge proposals, accept/decline |

## Realtime subscriptions

- `useNotifications` — `notifications` (INSERT, filter `user_id`)
- `useSocialGraph` — `friend_requests` (INSERT, filter `receiver_id`)
- `useDMs` — `direct_messages`, `conversations`

## Supabase tables (key ones)

- `profiles` — name, avatar, skill, suburb, ranking_points, privacy, last_active, show_online_status, show_last_seen
- `match_history` — score/status/tags + `match_type` (`'ranked'` vs `'casual'`) + `league_id`
- `friend_requests` — sender_id, receiver_id, status (pending/accepted/declined)
- `blocks` — blocker_id, blocked_id
- `direct_messages`, `conversations`
- `notifications` — type, from_user_id, entity_id, metadata jsonb, read
- `leagues`, `league_members`, `league_standings`

RLS notes: `match_history.match_select` policy is tight (`auth.uid() IN (user_id, opponent_id)`). Cross-RLS reads (e.g. friends' matches the viewer isn't in) go through `SECURITY DEFINER` RPCs like `fetch_friends_matches`.

## Presence system

- `usePresenceHeartbeat` pings every 60s while tab visible
- `presenceService.getPresence(profile, viewerIsSelf)` → `{dot, label, online, hidden}`
- Online = <5 min since last_active; away = <30 min
- `profile.show_online_status` hides dot, `profile.show_last_seen` hides last-seen label

---

## Architecture rules

### Folder structure

```
src/
  app/        App.jsx, providers.jsx
  assets/
  lib/        supabase.js, db.js, theme.js, utils/, constants/
  components/ui/   (generic, presentation-only primitives)
  features/<domain>/
    pages/        components/        hooks/        services/        utils/
```

Domains today: `admin`, `auth`, `challenges`, `home`, `leagues`, `map`, `notifications`, `pacts`, `people`, `profile`, `scoring`, `settings`, `tournaments`.

### Placement rules

1. Organise by feature/domain, not by file type.
2. `components/ui/` is for **truly generic** primitives only (Pill, PlayerAvatar, etc.). Domain code stays in its feature.
3. Route-level screens/pages live in the feature's `pages/`.
4. Global infrastructure only in `src/lib/`.
5. Tournament logic stays in `features/tournaments/`. Same for every other domain.
6. Shared avatar/date helpers in `lib/utils/`. Shared UI/domain constants in `lib/constants/`.
7. Do **not** recreate deleted top-level folders: `src/modals`, `src/tabs`, `src/screens`, `src/components/social`, `src/components/tournaments`, `src/components/common`.

### Import rules

1. Prefer local feature-relative imports inside a feature.
2. Don't import from deleted/old paths.
3. Don't duplicate a helper just to avoid an import.
4. Domain-specific utilities/constants stay in their feature folder, not `lib/`.
5. Don't promote something to shared just because two features use it.

### Refactor rules

1. Inspect target files first.
2. Keep diffs minimal — preserve behaviour unless asked.
3. Update imports carefully; don't rename/move unrelated files.
4. If a file should move or the architecture should drift, stop and explain before doing it.

### Before coding — always state

1. Which files will be touched.
2. Where any new files will go.
3. Why those locations match the architecture above.

### Anti-drift rule

If a requested change fits in the existing structure, do it there. Don't create a new organisational pattern without explicit approval.
