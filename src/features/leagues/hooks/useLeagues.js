// src/features/leagues/hooks/useLeagues.js
//
// Owns the viewer's league state: the list of leagues they're a member of
// (active OR invited), plus per-league detail caches (members + standings
// + recent matches) loaded lazily.
//
// Exposes thin wrappers around the leagueService RPCs that also refresh
// local state on success. All writes flow through SECURITY DEFINER RPCs —
// clients cannot tamper with leagues / members / standings directly.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase.js";
import { fetchProfilesByIds } from "../../../lib/db.js";
import * as L from "../services/leagueService.js";

export function useLeagues(opts) {
  var authUser = (opts && opts.authUser) || null;
  var sendNotification = (opts && opts.sendNotification) || null;

  var [leagues, setLeagues]         = useState([]);   // leagues I'm a member/invitee of
  var [profileMap, setProfileMap]   = useState({});   // user_id → profile (shared across all leagues)
  var [detailCache, setDetailCache] = useState({});   // { [leagueId]: {members, standings, recent, loadedAt} }
  var [loading, setLoading]         = useState(false);

  // ── Loader for the top-level "my leagues" list ─────────────────────────────
  var loadMyLeagues = useCallback(async function (userId) {
    if (!userId) { setLeagues([]); return; }
    setLoading(true);
    var r = await L.fetchMyLeagues(userId);
    setLoading(false);
    if (r.error) { console.error("fetchMyLeagues", r.error); return; }
    // Each row comes back with an inline league_members array of length 1
    // (the viewer's row). Flatten it onto the league for convenience.
    var flattened = (r.data || []).map(function (row) {
      var lm = (row.league_members && row.league_members[0]) || {};
      return Object.assign({}, row, {
        my_status: lm.status,
        my_role:   lm.role,
      });
    });
    setLeagues(flattened);
  }, []);

  useEffect(function () {
    if (authUser && authUser.id) loadMyLeagues(authUser.id);
  }, [authUser && authUser.id, loadMyLeagues]);

  // ── Detail loader: members + standings + recent matches for one league ────
  var loadLeagueDetail = useCallback(async function (leagueId) {
    if (!leagueId) return;
    var [mr, sr, rr] = await Promise.all([
      L.fetchLeagueMembers(leagueId),
      L.fetchLeagueStandings(leagueId),
      L.fetchLeagueRecentMatches(leagueId, 10),
    ]);
    var members   = mr.data || [];
    var standings = sr.data || [];
    var recent    = rr.data || [];

    // Enrich profileMap with any user_ids we haven't seen yet — used by the
    // detail view to render names + avatars without per-row roundtrips.
    var needIds = new Set();
    members.forEach(function (m)  { if (m.user_id)  needIds.add(m.user_id); });
    standings.forEach(function (s){ if (s.user_id)  needIds.add(s.user_id); });
    recent.forEach(function (rm)  {
      if (rm.user_id)     needIds.add(rm.user_id);
      if (rm.opponent_id) needIds.add(rm.opponent_id);
    });
    setProfileMap(function (prev) {
      var missing = [];
      needIds.forEach(function (id) { if (!prev[id]) missing.push(id); });
      if (!missing.length) return prev;
      // kick off fetch; we return prev synchronously and update async below
      fetchProfilesByIds(missing, "id,name,avatar,avatar_url,skill,suburb")
        .then(function (pr) {
          if (pr.error) return;
          setProfileMap(function (p) {
            var next = Object.assign({}, p);
            (pr.data || []).forEach(function (prof) { next[prof.id] = prof; });
            return next;
          });
        });
      return prev;
    });

    setDetailCache(function (d) {
      var next = Object.assign({}, d);
      next[leagueId] = { members: members, standings: standings, recent: recent, loadedAt: Date.now() };
      return next;
    });
  }, []);

  // ── Realtime — keep the viewer's list fresh when they get invited ─────────
  useEffect(function () {
    if (!authUser || !authUser.id) return;
    var ch = supabase
      .channel("leagues:" + authUser.id)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "league_members", filter: "user_id=eq." + authUser.id },
        function () { loadMyLeagues(authUser.id); }
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "league_members", filter: "user_id=eq." + authUser.id },
        function () { loadMyLeagues(authUser.id); }
      )
      .subscribe();
    return function () { supabase.removeChannel(ch); };
  }, [authUser && authUser.id, loadMyLeagues]);

  // ── RPC wrappers — each refreshes state on success ────────────────────────

  async function createLeague(payload) {
    var r = await L.rpcCreateLeague(payload);
    if (!r.error && authUser) await loadMyLeagues(authUser.id);
    return r;
  }

  async function inviteToLeague(leagueId, userId) {
    var r = await L.rpcInviteToLeague(leagueId, userId);
    if (!r.error) await loadLeagueDetail(leagueId);
    return r;
  }

  async function respondToInvite(leagueId, accept) {
    var r = await L.rpcRespondToLeagueInvite(leagueId, accept);
    if (!r.error && authUser) {
      await loadMyLeagues(authUser.id);
      if (accept) await loadLeagueDetail(leagueId);
    }
    return r;
  }

  async function removeMember(leagueId, userId) {
    var r = await L.rpcRemoveLeagueMember(leagueId, userId);
    if (!r.error) await loadLeagueDetail(leagueId);
    return r;
  }

  async function archiveLeague(leagueId, reason, note) {
    var r = await L.rpcArchiveLeague(leagueId, reason, note);
    if (!r.error && authUser) {
      await loadMyLeagues(authUser.id);
      await loadLeagueDetail(leagueId);
    }
    return r;
  }

  // Module 12 Slice 2 — three new lifecycle transitions. Same shape as
  // archiveLeague: RPC call, then refresh both the list and the detail
  // cache so the new status flows into every consumer immediately.
  // Server-side notification fan-out + pending-invite cleanup are
  // handled inside the SECURITY DEFINER RPCs themselves.
  async function completeLeague(leagueId, reason, note) {
    var r = await L.rpcCompleteLeague(leagueId, reason, note);
    if (!r.error && authUser) {
      await loadMyLeagues(authUser.id);
      await loadLeagueDetail(leagueId);
    }
    return r;
  }

  async function cancelLeague(leagueId, reason, note) {
    var r = await L.rpcCancelLeague(leagueId, reason, note);
    if (!r.error && authUser) {
      await loadMyLeagues(authUser.id);
      await loadLeagueDetail(leagueId);
    }
    return r;
  }

  async function voidLeague(leagueId, reason, note) {
    var r = await L.rpcVoidLeague(leagueId, reason, note);
    if (!r.error && authUser) {
      await loadMyLeagues(authUser.id);
      // After void the league is filtered out of the visible list, so
      // the detail-cache refresh is a courtesy for any consumer still
      // holding a stale ref. The component above us closes the detail
      // view when status flips off active.
      await loadLeagueDetail(leagueId);
    }
    return r;
  }

  function resetLeagues() {
    setLeagues([]);
    setProfileMap({});
    setDetailCache({});
  }

  // Helper: are both players active members of the same league?
  // Used later by the ScoreModal league selector (slice 2b).
  function leaguesForMatchup(userIdA, userIdB) {
    return leagues.filter(function (lg) {
      if (lg.status !== "active") return false;
      if (lg.my_status !== "active") return false;
      if (!userIdA || !userIdB) return false;
      // We don't have the full member list here cheaply; caller should validate
      // with loadLeagueDetail if they want certainty. For the selector, we
      // surface all active leagues the viewer belongs to, and the trigger
      // enforces the hard rule server-side.
      return true;
    });
  }

  // Count of invited/pending rows — used by the People nav badge.
  function counts() {
    var pendingInvites = leagues.filter(function (lg) { return lg.my_status === "invited"; }).length;
    return { pendingInvites: pendingInvites };
  }

  // Module 12 Slice 2 — voided leagues are hidden from normal surfaces.
  // The DB still returns them via fetchMyLeagues (RLS doesn't change
  // visibility for members), so we filter at the hook boundary so every
  // consumer (LeaguesPanel, HomeLeaguesStrip, ScoreModal selector) sees
  // the same view without re-implementing the rule. A direct deep-link
  // to a voided league still loads via the detail cache — that's
  // intentional for owner audit. Per spec there is no "show voided"
  // toggle in V1.
  var visibleLeagues = leagues.filter(function (lg) { return lg.status !== "voided"; });

  return {
    leagues: visibleLeagues,
    // Raw list with voided still included — useful for owner audit
    // surfaces if/when they get built. Nothing reads this in V1.
    leaguesIncludingVoided: leagues,
    profileMap,
    detailCache,
    loading,
    loadMyLeagues,
    loadLeagueDetail,
    createLeague,
    inviteToLeague,
    respondToInvite,
    removeMember,
    archiveLeague,
    completeLeague,
    cancelLeague,
    voidLeague,
    resetLeagues,
    leaguesForMatchup,
    counts,
  };
}
