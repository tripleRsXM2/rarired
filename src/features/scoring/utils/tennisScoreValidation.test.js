// src/features/scoring/utils/tennisScoreValidation.test.js
import { describe, it, expect } from "vitest";
import {
  CODES,
  isCompletedSet,
  isPartialSet,
  isValidTiebreakScore,
  validateSetScore,
  validateMatchScore,
  deriveMatchWinner,
  getScoreValidationMessage,
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
