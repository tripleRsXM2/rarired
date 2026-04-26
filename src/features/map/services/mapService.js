// src/features/map/services/mapService.js
import { supabase } from "../../../lib/supabase.js";
import { COURTS } from "../data/courts.js";
import { ZONES } from "../data/zones.js";

// Compute an ISO timestamp N days ago, used to gate "recent activity"
// queries at the db so we don't drag unbounded match_history rows.
function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}

// Map a match_history.venue string to the zone it lives in. Matches are
// stored with a free-text venue (e.g. "Prince Alfred Park"); we key off
// the curated courts list so a match counts toward a zone iff its venue
// is a known court in that zone. Case-insensitive exact match on the
// court name OR any alias — aliases preserve zone attribution when a
// venue gets renamed to match its official branding (e.g. the old
// "Moore Park Tennis" → "Centennial Parklands Sports Centre / Moore
// Park Tennis Courts"). A future iteration with a real court_id column
// would replace this text match entirely.
var NAME_TO_ZONE = (function () {
  var m = {};
  COURTS.forEach(function (c) {
    m[c.name.toLowerCase()] = c.zone;
    (c.aliases || []).forEach(function (a) { m[a.toLowerCase()] = c.zone; });
  });
  return m;
})();

// Confirmed matches in the last 7 days bucketed by zone. Returns an
// object { [zoneId]: { matches_7d: N, players_7d: N } } so both signals
// can render on the map without a second query.
//
// Cheap: one query over confirmed matches in the window, aggregated
// client-side. Caller is expected to memoize.
export async function fetchZoneActivity(windowDays) {
  var days = windowDays || 7;
  var r = await supabase
    .from("match_history")
    .select("id,user_id,opponent_id,tagged_user_id,venue,status,match_date")
    .eq("status", "confirmed")
    .gte("match_date", isoDaysAgo(days).slice(0, 10));
  if (r.error) return { data: {}, error: r.error };
  var byZone = {};
  ZONES.forEach(function (z) { byZone[z.id] = { matches_7d: 0, players: new Set() }; });
  (r.data || []).forEach(function (m) {
    if (!m.venue) return;
    var z = NAME_TO_ZONE[m.venue.toLowerCase().trim()];
    if (!z || !byZone[z]) return;
    byZone[z].matches_7d += 1;
    if (m.user_id)           byZone[z].players.add(m.user_id);
    if (m.opponent_id)       byZone[z].players.add(m.opponent_id);
    if (m.tagged_user_id)    byZone[z].players.add(m.tagged_user_id);
  });
  var out = {};
  Object.keys(byZone).forEach(function (k) {
    out[k] = { matches_7d: byZone[k].matches_7d, players_7d: byZone[k].players.size };
  });
  return { data: out, error: null };
}

// Compute a matchmaking score for a candidate relative to a viewer.
// Three signals combine (higher = better match):
//   1. plays-here     1000 — strong binary signal, overwhelms the others
//                             when set. Either self-reported (in
//                             profiles.played_courts) OR derived from
//                             a confirmed match_history row at this
//                             venue. Matches map-pivot product frame:
//                             "the person who actually plays here" is
//                             the most valuable recommendation.
//   2. skill distance    0 – 500
//                             500 = exact sub-level match ("Intermediate 2" = "Intermediate 2")
//                             300 = same tier, different sub-level
//                                     ("Intermediate 1" ~ "Intermediate 2")
//                               0 = different tier (Beginner ~ Advanced)
//   3. availability overlap  per-slot × 20, capped at 200. A Mon-Mornings
//                             overlap means they could both show up at
//                             the same time — the second-most valuable
//                             signal after plays-here.
//
// Returns a scalar; higher = recommend first.
export function tierFromSkill(s) {
  if (!s) return null;
  if (s.indexOf("Beginner") === 0) return "Beginner";
  if (s.indexOf("Intermediate") === 0) return "Intermediate";
  if (s.indexOf("Advanced") === 0) return "Advanced";
  if (s === "Competitive") return "Advanced";
  return null;
}
function skillScore(viewerSkill, candSkill) {
  if (!viewerSkill || !candSkill) return 0;
  if (viewerSkill === candSkill) return 500;
  var ta = tierFromSkill(viewerSkill);
  var tb = tierFromSkill(candSkill);
  return (ta && ta === tb) ? 300 : 0;
}
function availOverlapScore(viewerAvail, candAvail) {
  if (!viewerAvail || !candAvail) return 0;
  var n = 0;
  Object.keys(viewerAvail).forEach(function (day) {
    var candBlocks = candAvail[day] || [];
    (viewerAvail[day] || []).forEach(function (block) {
      if (candBlocks.indexOf(block) >= 0) n++;
    });
  });
  return Math.min(n * 20, 200);
}

