// src/v2/data/useV2Competitions.js
//
// Loads the leagues the viewer is in and reshapes them into the v2
// `SAMPLE_TOURNAMENTS` shape so CompetitionsScreen can render them
// without a code change. Returns { competitions, loading, error }.
//
// Output row shape (mirrors competitions/CompetitionsScreen sample):
//   { id, name, kind, status, round, mode, players, joined,
//     surface, nextMatch: null | { opp, when, court }, starts, ends }

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

// "active" / "pending" / etc → v2 status pill values. The v2 list
// only renders status="live" with a pulse dot; anything else gets
// rendered as a quieter row, so map active → live and let the rest
// fall through to the raw status.
function leagueStatusToV2(s) {
  if (s === "active") return "live";
  return s || "live";
}

// Map a v1 league row to the v2 competitions card shape. Some fields
// (round, nextMatch) aren't tracked server-side yet — we leave them
// null and let the v2 card render a "no upcoming match" placeholder.
function shapeLeague(row, memberCountById) {
  var id = row.id;
  return {
    id:        id,
    name:      row.name || "League",
    kind:      "ladder",   // v2 has no league kind yet; ladder is the closest visual fit
    status:    leagueStatusToV2(row.status),
    round:     null,
    mode:      row.mode === "casual" ? "casual" : "elo",
    players:   memberCountById[id] || 0,
    joined:    true,
    surface:   "hard",     // not tracked server-side yet
    nextMatch: null,       // computed lazily on tap-through in v1; v2 placeholder
    starts:    row.start_date || null,
    ends:      row.end_date   || null,
    rules: {
      matchFormat:     row.match_format    || null,
      tiebreakFormat:  row.tiebreak_format || null,
      winPoints:       row.win_points,
      lossPoints:      row.loss_points,
      maxMembers:      row.max_members,
    },
  };
}

export function useV2Competitions(authUserId) {
  var [rows, setRows]       = useState([]);
  var [loading, setLoading] = useState(true);
  var [error, setError]     = useState(null);

  useEffect(function () {
    if (!authUserId) { setRows([]); setLoading(false); return; }
    var cancelled = false;
    setLoading(true);
    setError(null);

    // Two-step: pull active league memberships for the viewer, then
    // fetch the league rows + a member-count aggregate for each.
    // Keeping it explicit (instead of a single RPC) so the v2 layer
    // doesn't depend on a v1-specific helper.
    supabase
      .from("league_members")
      .select("league_id,status,joined_at")
      .eq("user_id", authUserId)
      .eq("status", "active")
      .then(function (memRes) {
        if (cancelled) return;
        if (memRes.error) { setError(memRes.error); setLoading(false); return; }
        var leagueIds = (memRes.data || []).map(function (m) { return m.league_id; });
        if (leagueIds.length === 0) { setRows([]); setLoading(false); return; }

        var leaguesReq = supabase
          .from("leagues")
          .select("id,name,status,mode,match_format,tiebreak_format,win_points,loss_points,start_date,end_date,max_members")
          .in("id", leagueIds);

        var countReq = supabase
          .from("league_members")
          .select("league_id", { count: "exact", head: false })
          .in("league_id", leagueIds)
          .eq("status", "active");

        Promise.all([leaguesReq, countReq]).then(function (results) {
          if (cancelled) return;
          var lerr = results[0].error, cerr = results[1].error;
          if (lerr || cerr) { setError(lerr || cerr); setLoading(false); return; }
          // Tally active members per league.
          var counts = {};
          (results[1].data || []).forEach(function (r) {
            counts[r.league_id] = (counts[r.league_id] || 0) + 1;
          });
          var leagues = (results[0].data || []).map(function (l) { return shapeLeague(l, counts); });
          // Active first, then by start_date desc.
          leagues.sort(function (a, b) {
            if ((a.status === "live") !== (b.status === "live")) {
              return a.status === "live" ? -1 : 1;
            }
            var ta = a.starts ? new Date(a.starts).getTime() : 0;
            var tb = b.starts ? new Date(b.starts).getTime() : 0;
            return tb - ta;
          });
          setRows(leagues);
          setLoading(false);
        });
      });

    return function () { cancelled = true; };
  }, [authUserId]);

  return { competitions: rows, loading: loading, error: error };
}
