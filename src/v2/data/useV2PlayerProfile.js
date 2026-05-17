// src/v2/data/useV2PlayerProfile.js
//
// Loads a friend's public profile for the v2 PlayerProfileScreen —
// the same information v1's PlayerProfileView surfaces:
//   • identity: name, avatar, suburb, skill
//   • rating: ranking_points + confirmed match count
//   • record: matches_played / wins / losses / win %
//   • trust badge: player_trust_public.public_badge
//   • head-to-head vs the viewer (computed from match_history)
//
// Returns { profile, trustBadge, h2h, loading, error }.
//
// No v1 feature imports — supabase client only, per the v2 isolation
// rule. The H2H query is run here directly rather than reusing
// useV2History so it stays scoped to the viewer↔subject pair.

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

var EMPTY_H2H = { viewerWins: 0, subjectWins: 0, total: 0, lastDate: null };

// Compute head-to-head from the confirmed matches between the viewer
// and the subject. Each row's result is stored in the SUBMITTER's
// frame (match_history.result === 'win' means user_id won), so we
// invert when the viewer was the opponent, not the submitter.
function computeH2H(rows, viewerId, subjectId) {
  if (!rows || !rows.length) return EMPTY_H2H;
  var viewerWins = 0, subjectWins = 0, lastDate = null;
  rows.forEach(function (m) {
    var viewerIsSubmitter = m.user_id === viewerId;
    var viewerWon = viewerIsSubmitter
      ? m.result === "win"
      : m.result === "loss";   // opponent frame inverts
    if (viewerWon) viewerWins++; else subjectWins++;
    var when = m.match_date || m.confirmed_at || m.submitted_at;
    if (when && (!lastDate || when > lastDate)) lastDate = when;
  });
  return {
    viewerWins:  viewerWins,
    subjectWins: subjectWins,
    total:       rows.length,
    lastDate:    lastDate,
  };
}

export function useV2PlayerProfile(userId, viewerId) {
  var [profile, setProfile]       = useState(null);
  var [trustBadge, setTrustBadge] = useState(null);
  var [h2h, setH2h]               = useState(EMPTY_H2H);
  var [loading, setLoading]       = useState(true);
  var [error, setError]           = useState(null);

  useEffect(function () {
    if (!userId) { setProfile(null); setLoading(false); return; }
    var cancelled = false;
    setLoading(true);
    setError(null);
    setTrustBadge(null);
    setH2h(EMPTY_H2H);

    // 1. Profile row — the critical path. A failure here is a real
    //    error; trust + H2H are enhancements and never block render.
    var profileReq = supabase
      .from("profiles")
      .select("id,name,avatar,avatar_url,suburb,skill,style,ranking_points,matches_played,wins,losses")
      .eq("id", userId)
      .maybeSingle();

    // 2. Trust badge — public reliability view. maybeSingle so a
    //    user with no trust row just resolves to null.
    var trustReq = supabase
      .from("player_trust_public")
      .select("user_id,public_badge,confidence_level")
      .eq("user_id", userId)
      .maybeSingle();

    // 3. Head-to-head — confirmed matches between the two players,
    //    either submission direction. Skipped when the viewer is
    //    anonymous or viewing their own row.
    var h2hReq = (viewerId && viewerId !== userId)
      ? supabase
          .from("match_history")
          .select("user_id,opponent_id,result,match_date,confirmed_at,submitted_at")
          .eq("status", "confirmed")
          .or(
            "and(user_id.eq." + viewerId + ",opponent_id.eq." + userId + ")," +
            "and(user_id.eq." + userId + ",opponent_id.eq." + viewerId + ")"
          )
      : Promise.resolve({ data: [], error: null });

    Promise.all([profileReq, trustReq, h2hReq]).then(function (results) {
      if (cancelled) return;
      var pRes = results[0], tRes = results[1], hRes = results[2];
      if (pRes.error) {
        setError(pRes.error.message || "Could not load profile.");
        setProfile(null);
        setLoading(false);
        return;
      }
      setProfile(pRes.data || null);
      // Trust + H2H failures degrade silently — badges/H2H are
      // enhancements, not the critical path.
      setTrustBadge((!tRes.error && tRes.data && tRes.data.public_badge) || null);
      setH2h((!hRes.error)
        ? computeH2H(hRes.data || [], viewerId, userId)
        : EMPTY_H2H);
      setLoading(false);
    });

    return function () { cancelled = true; };
  }, [userId, viewerId]);

  return {
    profile:    profile,
    trustBadge: trustBadge,
    h2h:        h2h,
    loading:    loading,
    error:      error,
  };
}
