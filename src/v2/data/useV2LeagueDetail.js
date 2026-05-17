// src/v2/data/useV2LeagueDetail.js
//
// Loads a league's live Standings + Matches for the v2
// CompetitionsScreen detail view. Returns { standings, matches,
// loading, error }.
//
//   standings: [{ rank, userId, name, isYou, played, wins, losses,
//                 points }]  — from league_standings, ranked.
//   matches:   [{ id, aName, bName, score, date, status, isYou }]
//              — from match_history rows tagged with this league_id.
//
// No v1 feature imports — supabase client + the v2 format helpers
// only, per the isolation rule.

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { formatSetsV2, formatRelDate } from "./format.js";

var EMPTY = { standings: [], matches: [] };

export function useV2LeagueDetail(leagueId, viewerId) {
  var [data, setData]       = useState(EMPTY);
  var [loading, setLoading] = useState(true);
  var [error, setError]     = useState(null);

  useEffect(function () {
    if (!leagueId) { setData(EMPTY); setLoading(false); return; }
    var cancelled = false;
    setLoading(true);
    setError(null);

    // Standings (ranked) + every match tagged with this league.
    var standingsReq = supabase
      .from("league_standings")
      .select("league_id,user_id,played,wins,losses,points,rank")
      .eq("league_id", leagueId)
      .order("rank", { ascending: true, nullsFirst: false });

    var matchesReq = supabase
      .from("match_history")
      .select("id,user_id,opponent_id,opp_name,sets,result,status,match_date,confirmed_at,submitted_at")
      .eq("league_id", leagueId)
      .order("match_date", { ascending: false, nullsFirst: false })
      .order("submitted_at", { ascending: false });

    Promise.all([standingsReq, matchesReq]).then(function (results) {
      if (cancelled) return;
      var sRes = results[0], mRes = results[1];
      if (sRes.error || mRes.error) {
        setError((sRes.error || mRes.error).message || "Could not load league.");
        setLoading(false);
        return;
      }
      var standRows = sRes.data || [];
      var matchRows = mRes.data || [];

      // Collect every player id we need a display name for — standings
      // rows + both sides of every match — and batch-fetch profiles.
      var idSet = {};
      standRows.forEach(function (r) { if (r.user_id) idSet[r.user_id] = true; });
      matchRows.forEach(function (m) {
        if (m.user_id)     idSet[m.user_id]     = true;
        if (m.opponent_id) idSet[m.opponent_id] = true;
      });
      var ids = Object.keys(idSet);

      function finish(nameById) {
        if (cancelled) return;

        var standings = standRows.map(function (r, i) {
          return {
            rank:    r.rank != null ? r.rank : (i + 1),
            userId:  r.user_id,
            name:    nameById[r.user_id] || "Player",
            isYou:   !!viewerId && r.user_id === viewerId,
            played:  r.played || 0,
            wins:    r.wins   || 0,
            losses:  r.losses || 0,
            points:  r.points || 0,
          };
        });

        var matches = matchRows.map(function (m) {
          // Submitter is side A, opponent is side B. opp_name is the
          // free-text fallback when the opponent isn't a linked
          // profile (shouldn't happen for league matches, but safe).
          var aName = nameById[m.user_id] || "Player";
          var bName = (m.opponent_id && nameById[m.opponent_id])
            || m.opp_name || "Opponent";
          var when  = m.match_date || m.confirmed_at || m.submitted_at || null;
          // Lifecycle → v2 status vocabulary. Confirmed = done; the
          // rest (pending_confirmation / disputed / …) read as
          // "pending" so the row shows a Soon/Pending chip not a W/L.
          var v2status = m.status === "confirmed" ? "done" : "pending";
          var isYou = !!viewerId && (m.user_id === viewerId || m.opponent_id === viewerId);
          return {
            id:     m.id,
            aName:  aName,
            bName:  bName,
            score:  formatSetsV2(m.sets) || null,
            date:   formatRelDate(when),
            status: v2status,
            isYou:  isYou,
          };
        });

        setData({ standings: standings, matches: matches });
        setLoading(false);
      }

      if (ids.length === 0) { finish({}); return; }
      supabase
        .from("profiles")
        .select("id,name")
        .in("id", ids)
        .then(function (pr) {
          if (cancelled) return;
          var map = {};
          (pr.data || []).forEach(function (p) { map[p.id] = p.name; });
          finish(map);
        });
    });

    return function () { cancelled = true; };
  }, [leagueId, viewerId]);

  return { standings: data.standings, matches: data.matches, loading: loading, error: error };
}