export function scorePlayerForCourt(viewer, candidate, playsHere) {
  var score = 0;
  if (playsHere) score += 1000;
  score += skillScore(viewer && viewer.skill, candidate && candidate.skill);
  score += availOverlapScore(viewer && viewer.availability, candidate && candidate.availability);
  return score;
}

// Phase 2 — the ranked list of players for a given court. Combines:
//   • profiles where played_courts intersects {court.name ∪ aliases}
//     (self-reported "I play here")
//   • distinct participants from confirmed match_history rows at the
//     venue over the last 90 days (implicit plays-here signal — even
//     if the user never self-reported)
// Then scores each candidate against the viewer and sorts best first.
//
// `excludeIds` (optional) — viewer's blocked-user list, dropped from
// every candidate set before scoring. Asymmetric block: blocked users
// never appear in viewer's map.
//
// Returns { data: [ { ...profile, playsHere: bool, score: number } ], error }
export async function fetchPlayersAtCourt(courtName, viewer, limit, excludeIds) {
  var lim = limit || 12;
  var viewerId = viewer && viewer.id;
  var blockSet = new Set(excludeIds || []);
  // Resolve canonical + aliases so legacy venue strings still match.
  var court = COURTS.find(function (c) {
    return c.name === courtName
      || (c.aliases || []).some(function (a) { return a === courtName; });
  });
  var names = court ? [court.name].concat(court.aliases || []) : [courtName];

  // (a) Self-reporters — profiles.played_courts overlaps any canonical name.
  var selfReq = supabase.from("profiles")
    .select("id,name,avatar,avatar_url,skill,suburb,home_zone,availability,played_courts,ranking_points,last_active,show_online_status,show_last_seen,gender,age_bracket")
    .overlaps("played_courts", names);
  if (viewerId) selfReq = selfReq.neq("id", viewerId);

  // (b) Derived — distinct user_id / opponent_id from confirmed matches
  // at this venue in the last 90 days.
  var since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  var hmReq = supabase.from("match_history")
    .select("user_id,opponent_id,tagged_user_id,venue,status,match_date")
    .eq("status", "confirmed")
    .in("venue", names)
    .gte("match_date", since)
    .order("match_date", { ascending: false })
    .limit(80);

  var [selfRes, hmRes] = await Promise.all([selfReq, hmReq]);
  if (selfRes.error) return { data: [], error: selfRes.error };

  // Build the candidate set. "playsHere" is TRUE for both self-reporters
  // AND anyone surfaced from match_history — the two signals merge.
  // Blocked users are dropped at every entry to the candidate map.
  var byId = {};
  (selfRes.data || []).forEach(function (p) {
    if (blockSet.has(p.id)) return;
    byId[p.id] = Object.assign({}, p, { playsHere: true });
  });

  if (!hmRes.error) {
    var derivedIds = new Set();
    (hmRes.data || []).forEach(function (m) {
      [m.user_id, m.opponent_id, m.tagged_user_id].forEach(function (uid) {
        if (!uid) return;
        if (viewerId && uid === viewerId) return;
        if (blockSet.has(uid)) return; // never surface blocked users
        if (byId[uid]) return; // already in set
        derivedIds.add(uid);
      });
    });
    var idList = Array.from(derivedIds);
    if (idList.length) {
      var pRes = await supabase.from("profiles")
        .select("id,name,avatar,avatar_url,skill,suburb,home_zone,availability,played_courts,ranking_points,last_active,show_online_status,show_last_seen,gender,age_bracket")
        .in("id", idList);
      if (!pRes.error) {
        (pRes.data || []).forEach(function (p) {
          if (blockSet.has(p.id)) return;
          byId[p.id] = Object.assign({}, p, { playsHere: true });
        });
      }
    }
  }

  // Score + sort + cap.
  var ranked = Object.keys(byId).map(function (id) {
    var c = byId[id];
    var score = scorePlayerForCourt(viewer, c, c.playsHere);
    return Object.assign({}, c, { score: score });
  });
  ranked.sort(function (a, b) { return b.score - a.score; });
  return { data: ranked.slice(0, lim), error: null };
}

