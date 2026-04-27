// src/features/notifications/hooks/useNotifications.js
//
// Module 11 (Slice 2) — DB-driven lifecycle. Retires the
// sessionStorage seenIds badge logic in favour of a single canonical
// filter (countsAsUnread) that reads from the new lifecycle columns
// shipped by Slice 1's migration.
//
// Behaviour changes from prior version:
//   - markOneRead writes read_at (+ legacy read=true mirror) instead
//     of just `read`. Idempotent: a re-tap on an already-read row is
//     a no-op (gated by `.is('read_at', null)` in the service layer).
//   - dismissNotification writes dismissed_at instead of DELETE.
//   - markSeen drops seenIds entirely. Opening the tray bulk-marks
//     informational rows read so they fall out of the next centre
//     query; actionable rows stay visible because isActiveForUser
//     keeps them up while resolved_at is null.
//   - acceptMatchTag no longer hard-deletes the notification — the
//     server-side cleanup_match_notifs_trg flips it to resolved on
//     the match_history.status transition (Slice 1 wiring), and the
//     centre filter hides resolved rows on next render. Realtime
//     UPDATE event live-removes it.
//   - unreadCount uses countsAsUnread (registry-driven), so an
//     opened-but-unresolved actionable still counts as "needs your
//     attention" forever, while informational rows fall out the
//     moment read_at lands.

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase.js";
import * as N from "../services/notificationService.js";
import { fetchProfilesByIds } from "../../../lib/db.js";
import { isActionable, countsAsUnread } from "../utils/notifUtils.js";

