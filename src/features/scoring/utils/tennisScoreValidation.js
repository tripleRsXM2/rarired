// src/features/scoring/utils/tennisScoreValidation.js
//
// Central tennis score validation — pure functions, no React, no
// Supabase, no UI strings beyond the error-code → message lookup.
// Used by:
//   - ScoreModal.handleSave (UI gate, slice B)
//   - useMatchHistory.submitMatch (service-layer guard, slice C)
//   - validate_match_score DB trigger via parity logic (slice D)
//
// Set shape:
//   { you: string|number, them: string|number, tieBreak?: {you, them} }
//
// Set scores represent GAMES won. tieBreak (when present) is the
// inner tiebreak point score for a 7-6 / 6-7 set. The optional field
// is open-shape jsonb on the DB side — old rows without it remain
// valid; the validator treats missing tieBreak as "not provided"
// rather than an error unless `requireTiebreakDetails` is set.
//
// Options passed to the public APIs:
//   matchType: 'ranked' | 'casual' (default 'ranked')
//   completionType: 'completed' | 'time_limited' | 'retired' | 'abandoned'
//                   (default 'completed')
//   matchFormat: 'one_set' | 'best_of_3' | 'custom' (default 'best_of_3')
//   finalSetFormat: 'normal_set' | 'match_tiebreak' (default 'normal_set')
//   allowPartialScores: boolean — only honoured for non-ranked +
//                       non-completed; default false
//   requireTiebreakDetails: boolean — when true, a 7-6/6-7 set
//                          without a tieBreak object fails. Default false
//                          (today's submission flow doesn't collect
//                          inner tiebreak scores; if/when slice E adds
//                          a tiebreak input this flag flips on).
//   leagueMode: 'ranked' | 'casual' | null
//   leagueAllowPartial: boolean (defaults false)
//
// Return shape from validate*:
//   { ok: boolean, code: string, message: string, winner?, ... }
// where `code` is one of the constants below. `winner` is set on
// validateMatchScore only.

// ── Error / status codes ────────────────────────────────────────────────────
export var CODES = {
  OK:                          "OK",
  EMPTY_SCORE:                 "EMPTY_SCORE",
  NON_NUMERIC:                 "NON_NUMERIC",
  NEGATIVE:                    "NEGATIVE",
  NON_INTEGER:                 "NON_INTEGER",
  INVALID_NORMAL_SET:          "INVALID_NORMAL_SET",
  TIEBREAK_DETAILS_REQUIRED:   "TIEBREAK_DETAILS_REQUIRED",
  INVALID_TIEBREAK_DETAILS:    "INVALID_TIEBREAK_DETAILS",
  INVALID_MATCH_TIEBREAK:      "INVALID_MATCH_TIEBREAK",
  PARTIAL_SET_IN_COMPLETED:    "PARTIAL_SET_IN_COMPLETED",
  NO_SETS:                     "NO_SETS",
  WRONG_NUMBER_OF_SETS:        "WRONG_NUMBER_OF_SETS",
  INCOMPLETE_MATCH:            "INCOMPLETE_MATCH",
  RANKED_REQUIRES_COMPLETED:   "RANKED_REQUIRES_COMPLETED",
  LEAGUE_DISALLOWS_PARTIAL:    "LEAGUE_DISALLOWS_PARTIAL",
  LEAGUE_DISALLOWS_MATCH_TYPE: "LEAGUE_DISALLOWS_MATCH_TYPE",
};

// ── Internal helpers ────────────────────────────────────────────────────────

function toNum(v) {
  // Returns { ok, n, code } — code is set when ok is false.
  if (v === null || v === undefined || v === "") {
    return { ok: false, code: CODES.EMPTY_SCORE };
  }
  var s = String(v).trim();
  if (s === "") return { ok: false, code: CODES.EMPTY_SCORE };
  // Reject leading + or non-digit prefixes that Number() would coerce silently
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, code: CODES.NON_NUMERIC };
  var n = Number(s);
  if (Number.isNaN(n)) return { ok: false, code: CODES.NON_NUMERIC };
  if (n < 0) return { ok: false, code: CODES.NEGATIVE };
  if (!Number.isInteger(n)) return { ok: false, code: CODES.NON_INTEGER };
  return { ok: true, n: n };
}

