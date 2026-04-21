# CourtSync — Claude Project Context

## Product Vision (locked — never contradict this)

> **CourtSync is a verified social tennis identity product first, and a lightweight coordination product second.**

Every feature decision, UI trade-off, and prioritisation call must be consistent with this. If a proposed change leans toward heavy scheduling/coordination tooling at the expense of social identity and verification, push back or flag it.

## Product Lenses (locked — apply to all future work)

Every module, feature, and UX choice must pass through these three lenses before shipping.

### 1. The Cold Start Problem
Build for **network density in a small local tennis community first**. Prioritise suburb/club identity, local discovery, people-you-played, rematches, rivalries, and meaningful Friends-feed behaviour. Do NOT optimise for broad generic scale yet. If a feature makes sense only at 100k users but not at 100, it's the wrong feature now.

### 2. Hooked (Eyal)
For every feature, design the loop: **trigger → action → reward → investment**. Prioritise notifications as triggers, one-tap actions, visible profile/stat changes as variable rewards, and actions that make the app more valuable next time (investment). If a feature has no obvious re-entry hook, explain why.

### 3. The Mom Test (Fitzpatrick)
Do not only build UX. Also add **instrumentation so we can learn from real user behaviour**. Track core events, measure drop-offs, and support small experiments. Shipping without telemetry is shipping blind.

## Standing requirements (locked)

- Every module must explain how it improves **density, retention, or learning**.
- Every module must include **analytics/event tracking** if relevant.
- Every module must keep the user journey **lightweight**.
- **Avoid**: broad booking systems, generic messaging platforms. Those are not the product.
- **Optimise for the core loop**: play → log → confirm → profile/feed update → challenge/rematch.

### Icon rule (locked — never regress)

**No emoji as icons.** Every UI affordance — nav buttons, tab pills, inline action icons inside buttons / badges / status strips, notification bells, social footer actions, status indicators — uses an **SVG line-art icon** with `stroke="currentColor"`, `strokeWidth="1.5"`, and an 18×18 viewBox. Colour flows through the parent button's text colour (no hardcoded strokes).

- Shared icon set lives in **`src/lib/constants/navIcons.jsx`** (`NAV_ICONS.home`, `.map`, `.tournaments`, `.people`, `.profile`, `.admin`, `.notifications`, `.rematch`, …). Feed-local icons live in `src/features/home/pages/HomeTab.jsx` under `ICONS` (`like`, `likeFilled`, `comment`, `rematch`, `share`, `tennisBall`).
- If you need a new icon, add it to one of those sets. **Don't** inline a one-off SVG in a component and **don't** reach for an emoji as a shortcut.
- Exception: **decorative hero illustrations** inside empty-state blocks (e.g. a large 🎾 in "no matches yet" or 💬 in "no comments yet") at 28px+ are permitted as illustrations, not icons. When in doubt, use an SVG.

### Pre-module report format (required before starting any module)
1. How this improves local network density
2. How this improves the retention loop
3. What measurable user behaviour should change (hypothesis)
4. What analytics/events are being added (concrete event names)

## Product docs — always kept in sync with code (locked)

Code changes the product. Docs explain the product. Both must stay in sync. A module is **not complete** until the relevant docs are updated.

### Required docs (lives in `/docs/`)

| File | Owns |
|---|---|
| `product-principles.md` | What CourtSync is / isn't. Tradeoffs. Scope boundaries. |
| `trust-and-ranking-rules.md` | Match validity, confirmation, dispute, void, expiry, ranking formula. |
| `core-loop.md` | Primary + secondary loops, activation, aha moment, retention triggers, key metrics. |
| `notification-taxonomy.md` | Every notification type: trigger, recipient, priority, deep-link, copy. |
| `discovery-seeding-plan.md` | Atomic network, discovery behaviour, empty states, invite flow, seed metrics. |
| `analytics-events.md` | Every tracked event: trigger, props, loop-stage mapping, example queries. |

### Doc structure (required for each file)
1. Title
2. Purpose
3. Current Product Rule / Current State
4. Design / Decision Principles
5. Open Questions
6. Out of Scope
7. Last Updated By Module

### Change classification — which doc to update

| If the change touches… | Update |
|---|---|
| Trust, ranking, confirmation, disputes, match validity | `trust-and-ranking-rules.md` |
| The main user journey, onboarding, activation, next-step behaviour | `core-loop.md` |
| App scope, product direction, tradeoffs | `product-principles.md` |
| Alerts, inbox behaviour, deep links, notification copy | `notification-taxonomy.md` |
| Player search, follows, local discovery, empty states, growth assumptions | `discovery-seeding-plan.md` |
| Adds or changes a tracked analytics event (or its props) | `analytics-events.md` |

