// src/features/rating/utils/ratingSystem.js
//
// Pure rating math + status helpers. Single source of truth for the
// CourtSync Rating rules (NOT UTR, NOT a federation ranking — see
// docs/trust-and-ranking-rules.md).
//
// All math here is deterministic and side-effect free. Final WRITES
// to a player's rating happen server-side in the apply_match_outcome
// SECURITY DEFINER RPC — this utility only previews / explains /
// validates inputs.
//
// API surface:
//   getInitialRatingForSkillLevel(skill)
//   getDisplayedSkillLevelFromRating(rating, prevDisplayed?)
//   getRatingStatus(confirmedRankedMatchCount)
//   getKFactor(confirmedRankedMatchCount, ratingStatus?)
//   calculateExpectedScore(playerRating, opponentRating)
//   calculateRatingChange(playerRating, opponentRating, actualResult, opts)
//   calculateMatchRatingChanges(playerA, playerB, winnerId, opts?)
//   shouldLockSkillLevel(profile)
//   isRatingEligibleMatch(match)

import {
  RATING_BANDS,
  PROVISIONAL_THRESHOLD,
  HYSTERESIS,
  K_FACTORS,
  SKILL_LEVELS,
  SKILL_LEVEL_DESCRIPTIONS,
} from "../constants.js";

// Re-export the constants so callers can pull everything from one path.
export {
  RATING_BANDS,
  PROVISIONAL_THRESHOLD,
  HYSTERESIS,
  K_FACTORS,
  SKILL_LEVELS,
  SKILL_LEVEL_DESCRIPTIONS,
};

// ─────────────────────────────────────────────────────────────────────
// Skill ↔ rating mapping
// ─────────────────────────────────────────────────────────────────────

// Initial / starting rating for the user's self-assessed level. Used
// once at onboarding by the initialize_rating RPC; never re-evaluated.
export function getInitialRatingForSkillLevel(skillLevel) {
  if (!skillLevel) return null;
  var band = RATING_BANDS.find(function (b) { return b.skill === skillLevel; });
  return band ? band.start : null;
}

// Derive the *displayed* skill level from the player's current rating.
// Promotion is immediate when rating crosses the next band's floor.
// Demotion uses HYSTERESIS — rating must drop more than HYSTERESIS
// below the previous band's floor before the displayed level falls.
//
// `prevDisplayed` is the player's currently-shown skill (so we know
// where the demotion buffer starts). Pass `null` / omit to skip
// hysteresis (e.g. for a fresh promotion preview).
export function getDisplayedSkillLevelFromRating(rating, prevDisplayed) {
  if (rating == null || isNaN(rating)) return null;
  var newBand = RATING_BANDS.find(function (b) {
    return rating >= b.min && rating <= b.max;
  });
  if (!newBand) return null;

  if (prevDisplayed && prevDisplayed !== newBand.skill) {
    var prevBand = RATING_BANDS.find(function (b) { return b.skill === prevDisplayed; });
    if (prevBand) {
      // Rating is below the previous band — only demote if the gap
      // exceeds HYSTERESIS. This prevents ping-pong on borderline
      // results.
      if (rating < prevBand.min) {
        if (prevBand.min - rating < HYSTERESIS) return prevDisplayed;
      }
      // Rating is above the previous band — promotion goes through
      // immediately, no hysteresis on the upside.
    }
  }
  return newBand.skill;
}

// ─────────────────────────────────────────────────────────────────────
// Calibration / status / K-factor
// ─────────────────────────────────────────────────────────────────────

export function getRatingStatus(confirmedRankedMatchCount) {
  var n = confirmedRankedMatchCount || 0;
  return n >= PROVISIONAL_THRESHOLD ? "established" : "provisional";
}

