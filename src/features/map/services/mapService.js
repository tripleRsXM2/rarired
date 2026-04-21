// src/features/map/services/mapService.js
import { supabase } from "../../../lib/supabase.js";

// Fetch all players in a given zone — the source for the side-panel
// "Players here" list. Anyone whose profile.home_zone matches is returned.
export function fetchPlayersInZone(zoneId, limit){
  var l = limit || 20;
  return supabase.from("profiles")
    .select("id,name,avatar,suburb,skill,ranking_points,last_active,home_zone")
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
