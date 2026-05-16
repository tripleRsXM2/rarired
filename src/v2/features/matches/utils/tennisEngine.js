// tennisEngine.js — pure scoring logic, no UI. Ported from the v2 Claude
// Design `tennis-engine.jsx`. Handles best-of-3, best-of-5, doubles,
// regular/super tiebreaks, deuce/ad, changeover detection, undo stack,
// basic stats. No React imports — safe to call from anywhere.

const POINT_LABELS = ["0", "15", "30", "40", "Ad"];

// `label` is the human-readable badge each format renders as in the
// scoreboard ("Bo3" / "Pro 8" / "Free play"). `freeplay` is the
// no-format option: huge setLen + sets count means games still
// auto-close at 4-with-2 inside a game, but sets never auto-close
// at 6 games and the match never auto-ends — the user owns set
// boundaries via the End-set button and ends the match via Save.
// User feedback: "in live scoring there is a format, can you add
// a no format too?"
export const FORMATS = {
  bo3:        { sets: 3,  setLen: 6,  finalTb: "reg",   label: "Bo3" },
  bo5:        { sets: 5,  setLen: 6,  finalTb: "reg",   label: "Bo5" },
  bo3_super:  { sets: 3,  setLen: 6,  finalTb: "super", label: "Bo3 · super TB" },
  pro8:       { sets: 1,  setLen: 8,  finalTb: "reg",   label: "Pro 8" },
  tb7:        { sets: 1,  setLen: 0,  finalTb: "reg",   tbOnly: true, label: "7-pt TB" },
  tb10:       { sets: 1,  setLen: 0,  finalTb: "super", tbOnly: true, label: "10-pt TB" },
  freeplay:   { sets: 99, setLen: 99, finalTb: "reg",   label: "Free play" },
};

export function newMatch({
  format = "bo3",
  doubles = false,
  p1 = { name: "You",      team: ["You"] },
  p2 = { name: "Opponent", team: ["Opponent"] },
  serverIndex = 0,
} = {}) {
  const cfg = FORMATS[format];
  return {
    id: "m_" + Date.now(),
    format, doubles, p1, p2,
    cfg,
    startedAt: Date.now(),
    endedAt: null,
    serverIndex,
    points: [0, 0],
    games: [0, 0],
    setsWon: [0, 0],
    setHistory: [],
    inTiebreak: !!cfg.tbOnly,
    tbPoints: [0, 0],
    tbServerStart: serverIndex,
    log: [],
    stats: {
      aces: [0, 0], dfs: [0, 0], winners: [0, 0], errors: [0, 0],
      pointsWon: [0, 0],
    },
    history: [],
  };
}

function snapshot(m) {
  return JSON.parse(JSON.stringify({
    points: m.points, games: m.games, setsWon: m.setsWon,
    setHistory: m.setHistory, inTiebreak: m.inTiebreak,
    tbPoints: m.tbPoints, tbServerStart: m.tbServerStart,
    serverIndex: m.serverIndex, log: m.log, stats: m.stats,
    endedAt: m.endedAt,
  }));
}

function restoreSnapshot(m, s) { Object.assign(m, s); return m; }

export function addPoint(m, winner, tag = null) {
  if (m.endedAt) return m;
  m.history.push(snapshot(m));
  m.stats.pointsWon[winner]++;
  if (tag === "ace")     m.stats.aces[winner]++;
  if (tag === "df")      m.stats.dfs[1 - winner]++;
  if (tag === "winner")  m.stats.winners[winner]++;
  if (tag === "error")   m.stats.errors[1 - winner]++;
  m.log.push({ t: Date.now(), winner, tag, set: m.setHistory.length, game: m.games[0] + m.games[1] });

  if (m.inTiebreak) {
    m.tbPoints[winner]++;
    const target = (m.cfg.finalTb === "super" && m.setsWon[0] + m.setsWon[1] === m.cfg.sets - 1) ? 10 : 7;
    const a = m.tbPoints[winner], b = m.tbPoints[1 - winner];
    const totalTb = a + b;
    if (totalTb === 1 || (totalTb >= 1 && (totalTb - 1) % 2 === 1)) {
      m.serverIndex = 1 - m.serverIndex;
    }
    if (a >= target && a - b >= 2) {
      finishSet(m, winner, true);
    }
    return m;
  }

  m.points[winner]++;
  const a = m.points[winner], b = m.points[1 - winner];
  if (a >= 4 && a - b >= 2) finishGame(m, winner);
  return m;
}