// Notification types that should display a mini scorecard (sets + W/L)
// inline in the tray. Covers every match lifecycle event where the
// recipient benefits from seeing the actual score without drilling in.
var MATCH_CARD_TYPES = [
  "match_tag", "match_confirmed", "match_disputed",
  "match_corrected", "match_correction_requested",
  "match_counter_proposed", "match_voided", "match_deleted",
];

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

  // ── Initial load ─────────────────────────────────────────────────────────────
  // Module 11 Slice 1 added reconcile_my_notifications — call it on
  // load so any rows the cleanup triggers missed (deploy race, dropped
  // realtime event, etc.) are resolved before we render the centre.
  // Best-effort: failure is logged + ignored so the tray still loads.
  async function loadNotifications(userId) {
    try { await N.reconcileMyNotifications(); }
    catch (e) { console.warn("[notifications] reconcile failed:", e && e.message); }

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

    // Module 11 Slice 1 — cleanup triggers now flip resolved_at via
    // UPDATE rather than DELETE. The existing handleNotifChange path
    // catches UPDATE events (subscribed below) and re-renders the row;
    // isActiveForUser then filters it out at panel-time, so the
    // "match resolved → notification disappears" flow keeps working
    // without a separate DELETE-handler path.
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
  // Module 11 Slice 2: DB/lifecycle-driven, no sessionStorage. The
  // canonical countsAsUnread() helper handles the registry lookup +
  // the "read but unresolved actionable still counts" rule.
  function unreadCount() {
    return notifications.filter(countsAsUnread).length;
  }

  // ── markSeen ─────────────────────────────────────────────────────────────────
  // Called when the tray opens. Bulk-marks INFORMATIONAL rows read so
  // they vanish from the centre on next render (isActiveForUser hides
  // informational + read). Actionable rows are deliberately NOT
  // touched — they stay visible until the underlying entity resolves.
  async function markSeen() {
    if (!authUser) return;
    var current = notifications;
    var toRead = current.filter(function (n) {
      return !n.read_at && !isActionable(n);
    });
    if (!toRead.length) return;
    var ids = toRead.map(function (n) { return n.id; });
    await N.markNotificationsReadByIds(ids);
    var nowIso = new Date().toISOString();
    setNotifications(function (ns) {
      return ns.map(function (n) {
        return ids.indexOf(n.id) !== -1
          ? Object.assign({}, n, { read: true, read_at: nowIso })
          : n;
      });
    });
  }

  // ── markOneRead ──────────────────────────────────────────────────────────────
  // Called when the user clicks a notification row (informational or
  // actionable). Sets read_at + legacy `read = true`. For informational
  // rows this hides them on next render; for actionable rows the
  // centre keeps showing them while resolved_at is null.
  async function markOneRead(id) {
    await N.markNotificationRead(id);
    var nowIso = new Date().toISOString();
    setNotifications(function (ns) {
      return ns.map(function (n) {
        return n.id === id
          ? Object.assign({}, n, { read: true, read_at: n.read_at || nowIso })
          : n;
      });
    });
  }

  // ── markAllRead ──────────────────────────────────────────────────────────────
  // "Mark all read" CTA — same rule as markSeen: only informational
  // rows. Action items stay until resolved.
  async function markAllRead() {
    if (!authUser) return;
    var toRead = notifications.filter(function (n) {
      return !n.read_at && !isActionable(n);
    });
    if (!toRead.length) return;
    var ids = toRead.map(function (n) { return n.id; });
    await N.markNotificationsReadByIds(ids);
    var nowIso = new Date().toISOString();
    setNotifications(function (ns) {
      return ns.map(function (n) {
        return ids.indexOf(n.id) !== -1
          ? Object.assign({}, n, { read: true, read_at: nowIso })
          : n;
      });
    });
  }

  // ── dismissNotification ──────────────────────────────────────────────────────
  // Module 11 Slice 2: writes dismissed_at, doesn't DELETE. Keeps the
  // row in the table for the future history surface. Local state
  // patches dismissed_at so the panel filter (isActiveForUser) drops
  // it on next render.
  async function dismissNotification(id) {
    await N.deleteNotification(id);                  // service helper writes dismissed_at
    var nowIso = new Date().toISOString();
    setNotifications(function (ns) {
      return ns.map(function (n) {
        return n.id === id ? Object.assign({}, n, { dismissed_at: nowIso }) : n;
      });
    });
  }

  async function dismissNotifications(ids) {
    if (!ids || !ids.length) return;
    await Promise.all(ids.map(function (id) { return N.deleteNotification(id); }));
    var nowIso = new Date().toISOString();
    var idSet = new Set(ids);
    setNotifications(function (ns) {
      return ns.map(function (n) {
        return idSet.has(n.id) ? Object.assign({}, n, { dismissed_at: nowIso }) : n;
      });
    });
  }

  // ── acceptMatchTag / declineMatchTag ─────────────────────────────────────────
  // Slice 2: post-RPC delete is gone. The cleanup_match_notifs_trg
  // (Slice 1) flips resolved_at on the match_history.status →
  // 'confirmed' transition; realtime UPDATE event arrives and the
  // panel filter naturally hides the now-resolved row. Local state
  // is also patched so the UI updates instantly without waiting for
  // realtime.
  async function acceptMatchTag(n) {
    var rpc = await supabase.rpc('confirm_match_and_update_stats', { p_match_id: n.match_id });
    if (rpc.error) {
      console.error('[acceptMatchTag] confirm RPC failed:', rpc.error);
      return { error: rpc.error };
    }
    var mr = await supabase.from('match_history').select('*').eq('id', n.match_id).maybeSingle();
    var nowIso = new Date().toISOString();
    setNotifications(function (ns) {
      return ns.map(function (x) {
        return x.id === n.id ? Object.assign({}, x, { resolved_at: nowIso }) : x;
      });
    });
    setShowNotifications(false);
    if (mr.data && onMatchTagAccepted) onMatchTagAccepted(mr.data);
    return { error: null };
  }

  async function declineMatchTag(n) {
    if (!updateMatchTagStatus) return;
    await updateMatchTagStatus(n.match_id, "declined", false);
    // Decline transitions the match away from pending_confirmation;
    // the cleanup trigger will resolve the notification. Patch local
    // state immediately for snappy UX.
    var nowIso = new Date().toISOString();
    setNotifications(function (ns) {
      return ns.map(function (x) {
        return x.id === n.id ? Object.assign({}, x, { resolved_at: nowIso }) : x;
      });
    });
  }

  function resetNotifications() {
    setNotifications([]);
    setShowNotifications(false);
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
