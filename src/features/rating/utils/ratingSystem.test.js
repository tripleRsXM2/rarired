// src/features/rating/utils/ratingSystem.test.js
//
// Unit-test matrix for the CourtSync Rating utility. Covers:
//   - skill ↔ initial-rating mapping (all 6 levels)
//   - displayed-skill-from-rating bands + hysteresis
//   - provisional / established status transitions
//   - K-factor table
//   - expected-score formula
//   - rating change asymmetry (upset / expected wins + losses)
//   - asymmetric-K matches (provisional winner vs established loser)
//   - lock predicate
//   - rating eligibility predicate (casual / time_limited / disputed / etc)

import { describe, it, expect } from "vitest";
import {
  getInitialRatingForSkillLevel,
  getDisplayedSkillLevelFromRating,
  getRatingStatus,
  getKFactor,
  calculateExpectedScore,
  calculateRatingChange,
  calculateMatchRatingChanges,
  getMatchFormatWeight,
  shouldLockSkillLevel,
  isRatingEligibleMatch,
  FORMAT_WEIGHTS,
} from "./ratingSystem.js";

// ─────────────────────────────────────────────────────────────────────
// getInitialRatingForSkillLevel — band start values per spec
// ─────────────────────────────────────────────────────────────────────

describe("getInitialRatingForSkillLevel", function () {
  it("Beginner 1 → 800",     function () { expect(getInitialRatingForSkillLevel("Beginner 1")).toBe(800); });
  it("Beginner 2 → 1000",    function () { expect(getInitialRatingForSkillLevel("Beginner 2")).toBe(1000); });
  it("Intermediate 1 → 1200", function () { expect(getInitialRatingForSkillLevel("Intermediate 1")).toBe(1200); });
  it("Intermediate 2 → 1400", function () { expect(getInitialRatingForSkillLevel("Intermediate 2")).toBe(1400); });
  it("Advanced 1 → 1600",    function () { expect(getInitialRatingForSkillLevel("Advanced 1")).toBe(1600); });
  it("Advanced 2 → 1800",    function () { expect(getInitialRatingForSkillLevel("Advanced 2")).toBe(1800); });
  it("unknown skill → null", function () { expect(getInitialRatingForSkillLevel("Pro")).toBe(null); });
  it("null skill → null",    function () { expect(getInitialRatingForSkillLevel(null)).toBe(null); });
  it("empty skill → null",   function () { expect(getInitialRatingForSkillLevel("")).toBe(null); });
});

// ─────────────────────────────────────────────────────────────────────
// getDisplayedSkillLevelFromRating — bands + hysteresis
// ─────────────────────────────────────────────────────────────────────

describe("getDisplayedSkillLevelFromRating — band edges", function () {
  it("800  → Beginner 1",     function () { expect(getDisplayedSkillLevelFromRating(800)).toBe("Beginner 1"); });
  it("899  → Beginner 1",     function () { expect(getDisplayedSkillLevelFromRating(899)).toBe("Beginner 1"); });
  it("900  → Beginner 2",     function () { expect(getDisplayedSkillLevelFromRating(900)).toBe("Beginner 2"); });
  it("1099 → Beginner 2",     function () { expect(getDisplayedSkillLevelFromRating(1099)).toBe("Beginner 2"); });
  it("1100 → Intermediate 1", function () { expect(getDisplayedSkillLevelFromRating(1100)).toBe("Intermediate 1"); });
  it("1299 → Intermediate 1", function () { expect(getDisplayedSkillLevelFromRating(1299)).toBe("Intermediate 1"); });
  it("1300 → Intermediate 2", function () { expect(getDisplayedSkillLevelFromRating(1300)).toBe("Intermediate 2"); });
  it("1499 → Intermediate 2", function () { expect(getDisplayedSkillLevelFromRating(1499)).toBe("Intermediate 2"); });
  it("1500 → Advanced 1",     function () { expect(getDisplayedSkillLevelFromRating(1500)).toBe("Advanced 1"); });
  it("1699 → Advanced 1",     function () { expect(getDisplayedSkillLevelFromRating(1699)).toBe("Advanced 1"); });
  it("1700 → Advanced 2",     function () { expect(getDisplayedSkillLevelFromRating(1700)).toBe("Advanced 2"); });
  it("2500 → Advanced 2 (open top)", function () { expect(getDisplayedSkillLevelFromRating(2500)).toBe("Advanced 2"); });
  it("400  → Beginner 1 (open bottom)", function () { expect(getDisplayedSkillLevelFromRating(400)).toBe("Beginner 1"); });
});

