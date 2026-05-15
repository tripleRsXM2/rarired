// src/v2/data/useV2Friends.js
//
// Loads the viewer's accepted friends so the v2 QuickLog opponent
// picker can offer real linked players. Returns { friends, loading,
// error } where each friend is { id, name, avatar_url, skill, suburb }.
//
// Friendship model: a row in friend_requests with status='accepted'
// where the viewer is either sender or receiver. The friend is the
// other party. No v1 feature imports — supabase client only.

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

export function useV2Friends(authUserId) {
  var [friends, setFriends] = useState([]);
  var [loading, setLoading] = useState(true);
  var [error, setError]     = useState(null);

  useEffect(function () {
    if (!authUserId) { setFriends([]); setLoading(false); return; }
    var cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from("friend_requests")
      .select("sender_id,receiver_id,status")
      .eq("status", "accepted")
      .or("sender_id.eq." + authUserId + ",receiver_id.eq." + authUserId)
      .then(function (reqRes) {
        if (cancelled) return;
        if (reqRes.error) { setError(reqRes.error); setLoading(false); return; }
        // The friend is whichever party isn't the viewer.
        var friendIds = (reqRes.data || []).map(function (r) {
          return r.sender_id === authUserId ? r.receiver_id : r.sender_id;
        }).filter(Boolean);
        if (friendIds.length === 0) { setFriends([]); setLoading(false); return; }
        supabase
          .from("profiles")
          .select("id,name,avatar,avatar_url,skill,suburb")
          .in("id", friendIds)
          .then(function (pr) {
            if (cancelled) return;
            if (pr.error) { setError(pr.error); setLoading(false); return; }
            var list = (pr.data || []).slice();
            // Alphabetical by display name for a stable picker order.
            list.sort(function (a, b) {
              return (a.name || "").localeCompare(b.name || "");
            });
            setFriends(list);
            setLoading(false);
          });
      });

    return function () { cancelled = true; };
  }, [authUserId]);

  return { friends: friends, loading: loading, error: error };
}
