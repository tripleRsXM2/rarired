// src/features/profile/utils/profileStats.js
// Pure derivation helpers for profile stats. No React, no Supabase, no side
// effects — everything takes an array of normalised match objects and returns
// a derived summary. Shared by ProfileTab (own profile) and PlayerProfileView
// (anyone's public profile).
//
// A "match" in this module is the normalised shape from normalizeMatch():
//   { id, result: 'win'|'loss', sets, status, date, rawDate, oppName,
//     opponent_id, submitterId, isTagged, ... }
//
// Only confirmed matches count — anything disputed/voided/expired is ignored
// so the product vision ("verified tennis identity first") stays enforced.

function isConfirmed(m) {
  return m && m.status === "confirmed";
}

// Third-party rows (matches between two of the viewer's friends, surfaced
// via fetch_friends_matches) live in the same `history` array as own +
// tagged rows so the FeedCard list renders uniformly. But the viewer
// isn't a participant in those — they must NOT contribute to viewer-
// centric derivations: form, rivalry, win-rate, confirmation rate, etc.
function isViewerMatch(m) {
  return m && !m.isThirdParty;
}

// Last N confirmed matches as a sequence of 'W' | 'L'. The first entry is the
// most recent match. Returns [] if no confirmed history. Third-party rows
// (friend-vs-friend) are excluded — the viewer's form is the viewer's
// own results, not their friend graph's results.
export function computeRecentForm(history, limit) {
  var cap = typeof limit === "number" ? limit : 5;
  if (!history || !history.length) return [];
  return history
    .filter(function (m) { return isConfirmed(m) && isViewerMatch(m); })
    .slice(0, cap)
    .map(function (m) { return m.result === "win" ? "W" : "L"; });
}

// Compute current streak by walking the confirmed history from most recent
// backwards until the result flips. Used when a profile row doesn't have a
// precomputed streak_count (e.g. fresh accounts, or just as a sanity check).
export function computeStreakFromMatches(history) {
  if (!history || !history.length) return { count: 0, type: null };
  var confirmed = history.filter(function (m) { return isConfirmed(m) && isViewerMatch(m); });
  if (!confirmed.length) return { count: 0, type: null };
  var type = confirmed[0].result;
  var count = 0;
  for (var i = 0; i < confirmed.length; i++) {
    if (confirmed[i].result === type) count++;
    else break;
  }
  return { count: count, type: type };
}

// Group confirmed matches by opponent. Returns top N opponents by play count.
// Each entry: { opponentId, opponentName, plays, wins, losses, lastDate }.
// myId is the viewer's user id; used only to skip any rows that somehow
// reference the viewer as their own opponent.
export function computeMostPlayed(history, myId, limit) {
  var cap = typeof limit === "number" ? limit : 5;
  if (!history || !history.length) return [];
  var buckets = {};
  history.filter(function (m) { return isConfirmed(m) && isViewerMatch(m); }).forEach(function (m) {
    // Determine the OTHER side from the viewer's POV. For tagged matches
    // (m.isTagged) the viewer IS m.opponent_id, so the actual opponent is
    // the submitter (m.submitterId) and their display name is m.friendName
    // (loadHistory enriches that field on tagged rows). For own matches
    // the opponent is m.opponent_id with display m.oppName.
    var oppId   = m.isTagged ? m.submitterId : m.opponent_id;
    var oppName = m.isTagged ? (m.friendName || m.oppName || "Opponent") : (m.oppName || "Unknown");
    // Prefer the real user id over freetext name as the bucket key so two
    // matches against the same person don't split when one row was logged
    // before they were linked.
    var key = oppId || ("name:" + oppName);
    if (!key || key === myId) return;
    if (!buckets[key]) {
      buckets[key] = {
        opponentId: oppId || null,
        opponentName: oppName,
        plays: 0, wins: 0, losses: 0,
        lastDate: m.rawDate || null,
      };
    }
    var b = buckets[key];
    b.plays += 1;
    if (m.result === "win") b.wins += 1; else b.losses += 1;
    if (m.rawDate && (!b.lastDate || m.rawDate > b.lastDate)) b.lastDate = m.rawDate;
  });
  return Object.values(buckets)
    .sort(function (a, b) {
      if (b.plays !== a.plays) return b.plays - a.plays;
      return (b.lastDate || "").localeCompare(a.lastDate || "");
    })
    .slice(0, cap);
}

