// src/features/notifications/hooks/useNotifications.js
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase.js";
import * as N from "../services/notificationService.js";
import { fetchProfilesByIds } from "../../../lib/db.js";
import { getNotifType } from "../utils/notifUtils.js";

// Notification types that should display a mini scorecard (sets + W/L)
// inline in the tray. Covers every match lifecycle event where the
// recipient benefits from seeing the actual score without drilling in.
var MATCH_CARD_TYPES = [
  "match_tag", "match_confirmed", "match_disputed",
  "match_corrected", "match_correction_requested",
  "match_counter_proposed", "match_voided", "match_deleted",
];

// Fetch sets/result/participants for every match_id we'll render a card
// for, then stitch the data onto the notification as `match`. Viewer
// perspective is computed later in the UI (result is stored from the
// submitter's view, so if the viewer is the opponent we invert it).
async function enrichWithMatches(notifs, viewerId) {
  var ids = [...new Set(
    notifs
      .filter(function (n) { return MATCH_CARD_TYPES.indexOf(n.type) >= 0; })
      .map(function (n) { return n.match_id || n.entity_id; })
      .filter(Boolean)
  )];
  if (!ids.length) return notifs;
  var mr = await supabase.from("match_history")
    .select("id,user_id,opponent_id,tagged_user_id,opp_name,sets,result,match_date,status,tourn_name")
    .in("id", ids);
  var mMap = {};
  (mr.data || []).forEach(function (m) { mMap[m.id] = m; });
  return notifs.map(function (n) {
    var mid = n.match_id || n.entity_id;
    if (!mid || !mMap[mid]) return n;
    return Object.assign({}, n, { match: mMap[mid] });
  });
}

