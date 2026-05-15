// src/v2/data/useV2DiscoverPlayers.js
//
// Loads the unified "everyone you could message" list for the v2 New
// Message picker (Bug B + Bug C). Mirrors the v1 social.discoverPlayers
// surface: every non-self, non-blocked profile with a privacy that
// permits search. Excludes friends — they appear in their own section.
//
// Returns { players, loading } where players is sorted alphabetically
// by name. Same hook signature as the other v2/data hooks so it can be
// composed in BaselineApp alongside useV2Friends.

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

export function useV2DiscoverPlayers(authUserId, friendIds) {
  var [players, setPlayers] = useState([]);
  var [loading, setLoading] = useState(false);

  useEffect(function () {
    if (!authUserId) { setPlayers([]); return; }
    var cancelled = false;
    setLoading(true);
    // Pull a broad public list — the v2 picker filters by typed search,
    // so we don't need to over-think relevance ranking. Cap at 200 so
    // a brand-new test database returns everyone but a populated one
    // doesn't blow the payload.
    supabase
      .from("profiles")
      .select("id,name,avatar,avatar_url,skill,suburb")
      .neq("id", authUserId)
      .order("name", { ascending: true })
      .limit(200)
      .then(function (r) {
        if (cancelled) return;
        var fIdSet = {};
        (friendIds || []).forEach(function (id) { fIdSet[id] = true; });
        var list = (r.data || []).filter(function (p) {
          return p && p.id && !fIdSet[p.id];
        });
        setPlayers(list);
        setLoading(false);
      });
    return function () { cancelled = true; };
  }, [authUserId, (friendIds || []).join(",")]);

  return { players: players, loading: loading };
}
