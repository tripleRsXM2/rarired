// src/features/pacts/hooks/usePacts.js
//
// Owns the TINDIS pact state for the viewer:
//   • pacts:    every pact involving the viewer (all statuses)
//   • openCourts: open-court postings in the viewer's zone
//   • profileMap: participant profiles for quick render
//
// Realtime: INSERT/UPDATE/DELETE on match_pacts. Scoped via RLS — the
// client only receives rows it can see. Open-court changes stream too
// because proposed+null-partner rows are visible to everyone.
//
// Expiry: every 60s while visible, sweep proposed pacts past expires_at
// and flip them to 'expired'. Also fires on mount so stale pacts from
// prior sessions don't clutter the active list.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase.js";
import { fetchProfilesByIds } from "../../../lib/db.js";
import * as P from "../services/pactService.js";
import { insertNotification } from "../../notifications/services/notificationService.js";
import { track } from "../../../lib/analytics.js";

export function usePacts(opts) {
  var authUser = (opts && opts.authUser) || null;
  var profile  = (opts && opts.profile)  || null;

  var [pacts, setPacts]             = useState([]);
  var [openCourts, setOpenCourts]   = useState([]);
  var [profileMap, setProfileMap]   = useState({});
  var [loading, setLoading]         = useState(false);

  // Keep a ref to the current profile ids so we don't re-fetch ones we
  // already have. Small caches — pacts are low-volume per user.
  var knownIdsRef = useRef(new Set());

  // Enrichment helper: given a set of rows, collect every referenced
  // user id and fetch only the ones we don't already have.
  async function enrichParticipants(rows) {
    var need = new Set();
    rows.forEach(function (p) {
      if (p.proposer_id && !knownIdsRef.current.has(p.proposer_id)) need.add(p.proposer_id);
      if (p.partner_id  && !knownIdsRef.current.has(p.partner_id))  need.add(p.partner_id);
    });
    if (!need.size) return;
    var ids = Array.from(need);
    var r = await fetchProfilesByIds(ids, "id,name,avatar,avatar_url,skill,suburb,home_zone");
    if (r.error) return;
    var patch = {};
    (r.data || []).forEach(function (p) {
      patch[p.id] = p;
      knownIdsRef.current.add(p.id);
    });
    setProfileMap(function (m) { return Object.assign({}, m, patch); });
  }

  // ── Initial load ────────────────────────────────────────────────────
  var loadPacts = useCallback(async function (userId) {
    if (!userId) return;
    setLoading(true);
    try {
      // Sweep stale rows before we read. Server-side RPC covers every
      // lifecycle stage (proposed-past-expiry, confirmed-past-scheduled,
      // booked-past-7d, terminal-older-than-30d); the viewer-scoped
      // expireProposedPacts below is a belt-and-braces path in case the
      // RPC isn't available (older clients pointing at a fresh DB).
      try { await P.sweepStalePacts(); } catch (e) { /* RPC missing on old db — fall through */ }
      await P.expireProposedPacts(userId);
      var mine = await P.fetchMyPacts(userId);
      var rows = mine.data || [];
      setPacts(rows);
      await enrichParticipants(rows);
    } catch (e) {
      console.error("[usePacts.loadPacts]", e);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  var loadOpenCourts = useCallback(async function (zoneId, skill) {
    if (!zoneId) { setOpenCourts([]); return; }
    var r = await P.fetchOpenCourts(zoneId, skill || null, 30);
    if (r.error) { console.warn("[usePacts.loadOpenCourts]", r.error); return; }
    var rows = r.data || [];
    setOpenCourts(rows);
    await enrichParticipants(rows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial + when the authUser flips.
  useEffect(function () {
    if (!authUser) return;
    loadPacts(authUser.id);
  }, [authUser && authUser.id, loadPacts]);

  useEffect(function () {
    if (!authUser) return;
    loadOpenCourts(profile && profile.home_zone, profile && profile.skill);
  }, [authUser && authUser.id, profile && profile.home_zone, profile && profile.skill, loadOpenCourts]);

  // ── Periodic expiry sweep ───────────────────────────────────────────
  useEffect(function () {
    if (!authUser) return;
    // Run the server-side sweep first (covers every lifecycle stage),
    // then the client fallback, then re-load. We use async/await rather
    // than .catch/.finally because the service helpers return raw
    // Supabase query builders, which are thenable but don't expose
    // .catch directly — chaining .catch() on them throws TypeError.
    async function sweep() {
      if (document.hidden) return;
      try { await P.sweepStalePacts(); } catch (e) {}
      try { await P.expireProposedPacts(authUser.id); } catch (e) {}
      loadPacts(authUser.id);
    }
    var timer = setInterval(sweep, 60 * 1000);
    return function () { clearInterval(timer); };
  }, [authUser && authUser.id, loadPacts]);

  // ── Realtime: any change to match_pacts the viewer can see ─────────
  useEffect(function () {
    if (!authUser) return;
    var uid = authUser.id;
    var channel = supabase.channel("match_pacts:" + uid)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "match_pacts" },
        function (payload) {
          var n = payload.new || payload.old;
          if (!n) return;
          var involvesMe = n.proposer_id === uid || n.partner_id === uid;
          var isOpenCourt = n.partner_id == null && n.status === "proposed";
          if (!involvesMe && !isOpenCourt) return;

          if (payload.eventType === "DELETE") {
            setPacts(function (cs) { return cs.filter(function (c) { return c.id !== n.id; }); });
            setOpenCourts(function (cs) { return cs.filter(function (c) { return c.id !== n.id; }); });
            return;
          }

          // Upsert into whichever buckets it belongs to.
          if (involvesMe) {
            setPacts(function (cs) {
              var found = cs.some(function (c) { return c.id === n.id; });
              if (found) return cs.map(function (c) { return c.id === n.id ? Object.assign({}, c, n) : c; });
              return [n].concat(cs);
            });
          }
          if (isOpenCourt) {
            setOpenCourts(function (cs) {
              var found = cs.some(function (c) { return c.id === n.id; });
              if (found) return cs.map(function (c) { return c.id === n.id ? Object.assign({}, c, n) : c; });
              return cs.concat([n]);
            });
          } else {
            // Was open, got claimed → remove from open list.
            setOpenCourts(function (cs) { return cs.filter(function (c) { return c.id !== n.id; }); });
          }
          enrichParticipants([n]);
        })
      .subscribe();
    return function () { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser && authUser.id]);

  // ── Actions ─────────────────────────────────────────────────────────

  async function proposePact(payload) {
    if (!authUser) return { error: "not_authenticated" };
    var row = Object.assign({ proposer_id: authUser.id }, payload);
    var r = await P.createPact(row);
    if (r.error) { console.error("[proposePact]", r.error); return { error: r.error }; }
    setPacts(function (cs) { return [r.data].concat(cs); });
    enrichParticipants([r.data]);
    if (r.data.partner_id) {
      // Notify direct partner that they have a pact to review.
      await insertNotification({
        user_id: r.data.partner_id,
        type: "pact_proposed",
        from_user_id: authUser.id,
        entity_id: r.data.id,
      });
      track("pact_created", {
        pact_id: r.data.id, kind: "direct", has_cost: !!r.data.total_cost_cents,
      });
    } else {
      track("pact_created", { pact_id: r.data.id, kind: "open", zone_id: r.data.zone_id });
    }
    return { data: r.data };
  }

  async function agreeToPact(pact) {
    if (!authUser) return { error: "not_authenticated" };
    var side = pact.proposer_id === authUser.id ? "proposer" : "partner";
    var r = await P.setAgreement(pact.id, side, true);
    if (r.error) return { error: r.error };
    var updated = r.data;
    // If both sides now agree, flip to 'confirmed'.
    if (updated.proposer_agreed && updated.partner_agreed && updated.status === "proposed") {
      var conf = await P.confirmPact(pact.id);
      if (!conf.error) updated = conf.data;
      // Notify the other party so they know the pact is go.
      var otherId = pact.proposer_id === authUser.id ? pact.partner_id : pact.proposer_id;
      if (otherId) {
        await insertNotification({
          user_id: otherId, type: "pact_confirmed",
          from_user_id: authUser.id, entity_id: pact.id,
        });
      }
      track("pact_confirmed", { pact_id: pact.id });
    }
    setPacts(function (cs) { return cs.map(function (c) { return c.id === pact.id ? updated : c; }); });
    return { data: updated };
  }

  async function bookPact(pact, patch) {
    if (!authUser) return { error: "not_authenticated" };
    var body = Object.assign({ booked_by: authUser.id }, patch || {});
    var r = await P.bookPact(pact.id, body);
    if (r.error) return { error: r.error };
    setPacts(function (cs) { return cs.map(function (c) { return c.id === pact.id ? r.data : c; }); });
    var otherId = pact.proposer_id === authUser.id ? pact.partner_id : pact.proposer_id;
    if (otherId) {
      await insertNotification({
        user_id: otherId, type: "pact_booked",
        from_user_id: authUser.id, entity_id: pact.id,
      });
    }
    track("pact_booked", {
      pact_id: pact.id,
      has_cost: !!r.data.total_cost_cents,
      split_mode: r.data.split_mode,
    });
    return { data: r.data };
  }

  async function setPaid(pact, paid) {
    if (!authUser) return { error: "not_authenticated" };
    var side = pact.proposer_id === authUser.id ? "proposer" : "partner";
    var r = await P.setPaid(pact.id, side, paid);
    if (r.error) return { error: r.error };
    setPacts(function (cs) { return cs.map(function (c) { return c.id === pact.id ? r.data : c; }); });
    track(paid ? "pact_paid_self_marked" : "pact_paid_self_unmarked", { pact_id: pact.id });
    return { data: r.data };
  }

  async function cancelPact(pact) {
    if (!authUser) return { error: "not_authenticated" };
    var r = await P.cancelPact(pact.id);
    if (r.error) return { error: r.error };
    setPacts(function (cs) { return cs.map(function (c) { return c.id === pact.id ? r.data : c; }); });
    var otherId = pact.proposer_id === authUser.id ? pact.partner_id : pact.proposer_id;
    if (otherId) {
      await insertNotification({
        user_id: otherId, type: "pact_cancelled",
        from_user_id: authUser.id, entity_id: pact.id,
      });
    }
    track("pact_cancelled", { pact_id: pact.id, status_at_cancel: pact.status });
    return { data: r.data };
  }

  async function claimOpenPact(pact) {
    if (!authUser) return { error: "not_authenticated" };
    var r = await P.claimOpenPact(pact.id);
    if (r.error) return { error: r.error };
    var claimed = r.data;
    // RPC returns the pact row; add to my pacts, remove from open.
    setPacts(function (cs) {
      var found = cs.some(function (c) { return c.id === claimed.id; });
      if (found) return cs.map(function (c) { return c.id === claimed.id ? claimed : c; });
      return [claimed].concat(cs);
    });
    setOpenCourts(function (cs) { return cs.filter(function (c) { return c.id !== claimed.id; }); });
    await insertNotification({
      user_id: claimed.proposer_id, type: "pact_claimed",
      from_user_id: authUser.id, entity_id: claimed.id,
    });
    track("open_court_claimed", { pact_id: claimed.id });
    return { data: claimed };
  }

  function resetPacts() {
    setPacts([]); setOpenCourts([]); setProfileMap({});
    knownIdsRef.current = new Set();
    setLoading(false);
  }

  return {
    pacts, openCourts, profileMap, loading,
    loadPacts, loadOpenCourts,
    proposePact, agreeToPact, bookPact, setPaid, cancelPact, claimOpenPact,
    resetPacts,
  };
}