### Working process for every module
1. **Audit** what already exists.
2. **Classify** which areas the module touches (from the table above).
3. **Before coding**: state which docs will update and what product rule is being introduced or changed.
4. **Implement** the code.
5. **Verify**.
6. **Update** all relevant docs in the *same commit* (or at minimum the same merge).
7. **Summarise** code changes + product rule changes + docs touched + open questions.

### Doc writing rules
- Plain English, not aspirational fluff.
- Opinionated and specific; avoid "we should consider…" hedging.
- Concise and skimmable; prefer product rules over implementation detail.
- Include "Open Questions" when a thing is undecided — don't pretend it's settled.
- Include "Out of Scope" to prevent drift.
- Mark inferred-from-code assumptions clearly.
- Write for a future model to use as a source of truth.

## Git Workflow

### Branch ownership
- **`Mikey` / `Mikey/<feature>`** — the user's branches. All Claude work goes here.
- **`Mdawg` / `Mdawg/<feature>`** — the other developer's branches. **Claude must never touch these under any circumstances.**
- **`main`** — shared production branch. Only merge into main when explicitly instructed.

### Rules
- **Never push directly to `main`** unless the user explicitly says to.
- **Never touch `Mdawg` or any `Mdawg/*` branch** — not checkout, not merge, not push. Ever.
- Always pull latest `main` before starting new work.
- Use a separate branch per feature/fix: `Mikey/<feature-name>`.
- When merging `main` into a feature branch and conflicts arise, always keep `main`'s version unless the user says otherwise.

### Standard flow
```bash
# Start new work
git checkout main
git pull origin main
git checkout -b Mikey/feature-name

# Commit
git add .
git commit -m "Description"

# Sync main before pushing
git checkout main && git pull origin main
git checkout Mikey/feature-name
git merge main

# Push
git push origin Mikey/feature-name

# Merge to main (only when instructed)
git checkout main
git merge Mikey/feature-name
git push origin main
```

## Tech Stack

- **Framework**: React 18 + Vite
- **Backend**: Supabase (Postgres, Auth, Realtime, Storage)
- **Styling**: Inline styles with theme tokens (no CSS framework)
- **State**: Local React state + custom hooks (no Redux/Zustand)
- **Deploy**: Vercel

## Key Infrastructure

- `src/lib/supabase.js` — Supabase client singleton (import this everywhere, not the raw package)
- `src/lib/db.js` — Shared db helpers (`fetchProfilesByIds`)
- `src/lib/theme.js` — `makeTheme(dark)` returns all design tokens; `t` is passed as prop throughout the app
- `src/app/App.jsx` — Root component; owns all hooks and wires them to pages via props
- `src/app/providers.jsx` — Global CSS/keyframes injected via `<style>`

## Supabase CLI access (DB migrations, direct queries)

The Supabase personal access token is stored at `~/.supabase/access-token` (outside the repo, `chmod 600`, never commit).

To apply a migration or run a one-off query:

```bash
SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase/access-token)" /tmp/supabase db query --linked -f path/to/file.sql
```

Project is already linked via `supabase/.temp/linked-project.json` (ref `yndpjabmrkqclcxeecei`, org TripleRs). No need to re-link per session.

**Rules**:
- Never paste or echo the token in any committed file, commit message, or conversation transcript.
- Prefer `db query --linked -f <file>` over `db push --linked` — the latter will re-run any untracked older migrations.
- If the token is ever compromised, rotate it in Supabase Dashboard → Account → Access Tokens and overwrite `~/.supabase/access-token`.

## Coordinator Pattern

`App.jsx` uses a `coordRef` to break circular hook dependencies:

```js
var coordRef = useRef({});
// After all hooks declared:
coordRef.current = { bootstrap, reset };
```

Auth callbacks call `coordRef.current.bootstrap(user)` so they can reach hooks declared after `useAuthController` without stale closures.

## Key Custom Hooks (all in src/features/)

| Hook | Location | Owns |
|---|---|---|
| `useAuthController` | auth/hooks | session, sign-in/out lifecycle |
| `useCurrentUser` | profile/hooks | profile load/save/draft |
| `useMatchHistory` | scoring/hooks | match history, tag flow |
| `useSocialGraph` | people/hooks | friends, requests, blocks, search |
| `useDMs` | people/hooks | conversations, messages, realtime |
| `usePresenceHeartbeat` | people/hooks | heartbeat to last_active |
| `useNotifications` | notifications/hooks | notification list, realtime |
| `useTournamentManager` | tournaments/hooks | tournament CRUD, draws, results |

## Realtime Subscriptions

