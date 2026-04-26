// src/features/scoring/utils/tennisScoreValidation.test.js
import { describe, it, expect } from "vitest";
import {
  CODES,
  isCompletedSet,
  isPartialSet,
  isValidTiebreakScore,
  validateTiebreakScore,
  validateSetScore,
  validateMatchScore,
  deriveMatchWinner,
  getScoreValidationMessage,
  formatSetScore,
  formatMatchScore,
  normalizeSetFromDb,
  serializeSetForDb,
  isTiebreakSet,
} from "./tennisScoreValidation.js";

describe("isCompletedSet — normal sets", () => {
  it.each([
    [6, 0], [6, 1], [6, 2], [6, 3], [6, 4],
    [0, 6], [1, 6], [2, 6], [3, 6], [4, 6],
    [7, 5], [5, 7],
    [7, 6], [6, 7], // 7-6 is OK without tiebreak details when not required
  ])("%i-%i is a completed set", (y, t) => {
    expect(isCompletedSet({ you: y, them: t })).toBe(true);
  });

  it.each([
    [6, 5], [6, 6], [5, 5], [8, 2], [9, 7], [4, 4], [3, 2], [5, 3],
  ])("%i-%i is NOT a completed set", (y, t) => {
    expect(isCompletedSet({ you: y, them: t })).toBe(false);
  });

  it("rejects empty / blank sets", () => {
    expect(isCompletedSet({ you: "", them: "" })).toBe(false);
    expect(isCompletedSet({ you: "6", them: "" })).toBe(false);
    expect(isCompletedSet(null)).toBe(false);
    expect(isCompletedSet(undefined)).toBe(false);
  });

  it("accepts string-form numeric scores", () => {
    expect(isCompletedSet({ you: "6", them: "4" })).toBe(true);
    expect(isCompletedSet({ you: " 7 ", them: " 5 " })).toBe(true);
  });

  it("rejects non-numeric / non-integer / negative", () => {
    expect(isCompletedSet({ you: "abc", them: 4 })).toBe(false);
    expect(isCompletedSet({ you: 6.5, them: 4 })).toBe(false);
    expect(isCompletedSet({ you: -1, them: 6 })).toBe(false);
  });
});

describe("isCompletedSet — 7-6 tiebreak details", () => {
  it("accepts 7-6 without details when not required", () => {
    expect(isCompletedSet({ you: 7, them: 6 })).toBe(true);
  });

  it("requires details when requireTiebreakDetails=true", () => {
    expect(isCompletedSet({ you: 7, them: 6 }, { requireTiebreakDetails: true })).toBe(false);
    expect(isCompletedSet({ you: 7, them: 6, tieBreak: { you: 7, them: 4 } }, { requireTiebreakDetails: true })).toBe(true);
  });

  it("rejects invalid tiebreak details whether required or not", () => {
    expect(isCompletedSet({ you: 7, them: 6, tieBreak: { you: 7, them: 6 } })).toBe(false);
    expect(isCompletedSet({ you: 7, them: 6, tieBreak: { you: 5, them: 3 } })).toBe(false);
    expect(isCompletedSet({ you: 7, them: 6, tieBreak: { you: 8, them: 6 } })).toBe(true);  // 8-6 is win-by-2 and >=7
  });
});

describe("isCompletedSet — match tiebreak (final-set match-tiebreak format)", () => {
  it("accepts match-tiebreak completed scores", () => {
    expect(isCompletedSet({ you: 10, them: 6 }, { isFinalMatchTiebreak: true })).toBe(true);
    expect(isCompletedSet({ you: 10, them: 8 }, { isFinalMatchTiebreak: true })).toBe(true);
    expect(isCompletedSet({ you: 12, them: 10 }, { isFinalMatchTiebreak: true })).toBe(true);
  });

  it("rejects match-tiebreak that didn't finish", () => {
    expect(isCompletedSet({ you: 10, them: 9 }, { isFinalMatchTiebreak: true })).toBe(false);
    expect(isCompletedSet({ you: 9, them: 7 }, { isFinalMatchTiebreak: true })).toBe(false);
    expect(isCompletedSet({ you: 8, them: 6 }, { isFinalMatchTiebreak: true })).toBe(false);
  });
});