// Recent players at a specific court — returns distinct participants
// from confirmed matches at that venue in the last N days, with the
// most recent match first. Caller should exclude the viewer.
//
// Matches are OR'd across the canonical court name AND any aliases so
// a renamed venue still surfaces its historical matches (e.g. rows
// logged as "Moore Park Tennis" before the rename roll up under the
// new "Centennial Parklands Sports Centre / Moore Park Tennis Courts").
//
// Returns: { data: [{ id, name, avatar, avatar_url, skill, last_match_date }], error }
export async function fetchRecentPlayersAtCourt(courtName, windowDays, limit) {
  var days = windowDays || 60;
  var lim  = limit || 6;
  var court = COURTS.find(function (c) {
    return c.name === courtName
      || (c.aliases || []).some(function (a) { return a === courtName; });
  });
  var names = court
    ? [court.name].concat(court.aliases || [])
    : [courtName];
  // Build an OR expression across ilike(venue, each_name). Supabase JS's
  // .or() takes a comma-joined list. Escape commas in names to dodge the
  // parser (none of our names contain commas but be safe going forward).
  var orExpr = names.map(function (n) {
    return "venue.ilike." + n.replace(/,/g, " ");
  }).join(",");
  var r = await supabase
    .from("match_history")
    .select("id,user_id,opponent_id,tagged_user_id,venue,status,match_date")
    .eq("status", "confirmed")
    .or(orExpr)
    .gte("match_date", isoDaysAgo(days).slice(0, 10))
    .order("match_date", { ascending: false })
    .limit(50);
  if (r.error) return { data: [], error: r.error };
  var seen = {};   // userId → latest match_date we've recorded
  var order = [];  // preserves first-seen order (already most-recent-first from query)
  (r.data || []).forEach(function (m) {
    [m.user_id, m.opponent_id, m.tagged_user_id].forEach(function (uid) {
      if (!uid) return;
      if (seen[uid]) return;
      seen[uid] = m.match_date;
      order.push(uid);
    });
  });
  var ids = order.slice(0, lim);
  if (!ids.length) return { data: [], error: null };
  var pr = await supabase.from("profiles")
    .select("id,name,avatar,avatar_url,skill,ranking_points,suburb,home_zone,last_active")
    .in("id", ids);
  if (pr.error) return { data: [], error: pr.error };
  var pMap = {};
  (pr.data || []).forEach(function (p) { pMap[p.id] = p; });
  // Preserve the recency order from the match scan.
  var players = ids.map(function (id) {
    var p = pMap[id]; if (!p) return null;
    return Object.assign({}, p, { last_match_date: seen[id] });
  }).filter(Boolean);
  return { data: players, error: null };
}