- `useNotifications` — listens on `notifications` table (INSERT filtered by `user_id`)
- `useSocialGraph` — listens on `friend_requests` table (INSERT filtered by `receiver_id`)
- `useDMs` — listens on `direct_messages` and `conversations` tables

## Supabase Tables (key ones)

- `profiles` — user profile (name, avatar, skill, suburb, ranking_points, privacy, last_active, show_online_status, show_last_seen)
- `friend_requests` — (id, sender_id, receiver_id, status: pending/accepted/declined)
- `blocks` — (blocker_id, blocked_id)
- `direct_messages` — (id, conversation_id, sender_id, content, created_at)
- `conversations` — (id, participant_ids uuid[])
- `notifications` — (id, user_id, type, from_user_id, entity_id, metadata jsonb, read, created_at)
- `matches` — match records with score/status/tags

## Presence System

- Heartbeat every 60s while tab visible (`usePresenceHeartbeat`)
- `presenceService.getPresence(profile, viewerIsSelf)` returns `{dot, label, online, hidden}`
- Privacy: `show_online_status` hides dot, `show_last_seen` hides last-seen label
- Windows: online = within 5 min, away = within 30 min

---

## Architecture — Follow This Strictly

### Folder Structure

```
src/
  app/
    App.jsx
    App.css
    providers.jsx

  assets/

  lib/
    supabase.js
    db.js
    theme.js
    utils/
      avatar.js
      dates.js
    constants/
      ui.js
      domain.js

  components/
    ui/
      Pill.jsx
      PlayerAvatar.jsx

  features/
    admin/
      pages/
    auth/
      components/
      hooks/
      services/
    home/
      pages/
    notifications/
      components/
      hooks/
      services/
    people/
      pages/
      components/
      hooks/
      services/
    profile/
      pages/
      hooks/
      services/
    scoring/
      components/
      hooks/
      services/
      utils/
    settings/
      pages/
    tournaments/
      pages/
      components/
      hooks/
      services/
      utils/
      constants.js
```

### Architecture Rules

1. Organize by feature/domain, not by file type alone.
2. Only put truly generic, reusable, presentation-only UI primitives in `src/components/ui/`.
3. Keep business/domain code inside the owning feature folder.
4. Keep route-level screens/pages inside that feature's `pages/` folder.
5. Keep global infrastructure only in `src/lib/`.
6. Tournament-only logic must stay in `features/tournaments/`.
7. Shared avatar/date helpers must stay in `lib/utils/`.
8. Shared UI/domain constants must stay in `lib/constants/`.
9. Do not recreate deleted or abandoned top-level folders:
   - `src/modals`
   - `src/tabs`
   - `src/screens`
   - `src/components/social`
   - `src/components/tournaments`
   - `src/components/common`
10. Preserve existing behavior unless the task explicitly requires behavior changes.

### File Placement Rules

**`components/ui/`** — generic, presentation-only, zero business meaning (Pill, PlayerAvatar, future Button/Input/Modal shell)

**`lib/`** — shared global infrastructure or generic utility (supabase, db helpers, theme, avatar/date helpers, shared constants)

**`features/people/`** — people list, presence, DMs, social graph, people page UI

**`features/profile/`** — current user profile, profile display/edit, profile page logic

**`features/tournaments/`** — brackets, standings, tournament pages, schedule/dispute/comment flows, tournament constants, tournament math

**`features/scoring/`** — score modal, match history, score submission, scoring utilities

**`features/notifications/`** — notification panel, notification hooks/services

**`features/auth/`** — auth modal, onboarding, auth controller, auth services

**`features/settings/`** — settings page, user preferences, privacy settings, notification settings

**`features/admin/`** — admin-only tools, management workflows, reporting, admin financial controls

### Import Rules

1. Prefer local feature-relative imports inside a feature.
2. Do not import from deleted/old paths.
3. Do not duplicate helpers to avoid imports.
4. If a utility is tournament-specific, keep it in `features/tournaments/utils/`, not `lib/`.
5. If a constant is tournament-specific, keep it in `features/tournaments/constants.js`, not `lib/constants/`.
6. If a component is reused but still domain-specific, keep it in the feature unless there is a strong reason to promote it.
7. Do not move something to shared just because it is used twice.

### Refactor Rules

1. Inspect target files first.
2. Keep diffs minimal.
3. Preserve behavior unless asked otherwise.
4. Update imports carefully.
5. Do not rename or move unrelated files.
6. If a file should move, explain why before moving it.
7. If architecture drift seems necessary, stop and explain before doing it.

### Before Coding — Always State

1. Which files will be touched.
2. Where any new files will go.
3. Why those locations match the repo architecture.

### Anti-Drift Rule

If a requested change can be done inside the existing structure, do it there. Do not create a new organizational pattern unless explicitly approved.
