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
export function fetchPlayersInZone(zoneId, limit){
  var l = limit || 20;
  return supabase.from("profiles")
    .select("id,name,avatar,avatar_url,suburb,skill,ranking_points,last_active,home_zone")
    .eq("home_zone", zoneId)
    .order("last_active", { ascending: false, nullsFirst: false })
    .limit(l);
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

// Write-side helper used by the Map side panel and Settings screen.
// Passing null clears the home zone.
export function setHomeZone(userId, zoneId){
  return supabase.from("profiles")
    .update({ home_zone: zoneId })
    .eq("id", userId);
}