function bothFilled(set) {
  if (!set) return false;
  var y = set.you;
  var t = set.them;
  if (y === null || y === undefined || String(y).trim() === "") return false;
  if (t === null || t === undefined || String(t).trim() === "") return false;
  return true;
}

// Valid completed NORMAL set patterns (a, b) where a > b:
//   (6, 0..4), (7, 5), (7, 6) -- 7-6 requires tiebreak when required
// Mirrored for opponent wins: (0..4, 6), (5, 7), (6, 7)
function classifyNormalSet(y, t) {
  if (y === t) return null;                      // tied games, not a valid completed pattern
  var hi = Math.max(y, t);
  var lo = Math.min(y, t);
  if (hi === 6 && lo >= 0 && lo <= 4) return "normal_6_0_to_6_4";
  if (hi === 7 && lo === 5)           return "normal_7_5";
  if (hi === 7 && lo === 6)           return "tiebreak_7_6";
  return null;
}

// Tiebreak inner-score validity. pointsToWin = 7 for a set tiebreak,
// 10 for a match tiebreak. Winner needs >= pointsToWin AND margin >= 2.
function tiebreakOk(tb, pointsToWin) {
  if (!tb) return false;
  var ay = toNum(tb.you);
  var at = toNum(tb.them);
  if (!ay.ok || !at.ok) return false;
  var hi = Math.max(ay.n, at.n);
  var lo = Math.min(ay.n, at.n);
  if (ay.n === at.n) return false;
  if (hi < pointsToWin) return false;
  if (hi - lo < 2) return false;
  return true;
}

// Match-tiebreak set: stored shape today is `{you, them}` where the
// games-column actually holds the match-tiebreak points (e.g. 10-8
// stored as you:10 them:8). Validator checks that pattern: hi>=10,
// margin>=2.
function classifyMatchTiebreakSet(y, t) {
  if (y === t) return null;
  var hi = Math.max(y, t);
  var lo = Math.min(y, t);
  if (hi >= 10 && (hi - lo) >= 2) return "match_tiebreak_ok";
  return null;
}

// ── Public: per-set predicates ──────────────────────────────────────────────

export function isCompletedSet(set, options) {
  options = options || {};
  if (!bothFilled(set)) return false;
  var y = toNum(set.you), t = toNum(set.them);
  if (!y.ok || !t.ok) return false;
  if (options.isFinalMatchTiebreak === true) {
    return classifyMatchTiebreakSet(y.n, t.n) !== null;
  }
  var kind = classifyNormalSet(y.n, t.n);
  if (kind === null) return false;
  if (kind === "tiebreak_7_6") {
    if (options.requireTiebreakDetails) return tiebreakOk(set.tieBreak, 7);
    // Tolerant default: 7-6 alone is treated as completed; if tiebreak
    // details are present they MUST be valid.
    if (set.tieBreak) return tiebreakOk(set.tieBreak, 7);
    return true;
  }
  return true;
}

export function isPartialSet(set, options) {
  // A "partial" set has scores entered but does not match a completed pattern.
  // Empty-or-numeric-error sets are NOT considered partial — they're "absent".
  options = options || {};
  if (!bothFilled(set)) return false;
  var y = toNum(set.you), t = toNum(set.them);
  if (!y.ok || !t.ok) return false;
  return !isCompletedSet(set, options);
}

export function isValidTiebreakScore(tieBreak, options) {
  options = options || {};
  var pointsToWin = options.pointsToWin || 7;
  return tiebreakOk(tieBreak, pointsToWin);
}

// ── Public: validateSetScore ────────────────────────────────────────────────