describe("isPartialSet", () => {
  it.each([
    [3, 2], [4, 4], [5, 3], [6, 5],
  ])("%i-%i is partial (not completed but not garbage)", (y, t) => {
    expect(isPartialSet({ you: y, them: t })).toBe(true);
  });

  it("a completed set is not partial", () => {
    expect(isPartialSet({ you: 6, them: 4 })).toBe(false);
  });

  it("blank set is neither completed nor partial", () => {
    expect(isPartialSet({ you: "", them: "" })).toBe(false);
  });
});

describe("isValidTiebreakScore", () => {
  it("set tiebreak (default pointsToWin=7)", () => {
    expect(isValidTiebreakScore({ you: 7, them: 4 })).toBe(true);
    expect(isValidTiebreakScore({ you: 7, them: 5 })).toBe(true);
    expect(isValidTiebreakScore({ you: 8, them: 6 })).toBe(true);
    expect(isValidTiebreakScore({ you: 7, them: 6 })).toBe(false); // win-by-2 fails
    expect(isValidTiebreakScore({ you: 5, them: 3 })).toBe(false); // <7
  });

  it("match tiebreak (pointsToWin=10)", () => {
    expect(isValidTiebreakScore({ you: 10, them: 6 }, { pointsToWin: 10 })).toBe(true);
    expect(isValidTiebreakScore({ you: 10, them: 8 }, { pointsToWin: 10 })).toBe(true);
    expect(isValidTiebreakScore({ you: 10, them: 9 }, { pointsToWin: 10 })).toBe(false);
    expect(isValidTiebreakScore({ you: 9,  them: 7 }, { pointsToWin: 10 })).toBe(false);
  });
});