describe("getDisplayedSkillLevelFromRating — hysteresis", function () {
  it("rating 1095, prev=Intermediate 1 → stays Intermediate 1 (within 50 of 1100)", function () {
    expect(getDisplayedSkillLevelFromRating(1095, "Intermediate 1")).toBe("Intermediate 1");
  });
  it("rating 1051, prev=Intermediate 1 → stays Intermediate 1 (49 below 1100)", function () {
    expect(getDisplayedSkillLevelFromRating(1051, "Intermediate 1")).toBe("Intermediate 1");
  });
  it("rating 1049, prev=Intermediate 1 → demotes to Beginner 2 (51 below 1100)", function () {
    expect(getDisplayedSkillLevelFromRating(1049, "Intermediate 1")).toBe("Beginner 2");
  });
  it("promotion has no hysteresis: 1500 with prev=Intermediate 2 → Advanced 1", function () {
    expect(getDisplayedSkillLevelFromRating(1500, "Intermediate 2")).toBe("Advanced 1");
  });
  it("rating 1101, prev=Beginner 2 → promotes to Intermediate 1 immediately", function () {
    expect(getDisplayedSkillLevelFromRating(1101, "Beginner 2")).toBe("Intermediate 1");
  });
});

describe("getDisplayedSkillLevelFromRating — invalid input", function () {
  it("null   → null", function () { expect(getDisplayedSkillLevelFromRating(null)).toBe(null); });
  it("NaN    → null", function () { expect(getDisplayedSkillLevelFromRating(NaN)).toBe(null); });
});

// ─────────────────────────────────────────────────────────────────────
// getRatingStatus — provisional / established threshold
// ─────────────────────────────────────────────────────────────────────

describe("getRatingStatus", function () {
  it("0 confirmed → provisional",  function () { expect(getRatingStatus(0)).toBe("provisional"); });
  it("4 confirmed → provisional",  function () { expect(getRatingStatus(4)).toBe("provisional"); });
  it("5 confirmed → established",  function () { expect(getRatingStatus(5)).toBe("established"); });
  it("100 confirmed → established", function () { expect(getRatingStatus(100)).toBe("established"); });
  it("undefined → provisional",     function () { expect(getRatingStatus()).toBe("provisional"); });
  it("null → provisional",          function () { expect(getRatingStatus(null)).toBe("provisional"); });
});

// ─────────────────────────────────────────────────────────────────────
// getKFactor — calibration table
// ─────────────────────────────────────────────────────────────────────

describe("getKFactor", function () {
  it("0 confirmed → 40",   function () { expect(getKFactor(0)).toBe(40); });
  it("1 confirmed → 40",   function () { expect(getKFactor(1)).toBe(40); });
  it("2 confirmed → 40",   function () { expect(getKFactor(2)).toBe(40); });
  it("3 confirmed → 32",   function () { expect(getKFactor(3)).toBe(32); });
  it("4 confirmed → 32",   function () { expect(getKFactor(4)).toBe(32); });
  it("5 confirmed → 24",   function () { expect(getKFactor(5)).toBe(24); });
  it("100 confirmed → 24", function () { expect(getKFactor(100)).toBe(24); });
  it("status='established' overrides count → 24", function () {
    expect(getKFactor(2, "established")).toBe(24);
  });
});

// ─────────────────────────────────────────────────────────────────────
// calculateExpectedScore — Elo expected-score formula
// ─────────────────────────────────────────────────────────────────────

