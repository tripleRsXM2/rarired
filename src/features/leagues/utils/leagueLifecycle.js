// src/features/leagues/utils/leagueLifecycle.js
//
// Module 12 Slice 2 — feature-local constants + predicates for the
// league lifecycle state machine. Source-of-truth labels and reason
// enums live here so the UI (LeagueLifecycleMenu, LeagueLifecycleModal,
// LeaguesPanel) renders consistently.
//
// **Mirror obligation:** the reason enum below MUST match the DB CHECK
// constraint `leagues_status_reason_check` defined in
// `supabase/migrations/20260427_league_lifecycle_v1.sql`. Adding a value
// here without the matching ALTER TABLE will let the UI submit a value
// the DB rejects. If you change the enum, do both in the same commit.

// ── Status display labels ────────────────────────────────────────────────────
//
// Used by the row pill, detail header pill, and section dividers.
// Keep these short — the pill is 9px uppercase letterspaced text.

export var LIFECYCLE_LABELS = {
  active:    "Active",
  completed: "Completed",
  archived:  "Archived",
  cancelled: "Cancelled",
  voided:    "Voided",
};

// ── Lifecycle action copy (verb-first) ───────────────────────────────────────
//
// Used by the 3-dot menu items + the confirm modal title.

export var LIFECYCLE_ACTION_COPY = {
  complete: {
    verb:        "Complete season",
    title:       "Mark this season complete?",
    body:        "Standings get locked as the FINAL table. Members can still view it as history. You can't add new matches after this.",
    confirmLabel:"Complete season",
    destructive: false,
  },
  archive: {
    verb:        "Archive league",
    title:       "Archive this league?",
    body:        "Moves it off the active list and locks the standings. Use this when the league has run its course but you don't want to call it a finished season.",
    confirmLabel:"Archive",
    destructive: false,
  },
  cancel: {
    verb:        "Cancel league",
    title:       "Cancel this league?",
    body:        "The season ends without a final table. Standings stay visible but won't be marked as final. Use this if the league is being abandoned partway through.",
    confirmLabel:"Cancel league",
    destructive: true,
  },
  void: {
    verb:        "Void league",
    title:       "Void this league?",
    body:        "Use this for a mistake — wrong setup, test data, integrity issue. The league disappears from everyone's normal lists. Match history stays in personal feeds. Cannot be undone in V1 — contact support if you need to revert.",
    confirmLabel:"Void league",
    destructive: true,
  },
};

// ── Reason enums (one per action) ────────────────────────────────────────────
//
// Each menu action shows a small set of reasons in the confirm modal so
// the audit trail captures intent. Matches the DB CHECK constraint.

export var LIFECYCLE_REASONS = {
  complete: [
    { value: "season_finished",       label: "Season finished as planned" },
    { value: "other",                 label: "Other" },
  ],
  archive: [
    { value: "inactive",              label: "League went quiet" },
    { value: "season_finished",       label: "Season ran its course" },
    { value: "other",                 label: "Other" },
  ],
  cancel: [
    { value: "cancelled_by_creator",  label: "I'm cancelling this" },
    { value: "wrong_players",         label: "Wrong players in the league" },
    { value: "wrong_rules",           label: "Wrong rules / format" },
    { value: "other",                 label: "Other" },
  ],
  void: [
    { value: "created_by_mistake",    label: "Created by mistake" },
    { value: "test_league",           label: "This was a test league" },
    { value: "wrong_rules",           label: "Wrong rules / format" },
    { value: "wrong_players",         label: "Wrong players" },
    { value: "integrity_issue",       label: "Score / integrity issue" },
    { value: "other",                 label: "Other" },
  ],
};

// ── Predicates ───────────────────────────────────────────────────────────────

export function isActive(league)    { return !!league && league.status === "active"; }
export function isCompleted(league) { return !!league && league.status === "completed"; }
export function isArchived(league)  { return !!league && league.status === "archived"; }
export function isCancelled(league) { return !!league && league.status === "cancelled"; }
export function isVoided(league)    { return !!league && league.status === "voided"; }

// "Past" = anything off the active board: completed, archived, cancelled.
// Voided is its own thing (hidden from normal surfaces) — explicitly
// not lumped in with past.
export function isPastLifecycle(league) {
  if (!league) return false;
  return league.status === "completed"
      || league.status === "archived"
      || league.status === "cancelled";
}

// Owner-permission gate per action. The DB enforces this too — these
// predicates exist so we don't show a menu item that would just throw.
export function canComplete(league, iAmOwner) { return !!iAmOwner && isActive(league); }
export function canArchive(league, iAmOwner)  { return !!iAmOwner && (isActive(league) || isCompleted(league)); }
export function canCancel(league, iAmOwner)   { return !!iAmOwner && isActive(league); }
export function canVoid(league, iAmOwner)     { return !!iAmOwner && isActive(league); }

// ── Pill colors (theme-token keys, resolved by caller against `t`) ───────────
//
// Returns a {fg, bg} pair of theme-token names. The caller looks each
// one up against the active theme — keeps this file React-free.

export function lifecyclePillTokens(status) {
  switch (status) {
    case "active":    return { fg: "green",         bg: "greenSubtle" };
    case "completed": return { fg: "accent",        bg: "accentSubtle" };
    case "archived":  return { fg: "textTertiary",  bg: "bgTertiary" };
    case "cancelled": return { fg: "orange",        bg: "bgTertiary" };
    case "voided":    return { fg: "red",           bg: "bgTertiary" };
    default:          return { fg: "textTertiary",  bg: "bgTertiary" };
  }
}
