// src/features/people/services/presenceService.js
//
// Single source of truth for presence (WhatsApp-style):
//  • getPresence(profile)  → { dot, label, online, hidden } for use in UI
//  • touchPresence(userId) → updates profiles.last_active to now
//  • PRESENCE_FIELDS       → string for use in any supabase .select() that needs presence
//
// Privacy rules:
//  • If profile.show_online_status === false → no green dot for others
//  • If profile.show_last_seen === false     → no "Last seen…" label for others
//  • Both default to true (back-compat with rows that don't have the columns yet).

import { supabase } from "../../../lib/supabase.js";

export var PRESENCE_FIELDS = "last_active,show_online_status,show_last_seen";
export var ONLINE_WINDOW_MS = 5 * 60 * 1000;       // < 5 min → online
export var AWAY_WINDOW_MS   = 30 * 60 * 1000;      // < 30 min → away (no dot)

export function touchPresence(userId){
  if(!userId) return Promise.resolve({error:null});
  // IMPORTANT: must call .then() (or await) to actually issue the HTTP
  // request. Supabase JS v2 PostgrestFilterBuilder is lazy — if no
  // consumer subscribes, some versions never flush the request. The
  // heartbeat caller is fire-and-forget, so we terminate the chain
  // here and surface errors via console.warn so silent RLS / trigger
  // failures don't just quietly leave last_active null forever.
  return supabase.from("profiles")
    .update({last_active:new Date().toISOString()})
    .eq("id", userId)
    .then(function(r){
      if(r && r.error) console.warn("[touchPresence] error:", r.error.message);
      return r;
    });
}

// Compute a presence view for *another* user's profile.
// Pass viewerIsSelf=true to bypass privacy gates (so users see their own state).
export function getPresence(profile, viewerIsSelf){
  if(!profile) return { dot:false, label:null, online:false, hidden:true };

  // Defaults to true if column missing (back-compat).
  var showOnline = profile.show_online_status !== false;
  var showLast   = profile.show_last_seen     !== false;

  if(!profile.last_active){
    return { dot:false, label:null, online:false, hidden:true };
  }

  var diff = Date.now() - new Date(profile.last_active).getTime();
  var online = diff < ONLINE_WINDOW_MS;
  var away   = !online && diff < AWAY_WINDOW_MS;

  // Privacy gates (skipped when viewing self).
  var canSeeOnline = viewerIsSelf || showOnline;
  var canSeeLast   = viewerIsSelf || showLast;

  if(!canSeeOnline && !canSeeLast){
    return { dot:false, label:null, online:false, hidden:true };
  }

  var label = null;
  if(online && canSeeOnline){
    label = "Active now";
  } else if(away && canSeeLast){
    label = "Away";
  } else if(canSeeLast){
    label = "Last seen " + formatLastSeen(profile.last_active);
  }

  return {
    dot:    online && canSeeOnline,
    label:  label,
    online: online && canSeeOnline,
    hidden: !label && !(online && canSeeOnline),
  };
}

function formatLastSeen(iso){
  var d = new Date(iso);
  var diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if(diff < 60)    return "just now";
  if(diff < 3600)  return Math.floor(diff/60) + "m ago";
  var now = new Date();
  var sameDay = d.toDateString() === now.toDateString();
  if(sameDay)      return "today at " + d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
  var yesterday = new Date(now); yesterday.setDate(yesterday.getDate()-1);
  if(d.toDateString() === yesterday.toDateString())
                   return "yesterday at " + d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
  if(diff < 7*86400) return d.toLocaleDateString([], {weekday:"short"});
  return d.toLocaleDateString([], {day:"numeric", month:"short"});
}
