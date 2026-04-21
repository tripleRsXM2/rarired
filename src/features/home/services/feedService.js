// src/features/home/services/feedService.js
// Feed-specific queries. Kept small — matches/likes/comments services already
// exist elsewhere; this file is the place for "who liked a given match" type
// lookups that power the FeedInteractionsModal.

import { supabase } from "../../../lib/supabase.js";
import { fetchProfilesByIds } from "../../../lib/db.js";

// Returns [{ user_id, created_at, profile }, …] sorted newest first.
// Two-stage fetch (no PostgREST nested select) — feed_likes doesn't have a
// formal FK to profiles, and we already have fetchProfilesByIds.
export async function fetchMatchLikers(matchId) {
  if (!matchId) return { data: [], error: null };
  var r = await supabase
    .from("feed_likes")
    .select("user_id, created_at")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false });
  if (r.error) return { data: [], error: r.error };

  var uids = [...new Set((r.data || []).map(function (x) { return x.user_id; }))].filter(Boolean);
  if (!uids.length) return { data: [], error: null };

  var pr = await fetchProfilesByIds(uids, "id,name,avatar,avatar_url,suburb,skill");
  if (pr.error) return { data: [], error: pr.error };
  var pMap = {};
  (pr.data || []).forEach(function (p) { pMap[p.id] = p; });

  return {
    data: (r.data || []).map(function (x) {
      return {
        user_id: x.user_id,
        created_at: x.created_at,
        profile: pMap[x.user_id] || { id: x.user_id, name: "Player" },
      };
    }),
    error: null,
  };
}
