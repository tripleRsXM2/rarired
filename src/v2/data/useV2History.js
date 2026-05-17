// src/v2/data/useV2History.js
//
// Loads the viewer's confirmed match history and reshapes it for the
// v2 HomeScreen + HistoryScreen. Returns { history, weekStats,
// loading, error }.
//
// History row shape (matches sampleHistory.js):
//   { id, date, opp, score, win, surface, status, pending }
//
// `status` carries the raw match_history.status so the renderer can
// show a "Pending" / "Disputed" pill instead of W/L on in-flight
// matches. `pending` is a derived convenience flag for the same.
//
// weekStats shape (last 7 calendar days):
//   { matches, wins, losses, record, onCourt }
// weekStats counts confirmed rows only — a pending match's result
// is still the submitter's claim and could flip on dispute, so we
// don't bake it into the running W-L tally.
//
// RLS scope: match_history.match_select policy allows rows where the
// caller is either user_id or opponent_id. Two-step fetch — own rows
// keep the submitter frame, opponent rows are flipped (result + sets
// you/them swapped) so everything reads from the viewer's POV.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import {
  formatSetsV2,
  formatRelDate,
  deriveSurfaceKey,
  estimateOnCourtTime,
  isWithinLast7Days,
} from "./format.js";

var MATCH_COLS = [
  "id", "user_id", "opponent_id", "tagged_user_id",
  "opp_name", "tourn_name", "match_type",
  "result", "sets", "match_date", "submitted_at", "confirmed_at",
  "status", "venue", "court", "league_id",
].join(",");

// Shape a single DB row for the v2 history list. `viewerIsSubmitter`
// flips the result + the sets' you/them halves so the viewer always
// sees their own perspective.
function shapeRow(m, viewerIsSubmitter, profileMap) {
  var rawResult = m.result || "loss";
  var win = viewerIsSubmitter
    ? rawResult === "win"
    : rawResult === "loss"; // opponent's view inverts
  var sets = m.sets || [];
  // DB set shape is { you, them, tieBreak?: { you, them } }. For the
  // opponent's view we swap you/them on both the set score and the
  // nested tiebreak so the score string reads from their side.
  var viewerSets = viewerIsSubmitter
    ? sets
    : sets.map(function (s) {
        if (!s) return s;
        var flipped = Object.assign({}, s, { you: s.them, them: s.you });
        if (s.tieBreak && typeof s.tieBreak === "object") {
          flipped.tieBreak = { you: s.tieBreak.them, them: s.tieBreak.you };
        }
        return flipped;
      });
  // Opposite-party display name. Prefer the looked-up profiles.name
  // when we can (it stays current with renames); fall back to the
  // submitter-supplied opp_name when no link.
  var otherId = viewerIsSubmitter ? (m.opponent_id || m.tagged_user_id) : m.user_id;
  var oppName = (otherId && profileMap && profileMap[otherId] && profileMap[otherId].name)
    || (viewerIsSubmitter ? (m.opp_name || "Player") : (m.opp_name || "Player"));
  var when = m.confirmed_at || m.submitted_at || m.match_date || null;
  var status = m.status || "confirmed";
  var pending = status === "pending_confirmation"
             || status === "disputed"
             || status === "pending_reconfirmation";
  return {
    id:      m.id,
    date:    formatRelDate(when),
    opp:     oppName,
    // oppId — the opposite party's user id (null for a free-text
    // unlinked opponent). Lets the history row deep-link to that
    // player's v2 profile.
    oppId:   otherId || null,
    score:   formatSetsV2(viewerSets) || "—",
    win:     win,
    surface: deriveSurfaceKey(m.court || m.venue),
    when:    when,                  // raw ISO for sorting + week filter
    matchType: m.match_type || "casual",
    leagueId:  m.league_id || null,
    status:   status,
    pending:  pending,
  };
}

// Status set shown in the v2 history list. Confirmed is canonical;
// the three pending variants are surfaced too so a freshly logged
// match doesn't disappear until the opponent acts. Expired / voided
// / rejected matches drop off the list — same rule v1 uses.
var HISTORY_STATUSES = [
  "confirmed",
  "pending_confirmation",
  "disputed",
  "pending_reconfirmation",
];

