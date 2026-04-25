// src/features/rating/constants.js
//
// CourtSync Rating constants. Lives next to the rating utility
// (../utils/ratingSystem.js) so the band / K-table / threshold
// definitions are co-located with the math that consumes them.
//
// Naming: this is "CourtSync Rating", NOT UTR or any official
// federation ranking. See docs/trust-and-ranking-rules.md.

import { SKILL_LEVELS } from "../../lib/constants/domain.js";

// Re-export so consumers can pull every rating-domain constant
// from one path.
export { SKILL_LEVELS };

// Plain-language description per skill level — surfaced in the
// onboarding picker, the rating info modal, and the lock warning.
// Kept here (not in domain.js) so they stay tied to the rating
// product rule rather than the cross-feature skill enum.
export const SKILL_LEVEL_DESCRIPTIONS = {
  "Beginner 1":     "New to tennis. Learning rallies, serves, and basic scoring.",
  "Beginner 2":     "Can rally and play points, but consistency is still developing.",
  "Intermediate 1": "Can play full matches, hold rallies, and use basic tactics.",
  "Intermediate 2": "Consistent match player with stronger serve, placement, and point construction.",
  "Advanced 1":     "Strong competitive player with reliable weapons and match strategy.",
  "Advanced 2":     "High-level competitive player with strong consistency, pace, and tactical control.",
};

// Rating bands map self-assessed skill → starting rating (`start`)
// and the displayed-skill-from-rating window (`min..max`).
//
// `start` is the seed rating when a user picks this level during
// onboarding. `min..max` is the band the displayed skill falls
// into when their rating crosses thresholds. The two ends of the
// ladder are open: < 900 = always Beginner 1, ≥ 1700 = always
// Advanced 2.
export const RATING_BANDS = [
  { skill: "Beginner 1",     start: 800,  min: -Infinity, max: 899      },
  { skill: "Beginner 2",     start: 1000, min: 900,       max: 1099     },
  { skill: "Intermediate 1", start: 1200, min: 1100,      max: 1299     },
  { skill: "Intermediate 2", start: 1400, min: 1300,      max: 1499     },
  { skill: "Advanced 1",     start: 1600, min: 1500,      max: 1699     },
  { skill: "Advanced 2",     start: 1800, min: 1700,      max: Infinity },
];

// Calibration / provisional period — first N confirmed ranked
// matches a player plays. After this many, rating_status flips
// from 'provisional' to 'established' and the K-factor drops.
//
// 5 (per Module 7.7 spec) is short enough that calibration
// finishes in a couple of weeks for an active user, long enough
// that one lucky upset doesn't lock in a wildly wrong rating.
export const PROVISIONAL_THRESHOLD = 5;

// Hysteresis (in rating points) for displayed-skill demotion.
// Promotion happens immediately the moment rating crosses the
// next band's floor; demotion only happens once rating has
// dropped more than this many points below the previous band's
// floor. Avoids ping-ponging between displayed levels on a
// single unlucky result.
export const HYSTERESIS = 50;

// K-factor table per CourtSync Rating spec. Each player applies
// their own K independently, so a settled player vs a brand-new
// one have asymmetric movement (the new player swings more, the
// veteran moves less).
//
// HIGHLY_ESTABLISHED is reserved for a future tier (e.g. 200+
// confirmed matches). Not active in V1 — getKFactor returns
// ESTABLISHED for everyone past the provisional threshold.
export const K_FACTORS = {
  PROVISIONAL_EARLY:  40,   // 0–2 confirmed ranked matches
  PROVISIONAL_LATE:   32,   // 3–4 confirmed ranked matches
  ESTABLISHED:        24,   // 5+
  HIGHLY_ESTABLISHED: 16,   // future, optional
};