describe("calculateExpectedScore", function () {
  it("equal rating → 0.5",      function () { expect(calculateExpectedScore(1500, 1500)).toBeCloseTo(0.5, 5); });
  it("higher rated > 0.5",       function () { expect(calculateExpectedScore(1600, 1400)).toBeGreaterThan(0.5); });
  it("lower rated < 0.5",        function () { expect(calculateExpectedScore(1400, 1600)).toBeLessThan(0.5); });
  it("400 diff → ≈ 0.909",       function () { expect(calculateExpectedScore(1800, 1400)).toBeCloseTo(0.909, 2); });
  it("-400 diff → ≈ 0.091",      function () { expect(calculateExpectedScore(1400, 1800)).toBeCloseTo(0.091, 2); });
  it("symmetric (sums to 1)",    function () {
    var a = calculateExpectedScore(1400, 1800);
    var b = calculateExpectedScore(1800, 1400);
    expect(a + b).toBeCloseTo(1, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────
// calculateRatingChange — opponent-strength asymmetry
// ─────────────────────────────────────────────────────────────────────

describe("calculateRatingChange — opponent strength", function () {
  it("equal-rating win at K=24 → exactly +12", function () {
    expect(calculateRatingChange(1500, 1500, 1, { k: 24 })).toBe(12);
  });
  it("equal-rating loss at K=24 → exactly -12", function () {
    expect(calculateRatingChange(1500, 1500, 0, { k: 24 })).toBe(-12);
  });
  it("upset win (1100 beats 1500) → larger gain than expected win", function () {
    var upset = calculateRatingChange(1100, 1500, 1, { k: 24 });
    var expected = calculateRatingChange(1500, 1100, 1, { k: 24 });
    expect(upset).toBeGreaterThan(expected);
  });
  it("expected win (1500 beats 1100) → smaller gain", function () {
    var d = calculateRatingChange(1500, 1100, 1, { k: 24 });
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(12); // less than half K
  });
  it("unexpected loss (1500 loses to 1100) → larger loss", function () {
    var unexpected = calculateRatingChange(1500, 1100, 0, { k: 24 });
    var expected = calculateRatingChange(1100, 1500, 0, { k: 24 });
    expect(Math.abs(unexpected)).toBeGreaterThan(Math.abs(expected));
  });
  it("expected loss (1100 loses to 1500) → smaller loss", function () {
    var d = calculateRatingChange(1100, 1500, 0, { k: 24 });
    expect(d).toBeLessThan(0);
    expect(Math.abs(d)).toBeLessThan(12);
  });
  it("higher K = bigger movement (provisional swings more)", function () {
    var prov = calculateRatingChange(1500, 1500, 1, { k: 40 });
    var est  = calculateRatingChange(1500, 1500, 1, { k: 24 });
    expect(prov).toBeGreaterThan(est);
  });
});

// ─────────────────────────────────────────────────────────────────────
// calculateMatchRatingChanges — asymmetric K (winner vs loser)
// ─────────────────────────────────────────────────────────────────────

describe("calculateMatchRatingChanges", function () {
  it("provisional winner (K=40) gains MORE than established loser (K=24) loses", function () {
    var r = calculateMatchRatingChanges(
      { id: "a", rating: 1100, k: 40 },
      { id: "b", rating: 1500, k: 24 },
      "a"
    );
    expect(r.a.delta).toBeGreaterThan(0);
    expect(r.b.delta).toBeLessThan(0);
    expect(r.a.delta).toBeGreaterThan(Math.abs(r.b.delta));
  });
  it("equal rating + equal K → +12 / -12", function () {
    var r = calculateMatchRatingChanges(
      { id: "x", rating: 1500, k: 24 },
      { id: "y", rating: 1500, k: 24 },
      "x"
    );
    expect(r.x.delta).toBe(12);
    expect(r.y.delta).toBe(-12);
    expect(r.x.newRating).toBe(1512);
    expect(r.y.newRating).toBe(1488);
  });
  it("clamps newRating at 0 (can't go negative)", function () {
    var r = calculateMatchRatingChanges(
      { id: "a", rating: 50, k: 40 },
      { id: "b", rating: 2000, k: 24 },
      "b"
    );
    expect(r.a.newRating).toBeGreaterThanOrEqual(0);
  });
  it("works either way (winnerId can be either player)", function () {
    var r = calculateMatchRatingChanges(
      { id: "a", rating: 1500, k: 24 },
      { id: "b", rating: 1500, k: 24 },
      "b"
    );
    expect(r.b.delta).toBe(12);
    expect(r.a.delta).toBe(-12);
  });
});

// ─────────────────────────────────────────────────────────────────────
// getMatchFormatWeight — sets shape → format weight
// ─────────────────────────────────────────────────────────────────────

describe("getMatchFormatWeight", function () {
  it("1 set → 0.60", function () {
    expect(getMatchFormatWeight([{ you: "6", them: "4" }])).toBe(0.60);
  });
  it("2 sets, same winner → 1.00", function () {
    expect(getMatchFormatWeight([
      { you: "6", them: "4" },
      { you: "6", them: "3" },
    ])).toBe(1.00);
  });
  it("2 sets, split winners → incomplete (0) — defensive", function () {
    // The validator wouldn't accept this as completed best-of-3, but
    // be defensive in case it ever hit the rating engine.
    expect(getMatchFormatWeight([
      { you: "6", them: "4" },
      { you: "3", them: "6" },
    ])).toBe(0);
  });
  it("3 sets, normal final → 1.10", function () {
    expect(getMatchFormatWeight([
      { you: "6", them: "4" },
      { you: "3", them: "6" },
      { you: "7", them: "5" },
    ])).toBe(1.10);
  });
  it("3 sets, match-tiebreak final → 0.85", function () {
    expect(getMatchFormatWeight([
      { you: "6", them: "4" },
      { you: "3", them: "6" },
      { you: "10", them: "8" },
    ])).toBe(0.85);
  });
  it("3 sets, match-tiebreak final 12-10 → 0.85", function () {
    expect(getMatchFormatWeight([
      { you: "6", them: "4" },
      { you: "3", them: "6" },
      { you: "12", them: "10" },
    ])).toBe(0.85);
  });
  it("empty / null sets → 0", function () {
    expect(getMatchFormatWeight([])).toBe(0);
    expect(getMatchFormatWeight(null)).toBe(0);
    expect(getMatchFormatWeight(undefined)).toBe(0);
  });
  it("strips empty rows before classifying", function () {
    expect(getMatchFormatWeight([
      { you: "6", them: "4" },
      { you: "", them: "" },
    ])).toBe(0.60);
  });
  it("non-numeric inputs → incomplete", function () {
    expect(getMatchFormatWeight([{ you: "abc", them: "4" }])).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// calculateRatingChange + calculateMatchRatingChanges — weight option
// ─────────────────────────────────────────────────────────────────────

describe("rating change with format weight", function () {
  it("weight=1.0 matches the unweighted result", function () {
    var w = calculateRatingChange(1500, 1500, 1, { k: 24, weight: 1.0 });
    var u = calculateRatingChange(1500, 1500, 1, { k: 24 });
    expect(w).toBe(u);
  });
  it("one-set weight 0.6 → 60% of full delta (rounded)", function () {
    var full = calculateRatingChange(1500, 1500, 1, { k: 24 });   // +12
    var oneSet = calculateRatingChange(1500, 1500, 1, { k: 24, weight: 0.6 }); // round(12 * 0.6) = 7
    expect(full).toBe(12);
    expect(oneSet).toBe(7);
  });
  it("3-set match (1.10) > 2-set match (1.00) > one-set (0.60)", function () {
    var oneSet = calculateRatingChange(1500, 1500, 1, { k: 24, weight: 0.60 });
    var twoSet = calculateRatingChange(1500, 1500, 1, { k: 24, weight: 1.00 });
    var threeSet = calculateRatingChange(1500, 1500, 1, { k: 24, weight: 1.10 });
    var mtb = calculateRatingChange(1500, 1500, 1, { k: 24, weight: 0.85 });
    expect(oneSet).toBeLessThan(twoSet);
    expect(twoSet).toBeLessThan(threeSet);
    expect(mtb).toBeLessThan(twoSet);
    expect(mtb).toBeGreaterThan(oneSet);
  });
  it("weight=0 → no change", function () {
    expect(calculateRatingChange(1500, 1500, 1, { k: 24, weight: 0 })).toBe(0);
  });
  it("calculateMatchRatingChanges propagates weight to both sides", function () {
    var r = calculateMatchRatingChanges(
      { id: "a", rating: 1500, k: 24 },
      { id: "b", rating: 1500, k: 24 },
      "a",
      { weight: 0.60 }
    );
    expect(r.a.delta).toBe(7);
    expect(r.b.delta).toBe(-7);
  });
});

// ─────────────────────────────────────────────────────────────────────
// shouldLockSkillLevel
// ─────────────────────────────────────────────────────────────────────

describe("shouldLockSkillLevel", function () {
  it("null profile → false",  function () { expect(shouldLockSkillLevel(null)).toBe(false); });
  it("undefined → false",     function () { expect(shouldLockSkillLevel()).toBe(false); });
  it("never confirmed, lock=false → false", function () {
    expect(shouldLockSkillLevel({ confirmed_ranked_match_count: 0, skill_level_locked: false })).toBe(false);
  });
  it("first confirmed match → true (auto-lock)", function () {
    expect(shouldLockSkillLevel({ confirmed_ranked_match_count: 1, skill_level_locked: false })).toBe(true);
  });
  it("explicit lock with no matches → true", function () {
    expect(shouldLockSkillLevel({ confirmed_ranked_match_count: 0, skill_level_locked: true })).toBe(true);
  });
  it("missing count, explicit lock → true", function () {
    expect(shouldLockSkillLevel({ skill_level_locked: true })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// isRatingEligibleMatch — exclusion matrix
// ─────────────────────────────────────────────────────────────────────

describe("isRatingEligibleMatch", function () {
  function base() {
    return {
      match_type: "ranked",
      status: "confirmed",
      opponent_id: "abc",
      completion_type: "completed",
    };
  }
  it("ranked + confirmed + linked + completed → true", function () {
    expect(isRatingEligibleMatch(base())).toBe(true);
  });
  it("missing completion_type (legacy row) → true", function () {
    var m = base(); delete m.completion_type;
    expect(isRatingEligibleMatch(m)).toBe(true);
  });
  it("casual → false", function () {
    expect(isRatingEligibleMatch(Object.assign(base(), { match_type: "casual" }))).toBe(false);
  });
  it("pending_confirmation → false", function () {
    expect(isRatingEligibleMatch(Object.assign(base(), { status: "pending_confirmation" }))).toBe(false);
  });
  it("disputed → false", function () {
    expect(isRatingEligibleMatch(Object.assign(base(), { status: "disputed" }))).toBe(false);
  });
  it("voided → false", function () {
    expect(isRatingEligibleMatch(Object.assign(base(), { status: "voided" }))).toBe(false);
  });
  it("expired → false", function () {
    expect(isRatingEligibleMatch(Object.assign(base(), { status: "expired" }))).toBe(false);
  });
  it("no opponent_id (legacy casual) → false", function () {
    expect(isRatingEligibleMatch(Object.assign(base(), { opponent_id: null }))).toBe(false);
  });
  it("completion_type='time_limited' → false", function () {
    expect(isRatingEligibleMatch(Object.assign(base(), { completion_type: "time_limited" }))).toBe(false);
  });
  it("completion_type='retired' → false", function () {
    expect(isRatingEligibleMatch(Object.assign(base(), { completion_type: "retired" }))).toBe(false);
  });
  it("voided_at set → false (defensive double-check)", function () {
    expect(isRatingEligibleMatch(Object.assign(base(), { voided_at: "2026-04-25T10:00:00Z" }))).toBe(false);
  });
  it("voided_reason set → false", function () {
    expect(isRatingEligibleMatch(Object.assign(base(), { voided_reason: "not_my_match" }))).toBe(false);
  });
  it("null match → false", function () {
    expect(isRatingEligibleMatch(null)).toBe(false);
  });
  it("undefined match → false", function () {
    expect(isRatingEligibleMatch(undefined)).toBe(false);
  });
});