describe("validateSetScore — error codes", () => {
  it("INVALID_NORMAL_SET 6-5", () => {
    var r = validateSetScore({ you: 6, them: 5 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.INVALID_NORMAL_SET);
    expect(r.message).toMatch(/6-5/);
  });

  it("INVALID_NORMAL_SET 6-6", () => {
    var r = validateSetScore({ you: 6, them: 6 });
    expect(r.code).toBe(CODES.INVALID_NORMAL_SET);
    expect(r.message).toMatch(/6-6/);
  });

  it("INVALID_NORMAL_SET 8-2", () => {
    expect(validateSetScore({ you: 8, them: 2 }).code).toBe(CODES.INVALID_NORMAL_SET);
  });

  it("NEGATIVE", () => {
    expect(validateSetScore({ you: -1, them: 4 }).code).toBe(CODES.NEGATIVE);
  });

  it("NON_NUMERIC", () => {
    expect(validateSetScore({ you: "abc", them: 4 }).code).toBe(CODES.NON_NUMERIC);
  });

  it("EMPTY_SCORE", () => {
    expect(validateSetScore({ you: "", them: "" }).code).toBe(CODES.EMPTY_SCORE);
    expect(validateSetScore({ you: 6, them: "" }).code).toBe(CODES.EMPTY_SCORE);
  });

  it("INVALID_TIEBREAK_DETAILS when present but bogus", () => {
    var r = validateSetScore({ you: 7, them: 6, tieBreak: { you: 7, them: 7 } });
    expect(r.code).toBe(CODES.INVALID_TIEBREAK_DETAILS);
  });

  it("TIEBREAK_DETAILS_REQUIRED when flag set + missing details", () => {
    var r = validateSetScore({ you: 7, them: 6 }, { requireTiebreakDetails: true });
    expect(r.code).toBe(CODES.TIEBREAK_DETAILS_REQUIRED);
  });

  it("INVALID_MATCH_TIEBREAK", () => {
    var r = validateSetScore({ you: 10, them: 9 }, { isFinalMatchTiebreak: true });
    expect(r.code).toBe(CODES.INVALID_MATCH_TIEBREAK);
  });
});

describe("validateMatchScore — one_set format", () => {
  it("accepts a single completed set", () => {
    var r = validateMatchScore([{ you: 6, them: 4 }], { matchFormat: "one_set", matchType: "ranked" });
    expect(r.ok).toBe(true);
    expect(r.completionStatus).toBe("completed");
    expect(r.winner).toBe("submitter");
  });

  it("rejects more than one set in one_set format", () => {
    var r = validateMatchScore(
      [{ you: 6, them: 4 }, { you: 6, them: 4 }],
      { matchFormat: "one_set", matchType: "ranked" }
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.WRONG_NUMBER_OF_SETS);
  });

  it("rejects a partial single set in ranked", () => {
    var r = validateMatchScore([{ you: 5, them: 3 }], { matchFormat: "one_set", matchType: "ranked" });
    expect(r.ok).toBe(false);
    expect([CODES.INVALID_NORMAL_SET, CODES.RANKED_REQUIRES_COMPLETED]).toContain(r.code);
  });
});

describe("validateMatchScore — best_of_3 format", () => {
  it("accepts a 2-set sweep", () => {
    var r = validateMatchScore(
      [{ you: 6, them: 4 }, { you: 6, them: 3 }],
      { matchFormat: "best_of_3", matchType: "ranked" }
    );
    expect(r.ok).toBe(true);
    expect(r.completionStatus).toBe("completed");
    expect(r.winner).toBe("submitter");
  });

  it("accepts a 3-set decider", () => {
    var r = validateMatchScore(
      [{ you: 6, them: 4 }, { you: 3, them: 6 }, { you: 6, them: 3 }],
      { matchFormat: "best_of_3", matchType: "ranked" }
    );
    expect(r.ok).toBe(true);
    expect(r.winner).toBe("submitter");
  });

  it("accepts 3-set with final match-tiebreak when finalSetFormat=match_tiebreak", () => {
    var r = validateMatchScore(
      [{ you: 6, them: 4 }, { you: 3, them: 6 }, { you: 10, them: 8 }],
      { matchFormat: "best_of_3", finalSetFormat: "match_tiebreak", matchType: "ranked" }
    );
    expect(r.ok).toBe(true);
    expect(r.winner).toBe("submitter");
  });

  it("rejects a single-set best_of_3 in ranked (incomplete)", () => {
    var r = validateMatchScore(
      [{ you: 6, them: 4 }],
      { matchFormat: "best_of_3", matchType: "ranked" }
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.RANKED_REQUIRES_COMPLETED);
  });

  it("accepts a single-set casual time-limited", () => {
    var r = validateMatchScore(
      [{ you: 5, them: 3 }],
      { matchFormat: "best_of_3", matchType: "casual", completionType: "time_limited", allowPartialScores: true }
    );
    expect(r.ok).toBe(true);
    expect(r.completionStatus).toBe("partial");
  });

  it("rejects a single-set casual without allowPartialScores", () => {
    var r = validateMatchScore(
      [{ you: 5, them: 3 }],
      { matchFormat: "best_of_3", matchType: "casual", completionType: "time_limited", allowPartialScores: false }
    );
    expect(r.ok).toBe(false);
    expect([CODES.INVALID_NORMAL_SET, CODES.INCOMPLETE_MATCH]).toContain(r.code);
  });

  it("accepts a 3-set decider with valid normal final set when finalSetFormat=normal_set", () => {
    var r = validateMatchScore(
      [{ you: 6, them: 4 }, { you: 3, them: 6 }, { you: 7, them: 5 }],
      { matchFormat: "best_of_3", finalSetFormat: "normal_set", matchType: "ranked" }
    );
    expect(r.ok).toBe(true);
  });

  it("rejects a final 'match-tiebreak-style' set when finalSetFormat=normal_set", () => {
    var r = validateMatchScore(
      [{ you: 6, them: 4 }, { you: 3, them: 6 }, { you: 10, them: 8 }],
      { matchFormat: "best_of_3", finalSetFormat: "normal_set", matchType: "ranked" }
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.INVALID_NORMAL_SET);
  });
});

describe("validateMatchScore — partial / time-limited paths", () => {
  it("ranked + partial → RANKED_REQUIRES_COMPLETED", () => {
    var r = validateMatchScore(
      [{ you: 5, them: 3 }],
      { matchFormat: "best_of_3", matchType: "ranked", completionType: "time_limited", allowPartialScores: true }
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.RANKED_REQUIRES_COMPLETED);
  });

  it("casual + completed flag + partial sets → still passes the partial path? No — we treat partial sets as shape errors when completionType=completed", () => {
    var r = validateMatchScore(
      [{ you: 5, them: 3 }],
      { matchFormat: "best_of_3", matchType: "casual", completionType: "completed", allowPartialScores: true }
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.INVALID_NORMAL_SET);
  });

  it("casual + time-limited + multiple partial sets passes", () => {
    var r = validateMatchScore(
      [{ you: 5, them: 3 }, { you: 4, them: 4 }],
      { matchFormat: "best_of_3", matchType: "casual", completionType: "time_limited", allowPartialScores: true }
    );
    expect(r.ok).toBe(true);
    expect(r.completionStatus).toBe("partial");
  });

  it("casual + time-limited + invalid garbage still fails", () => {
    var r = validateMatchScore(
      [{ you: -1, them: 3 }],
      { matchFormat: "best_of_3", matchType: "casual", completionType: "time_limited", allowPartialScores: true }
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.NEGATIVE);
  });
});

describe("validateMatchScore — league rules", () => {
  it("ranked match into ranked league passes", () => {
    var r = validateMatchScore(
      [{ you: 6, them: 4 }, { you: 6, them: 3 }],
      { matchFormat: "best_of_3", matchType: "ranked", leagueMode: "ranked" }
    );
    expect(r.ok).toBe(true);
  });

  it("casual match into ranked league fails", () => {
    var r = validateMatchScore(
      [{ you: 6, them: 4 }, { you: 6, them: 3 }],
      { matchFormat: "best_of_3", matchType: "casual", leagueMode: "ranked" }
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.LEAGUE_DISALLOWS_MATCH_TYPE);
  });

  it("partial score into ranked league (allowPartial=false) fails", () => {
    var r = validateMatchScore(
      [{ you: 5, them: 3 }],
      {
        matchFormat: "best_of_3", matchType: "ranked",
        leagueMode: "ranked", leagueAllowPartial: false,
        completionType: "time_limited", allowPartialScores: true,
      }
    );
    // ranked path triggers first
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.RANKED_REQUIRES_COMPLETED);
  });

  it("partial score into casual league with allowPartialScores=true passes", () => {
    var r = validateMatchScore(
      [{ you: 5, them: 3 }],
      {
        matchFormat: "best_of_3", matchType: "casual",
        leagueMode: "casual", leagueAllowPartial: true,
        completionType: "time_limited", allowPartialScores: true,
      }
    );
    expect(r.ok).toBe(true);
    expect(r.completionStatus).toBe("partial");
  });

  it("partial score into casual league WITHOUT allowPartialScores fails", () => {
    var r = validateMatchScore(
      [{ you: 5, them: 3 }],
      {
        matchFormat: "best_of_3", matchType: "casual",
        leagueMode: "casual", leagueAllowPartial: false,
        completionType: "time_limited", allowPartialScores: true,
      }
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.LEAGUE_DISALLOWS_PARTIAL);
  });
});