// Fetch all players in a given zone — the source for the side-panel
// "Players here" list. Anyone whose profile.home_zone matches is returned.
// `excludeIds` (optional) filters out specific user ids — used by the
// caller to drop blocked users before they ever render.
// `zoneId` null = no zone filter (used for the "Everywhere" toggle in
// ZoneSidePanel, which widens the roster to anyone with a home_zone).
export function fetchPlayersInZone(zoneId, limit, excludeIds){
  var l = limit || 20;
  var q = supabase.from("profiles")
    .select("id,name,avatar,avatar_url,suburb,skill,ranking_points,last_active,home_zone,gender,age_bracket");
  if (zoneId) q = q.eq("home_zone", zoneId);
  else        q = q.not("home_zone", "is", null); // "Everywhere" still requires a zone — skip ghosts
  if (excludeIds && excludeIds.length) {
    q = q.not("id", "in", "(" + excludeIds.join(",") + ")");
  }
  return q.order("last_active", { ascending: false, nullsFirst: false }).limit(l);
}

// Anonymous-friendly count of public players in a zone. RLS blocks anon
// SELECT on profiles entirely, so for the signed-out map preview we
// route through a SECURITY DEFINER RPC that returns just the integer.
// No PII leaves the DB; the side panel renders that many blurred
// shapes + a sign-in nudge.
export async function fetchPublicPlayersCountInZone(zoneId) {
  if (!zoneId) return { data: 0, error: null };
  var r = await supabase.rpc("count_public_players_in_zone", { p_zone_id: zoneId });
  if (r.error) return { data: 0, error: r.error };
  return { data: r.data || 0, error: null };
}

// Group counts — one row per zone — for the map surface itself.
// Cheap: six buckets max.
export async function fetchZonePlayerCounts(){
  var r = await supabase.from("profiles")
    .select("home_zone")
    .not("home_zone","is",null);
  if(r.error) return { data: {}, error: r.error };
  var counts = {};
  (r.data||[]).forEach(function(row){
    if(!row.home_zone) return;
    counts[row.home_zone] = (counts[row.home_zone]||0) + 1;
  });
  return { data: counts, error: null };
}

// History-aware ranking helper for the Play Match player picker.
// Given the viewer + a list of candidate user_ids, returns a map
// {candidateId: confirmedMatchCountTogether}. Used to float "people
// you've already played with" to the front of the carousel and
// render a "N matches together" social-proof chip on the cards.
//
// Cheap: one query over match_history filtered to confirmed rows
// involving the viewer + any of the candidate ids. RLS already
// limits SELECT to (auth.uid() = user_id OR auth.uid() = opponent_id),
// so the dataset is automatically scoped to "viewer's own matches."
//
// Returns { data: { [opponentId]: count }, error }.
export async function fetchViewerMatchCountsBy(viewerId, candidateIds){
  if(!viewerId) return { data: {}, error: null };
  var ids = Array.isArray(candidateIds) ? candidateIds.filter(Boolean) : [];
  if(ids.length === 0) return { data: {}, error: null };
  // We need rows where the viewer is one party and a candidate is the
  // other. Build a single OR filter that pulls both perspectives in
  // one round-trip:
  //   (user_id = viewer AND opponent_id IN candidates)
  //   OR (opponent_id = viewer AND user_id IN candidates)
  var inList = "(" + ids.join(",") + ")";
  var orExpr =
    "and(user_id.eq." + viewerId + ",opponent_id.in." + inList + ")," +
    "and(opponent_id.eq." + viewerId + ",user_id.in." + inList + ")";
  var r = await supabase.from("match_history")
    .select("user_id,opponent_id")
    .eq("status", "confirmed")
    .or(orExpr);
  if(r.error) return { data: {}, error: r.error };
  var counts = {};
  (r.data || []).forEach(function(row){
    var other = row.user_id === viewerId ? row.opponent_id : row.user_id;
    if(!other) return;
    counts[other] = (counts[other] || 0) + 1;
  });
  return { data: counts, error: null };
}

// Write-side helper used by the Map side panel and Settings screen.
// Passing null clears the home zone.
export function setHomeZone(userId, zoneId){
  return supabase.from("profiles")
    .update({ home_zone: zoneId })
    .eq("id", userId);
}
