// src/lib/utils/avatar.js
// Generic avatar helpers: deterministic colour from name + initials extractor.
// Plus a lookup for the uploaded photo URL and a display-location resolver.
import { AV_COLORS } from "../constants/ui.js";
import { ZONE_BY_ID } from "../../features/map/data/zones.js";

export function avColor(name) {
  return AV_COLORS[(name||"A").charCodeAt(0) % AV_COLORS.length];
}

export function initials(name) {
  return (name||"?").split(" ").map(function(w){return w[0];}).join("").slice(0,2).toUpperCase();
}

// Returns the profile's uploaded photo URL, or null if none set.
// Safe on partial profile objects (e.g. bare {name, avatar}).
export function avatarUrl(profile){
  if(!profile) return null;
  var u = profile.avatar_url || profile.avatarUrl || null;
  return (typeof u === "string" && u.length > 0) ? u : null;
}

// Where the user plays — the subtitle under their name. Prefers the declared
// home zone (zone name lookup) over the freetext `suburb` field. Returns ""
// when neither is set so callers can render-or-skip cleanly.
export function displayLocation(profile){
  if(!profile) return "";
  if(profile.home_zone){
    var z = ZONE_BY_ID[profile.home_zone];
    if(z) return z.name;
  }
  return profile.suburb || "";
}
