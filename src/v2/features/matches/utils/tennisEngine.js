// tennisEngine.js — pure scoring logic, no UI. Ported from the v2 Claude
// Design `tennis-engine.jsx`. Handles best-of-3, best-of-5, doubles,
// regular/super tiebreaks, deuce/ad, changeover detection, undo stack,
// basic stats. No React imports — safe to call from anywhere.

const POINT_LABELS = ["0", "15", "30", "40", "Ad"];

export const FORMATS = {
  bo3:        { sets: 3, setLen: 6, finalTb: "reg" },
  bo5:        { sets: 5, setLen: 6, finalTb: "reg" },
  bo3_super:  { sets: 3, setLen: 6, finalTb: "super" },
  pro8:       { sets: 1, setLen: 8, finalTb: "reg" },
  tb7:        { sets: 1, setLen: 0, finalTb: "reg",   tbOnly: true },
  tb10:       { sets: 1, setLen: 0, finalTb: "super", tbOnly: true },
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
