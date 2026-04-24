// src/lib/constants/domain.js
// Cross-feature domain enums (skill levels, play styles, weekday/time-block labels).

// Six-rung skill ladder: three tiers × two sub-levels (early / late).
// Replaces the original 4-level set (Beginner / Intermediate / Advanced
// / Competitive) which buried a huge range inside each bucket.
//
// Why 6 and not 9: self-assessed skill is noisy. More rungs introduce
// more noise per rung. "Early / late within tier" reads as natural
// tennis language ("I'm early Intermediate, still working on my serve"),
// where a 3-level split forces users to pick a middle slot nobody knows
// how to evaluate. 6 still gives matchmaking a ±1 candidate window of
// 2-3 players per tier, which is enough at seed scale.
//
// Legacy values from the 4-level system map into the new ladder via
// the migration 20260425_skill_levels_v2.sql:
//   Beginner     → Beginner 1
//   Intermediate → Intermediate 1
//   Advanced     → Advanced 1
//   Competitive  → Advanced 2
export const SKILL_LEVELS = [
  "Beginner 1",     "Beginner 2",
  "Intermediate 1", "Intermediate 2",
  "Advanced 1",     "Advanced 2",
];

// Human-readable hints shown next to the skill picker during onboarding +
// edit profile. Keeps the self-assessment honest; roughly maps to the
// USTA NTRP 1.0–6.0+ scale for reference.
export const SKILL_HINTS = {
  "Beginner 1":     "Just picking up a racket — learning to rally",
  "Beginner 2":     "Reliable serve, winning basic points",
  "Intermediate 1": "Solid groundstrokes, can serve + return under pressure",
  "Intermediate 2": "Full match play, strong club-level weapon",
  "Advanced 1":     "Regular tournament player — all shots under pressure",
  "Advanced 2":     "Regional / Open level, high tactical IQ",
};

// Tier helper — groups the 9 skills into their 3 broad tiers. Used by
// matchmaking (same-tier is "close enough" even if sub-level differs)
// and by leaderboard / tournament filters that need coarser buckets.
export function skillTier(skill) {
  if (!skill) return null;
  if (skill.indexOf("Beginner") === 0)     return "Beginner";
  if (skill.indexOf("Intermediate") === 0) return "Intermediate";
  if (skill.indexOf("Advanced") === 0)     return "Advanced";
  // Legacy bare values — in case a stale client writes one before the
  // migration reaches every user's browser.
  if (skill === "Competitive") return "Advanced";
  return null;
}

// Numeric index on the 9-rung ladder for distance math (matchmaking
// orders candidates by skill proximity — |a - b| ≤ 2 is "close enough").
// Returns null for unknown values.
export function skillRank(skill) {
  var idx = SKILL_LEVELS.indexOf(skill);
  return idx < 0 ? null : idx;
}

export const PLAY_STYLES  = ["Baseline","Serve and Volley","All-Court","Defensive"];
export const DAYS_SHORT   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
export const TIME_BLOCKS  = ["Morning","Afternoon","Evening","Late"];
