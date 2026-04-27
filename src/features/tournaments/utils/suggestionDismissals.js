// src/features/tournaments/utils/suggestionDismissals.js
//
// Per-user, per-device dismissal state for Compete hub "Suggested
// for you" cards. When a user taps × on a suggestion the key is
// added to a localStorage set; the section filters dismissed keys
// out of the visible list on next render.
//
// Why localStorage:
//   - Per-device is the right granularity for a "I don't want to
//     see THIS suggestion in this UI right now" affordance. A user
//     dismissing on their phone shouldn't have it disappear on
//     their laptop too — those are independent surfaces.
//   - Avoids server-roundtrip cost on a low-stakes UI hide.
//   - DB-backed dismissals can land later if cross-device sync
//     becomes a real ask.
//
// Storage shape:
//   localStorage["cs_dismissed_suggestions:<userId>"] = JSON([key, ...])
//
// Dismissal keys are scoped to the underlying entity rather than
// the suggestion type alone, so a future rematch suggestion against
// a DIFFERENT match (newer than the dismissed one) re-surfaces:
//   rematch:<matchId>            — dismissing a specific match
//   continue_league:<leagueId>   — dismissing continue prompts for a league
//
// SSR / private-mode safety:
//   localStorage is `try`-guarded throughout. In Safari private
//   mode setItem throws QuotaExceededError; in incognito the API
//   exists but is partially unreliable. We treat any failure as a
//   silent no-op — the worst that happens is dismissals don't
//   persist, which is acceptable.

var STORAGE_KEY_PREFIX = "cs_dismissed_suggestions:";

function storageKey(userId) {
  return STORAGE_KEY_PREFIX + (userId || "anon");
}

// ── Read ─────────────────────────────────────────────────────────
// Returns a Set of dismissed keys. Always returns a Set even on
// failure paths so callers can use .has() without null-checks.

export function getDismissedSet(userId) {
  if (typeof window === "undefined") return new Set();
  try {
    var raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    var arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr);
  } catch (_) {
    return new Set();
  }
}

// ── Write ────────────────────────────────────────────────────────
// Append a key. Idempotent: re-dismissing an already-dismissed key
// is a no-op. Returns the new Set so the caller can update state
// in one go without re-reading from storage.

export function dismissKey(userId, key) {
  if (!key) return getDismissedSet(userId);
  var set = getDismissedSet(userId);
  if (set.has(key)) return set;
  set.add(key);
  try {
    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify(Array.from(set)),
    );
  } catch (_) {
    // Quota / private-mode failure — keep the in-memory set so the
    // current tab honors the dismissal even if it doesn't persist.
  }
  return set;
}

// ── Reset (for future "show dismissed" / debug) ──────────────────
// Not wired to UI in V1 but cheap to ship for the inevitable
// "I dismissed by accident, can I bring them back" support case.

export function clearDismissals(userId) {
  if (typeof window === "undefined") return new Set();
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch (_) { /* swallow */ }
  return new Set();
}