export function validateSetScore(set, options) {
  options = options || {};
  if (!bothFilled(set)) {
    return { ok: false, code: CODES.EMPTY_SCORE, message: getScoreValidationMessage(CODES.EMPTY_SCORE) };
  }
  var y = toNum(set.you);
  if (!y.ok) return { ok: false, code: y.code, message: getScoreValidationMessage(y.code) };
  var t = toNum(set.them);
  if (!t.ok) return { ok: false, code: t.code, message: getScoreValidationMessage(t.code) };

  if (options.isFinalMatchTiebreak === true) {
    if (classifyMatchTiebreakSet(y.n, t.n) === null) {
      return { ok: false, code: CODES.INVALID_MATCH_TIEBREAK, message: getScoreValidationMessage(CODES.INVALID_MATCH_TIEBREAK) };
    }
    return { ok: true, code: CODES.OK, message: "" };
  }

  var kind = classifyNormalSet(y.n, t.n);
  if (kind === null) {
    return { ok: false, code: CODES.INVALID_NORMAL_SET, message: getScoreValidationMessage(CODES.INVALID_NORMAL_SET, { you: y.n, them: t.n }) };
  }
  if (kind === "tiebreak_7_6") {
    if (options.requireTiebreakDetails && !set.tieBreak) {
      return { ok: false, code: CODES.TIEBREAK_DETAILS_REQUIRED, message: getScoreValidationMessage(CODES.TIEBREAK_DETAILS_REQUIRED) };
    }
    if (set.tieBreak && !tiebreakOk(set.tieBreak, 7)) {
      return { ok: false, code: CODES.INVALID_TIEBREAK_DETAILS, message: getScoreValidationMessage(CODES.INVALID_TIEBREAK_DETAILS) };
    }
  }
  return { ok: true, code: CODES.OK, message: "" };
}

// ── Public: deriveMatchWinner ───────────────────────────────────────────────
// Returns 'submitter' | 'opponent' | null. Only counts COMPLETED sets in
// the given format. For partial / time-limited matches, returns the leader
// by completed-set count (or null on a tie).

export function deriveMatchWinner(sets, options) {
  options = options || {};
  var format = options.matchFormat || "best_of_3";
  var finalSetFormat = options.finalSetFormat || "normal_set";
  if (!Array.isArray(sets) || sets.length === 0) return null;

  var subWins = 0, oppWins = 0;
  for (var i = 0; i < sets.length; i++) {
    var isLast = i === sets.length - 1;
    var thisSetIsMatchTb = (
      format === "best_of_3" &&
      finalSetFormat === "match_tiebreak" &&
      isLast &&
      // Only treat the last set as a match-tiebreak when the match is on
      // the brink (1-1 in normal sets) — otherwise it's just a 3rd normal set.
      subWins === 1 && oppWins === 1
    );
    var setOpts = { isFinalMatchTiebreak: thisSetIsMatchTb, requireTiebreakDetails: !!options.requireTiebreakDetails };
    if (!isCompletedSet(sets[i], setOpts)) continue;
    var y = toNum(sets[i].you).n;
    var t = toNum(sets[i].them).n;
    if (y > t) subWins++; else if (t > y) oppWins++;
  }

  if (format === "one_set") {
    if (subWins > oppWins) return "submitter";
    if (oppWins > subWins) return "opponent";
    return null;
  }
  // best_of_3 / custom
  if (subWins >= 2 && subWins > oppWins) return "submitter";
  if (oppWins >= 2 && oppWins > subWins) return "opponent";
  // Partial — leader by completed-set count
  if (subWins > oppWins) return "submitter";
  if (oppWins > subWins) return "opponent";
  return null;
}

// ── Public: validateMatchScore ──────────────────────────────────────────────
//
// Top-level entry the UI + service layer call. Returns
//   { ok, code, message, perSet: [{code, ...}], winner: 'submitter'|'opponent'|null,
//     completionStatus: 'completed' | 'partial', invalidIndex: number|null }