// Head-to-head against a specific subject player. Computed purely from the
// VIEWER's match history (which always includes matches where the viewer is
// either the submitter or the opponent — so RLS never restricts us here).
// Returns { viewerWins, subjectWins, totalMatches, lastDate, lastResult }.
// lastResult is 'win' | 'loss' from the viewer's POV.
export function computeHeadToHead(viewerHistory, viewerId, subjectId) {
  var empty = { viewerWins: 0, subjectWins: 0, totalMatches: 0, lastDate: null, lastResult: null };
  if (!viewerHistory || !viewerId || !subjectId || viewerId === subjectId) return empty;
  var matches = viewerHistory.filter(function (m) {
    if (!isConfirmed(m)) return false;
    if (!isViewerMatch(m)) return false; // third-party rows mention friends but aren't viewer's H2H
    return m.opponent_id === subjectId || m.submitterId === subjectId;
  });
  if (!matches.length) return empty;
  var viewerWins = 0, subjectWins = 0;
  matches.forEach(function (m) {
    // m.result is in the viewer's frame (normalizeMatch flips result for
    // tagged rows). So if viewer won, viewerWins++.
    if (m.result === "win") viewerWins++;
    else subjectWins++;
  });
  // Most recent match by raw date
  var sorted = matches.slice().sort(function (a, b) {
    return (b.rawDate || "").localeCompare(a.rawDate || "");
  });
  var latest = sorted[0];
  return {
    viewerWins: viewerWins,
    subjectWins: subjectWins,
    totalMatches: matches.length,
    lastDate: latest.date || null,
    lastResult: latest.result || null,
  };
}

// Confirmed ratio (trust indicator) — just a formatted string based on
// profile.matches_played. matches_played is bumped ONLY on confirm, so it's
// a clean confirmed-match count. Returns null if no matches.
export function formatConfirmedBadge(profile) {
  var n = profile && profile.matches_played;
  if (!n) return null;
  return n === 1 ? "1 confirmed match" : n + " confirmed matches";
}

// Module 7.7: CourtSync Rating provisional period. Replaces the old
// Module-5 20-match settled threshold with a 5-match calibration window.
// Reads `confirmed_ranked_match_count` (server-managed via
// apply_match_outcome) and falls back to `matches_played` for legacy
// profiles that predate the new column.
//
// Authoritative spec lives in src/features/rating/constants.js;
// re-exported here so legacy callers don't all have to change imports.
export var PROVISIONAL_THRESHOLD = 5;

function confirmedRanked(profile) {
  if (!profile) return 0;
  if (profile.confirmed_ranked_match_count != null) return profile.confirmed_ranked_match_count;
  return profile.matches_played || 0;
}

export function isProvisional(profile) {
  if (!profile) return true;
  return confirmedRanked(profile) < PROVISIONAL_THRESHOLD;
}

export function provisionalLabel(profile) {
  if (!profile) return null;
  var played = confirmedRanked(profile);
  if (played >= PROVISIONAL_THRESHOLD) return null;
  var remaining = PROVISIONAL_THRESHOLD - played;
  if (played === 0) return "Provisional · calibrating";
  return "Provisional · " + remaining + " match" + (remaining === 1 ? "" : "es") + " to calibrate";
}

// Calibration progress label — shown next to the rating display while
// the player is still provisional. Editorial vocabulary:
// "Calibration X / 5". Returns null once they're established.
export function calibrationProgressLabel(profile) {
  if (!profile) return null;
  var played = confirmedRanked(profile);
  if (played >= PROVISIONAL_THRESHOLD) return null;
  return "Calibration " + played + " / " + PROVISIONAL_THRESHOLD;
}

// Confirmation rate trust signal. Computed from the viewer's *own* match
// history. Returns null until they have ≥3 confirmed matches (otherwise the
// percentage is too noisy to mean anything). Returns { pct, total }.
//
// Counts confirmed vs (confirmed + voided + expired). Disputed-in-flight
// matches don't count either way — they're still in motion. We deliberately
// do NOT count "casual matches the user logged for themselves" as anything
// here; only ranked matches have a meaningful confirmation rate.
export function computeConfirmationRate(history) {
  if (!history || !history.length) return null;
  var ranked = history.filter(function (m) {
    if (!isViewerMatch(m)) return false; // third-party rows aren't viewer's confirmation rate
    if (!m.opponent_id) return false; // casual
    return m.status === "confirmed" || m.status === "voided" || m.status === "expired";
  });
  if (ranked.length < 3) return null;
  var ok = ranked.filter(function (m) { return m.status === "confirmed"; }).length;
  return { pct: Math.round((ok / ranked.length) * 100), total: ranked.length };
}
