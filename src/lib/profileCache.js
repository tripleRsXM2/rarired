// src/lib/profileCache.js
//
// localStorage-backed profile cache. Keyed by user id. Holds a small
// subset of the profile shape that the messages list + map needs to
// paint synchronously: { id, name, avatar, avatar_url, skill, suburb }.
// First read from the network promotes into the cache; every
// subsequent paint reads from cache synchronously, then refreshes in
// the background. Pattern lifted from Messenger/WhatsApp/Telegram —
// names and avatars should never flash "Loading…" for someone we've
// already seen.
//
// Shape stored in localStorage under KEY:
//   { ids: [id1, id2, …], byId: { [id]: slimProfile } }
// where `ids` is an insertion-order list used for FIFO eviction past
// MAX_ENTRIES. Bounded so the cache can't grow unbounded over time on
// power users.

var KEY = "courtsync.profileCache.v1";
var MAX_ENTRIES = 500;

function safeParse() {
  try {
    var raw = (typeof localStorage !== "undefined") ? localStorage.getItem(KEY) : null;
    if (!raw) return { ids: [], byId: {} };
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.ids) || !parsed.byId) {
      return { ids: [], byId: {} };
    }
    return parsed;
  } catch (_) { return { ids: [], byId: {} }; }
}

function safeWrite(state) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, JSON.stringify(state));
    }
  } catch (_) {}
}

export function getCachedProfile(id) {
  if (!id) return null;
  var s = safeParse();
  return s.byId[id] || null;
}

export function getCachedProfiles(ids) {
  if (!Array.isArray(ids) || !ids.length) return {};
  var s = safeParse();
  var out = {};
  for (var i = 0; i < ids.length; i++) {
    var p = s.byId[ids[i]];
    if (p) out[ids[i]] = p;
  }
  return out;
}

export function setCachedProfiles(profiles) {
  if (!Array.isArray(profiles) || !profiles.length) return;
  var s = safeParse();
  for (var i = 0; i < profiles.length; i++) {
    var p = profiles[i];
    if (!p || !p.id) continue;
    var slim = {
      id: p.id,
      name: p.name || null,
      avatar: p.avatar || null,
      avatar_url: p.avatar_url || null,
      skill: p.skill || null,
      suburb: p.suburb || null,
      // Stash the timestamp so callers can opt to ignore very stale
      // entries (e.g. presence flicker doesn't matter for name).
      _cachedAt: Date.now(),
    };
    if (!s.byId[p.id]) s.ids.push(p.id);
    s.byId[p.id] = slim;
  }
  // Evict FIFO past MAX_ENTRIES.
  while (s.ids.length > MAX_ENTRIES) {
    var evictId = s.ids.shift();
    delete s.byId[evictId];
  }
  safeWrite(s);
}

export function clearProfileCache() {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
  } catch (_) {}
}