export function validateMatchScore(sets, options) {
  options = options || {};
  var matchType         = options.matchType || "ranked";
  var completionType    = options.completionType || "completed";
  var format            = options.matchFormat || "best_of_3";
  var finalSetFormat    = options.finalSetFormat || "normal_set";
  var allowPartial      = !!options.allowPartialScores;
  var leagueMode        = options.leagueMode || null;
  var leagueAllowPart   = !!options.leagueAllowPartial;

  if (!Array.isArray(sets)) sets = [];
  // Strip empty-on-both-sides set rows — the UI commonly has trailing blanks.
  var nonEmpty = sets.filter(function (s) {
    return (s && (String(s.you ?? "").trim() !== "" || String(s.them ?? "").trim() !== ""));
  });

  if (nonEmpty.length === 0) {
    return {
      ok: false, code: CODES.NO_SETS,
      message: getScoreValidationMessage(CODES.NO_SETS),
      perSet: [], winner: null, completionStatus: "partial", invalidIndex: null,
    };
  }

  // League/match-type compatibility — fast-fail before per-set checks.
  if (leagueMode && leagueMode !== matchType) {
    return {
      ok: false, code: CODES.LEAGUE_DISALLOWS_MATCH_TYPE,
      message: getScoreValidationMessage(CODES.LEAGUE_DISALLOWS_MATCH_TYPE, { leagueMode: leagueMode, matchType: matchType }),
      perSet: [], winner: null, completionStatus: "partial", invalidIndex: null,
    };
  }

  // Per-set validation in completion-aware mode.
  var perSet = [];
  var completedCount = 0;
  var partialCount   = 0;
  var subWins = 0, oppWins = 0;

  for (var i = 0; i < nonEmpty.length; i++) {
    var s = nonEmpty[i];
    var isLast = i === nonEmpty.length - 1;
    var thisSetIsMatchTb = (
      format === "best_of_3" &&
      finalSetFormat === "match_tiebreak" &&
      isLast &&
      subWins === 1 && oppWins === 1
    );
    var setOpts = { isFinalMatchTiebreak: thisSetIsMatchTb, requireTiebreakDetails: !!options.requireTiebreakDetails };

    // Numeric / shape validity is required for every set, ranked or casual.
    var basic = validateSetScore(s, setOpts);
    if (!basic.ok) {
      // For partial / time-limited / retired matches: a non-completed set
      // is OK only if it's "shape valid but not a finished pattern", AND
      // partials are allowed.
      var canBePartial = allowPartial && (completionType !== "completed");
      // Distinguish "garbage / negative / non-integer" from "valid integers
      // but not a completed pattern": validateSetScore returns
      // INVALID_NORMAL_SET / INVALID_MATCH_TIEBREAK for the latter.
      var isShapeError = basic.code === CODES.EMPTY_SCORE
                       || basic.code === CODES.NON_NUMERIC
                       || basic.code === CODES.NEGATIVE
                       || basic.code === CODES.NON_INTEGER
                       || basic.code === CODES.TIEBREAK_DETAILS_REQUIRED
                       || basic.code === CODES.INVALID_TIEBREAK_DETAILS;
      if (!canBePartial || isShapeError) {
        perSet.push(basic);
        return {
          ok: false, code: basic.code, message: basic.message,
          perSet: perSet, winner: null, completionStatus: "partial", invalidIndex: i,
        };
      }
      // Permissive partial path — record but keep going.
      perSet.push({ ok: true, code: CODES.OK, message: "", partial: true });
      partialCount++;
      // No winner contribution from a partial set.
      continue;
    }

    perSet.push(basic);
    completedCount++;
    var yn = toNum(s.you).n, tn = toNum(s.them).n;
    if (yn > tn) subWins++; else if (tn > yn) oppWins++;
  }

  // Format-level checks.
  if (format === "one_set") {
    if (nonEmpty.length > 1) {
      return {
        ok: false, code: CODES.WRONG_NUMBER_OF_SETS,
        message: getScoreValidationMessage(CODES.WRONG_NUMBER_OF_SETS, { format: format }),
        perSet: perSet, winner: null, completionStatus: "partial", invalidIndex: 1,
      };
    }
  } else if (format === "best_of_3") {
    if (nonEmpty.length > 3) {
      return {
        ok: false, code: CODES.WRONG_NUMBER_OF_SETS,
        message: getScoreValidationMessage(CODES.WRONG_NUMBER_OF_SETS, { format: format }),
        perSet: perSet, winner: null, completionStatus: "partial", invalidIndex: 3,
      };
    }
  }

  // Did the match actually finish?
  var winnerStr = null;
  var completed = false;
  if (format === "one_set" && completedCount === 1 && (subWins + oppWins) === 1) {
    winnerStr = subWins > oppWins ? "submitter" : "opponent";
    completed = true;
  } else if (format === "best_of_3") {
    if (subWins >= 2 && subWins > oppWins) { winnerStr = "submitter"; completed = true; }
    else if (oppWins >= 2 && oppWins > subWins) { winnerStr = "opponent"; completed = true; }
  } else if (format === "custom") {
    // Custom: leader by completed-set count counts as winner if any.
    if (subWins > oppWins) { winnerStr = "submitter"; completed = subWins > 0; }
    else if (oppWins > subWins) { winnerStr = "opponent"; completed = oppWins > 0; }
  }

  if (!completed) {
    // Partial / time-limited path: accept ONLY when explicitly allowed.
    var allowedAsPartial = allowPartial && (completionType !== "completed");
    if (matchType === "ranked") {
      return {
        ok: false, code: CODES.RANKED_REQUIRES_COMPLETED,
        message: getScoreValidationMessage(CODES.RANKED_REQUIRES_COMPLETED),
        perSet: perSet, winner: null, completionStatus: "partial", invalidIndex: null,
      };
    }
    if (leagueMode && !leagueAllowPart) {
      return {
        ok: false, code: CODES.LEAGUE_DISALLOWS_PARTIAL,
        message: getScoreValidationMessage(CODES.LEAGUE_DISALLOWS_PARTIAL),
        perSet: perSet, winner: null, completionStatus: "partial", invalidIndex: null,
      };
    }
    if (!allowedAsPartial) {
      return {
        ok: false, code: CODES.INCOMPLETE_MATCH,
        message: getScoreValidationMessage(CODES.INCOMPLETE_MATCH, { format: format }),
        perSet: perSet, winner: null, completionStatus: "partial", invalidIndex: null,
      };
    }
    // Partial accepted — derive a soft winner by leader count, no strict requirement.
    if (subWins > oppWins) winnerStr = "submitter";
    else if (oppWins > subWins) winnerStr = "opponent";
    return {
      ok: true, code: CODES.OK, message: "",
      perSet: perSet, winner: winnerStr, completionStatus: "partial", invalidIndex: null,
    };
  }

  return {
    ok: true, code: CODES.OK, message: "",
    perSet: perSet, winner: winnerStr, completionStatus: "completed", invalidIndex: null,
  };
}