function finishGame(m, winner) {
  m.games[winner]++;
  m.points = [0, 0];
  m.serverIndex = 1 - m.serverIndex;

  const a = m.games[winner], b = m.games[1 - winner];
  const setLen = m.cfg.setLen;

  if (a === setLen && b < setLen - 1) {
    finishSet(m, winner, false);
  } else if (a === setLen + 1 && b === setLen - 1) {
    finishSet(m, winner, false);
  } else if (a === setLen && b === setLen) {
    m.inTiebreak = true;
    m.tbPoints = [0, 0];
    m.tbServerStart = m.serverIndex;
  }
}

function finishSet(m, winner, fromTb) {
  const setScore = fromTb
    ? (winner === 0 ? [m.games[0] + 1, m.games[1]] : [m.games[0], m.games[1] + 1])
    : [...m.games];
  m.setHistory.push({
    score: setScore,
    tb: fromTb ? [...m.tbPoints] : null,
  });
  m.setsWon[winner]++;
  m.games = [0, 0];
  m.points = [0, 0];
  m.inTiebreak = false;
  m.tbPoints = [0, 0];

  const needed = Math.ceil(m.cfg.sets / 2);
  if (m.setsWon[winner] >= needed) {
    m.endedAt = Date.now();
  } else if (m.cfg.finalTb === "super" && m.setsWon[0] + m.setsWon[1] === m.cfg.sets - 1) {
    m.inTiebreak = true;
    m.tbPoints = [0, 0];
    m.tbServerStart = m.serverIndex;
  }
}

// ── End set early ────────────────────────────────────────────────────────────
// Close out the current set with whatever games are on the board.
// User-driven: lets the user say "we played four games, let's call
// it" without playing all the way to 6. The winner of the closed
// set is whoever has more games; ties cap the set at "no winner"
// (we leave setsWon unchanged but advance the set index so the
// next set begins fresh). If the match would be over per the
// best-of-N rule after this set, endedAt is set.
//
// No-op when there's nothing to close (games still 0-0 and no
// tiebreak underway). Returns the mutated match.
export function endSetEarly(m) {
  if (!m || m.endedAt) return m;
  var games = Array.isArray(m.games) ? m.games : [0, 0];
  var hasTb = m.inTiebreak && Array.isArray(m.tbPoints) && (m.tbPoints[0] > 0 || m.tbPoints[1] > 0);
  if (games[0] === 0 && games[1] === 0 && !hasTb) return m;

  m.history.push(snapshot(m));

  m.setHistory.push({
    score: [games[0] || 0, games[1] || 0],
    tb: hasTb ? [m.tbPoints[0] || 0, m.tbPoints[1] || 0] : null,
  });
  if (games[0] > games[1])      m.setsWon[0]++;
  else if (games[1] > games[0]) m.setsWon[1]++;
  // Ties: no setsWon bump — the set is recorded for reference but
  // doesn't count toward the best-of-N goal.

  m.games   = [0, 0];
  m.points  = [0, 0];
  m.inTiebreak = false;
  m.tbPoints = [0, 0];

  var needed = Math.ceil(m.cfg.sets / 2);
  if (m.setsWon[0] >= needed || m.setsWon[1] >= needed) {
    m.endedAt = Date.now();
  } else if (
    m.cfg.finalTb === "super" &&
    m.setsWon[0] + m.setsWon[1] === m.cfg.sets - 1
  ) {
    m.inTiebreak = true;
    m.tbPoints = [0, 0];
    m.tbServerStart = m.serverIndex;
  }
  return m;
}

// ── Tag last point ───────────────────────────────────────────────────────────
// Re-label the most recent point in m.log AND reconcile its stat
// impact (rolls the old tag's stat back, then applies the new
// tag's). User flow: tap a tap-zone → point lands untagged → tap
// a chip ("Ace" / "Winner" / "Double fault" / "Unforced error" /
// "Net cord") → log entry updated.
//
// Tags accepted (matching addPoint's internal keys):
//   'ace'    — winner.aces++
//   'df'     — opponent.dfs++ (double fault is charged to the server,
//              i.e. the side that LOST the point)
//   'winner' — winner.winners++
//   'error'  — opponent.errors++ (unforced error charged to the loser)
//   'net'    — no stat impact, just a log label
//   null     — clears the tag + stat impact
export function tagLastPoint(m, tag) {
  if (!m || !Array.isArray(m.log) || m.log.length === 0) return m;
  var last = m.log[m.log.length - 1];
  if (!last) return m;
  var winner = last.winner;

  function applyDelta(t, sign) {
    if (!t || !m.stats) return;
    if (t === "ace"    && m.stats.aces)    m.stats.aces[winner]    = Math.max(0, (m.stats.aces[winner]    || 0) + sign);
    if (t === "df"     && m.stats.dfs)     m.stats.dfs[1 - winner] = Math.max(0, (m.stats.dfs[1 - winner] || 0) + sign);
    if (t === "winner" && m.stats.winners) m.stats.winners[winner] = Math.max(0, (m.stats.winners[winner] || 0) + sign);
    if (t === "error"  && m.stats.errors)  m.stats.errors[1 - winner] = Math.max(0, (m.stats.errors[1 - winner] || 0) + sign);
    // 'net' has no stat impact.
  }

  // Roll back old tag, apply new. No engine-state snapshot needed
  // because we don't want Undo to walk back through tag edits —
  // Undo is reserved for taking back the point itself.
  applyDelta(last.tag, -1);
  last.tag = tag || null;
  applyDelta(last.tag, +1);
  return m;
}

