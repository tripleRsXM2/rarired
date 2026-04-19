# CourtSync — Claude Project Context

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
