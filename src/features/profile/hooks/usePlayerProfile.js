// src/features/profile/hooks/usePlayerProfile.js
// Loads a single profile row by userId for the public-facing profile view.
// Keeps its own loading/error state so PlayerProfileView can render a skeleton
// or an error without pulling anything into the top-level App state.

import { useEffect, useState } from "react";
import { fetchProfile } from "../services/profileService.js";

export function usePlayerProfile(userId) {
  var [profile, setProfile] = useState(null);
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  useEffect(function () {
    if (!userId) { setProfile(null); return; }
    var cancelled = false;
    setLoading(true);
    setError(null);
    fetchProfile(userId).then(function (r) {
      if (cancelled) return;
      if (r.error) {
        setError(r.error.message || "Could not load profile.");
        setProfile(null);
      } else {
        setProfile(r.data || null);
      }
      setLoading(false);
    });
    return function () { cancelled = true; };
  }, [userId]);

  return { profile: profile, loading: loading, error: error };
}