export function undo(m) {
  if (m.history.length === 0) return m;
  const s = m.history.pop();
  restoreSnapshot(m, s);
  return m;
}

export function pointLabel(m, side) {
  if (m.inTiebreak) return String(m.tbPoints[side]);
  const a = m.points[side], b = m.points[1 - side];
  if (a >= 3 && b >= 3) {
    if (a === b)     return "40";
    if (a === b + 1) return "Ad";
    return "—";
  }
  return POINT_LABELS[Math.min(a, 3)];
}

export function isDeuce(m) {
  return !m.inTiebreak && m.points[0] >= 3 && m.points[1] >= 3 && m.points[0] === m.points[1];
}

export function isMatchPoint(m) {
  if (m.endedAt) return -1;
  for (let s = 0; s < 2; s++) {
    const test = JSON.parse(JSON.stringify(m));
    test.history = [];
    addPoint(test, s);
    if (test.endedAt) return s;
  }
  return -1;
}

export function isChangeover(m) {
  const totalGames = m.games[0] + m.games[1];
  return !m.inTiebreak && totalGames > 0 && totalGames % 2 === 1 && m.points[0] === 0 && m.points[1] === 0;
}

export function isSetBreak(m) {
  return m.points[0] === 0 && m.points[1] === 0 && m.games[0] === 0 && m.games[1] === 0 && m.setHistory.length > 0 && !m.endedAt;
}

export function elapsedMs(m) {
  return (m.endedAt || Date.now()) - m.startedAt;
}

export function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

// ── Live → logV2Match handoff ─────────────────────────────────────────────────
// Reshape an in-flight engine match into the v2Sets payload `logV2Match`
// expects:
//   v2Sets : [{ score: [you, them], tb: [you, them] | null }, ...]
//
// Includes COMPLETED sets (engine.setHistory) AND — when the match
// is still in progress — the current-set games as a partial set so
// the user can Save at any point ("3-2 in the second" persists as
// 6-4, 3-2 etc.). User feedback: "I want it to be able to save and
// log at any point in the game." Tiebreak-only formats (TB7 / TB10
// / Pro 8) surface the running tiebreak points as a partial set too.
//
// Returns an empty array only when the match has literally no
// score on the board — fresh 0-0 with no games and no tiebreak
// points. Callers can treat that as "not ready to save".
export function engineToLogPayload(m) {
  if (!m) return [];
  var out = (Array.isArray(m.setHistory) ? m.setHistory : [])
    .map(function (sh) {
      if (!sh || !Array.isArray(sh.score)) return null;
      var s = { score: [sh.score[0] || 0, sh.score[1] || 0], tb: null };
      if (sh.tb && Array.isArray(sh.tb)) {
        s.tb = [sh.tb[0] || 0, sh.tb[1] || 0];
      }
      return s;
    })
    .filter(Boolean);

  // If the match has finalised (endedAt set), the engine has rolled
  // the final set into setHistory — nothing more to append.
  if (m.endedAt) return out;

  var hasGames = Array.isArray(m.games) && (m.games[0] > 0 || m.games[1] > 0);
  var hasTb    = m.inTiebreak && Array.isArray(m.tbPoints) && (m.tbPoints[0] > 0 || m.tbPoints[1] > 0);
  if (hasGames || hasTb) {
    var cur = {
      score: [
        (m.games && m.games[0]) || 0,
        (m.games && m.games[1]) || 0,
      ],
      tb: null,
    };
    if (hasTb) cur.tb = [m.tbPoints[0] || 0, m.tbPoints[1] || 0];
    out.push(cur);
  }
  return out;
}
