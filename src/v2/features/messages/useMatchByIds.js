// src/v2/features/messages/useMatchByIds.js
//
// Resolves the match rows referenced by kind='score' DM payloads inside
// the active thread. We can't reuse useV2History because:
//   • it only loads confirmed matches (the Confirm widget needs
//     pending_confirmation rows too)
//   • the viewer may be the OPPONENT, whose v2 history flips sides — we
//     need the raw row so the widget renderer can decide perspective
//
// Strategy: collect distinct matchIds from the messages list, fetch any
// that aren't cached yet, return a `{ id: row }` map. Re-runs whenever
// the set of ids changes. RLS on match_history lets either participant
// SELECT the row, so this works without a SECURITY DEFINER RPC.

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase.js";

var MATCH_COLS = [
  "id", "user_id", "opponent_id",
  "opp_name", "sets", "result", "match_date",
  "status", "match_type", "league_id", "court", "venue",
].join(",");

export function useMatchByIds(messages) {
  var [map, setMap] = useState({});

  useEffect(function () {
    if (!Array.isArray(messages) || messages.length === 0) return;
    var ids = {};
    messages.forEach(function (m) {
      if (m && m.kind === "score" && m.payload && m.payload.matchId) {
        ids[m.payload.matchId] = true;
      }
    });
    var idList = Object.keys(ids);
    if (idList.length === 0) return;
    // Only fetch ids we haven't already resolved this session.
    var missing = idList.filter(function (id) { return !map[id]; });
    if (missing.length === 0) return;
    var cancelled = false;
    supabase.from("match_history")
      .select(MATCH_COLS)
      .in("id", missing)
      .then(function (r) {
        if (cancelled) return;
        if (r.error) return;
        var next = Object.assign({}, map);
        (r.data || []).forEach(function (row) { next[row.id] = row; });
        setMap(next);
      });
    return function () { cancelled = true; };
    // We intentionally key off the message-id list, not the messages
    // array identity, so a thread that already loaded its matches
    // doesn't refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages && messages.map(function(m){ return m && m.kind==='score' && m.payload && m.payload.matchId; }).filter(Boolean).join(",")]);

  // Bumper — used after a confirmOpponentMatch action to repull the row
  // so the widget swaps Confirm → Score on success without a manual
  // page refresh. Cheap because we only re-fetch one match id.
  function refreshMatch(matchId) {
    if (!matchId) return;
    supabase.from("match_history").select(MATCH_COLS).eq("id", matchId).maybeSingle()
      .then(function (r) {
        if (r && r.data) {
          setMap(function (m) {
            var next = Object.assign({}, m);
            next[matchId] = r.data;
            return next;
          });
        }
      });
  }

  return { matchById: map, refreshMatch: refreshMatch };
}
