// src/lib/db.js
// Shared Supabase utilities used across multiple features.
import { supabase } from "./supabase.js";

export function fetchProfilesByIds(ids, fields){
  return supabase.from('profiles').select(fields||'id,name,avatar').in('id',ids);
}

// Context-aware profile fetch — bypasses the strict profiles RLS for the
// two cases where the viewer has legitimate visibility (shared
// conversation, or the target is zone-bound). Returns the same {data,
// error} shape as fetchProfilesByIds so callers can swap it in directly.
//
// Use this when you're populating profile names/avatars for users who
// you already know are inside a context the viewer participates in
// (group conv participants, zone roster). Don't use it for global
// search results — let the standard RLS hide friends-only strangers.
//
// Backed by SECURITY DEFINER RPC `fetch_visible_profiles` —
// see supabase/migrations/20260502_visible_profile_rpc.sql.
export async function fetchVisibleProfilesByIds(ids){
  if(!Array.isArray(ids) || !ids.length) return { data: [], error: null };
  var r = await supabase.rpc('fetch_visible_profiles', { p_user_ids: ids });
  return { data: r.data || [], error: r.error || null };
}
