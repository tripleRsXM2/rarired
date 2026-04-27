// src/features/profile/hooks/usePlayerProfiles.js
//
// Multi-id companion to usePlayerProfile. Loads full profile rows for an
// array of user ids and returns them keyed by id. Used by the DM details
// drawer to enrich the participant list (the partner stub stored on a
// conversation only carries a subset of fields — skill/style/ranking
// stats live on the full row).
//
// The fetch is keyed by the joined id list so re-renders with the same
// participants don't refire. Empty/null ids are tolerated (no-op).

import { useEffect, useState } from "react";
import { fetchProfilesByIds } from "../../../lib/db.js";

export function usePlayerProfiles(userIds) {
  var ids = Array.isArray(userIds)
    ? userIds.filter(function (x) { return !!x; })
    : [];
  var key = ids.slice().sort().join(",");

  var [profiles, setProfiles] = useState({});
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);

  useEffect(function () {
    if (!ids.length) { setProfiles({}); return; }
    var cancelled = false;
    setLoading(true);
    setError(null);
    fetchProfilesByIds(ids, "*").then(function (r) {
      if (cancelled) return;
      if (r && r.error) {
        setError(r.error.message || "Could not load profiles.");
        setProfiles({});
      } else {
        var map = {};
        ((r && r.data) || []).forEach(function (p) { if (p && p.id) map[p.id] = p; });
        setProfiles(map);
      }
      setLoading(false);
    }, function (err) {
      if (cancelled) return;
      setError((err && err.message) || "Could not load profiles.");
      setProfiles({});
      setLoading(false);
    });
    return function () { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { profiles: profiles, loading: loading, error: error };
}