// K-factor table:
//   provisional 0–2  → 40   (calibrating fast)
//   provisional 3–4  → 32   (calibrating slower)
//   established      → 24
//
// `ratingStatus`, when supplied, is treated as authoritative. Otherwise
// status is derived from the count.
export function getKFactor(confirmedRankedMatchCount, ratingStatus) {
  var n = confirmedRankedMatchCount || 0;
  var status = ratingStatus || getRatingStatus(n);
  if (status === "established") return K_FACTORS.ESTABLISHED;
  // provisional
  if (n <= 2) return K_FACTORS.PROVISIONAL_EARLY;
  return K_FACTORS.PROVISIONAL_LATE;
}

// ─────────────────────────────────────────────────────────────────────
// Elo math — opponent-strength weighted
// ─────────────────────────────────────────────────────────────────────

// Standard Elo expected score. Returns the probability the player
// "wins" (between 0 and 1) given their rating vs the opponent's.
//   diff  +400 → 0.909  (heavy favorite)
//   diff     0 → 0.5
//   diff  -400 → 0.091  (heavy underdog)
export function calculateExpectedScore(playerRating, opponentRating) {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

// Rating delta for one player. `actualResult` is 1 for a win, 0 for a
// loss. `options.k` is the player's K-factor (callers pass their own
// so each player applies their own provisional/established K).
//
// Opponent-strength asymmetry comes for free from the expected-score
// formula:
//   - upset win  (lower beats higher) → larger gain
//   - expected win                    → smaller gain
//   - unexpected loss                 → larger loss
//   - expected loss                   → smaller loss
export function calculateRatingChange(playerRating, opponentRating, actualResult, options) {
  options = options || {};
  var k = options.k != null ? options.k : K_FACTORS.ESTABLISHED;
  var expected = calculateExpectedScore(playerRating, opponentRating);
  return Math.round(k * (actualResult - expected));
}

// Convenience: compute both players' new ratings + deltas in one call.
// Each player passes their own `k` (so a provisional winner moves more
// than the established loser loses).
//
// Returns:
//   {
//     [playerA.id]: { newRating, delta },
//     [playerB.id]: { newRating, delta },
//   }
export function calculateMatchRatingChanges(playerA, playerB, winnerId, options) {
  options = options || {};
  var aResult = winnerId === playerA.id ? 1 : 0;
  var bResult = 1 - aResult;
  var aDelta = calculateRatingChange(playerA.rating, playerB.rating, aResult, { k: playerA.k });
  var bDelta = calculateRatingChange(playerB.rating, playerA.rating, bResult, { k: playerB.k });
  // Clamp at 0 — ratings never go negative even after a streak of
  // unexpected losses (mirrors the SQL: greatest(0, ...)).
  var out = {};
  out[playerA.id] = { newRating: Math.max(0, playerA.rating + aDelta), delta: aDelta };
  out[playerB.id] = { newRating: Math.max(0, playerB.rating + bDelta), delta: bDelta };
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Lock / eligibility predicates
// ─────────────────────────────────────────────────────────────────────

// Skill level is locked once the user has played at least one
// confirmed ranked match OR has explicitly locked it (via a future
// "lock now" affordance — not in V1). The DB-side trigger enforces
// the same rule; this helper is for the UI.
export function shouldLockSkillLevel(profile) {
  if (!profile) return false;
  if (profile.skill_level_locked) return true;
  return (profile.confirmed_ranked_match_count || 0) > 0;
}

// Predicate: would this match feed the rating system?
//
//   match_type === 'ranked'             — casual is excluded
//   status === 'confirmed'              — pending/disputed/voided/expired excluded
//   opponent_id is set                  — both sides are real users
//   completion_type !== 'time_limited'  — partial scores excluded
//   completion_type !== 'retired'       — retired matches excluded
//   not voided                          — defensive double-check
//
// League matches are eligible iff their league.mode === 'ranked'
// (the validate_match_league trigger enforces match_type === league.mode
// at insert time, so checking match_type here transitively covers it).
export function isRatingEligibleMatch(match) {
  if (!match) return false;
  if (match.match_type !== "ranked") return false;
  if (match.status !== "confirmed") return false;
  if (!match.opponent_id) return false;
  if (match.completion_type === "time_limited") return false;
  if (match.completion_type === "retired") return false;
  if (match.voided_at || match.voided_reason) return false;
  return true;
}