export function useNotifications(opts) {
  var authUser             = (opts && opts.authUser) || null;
  var onMatchTagAccepted   = opts && opts.onMatchTagAccepted;
  var updateMatchTagStatus = (opts && opts.updateMatchTagStatus) || null;

  var [notifications, setNotifications] = useState([]);
  var [showNotifications, setShowNotifications] = useState(false);
  // seenIds — purely in-memory; tracks which notification IDs were visible when
  // the tray was opened. Cleared on mount/reload by design.
  var [seenIds, setSeenIds] = useState(function () { return new Set(); });

  // ── Initial load ─────────────────────────────────────────────────────────────
  async function loadNotifications(userId) {
    var nr = await N.fetchRecentNotifications(userId);
    if (nr.data && nr.data.length) {
      var fromIds = [...new Set(nr.data.map(function (n) { return n.from_user_id; }).filter(Boolean))];
      var fpr = fromIds.length ? await fetchProfilesByIds(fromIds, "id,name,avatar,avatar_url") : { data: [] };
      var fpMap = {};
      (fpr.data || []).forEach(function (p) { fpMap[p.id] = p; });
      var base = nr.data.map(function (n) {
        var fp = fpMap[n.from_user_id] || {};
        return Object.assign({}, n, {
          fromName: fp.name || "Someone",
          fromAvatar: fp.avatar || "?",
          fromAvatarUrl: fp.avatar_url || null,
        });
      });
      var enriched = await enrichWithMatches(base, userId);
      setNotifications(enriched);
    } else {
      setNotifications([]);
    }
  }

  // ── Realtime subscription ────────────────────────────────────────────────────
  useEffect(function () {
    if (!authUser) return;
    var uid = authUser.id;

    async function handleNotifChange(payload) {
      var n = payload.new;
      if (!n || n.user_id !== uid) return;
      var senderProfile = { name: "Someone", avatar: "?" };
      if (n.from_user_id) {
        var pr = await fetchProfilesByIds([n.from_user_id], "id,name,avatar,avatar_url");
        var p = (pr.data && pr.data[0]) || {};
        senderProfile = { name: p.name || "Someone", avatar: p.avatar || "?", avatar_url: p.avatar_url || null };
      }
      var enriched = Object.assign({}, n, {
        fromName: senderProfile.name,
        fromAvatar: senderProfile.avatar,
        fromAvatarUrl: senderProfile.avatar_url,
      });
      // If this is a match-lifecycle notification, fetch the match row so
      // the tray can render an inline mini-scorecard (sets + W/L).
      if (MATCH_CARD_TYPES.indexOf(enriched.type) >= 0) {
        var mid = enriched.match_id || enriched.entity_id;
        if (mid) {
          var mr = await supabase.from("match_history")
            .select("id,user_id,opponent_id,tagged_user_id,opp_name,sets,result,match_date,status,tourn_name")
            .eq("id", mid).maybeSingle();
          if (mr.data) enriched.match = mr.data;
        }
      }
      setNotifications(function (ns) {
        if (ns.some(function (x) { return x.id === enriched.id; })) {
          return ns.map(function (x) { return x.id === enriched.id ? enriched : x; });
        }
        return [enriched].concat(ns);
      });
    }

    // Realtime: DELETE events let us live-remove rows the moment a
    // cleanup trigger fires (e.g. conv deleted → message_request notif
    // gone; match voided → match_tag notif gone; challenge expired →
    // challenge_received notif gone). notifications is REPLICA IDENTITY
    // FULL so payload.old carries user_id — we filter by that here.
    function handleNotifDelete(payload) {
      var old = payload.old || {};
      if (!old.id) return;
      if (old.user_id && old.user_id !== uid) return;
      setNotifications(function (ns) {
        return ns.filter(function (n) { return n.id !== old.id; });
      });
    }

    var channel = supabase.channel("notifications:" + uid)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + uid }, handleNotifChange)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: "user_id=eq." + uid }, handleNotifChange)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications" }, handleNotifDelete)
      .subscribe();

    return function () { supabase.removeChannel(channel); };
  }, [authUser && authUser.id]);

  // ── Badge count ──────────────────────────────────────────────────────────────
  // Shows items that are unread AND not yet seen in this session.
  //
  // Excludes `message` notifications — unread DMs surface via the People
  // nav badge instead (Instagram-style), so showing them here too would
  // double-count. The `message_request` + `message_request_accepted`
  // types DO count here because they're friend-request-style events, not
  // ongoing chat activity.
  function unreadCount() {
    return notifications.filter(function (n) {
      if (n.type === "message") return false;
      return !n.read && !seenIds.has(n.id);
    }).length;
  }

  // ── markSeen ─────────────────────────────────────────────────────────────────
  // Called when the tray opens. Adds all visible IDs to seenIds (clears badge
  // locally). Also auto-reads non-action items in the DB so they don't
  // re-appear in the badge after a page reload.
  async function markSeen() {
    var current = notifications;
    setSeenIds(function (prev) {
      var next = new Set(prev);
      current.forEach(function (n) { next.add(n.id); });
      return next;
    });
    var toRead = current.filter(function (n) {
      return !n.read && getNotifType(n) !== "action";
    });
    if (toRead.length && authUser) {
      var ids = toRead.map(function (n) { return n.id; });
      await N.markNotificationsReadByIds(ids);
      setNotifications(function (ns) {
        return ns.map(function (n) {
          return ids.indexOf(n.id) !== -1 ? Object.assign({}, n, { read: true }) : n;
        });
      });
    }
  }

  // ── markOneRead ──────────────────────────────────────────────────────────────
  // Called when the user clicks a notification row.
  async function markOneRead(id) {
    await N.markNotificationRead(id);
    setNotifications(function (ns) {
      return ns.map(function (n) {
        return n.id === id ? Object.assign({}, n, { read: true }) : n;
      });
    });
  }

  // ── markAllRead ──────────────────────────────────────────────────────────────
  // "Mark all read" button — intentionally skips action-type items so unresolved
  // disputes / match tags are never silently cleared.
  async function markAllRead() {
    var toRead = notifications.filter(function (n) {
      return !n.read && getNotifType(n) !== "action";
    });
    if (!toRead.length || !authUser) return;
    var ids = toRead.map(function (n) { return n.id; });
    await N.markNotificationsReadByIds(ids);
    setNotifications(function (ns) {
      return ns.map(function (n) {
        return ids.indexOf(n.id) !== -1 ? Object.assign({}, n, { read: true }) : n;
      });
    });
  }

  // ── dismissNotification ──────────────────────────────────────────────────────
  // Deletes a single non-action notification from DB and local state.
  async function dismissNotification(id) {
    await N.deleteNotification(id);
    setNotifications(function (ns) { return ns.filter(function (n) { return n.id !== id; }); });
  }

  // ── dismissNotifications (bulk) ──────────────────────────────────────────────
  // Used to dismiss all notifications in a group/thread at once.
  async function dismissNotifications(ids) {
    if (!ids || !ids.length) return;
    await Promise.all(ids.map(function (id) { return N.deleteNotification(id); }));
    var idSet = new Set(ids);
    setNotifications(function (ns) { return ns.filter(function (n) { return !idSet.has(n.id); }); });
  }

  // ── acceptMatchTag / declineMatchTag ─────────────────────────────────────────
  // Accept uses the SECURITY DEFINER RPC (confirm_match_and_update_stats)
  // because profile stats columns (ranking_points / wins / losses /
  // matches_played / streak_*) are locked from user writes by a trigger
  // (profiles_locked_columns_guard). Only the server can update them, and
  // the RPC calls apply_match_outcome internally to run the real ELO.
  //
  // The old path did a direct UPDATE on match_history + a client-side
  // bump on profiles, which fails with "profiles.ranking_points is not
  // user-writable" the moment the locked-columns guard is in place.
  async function acceptMatchTag(n) {
    var rpc = await supabase.rpc('confirm_match_and_update_stats', { p_match_id: n.match_id });
    if (rpc.error) {
      console.error('[acceptMatchTag] confirm RPC failed:', rpc.error);
      return { error: rpc.error };
    }
    // Fetch the now-confirmed row so the caller can wire it into local state
    var mr = await supabase.from('match_history').select('*').eq('id', n.match_id).maybeSingle();
    await N.deleteNotification(n.id);
    setNotifications(function (ns) { return ns.filter(function (x) { return x.id !== n.id; }); });
    setShowNotifications(false);
    if (mr.data && onMatchTagAccepted) onMatchTagAccepted(mr.data);
    return { error: null };
  }

  async function declineMatchTag(n) {
    if (!updateMatchTagStatus) return;
    await updateMatchTagStatus(n.match_id, "declined", false);
    await N.deleteNotification(n.id);
    setNotifications(function (ns) { return ns.filter(function (x) { return x.id !== n.id; }); });
  }

  function resetNotifications() {
    setNotifications([]);
    setShowNotifications(false);
    setSeenIds(new Set());
  }

  return {
    notifications, setNotifications,
    showNotifications, setShowNotifications,
    loadNotifications, resetNotifications,
    unreadCount,
    markSeen, markOneRead, markAllRead,
    dismissNotification, dismissNotifications,
    acceptMatchTag, declineMatchTag,
    // Legacy alias — kept so any remaining callers don't break
    markNotificationsRead: markAllRead,
  };
}