export function useV2History(authUserId) {
  var [rows, setRows]       = useState([]);
  var [loading, setLoading] = useState(true);
  var [error, setError]     = useState(null);
  // Bumping this counter re-runs the fetch effect — call reload()
  // after logging a match so the new row appears without a full
  // page refresh.
  var [reloadKey, setReloadKey] = useState(0);
  function reload() { setReloadKey(function (k) { return k + 1; }); }

  useEffect(function () {
    if (!authUserId) { setRows([]); setLoading(false); return; }
    var cancelled = false;
    setLoading(true);
    setError(null);

    // Two queries — own rows and opponent rows — then merge + sort.
    // Doing them in parallel. Status set includes confirmed PLUS the
    // three pending variants so a freshly logged match (auto-emitted
    // confirm-card DM in flight) shows up immediately in History;
    // expired / voided / rejected matches drop off the same way v1
    // handles them. Pending rows render with a "Pending" pill on
    // HistoryRow rather than W/L.
    var ownReq = supabase
      .from("match_history")
      .select(MATCH_COLS)
      .eq("user_id", authUserId)
      .in("status", HISTORY_STATUSES)
      .order("confirmed_at", { ascending: false, nullsFirst: false })
      .order("submitted_at", { ascending: false })
      .limit(60);

    var oppReq = supabase
      .from("match_history")
      .select(MATCH_COLS)
      .eq("opponent_id", authUserId)
      .in("status", HISTORY_STATUSES)
      .order("confirmed_at", { ascending: false, nullsFirst: false })
      .order("submitted_at", { ascending: false })
      .limit(60);

    Promise.all([ownReq, oppReq]).then(function (results) {
      if (cancelled) return;
      var ownErr = results[0].error;
      var oppErr = results[1].error;
      if (ownErr || oppErr) {
        setError(ownErr || oppErr);
        setLoading(false);
        return;
      }
      var ownRows = (results[0].data || []);
      var oppRows = (results[1].data || []);

      // Resolve participant names from profiles — single batch fetch
      // for every distinct counterpart id so the v2 history rows show
      // the friend's current display name instead of the static
      // opp_name the submitter typed at log time.
      var partnerIds = {};
      ownRows.forEach(function (m) {
        if (m.opponent_id)     partnerIds[m.opponent_id]     = true;
        if (m.tagged_user_id)  partnerIds[m.tagged_user_id]  = true;
      });
      oppRows.forEach(function (m) { if (m.user_id) partnerIds[m.user_id] = true; });
      var ids = Object.keys(partnerIds);

      function finish(profileMap) {
        if (cancelled) return;
        var ownShaped = ownRows.map(function (m) { return shapeRow(m, true,  profileMap); });
        var oppShaped = oppRows.map(function (m) { return shapeRow(m, false, profileMap); });
        var merged = ownShaped.concat(oppShaped);
        // Sort newest first using the raw timestamp we tucked in.
        merged.sort(function (a, b) {
          var ta = a.when ? new Date(a.when).getTime() : 0;
          var tb = b.when ? new Date(b.when).getTime() : 0;
          return tb - ta;
        });
        setRows(merged);
        setLoading(false);
      }

      if (ids.length === 0) { finish({}); return; }
      supabase
        .from("profiles")
        .select("id,name,avatar_url")
        .in("id", ids)
        .then(function (pr) {
          if (cancelled) return;
          var map = {};
          (pr.data || []).forEach(function (p) { map[p.id] = p; });
          finish(map);
        });
    });

    return function () { cancelled = true; };
  }, [authUserId, reloadKey]);

  // Derived week stats — recompute when rows change. Counts confirmed
  // rows only so the W-L tally never includes a contested result that
  // might flip on dispute. Pending matches still show in the list, so
  // the per-row pending pill makes the discrepancy obvious.
  var weekStats = useMemo(function () {
    var weekRows = rows.filter(function (r) {
      return isWithinLast7Days(r.when) && r.status === "confirmed";
    });
    var wins = 0, losses = 0;
    weekRows.forEach(function (r) { if (r.win) wins++; else losses++; });
    return {
      matches: weekRows.length,
      wins:    wins,
      losses:  losses,
      record:  wins + "-" + losses,
      onCourt: estimateOnCourtTime(weekRows.length),
    };
  }, [rows]);

  return { history: rows, weekStats: weekStats, loading: loading, error: error, reload: reload };
}
