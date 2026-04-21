// src/features/notifications/hooks/useNotifications.js
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase.js";
import * as N from "../services/notificationService.js";
import { fetchProfilesByIds } from "../../../lib/db.js";
import { getNotifType } from "../utils/notifUtils.js";

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
      setNotifications(nr.data.map(function (n) {
        var fp = fpMap[n.from_user_id] || {};
        return Object.assign({}, n, {
          fromName: fp.name || "Someone",
          fromAvatar: fp.avatar || "?",
          fromAvatarUrl: fp.avatar_url || null,
        });
      }));
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
      setNotifications(function (ns) {
        if (ns.some(function (x) { return x.id === enriched.id; })) {
          return ns.map(function (x) { return x.id === enriched.id ? enriched : x; });
        }
        return [enriched].concat(ns);
      });
    }

    var channel = supabase.channel("notifications:" + uid)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + uid }, handleNotifChange)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: "user_id=eq." + uid }, handleNotifChange)
      .subscribe();

    return function () { supabase.removeChannel(channel); };
  }, [authUser && authUser.id]);

  // ── Badge count ──────────────────────────────────────────────────────────────
  // Shows items that are unread AND not yet seen in this session.
  function unreadCount() {
    return notifications.filter(function (n) {
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
  async function acceptMatchTag(n) {
    if (!updateMatchTagStatus) return;
    var mr = await updateMatchTagStatus(n.match_id, "accepted", true);
    await N.deleteNotification(n.id);
    setNotifications(function (ns) { return ns.filter(function (x) { return x.id !== n.id; }); });
    setShowNotifications(false);
    if (mr.data && onMatchTagAccepted) onMatchTagAccepted(mr.data);
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