describe("deriveMatchWinner", () => {
  it("returns the set winner for one_set", () => {
    expect(deriveMatchWinner([{ you: 6, them: 4 }], { matchFormat: "one_set" })).toBe("submitter");
    expect(deriveMatchWinner([{ you: 4, them: 6 }], { matchFormat: "one_set" })).toBe("opponent");
  });

  it("returns submitter / opponent for best_of_3 sweeps", () => {
    expect(deriveMatchWinner(
      [{ you: 6, them: 4 }, { you: 6, them: 3 }],
      { matchFormat: "best_of_3" }
    )).toBe("submitter");
    expect(deriveMatchWinner(
      [{ you: 4, them: 6 }, { you: 3, them: 6 }],
      { matchFormat: "best_of_3" }
    )).toBe("opponent");
  });

  it("returns the third-set winner in best_of_3", () => {
    expect(deriveMatchWinner(
      [{ you: 6, them: 4 }, { you: 3, them: 6 }, { you: 6, them: 3 }],
      { matchFormat: "best_of_3" }
    )).toBe("submitter");
  });

  it("returns null when no completed sets", () => {
    expect(deriveMatchWinner([{ you: 5, them: 3 }], { matchFormat: "best_of_3" })).toBe(null);
  });
});

describe("getScoreValidationMessage — sanity", () => {
  it("returns specific tennis hints for known patterns", () => {
    expect(getScoreValidationMessage(CODES.INVALID_NORMAL_SET, { you: 6, them: 5 })).toMatch(/6-5/);
    expect(getScoreValidationMessage(CODES.INVALID_NORMAL_SET, { you: 6, them: 6 })).toMatch(/tiebreak|tie-break/i);
  });

  it("RANKED_REQUIRES_COMPLETED suggests a casual fallback", () => {
    expect(getScoreValidationMessage(CODES.RANKED_REQUIRES_COMPLETED)).toMatch(/casual|time-limited/i);
  });

  it("LEAGUE_DISALLOWS_PARTIAL is league-aware", () => {
    expect(getScoreValidationMessage(CODES.LEAGUE_DISALLOWS_PARTIAL)).toMatch(/league/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
// V1.2: tiebreak winner-consistency + new helpers
// ─────────────────────────────────────────────────────────────────────

describe("validateTiebreakScore — winner consistency", () => {
  it("7-6 set, inner 7-4 with set winner 'you' → ok", () => {
    expect(
      validateTiebreakScore({ you: 7, them: 4 }, { expectedWinner: "you" }).ok
    ).toBe(true);
  });
  it("7-6 set, inner 7-5 with set winner 'them' → mismatch", () => {
    var r = validateTiebreakScore({ you: 7, them: 5 }, { expectedWinner: "them" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.TIEBREAK_WINNER_MISMATCH);
  });
  it("inner 7-6 (not won by 2) → invalid (not mismatch)", () => {
    var r = validateTiebreakScore({ you: 7, them: 6 }, { expectedWinner: "you" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.INVALID_TIEBREAK_DETAILS);
  });
  it("inner 5-3 (didn't reach 7) → invalid", () => {
    var r = validateTiebreakScore({ you: 5, them: 3 }, { expectedWinner: "you" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.INVALID_TIEBREAK_DETAILS);
  });
  it("missing tieBreak → required", () => {
    var r = validateTiebreakScore(null, { expectedWinner: "you" });
    expect(r.code).toBe(CODES.TIEBREAK_DETAILS_REQUIRED);
  });
  it("no expectedWinner provided → only checks shape", () => {
    expect(validateTiebreakScore({ you: 7, them: 5 }).ok).toBe(true);
  });
});

describe("isCompletedSet / validateSetScore — tiebreak winner mismatch", () => {
  it("7-6 with inner won by them (5-7) → not completed", () => {
    expect(isCompletedSet({ you: 7, them: 6, tieBreak: { you: 5, them: 7 } })).toBe(false);
  });
  it("6-7 with inner won by you (7-5) → not completed", () => {
    expect(isCompletedSet({ you: 6, them: 7, tieBreak: { you: 7, them: 5 } })).toBe(false);
  });
  it("7-6 with inner won by you (7-4) → completed", () => {
    expect(isCompletedSet({ you: 7, them: 6, tieBreak: { you: 7, them: 4 } })).toBe(true);
  });
  it("6-7 with inner won by them (3-7) → completed", () => {
    expect(isCompletedSet({ you: 6, them: 7, tieBreak: { you: 3, them: 7 } })).toBe(true);
  });
  it("validateSetScore surfaces the mismatch code", () => {
    var r = validateSetScore({ you: 7, them: 6, tieBreak: { you: 5, them: 7 } });
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.TIEBREAK_WINNER_MISMATCH);
  });
  it("8-6 inner with set winner 'you' (7-6 games) still passes", () => {
    // Existing behaviour: 8-6 is win-by-2 ≥7. Winner 'you' on both
    // games (7-6) and inner (8-6) — should remain valid.
    expect(isCompletedSet({ you: 7, them: 6, tieBreak: { you: 8, them: 6 } })).toBe(true);
  });
});

describe("isTiebreakSet", () => {
  it("7-6 → true", () => { expect(isTiebreakSet({ you: 7, them: 6 })).toBe(true); });
  it("6-7 → true", () => { expect(isTiebreakSet({ you: 6, them: 7 })).toBe(true); });
  it("6-3 → false", () => { expect(isTiebreakSet({ you: 6, them: 3 })).toBe(false); });
  it("10-8 (match-tiebreak) → false", () => { expect(isTiebreakSet({ you: 10, them: 8 })).toBe(false); });
  it("empty → false", () => { expect(isTiebreakSet({ you: "", them: "" })).toBe(false); });
});

describe("formatSetScore", () => {
  it("6-3 (no tiebreak)", () => {
    expect(formatSetScore({ you: 6, them: 3 })).toBe("6-3");
  });
  it("7-6 with valid tiebreak details renders winner-first", () => {
    expect(formatSetScore({ you: 7, them: 6, tieBreak: { you: 7, them: 4 } })).toBe("7-6 (7-4)");
  });
  it("6-7 with valid tiebreak renders winner-first", () => {
    expect(formatSetScore({ you: 6, them: 7, tieBreak: { you: 4, them: 7 } })).toBe("6-7 (7-4)");
  });
  it("7-6 without tiebreak details just renders the games", () => {
    expect(formatSetScore({ you: 7, them: 6 })).toBe("7-6");
  });
  it("10-8 final set match-tiebreak (no inner tieBreak field)", () => {
    expect(formatSetScore({ you: 10, them: 8 })).toBe("10-8");
  });
  it("missing one side renders an em-dash", () => {
    expect(formatSetScore({ you: 6, them: "" })).toBe("6-—");
    expect(formatSetScore({ you: "", them: 4 })).toBe("—-4");
  });
  it("both empty → empty string", () => {
    expect(formatSetScore({ you: "", them: "" })).toBe("");
  });
  it("null set → empty", () => {
    expect(formatSetScore(null)).toBe("");
  });
  it("invalid tiebreak (incomplete) renders the games only", () => {
    expect(formatSetScore({ you: 7, them: 6, tieBreak: { you: "", them: "" } })).toBe("7-6");
  });
});

describe("formatMatchScore", () => {
  it("joins set strings with ', '", () => {
    expect(formatMatchScore([
      { you: 6, them: 3 },
      { you: 7, them: 6, tieBreak: { you: 7, them: 4 } },
    ])).toBe("6-3, 7-6 (7-4)");
  });
  it("ignores empty trailing rows", () => {
    expect(formatMatchScore([
      { you: 6, them: 3 },
      { you: "", them: "" },
    ])).toBe("6-3");
  });
  it("non-array → empty", () => { expect(formatMatchScore(null)).toBe(""); });
});

// ─────────────────────────────────────────────────────────────────────
// Regression: validator auto-derives format from sets count when no
// explicit matchFormat is supplied (Module 7.7 follow-up).
// ─────────────────────────────────────────────────────────────────────

describe("validateMatchScore — auto-derived format", () => {
  function ranked(sets, opts) {
    return validateMatchScore(sets, Object.assign({
      matchType: "ranked",
      completionType: "completed",
      // matchFormat omitted on purpose — this is the regression case:
      // a non-league submission must be treated as one_set when a
      // single completed set is provided, NOT rejected as
      // best-of-3 incomplete.
    }, opts || {}));
  }
  function casual(sets) {
    return validateMatchScore(sets, {
      matchType: "casual", completionType: "completed",
    });
  }

  it("ranked 1 set 6-4 → ok (was RANKED_REQUIRES_COMPLETED)", () => {
    expect(ranked([{ you: 6, them: 4 }]).ok).toBe(true);
  });
  it("ranked 1 set 7-5 → ok", () => {
    expect(ranked([{ you: 7, them: 5 }]).ok).toBe(true);
  });
  it("ranked 1 set 7-6 with valid TB → ok", () => {
    expect(ranked([{ you: 7, them: 6, tieBreak: { you: 7, them: 4 } }]).ok).toBe(true);
  });
  it("ranked 1 set 7-6 (8-6) — TB ≥7 win-by-2 → ok", () => {
    expect(ranked([{ you: 7, them: 6, tieBreak: { you: 8, them: 6 } }]).ok).toBe(true);
  });
  it("ranked 1 set 7-6 (12-10) → ok", () => {
    expect(ranked([{ you: 7, them: 6, tieBreak: { you: 12, them: 10 } }]).ok).toBe(true);
  });
  it("ranked 1 set 7-6 without TB → still requires TB details", () => {
    var r = ranked([{ you: 7, them: 6 }], { requireTiebreakDetails: true });
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODES.TIEBREAK_DETAILS_REQUIRED);
  });
  it("casual 1 set 6-4 completed → ok (was INCOMPLETE_MATCH)", () => {
    expect(casual([{ you: 6, them: 4 }]).ok).toBe(true);
  });
  it("casual 1 set 7-6 completed → ok", () => {
    expect(casual([{ you: 7, them: 6 }]).ok).toBe(true);
  });

  it("BO3 ranked 6-4 6-3 → ok (auto-derives best_of_3 from 2 sets)", () => {
    expect(ranked([{ you: 6, them: 4 }, { you: 6, them: 3 }]).ok).toBe(true);
  });
  it("BO3 ranked split 1-1 → REJECTS as incomplete", () => {
    var r = ranked([{ you: 6, them: 4 }, { you: 3, them: 6 }]);
    expect(r.ok).toBe(false);
  });
  it("BO3 ranked 3-set → ok (auto-derives best_of_3 from 3 sets)", () => {
    expect(ranked([{ you: 6, them: 4 }, { you: 3, them: 6 }, { you: 7, them: 5 }]).ok).toBe(true);
  });

  it("explicit format=one_set still works (league override)", () => {
    var r = validateMatchScore([{ you: 6, them: 4 }], {
      matchType: "ranked",
      completionType: "completed",
      matchFormat: "one_set",
    });
    expect(r.ok).toBe(true);
  });
  it("explicit format=best_of_3 with 1 set still rejects (league forces BO3)", () => {
    var r = validateMatchScore([{ you: 6, them: 4 }], {
      matchType: "ranked",
      completionType: "completed",
      matchFormat: "best_of_3",
    });
    expect(r.ok).toBe(false);
  });
});

describe("normalizeSetFromDb / serializeSetForDb round-trip", () => {
  it("game-only set survives round-trip", () => {
    var n = normalizeSetFromDb({ you: 6, them: 3 });
    expect(serializeSetForDb(n)).toEqual({ you: 6, them: 3 });
  });
  it("tiebreak set survives round-trip", () => {
    var n = normalizeSetFromDb({ you: 7, them: 6, tieBreak: { you: 7, them: 4 } });
    expect(serializeSetForDb(n)).toEqual({ you: 7, them: 6, tieBreak: { you: 7, them: 4 } });
  });
  it("serialize strips half-filled tieBreak", () => {
    expect(serializeSetForDb({ you: 7, them: 6, tieBreak: { you: 7, them: "" } }))
      .toEqual({ you: 7, them: 6 });
  });
  it("serialize strips empty tieBreak object", () => {
    expect(serializeSetForDb({ you: 6, them: 3, tieBreak: { you: "", them: "" } }))
      .toEqual({ you: 6, them: 3 });
  });
  it("serialize coerces string tiebreak halves to numbers", () => {
    expect(serializeSetForDb({ you: 7, them: 6, tieBreak: { you: "7", them: "4" } }))
      .toEqual({ you: 7, them: 6, tieBreak: { you: 7, them: 4 } });
  });
  it("normalize on missing input returns empty shape", () => {
    expect(normalizeSetFromDb(null)).toEqual({ you: "", them: "" });
  });
});