// ── Public: getScoreValidationMessage ───────────────────────────────────────
//
// User-facing message for an error code. Where context helps, pass it in
// as the second arg ({ you, them, format, ... }).

export function getScoreValidationMessage(code, ctx) {
  ctx = ctx || {};
  switch (code) {
    case CODES.OK:
      return "";
    case CODES.EMPTY_SCORE:
      return "Each set needs a score on both sides.";
    case CODES.NON_NUMERIC:
      return "Set scores must be numbers.";
    case CODES.NEGATIVE:
      return "Set scores can't be negative.";
    case CODES.NON_INTEGER:
      return "Set scores must be whole numbers.";
    case CODES.INVALID_NORMAL_SET:
      if (ctx.you !== undefined && ctx.them !== undefined) {
        var hi = Math.max(ctx.you, ctx.them), lo = Math.min(ctx.you, ctx.them);
        if (hi === 6 && lo === 5) {
          return "A completed set can't end 6-5. Continue to 7-5 or 7-6, or save this as time-limited.";
        }
        if (hi === 6 && lo === 6) {
          return "6-6 isn't a finished set — it goes to a 7-point tiebreak (7-6 / 6-7).";
        }
      }
      return "That's not a valid completed tennis set. A normal set ends 6-0 to 6-4, 7-5, or 7-6 (with a tiebreak).";
    case CODES.TIEBREAK_DETAILS_REQUIRED:
      return "A 7-6 set needs a valid tiebreak score.";
    case CODES.INVALID_TIEBREAK_DETAILS:
      return "Tiebreak score must reach 7 with a 2-point lead (e.g. 7-4, 9-7).";
    case CODES.INVALID_MATCH_TIEBREAK:
      return "Match tiebreak must reach 10 with a 2-point lead (e.g. 10-6, 12-10).";
    case CODES.PARTIAL_SET_IN_COMPLETED:
      return "A completed match can't end mid-set.";
    case CODES.NO_SETS:
      return "Add at least one set score.";
    case CODES.WRONG_NUMBER_OF_SETS:
      if (ctx.format === "one_set") return "This match format expects a single set.";
      return "Best-of-3 has at most three sets.";
    case CODES.INCOMPLETE_MATCH:
      if (ctx.format === "one_set") return "Enter a completed set, or save as time-limited.";
      return "A best-of-3 needs one player to win two sets, or save as time-limited.";
    case CODES.RANKED_REQUIRES_COMPLETED:
      return "A ranked match must be completed before it can affect rating. Save it as a casual time-limited result instead?";
    case CODES.LEAGUE_DISALLOWS_PARTIAL:
      return "This league only accepts completed results — partial / time-limited scores aren't allowed here.";
    case CODES.LEAGUE_DISALLOWS_MATCH_TYPE:
      if (ctx.leagueMode === "ranked") return "This league only accepts ranked matches.";
      return "This league only accepts casual matches.";
    default:
      return "Score is invalid.";
  }
}
