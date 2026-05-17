// src/v2/data/useV2Profile.js
//
// v2 profile loader. Reads the current Supabase session and fetches
// the matching `profiles` row. Returns { authUser, profile, loading,
// error }. Keeps the surface minimal — the v2 shell only needs the
// signed-in user's id + display name + avatar for now.
//
// No imports from src/features/ — uses the singleton supabase client
// at src/lib/supabase.js directly. Matches the v2 isolation rule.

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

export function useV2Profile() {
  var [authUser, setAuthUser] = useState(null);
  var [profile, setProfile]   = useState(null);
  var [loading, setLoading]   = useState(true);
  var [error, setError]       = useState(null);

  // Read session once on mount + subscribe to auth changes so a
  // sign-in/out from anywhere in the app re-renders the v2 shell.
  useEffect(function () {
    var cancelled = false;
    supabase.auth.getSession().then(function (r) {
      if (cancelled) return;
      var u = (r && r.data && r.data.session && r.data.session.user) || null;
      setAuthUser(u);
    });
    var sub = supabase.auth.onAuthStateChange(function (_evt, session) {
      if (cancelled) return;
      setAuthUser((session && session.user) || null);
    });
    return function () {
      cancelled = true;
      if (sub && sub.data && sub.data.subscription && sub.data.subscription.unsubscribe) {
        sub.data.subscription.unsubscribe();
      }
    };
  }, []);

  // When the auth user resolves, fetch the matching profiles row.
  useEffect(function () {
    if (!authUser) {
      setProfile(null);
      setLoading(false);
      return;
    }
    var cancelled = false;
    setLoading(true);
    setError(null);
    supabase
      .from("profiles")
      .select("id,name,avatar,avatar_url,suburb,skill,ranking_points")
      .eq("id", authUser.id)
      .maybeSingle()
      .then(function (r) {
        if (cancelled) return;
        if (r.error) { setError(r.error); setLoading(false); return; }
        setProfile(r.data || null);
        setLoading(false);
      });
    return function () { cancelled = true; };
  }, [authUser && authUser.id]);

  return { authUser: authUser, profile: profile, loading: loading, error: error };
}
