// src/features/challenges/hooks/useChallenges.js
// Client-side state for the lightweight challenge / rematch flow. Mirrors the
// pattern used by useSocialGraph (load + actions + realtime).
//
// State machine summary (full rules in /docs/core-loop.md):
//   pending → accepted | declined | expired | (challenger may delete)
//   accepted → completed (when converted to a logged match)
//
// All notifications are fired here so the UI stays thin. Analytics events
// fire from here too (challenge_sent / accepted / declined / converted).

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase.js";
import * as C from "../services/challengeService.js";
import { fetchProfilesByIds } from "../../../lib/db.js";
import { insertNotification } from "../../notifications/services/notificationService.js";
import { track } from "../../../lib/analytics.js";

export function useChallenges(opts) {
  var authUser = (opts && opts.authUser) || null;

  var [challenges, setChallenges] = useState([]);   // raw rows
  var [profileMap, setProfileMap] = useState({});   // userId → profile (name+avatar+suburb)
  var [composer, setComposer]     = useState(null); // {targetUser, source: 'profile'|'rematch', sourceMatchId?}
  var [draft, setDraft] = useState({ message: "", venue: "", court: "", proposed_at: "" });
  var [loading, setLoading] = useState({});

  // Load all challenges involving the user, plus enrich the other party's
  // profile (so the UI can show name/avatar without another lookup).
  async function loadChallenges(userId) {
    if (!userId) return;
    var r = await C.fetchChallengesForUser(userId);
    var rows = r.data || [];
    setChallenges(rows);
    var otherIds = [...new Set(rows.map(function (c) {
      return c.challenger_id === userId ? c.challenged_id : c.challenger_id;
    }))].filter(Boolean);
    if (!otherIds.length) { setProfileMap({}); return; }
    var pr = await fetchProfilesByIds(otherIds, "id,name,avatar,skill,suburb");
    var m = {};
    (pr.data || []).forEach(function (p) { m[p.id] = p; });
    setProfileMap(m);
  }

  function resetChallenges() {
    setChallenges([]); setProfileMap({}); setComposer(null);
    setDraft({ message: "", venue: "", court: "", proposed_at: "" });
  }

  // ── Realtime: incoming challenges (where current user is the challenged) ──
  useEffect(function () {
    if (!authUser) return;
    var uid = authUser.id;
    var channel = supabase.channel("challenges:" + uid)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "challenges",
        filter: "challenged_id=eq." + uid,
      }, async function (payload) {
        var row = payload.new;
        // Enrich the challenger profile so the UI can render immediately.
        var pr = await fetchProfilesByIds([row.challenger_id], "id,name,avatar,skill,suburb");
        var p = (pr.data && pr.data[0]) || { id: row.challenger_id, name: "Player" };
        setProfileMap(function (m) { var n = Object.assign({}, m); n[p.id] = p; return n; });
        setChallenges(function (cs) {
          if (cs.some(function (c) { return c.id === row.id; })) return cs;
          return [row].concat(cs);
        });
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "challenges",
        filter: "challenger_id=eq." + uid,
      }, function (payload) {
        var row = payload.new;
        setChallenges(function (cs) {
          return cs.map(function (c) { return c.id === row.id ? row : c; });
        });
      })
      .subscribe();
    return function () { supabase.removeChannel(channel); };
  }, [authUser && authUser.id]);

  // ── Compose helpers ──────────────────────────────────────────────────────
  function openComposer(targetUser, source, sourceMatchId) {
    if (!targetUser) return;
    setComposer({ targetUser: targetUser, source: source || "profile", sourceMatchId: sourceMatchId || null });
    // For a rematch, prefill venue/court from the source match if we have it
    // (HomeTab passes the match into openComposer via the wrapper).
    setDraft({ message: "", venue: "", court: "", proposed_at: "" });
  }
  function closeComposer() { setComposer(null); }

  // ── Send ─────────────────────────────────────────────────────────────────
  async function sendChallenge() {
    if (!authUser || !composer || !composer.targetUser) return { error: "no_target" };
    var target = composer.targetUser;
    setLoading(function (l) { return Object.assign({}, l, { send: true }); });
    var payload = {
      challenger_id: authUser.id,
      challenged_id: target.id,
      status: "pending",
      message: (draft.message || "").trim().slice(0, 280) || null,
      venue: (draft.venue || "").trim() || null,
      court: (draft.court || "").trim() || null,
      proposed_at: draft.proposed_at || null,
    };
    var r = await C.insertChallenge(payload);
    setLoading(function (l) { return Object.assign({}, l, { send: false }); });
    if (r.error) {
      console.error("[sendChallenge]", r.error);
      return { error: r.error.message || "Could not send challenge." };
    }
    // Optimistic local insert
    setChallenges(function (cs) { return [r.data].concat(cs); });
    // Notification + analytics
    await insertNotification({
      user_id: target.id,
      type: "challenge_received",
      from_user_id: authUser.id,
      entity_id: r.data.id,
    });
    track("challenge_sent", {
      target_user_id: target.id,
      has_proposed_time: !!draft.proposed_at,
      has_venue: !!(draft.venue || "").trim(),
      has_message: !!(draft.message || "").trim(),
      source: composer.source,
    });
    closeComposer();
    return { error: null, challenge: r.data };
  }

  // ── Accept / Decline / Cancel ────────────────────────────────────────────
  async function acceptChallenge(c) {
    if (!authUser) return { error: "no_auth" };
    setLoading(function (l) { return Object.assign({}, l, { [c.id]: true }); });
    var r = await C.updateChallengeStatus(c.id, "accepted");
    setLoading(function (l) { return Object.assign({}, l, { [c.id]: false }); });
    if (r.error) return { error: r.error.message };
    setChallenges(function (cs) { return cs.map(function (x) { return x.id === c.id ? r.data : x; }); });
    await insertNotification({
      user_id: c.challenger_id,
      type: "challenge_accepted",
      from_user_id: authUser.id,
      entity_id: c.id,
    });
    var ageDays = Math.max(0, Math.round((Date.now() - new Date(c.created_at).getTime()) / 86400000));
    track("challenge_accepted", { challenger_user_id: c.challenger_id, days_since_sent: ageDays });
    return { error: null };
  }

  async function declineChallenge(c) {
    if (!authUser) return { error: "no_auth" };
    setLoading(function (l) { return Object.assign({}, l, { [c.id]: true }); });
    var r = await C.updateChallengeStatus(c.id, "declined");
    setLoading(function (l) { return Object.assign({}, l, { [c.id]: false }); });
    if (r.error) return { error: r.error.message };
    setChallenges(function (cs) { return cs.map(function (x) { return x.id === c.id ? r.data : x; }); });
    await insertNotification({
      user_id: c.challenger_id,
      type: "challenge_declined",
      from_user_id: authUser.id,
      entity_id: c.id,
    });
    track("challenge_declined", { challenger_user_id: c.challenger_id });
    return { error: null };
  }

  async function cancelChallenge(c) {
    if (!authUser) return { error: "no_auth" };
    setLoading(function (l) { return Object.assign({}, l, { [c.id]: true }); });
    var r = await C.deleteChallenge(c.id);
    setLoading(function (l) { return Object.assign({}, l, { [c.id]: false }); });
    if (r.error) return { error: r.error.message };
    setChallenges(function (cs) { return cs.filter(function (x) { return x.id !== c.id; }); });
    return { error: null };
  }

  // ── Convert accepted → match ─────────────────────────────────────────────
  // Called by useMatchHistory after a match is logged. Marks the challenge
  // completed and links the match. Best-effort; failures don't surface.
  async function markChallengeAsConverted(challengeId, matchId) {
    if (!challengeId || !matchId) return;
    var c = challenges.find(function (x) { return x.id === challengeId; });
    if (!c) return;
    var ageDays = c.responded_at
      ? Math.max(0, Math.round((Date.now() - new Date(c.responded_at).getTime()) / 86400000))
      : null;
    await C.markChallengeCompleted(challengeId, matchId);
    setChallenges(function (cs) {
      return cs.map(function (x) {
        return x.id === challengeId
          ? Object.assign({}, x, { status: "completed", match_id: matchId, completed_at: new Date().toISOString() })
          : x;
      });
    });
    track("rematch_converted_to_match", {
      challenge_id: challengeId,
      match_id: matchId,
      days_since_accepted: ageDays,
    });
  }

  // ── Derived helpers for UI ───────────────────────────────────────────────
  function pendingIncoming() {
    if (!authUser) return [];
    return challenges.filter(function (c) {
      return c.status === "pending" && c.challenged_id === authUser.id;
    });
  }
  function pendingOutgoing() {
    if (!authUser) return [];
    return challenges.filter(function (c) {
      return c.status === "pending" && c.challenger_id === authUser.id;
    });
  }
  function acceptedReady() {
    if (!authUser) return [];
    return challenges.filter(function (c) {
      return c.status === "accepted";
    });
  }
  function counts() {
    return {
      incoming: pendingIncoming().length,
      outgoing: pendingOutgoing().length,
      accepted: acceptedReady().length,
    };
  }

  return {
    challenges, setChallenges, profileMap, composer, draft, setDraft, loading,
    loadChallenges, resetChallenges,
    openComposer, closeComposer,
    sendChallenge, acceptChallenge, declineChallenge, cancelChallenge,
    markChallengeAsConverted,
    pendingIncoming, pendingOutgoing, acceptedReady, counts,
  };
}
