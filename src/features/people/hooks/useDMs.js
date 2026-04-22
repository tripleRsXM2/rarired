// src/features/people/hooks/useDMs.js
//
// Owns: conversation + request lists, thread state, realtime subscriptions,
// read receipts, reactions, edit/delete, draft state.
//
// Changes vs pre-hardening:
// • Multi-tab: realtime INSERT handler no longer drops rows where
//   `sender_id === me`. Instead we dedupe by id so a message I sent from
//   another tab still appears here.
// • Chat switching: `openConversation` / `openOrStartConversation` /
//   `closeConversation` now clear `replyTo` and `editingId` so state from
//   the previous chat cannot leak into the new one.
// • Reactions realtime: subscription scoped per-conversation and gated by
//   a ref-tracked message id set so edits/deletes don't cause stale closures.
// • Optimistic reactions: local `reactions[messageId]` is updated on add,
//   rolled back on RPC error. Symmetric for remove.

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase.js";
import * as D from "../services/dmService.js";
import { fetchProfilesByIds } from "../services/socialService.js";
import { insertNotification, upsertMessageNotification } from "../../notifications/services/notificationService.js";
import { appendMessageIfNew, patchMessageById, validateDraft, previewify } from "../utils/messaging.js";

var PARTNER_FIELDS = "id,name,avatar,avatar_url,skill,suburb,home_zone,last_active,show_online_status,show_last_seen";

export function useDMs(opts) {
  var authUser = (opts && opts.authUser) || null;
  var friends = (opts && opts.friends) || [];

  var [conversations, setConversations] = useState([]);  // accepted + pending-outgoing
  var [requests, setRequests] = useState([]);             // pending incoming
  var [activeConv, setActiveConv] = useState(null);
  var [threadMessages, setThreadMessages] = useState([]);
  var [reactions, setReactions] = useState({});          // {messageId: [{id,emoji,user_id}]}
  var [threadLoading, setThreadLoading] = useState(false);
  var [msgDraft, setMsgDraft] = useState("");
  var [sending, setSending] = useState(false);
  var [replyTo, setReplyTo] = useState(null);
  var [editingId, setEditingId] = useState(null);
  var [editDraft, setEditDraft] = useState("");
  var [partnerLastReadAt, setPartnerLastReadAt] = useState(null);

  var activeConvRef = useRef(null);
  // Keep a ref of the current thread's message ids so the reactions realtime
  // subscription can filter out events for messages not currently loaded
  // without recreating the subscription on every thread change.
  var threadIdsRef = useRef({});
  useEffect(function () {
    var map = {};
    (threadMessages || []).forEach(function (m) { map[m.id] = true; });
    threadIdsRef.current = map;
  }, [threadMessages]);

  // Friendship override — friends bypass the DM request gate.
  var friendIdsRef = useRef([]);
  friendIdsRef.current = friends.map(function (f) { return f.id; });
  function isFriendId(uid) { return friendIdsRef.current.indexOf(uid) >= 0; }

  // ── Load ────────────────────────────────────────────────────────────────

  async function loadConversations() {
    if (!authUser) return;
    var uid = authUser.id;
    var r = await D.fetchConversations(uid);
    var all = r.data || [];

    var fIds = friendIdsRef.current;
    if (fIds.length) {
      var toUpgrade = all.filter(function (c) {
        if (c.status !== "pending") return false;
        var pid = c.user1_id === uid ? c.user2_id : c.user1_id;
        return fIds.indexOf(pid) >= 0;
      });
      if (toUpgrade.length) {
        await Promise.all(toUpgrade.map(function (c) {
          return D.updateConversationStatus(c.id, "accepted");
        }));
        var upgraded = {};
        toUpgrade.forEach(function (c) { upgraded[c.id] = true; });
        all = all.map(function (c) { return upgraded[c.id] ? Object.assign({}, c, { status: "accepted" }) : c; });
      }
    }

    var accepted = all.filter(function (c) { return c.status === "accepted"; });
    var pendingOut = all.filter(function (c) { return c.status === "pending" && c.requester_id === uid; });
    var pendingIn = all.filter(function (c) { return c.status === "pending" && c.requester_id !== uid; });

    var partnerIds = [...new Set(all.map(function (c) { return c.user1_id === uid ? c.user2_id : c.user1_id; }))];
    var partnerMap = {};
    if (partnerIds.length) {
      var pr = await fetchProfilesByIds(partnerIds, PARTNER_FIELDS);
      (pr.data || []).forEach(function (p) { partnerMap[p.id] = p; });
    }

    var convIds = accepted.map(function (c) { return c.id; });
    var readMap = {};
    if (convIds.length) {
      var rr = await D.fetchReads(uid, convIds);
      (rr.data || []).forEach(function (row) { readMap[row.conversation_id] = row.last_read_at; });
    }

    function enrich(c) {
      var pid = c.user1_id === uid ? c.user2_id : c.user1_id;
      var partner = partnerMap[pid] || { id: pid, name: "Player", avatar: "PL" };
      var lastRead = readMap[c.id];
      var hasUnread = c.status === "accepted" && c.last_message_sender_id !== uid &&
        (!lastRead || new Date(c.last_message_at) > new Date(lastRead));
      return Object.assign({}, c, { partner: partner, hasUnread: hasUnread, lastReadAt: lastRead });
    }

    setConversations(accepted.concat(pendingOut).map(enrich));
    setRequests(pendingIn.map(enrich));
  }

  // ── Open / switch / close — always scrub transient chat state ──────────

  function _scrubTransient() {
    setReplyTo(null);
    setEditingId(null);
    setEditDraft("");
    setMsgDraft("");
    setPartnerLastReadAt(null);
  }

  async function _loadThread(conv) {
    setThreadLoading(true);
    setThreadMessages([]);
    setReactions({});
    var r = await D.fetchThread(conv.id);
    var msgs = r.data || [];
    setThreadMessages(msgs);
    if (msgs.length) {
      var rr = await D.fetchReactions(msgs.map(function (m) { return m.id; }));
      var rMap = {};
      (rr.data || []).forEach(function (rx) {
        if (!rMap[rx.message_id]) rMap[rx.message_id] = [];
        rMap[rx.message_id].push(rx);
      });
      setReactions(rMap);
    }
    setThreadLoading(false);
  }

  async function openConversation(conv) {
    if (!authUser) return;
    var uid = authUser.id;
    _scrubTransient();
    setActiveConv(conv);
    activeConvRef.current = conv;
    await _loadThread(conv);
    if (conv.status === "accepted") {
      D.upsertRead(uid, conv.id);
      D.updatePresence(uid);
      setConversations(function (cs) {
        return cs.map(function (c) {
          return c.id === conv.id ? Object.assign({}, c, { hasUnread: false, lastReadAt: new Date().toISOString() }) : c;
        });
      });
      var partnerId = (conv.partner && conv.partner.id) ||
        (conv.user1_id === uid ? conv.user2_id : conv.user1_id);
      if (partnerId) {
        D.fetchPartnerRead(partnerId, conv.id).then(function (pr) {
          if (pr && pr.data) setPartnerLastReadAt(pr.data.last_read_at);
        });
      }
    }
  }

  async function openOrStartConversation(partner) {
    if (!authUser) return;
    var uid = authUser.id;

    var r = await D.getOrCreateConversation(partner.id);
    if (r.error || !r.data) {
      console.error("[useDMs] getOrCreateConversation failed:", r.error);
      return;
    }
    var row = r.data;

    if (row.status === "pending" && isFriendId(partner.id)) {
      var ur = await D.updateConversationStatus(row.id, "accepted");
      row = (ur && ur.data) ? ur.data : Object.assign({}, row, { status: "accepted" });
    }

    if (row.status === "declined") {
      if (row.request_cooldown_until && new Date(row.request_cooldown_until) > new Date()) {
        // Caller is expected to toast; log and bail.
        console.warn("[useDMs] cooldown active for", partner.id);
        return;
      }
      await D.updateConversationStatus(row.id, "pending");
      row = Object.assign({}, row, { status: "pending", requester_id: uid });
    }

    var conv = Object.assign({}, row, { partner: partner, hasUnread: false });
    _scrubTransient();
    setActiveConv(conv);
    activeConvRef.current = conv;

    var isNewPending = row.requester_id === uid && row.status === "pending" && !row.last_message_at;

    if (isNewPending) {
      setThreadMessages([]);
      setConversations(function (cs) {
        if (cs.some(function (c) { return c.id === conv.id; })) return cs;
        return cs.concat([conv]);
      });
      insertNotification({ user_id: partner.id, type: "message_request", from_user_id: uid, entity_id: conv.id });
    } else {
      await _loadThread(conv);
      if (row.status === "accepted") {
        D.upsertRead(uid, row.id);
        setRequests(function (rs) { return rs.filter(function (x) { return x.id !== conv.id; }); });
        setConversations(function (cs) {
          if (cs.some(function (c) { return c.id === conv.id; })) {
            return cs.map(function (c) { return c.id === conv.id ? Object.assign({}, c, { hasUnread: false, status: "accepted" }) : c; });
          }
          return [conv].concat(cs);
        });
      }
    }
  }

  function closeConversation() {
    _scrubTransient();
    setActiveConv(null);
    activeConvRef.current = null;
    setThreadMessages([]);
    setReactions({});
  }

  // ── Send ────────────────────────────────────────────────────────────────

  async function sendMessage(content) {
    if (!activeConv || !authUser || sending) return;
    var v = validateDraft(content);
    if (!v.ok) return;
    var uid = authUser.id;
    var conv = activeConvRef.current;
    var replySnapshot = replyTo;
    setSending(true);
    setMsgDraft("");
    var r = await D.sendMessage(conv.id, uid, v.value, replySnapshot ? replySnapshot.id : null);
    if (!r.error && r.data) {
      var msg = r.data;
      setThreadMessages(function (ms) { return appendMessageIfNew(ms, msg); });
      var preview = previewify(v.value, 80);
      D.updateConversationLastMessage(conv.id, preview, uid);
      var partnerId = conv.user1_id === uid ? conv.user2_id : conv.user1_id;
      if (conv.status === "accepted" && partnerId) {
        upsertMessageNotification({
          user_id: partnerId,
          type: "message",
          from_user_id: uid,
          entity_id: conv.id,
          metadata: { preview: previewify(v.value, 60) },
        }).catch(function (e) { console.error("[sendMessage] notification threw:", e); });
      }
      setConversations(function (cs) {
        var updated = Object.assign({}, conv, {
          last_message_preview: preview,
          last_message_at: msg.created_at,
          last_message_sender_id: uid,
          hasUnread: false,
        });
        if (cs.some(function (c) { return c.id === conv.id; }))
          return cs.map(function (c) { return c.id === conv.id ? updated : c; });
        return cs.concat([updated]);
      });
      // Clear reply only on success. Failure path keeps it so the user can retry.
      setReplyTo(null);
    } else {
      // Restore the draft + reply context so the user can retry.
      setMsgDraft(v.value);
      if (replySnapshot) setReplyTo(replySnapshot);
    }
    setSending(false);
    return r;
  }

  // ── Requests ────────────────────────────────────────────────────────────

  async function acceptRequest(convId) {
    if (!authUser) return;
    var uid = authUser.id;
    var r = await D.updateConversationStatus(convId, "accepted");
    if (!r.error && r.data) {
      var req = requests.find(function (c) { return c.id === convId; });
      if (req) {
        var enriched = Object.assign({}, r.data, { partner: req.partner, hasUnread: true });
        setConversations(function (cs) { return [enriched].concat(cs); });
        setRequests(function (rs) { return rs.filter(function (c) { return c.id !== convId; }); });
        insertNotification({ user_id: req.partner.id, type: "message_request_accepted", from_user_id: uid });
        if (activeConvRef.current && activeConvRef.current.id === convId) {
          setActiveConv(function (ac) { return Object.assign({}, ac, { status: "accepted" }); });
          activeConvRef.current = Object.assign({}, activeConvRef.current, { status: "accepted" });
        }
      }
    }
  }

  async function declineRequest(convId) {
    var cooldown = new Date();
    cooldown.setDate(cooldown.getDate() + 7);
    await D.declineConversation(convId, cooldown.toISOString());
    setRequests(function (rs) { return rs.filter(function (c) { return c.id !== convId; }); });
    if (activeConvRef.current && activeConvRef.current.id === convId) closeConversation();
  }

  // ── Reactions (optimistic) ──────────────────────────────────────────────

  async function toggleReaction(messageId, emoji) {
    if (!authUser) return;
    var uid = authUser.id;
    var existing = (reactions[messageId] || []).find(function (r) {
      return r.user_id === uid && r.emoji === emoji;
    });
    if (existing) {
      // Optimistic remove.
      setReactions(function (rs) {
        return Object.assign({}, rs, {
          [messageId]: (rs[messageId] || []).filter(function (r) { return !(r.user_id === uid && r.emoji === emoji); }),
        });
      });
      var rr = await D.removeReaction(messageId, uid, emoji);
      if (rr.error) {
        // Rollback.
        setReactions(function (rs) {
          var cur = rs[messageId] || [];
          if (cur.some(function (r) { return r.id === existing.id; })) return rs;
          return Object.assign({}, rs, { [messageId]: cur.concat([existing]) });
        });
      }
    } else {
      // Optimistic add with a temp id; the realtime INSERT will replace it
      // with the real row, but we dedupe by real id so there's no flicker.
      var optimisticId = "opt:" + uid + ":" + emoji + ":" + messageId;
      var optimistic = { id: optimisticId, message_id: messageId, user_id: uid, emoji: emoji, _optimistic: true };
      setReactions(function (rs) {
        return Object.assign({}, rs, { [messageId]: (rs[messageId] || []).concat([optimistic]) });
      });
      var r = await D.addReaction(messageId, uid, emoji);
      if (r.error) {
        setReactions(function (rs) {
          return Object.assign({}, rs, {
            [messageId]: (rs[messageId] || []).filter(function (x) { return x.id !== optimisticId; }),
          });
        });
      } else if (r.data) {
        setReactions(function (rs) {
          var cur = (rs[messageId] || []).filter(function (x) { return x.id !== optimisticId; });
          if (cur.some(function (x) { return x.id === r.data.id; })) return Object.assign({}, rs, { [messageId]: cur });
          return Object.assign({}, rs, { [messageId]: cur.concat([r.data]) });
        });
      }
    }
  }

  // ── Edit / Delete ───────────────────────────────────────────────────────

  function startEdit(msg) { setEditingId(msg.id); setEditDraft(msg.content); }
  function cancelEdit() { setEditingId(null); setEditDraft(""); }

  async function submitEdit(messageId) {
    var v = validateDraft(editDraft);
    if (!v.ok) return;
    var r = await D.editMessage(messageId, v.value);
    if (!r.error && r.data) {
      setThreadMessages(function (ms) { return patchMessageById(ms, r.data); });
    }
    setEditingId(null); setEditDraft("");
  }

  async function deleteMessage(messageId) {
    var snapshot = threadMessages.find(function (m) { return m.id === messageId; });
    // Optimistic: mark deleted locally with our clock; realtime UPDATE
    // will reconcile with the server's timestamp.
    setThreadMessages(function (ms) {
      return patchMessageById(ms, { id: messageId, deleted_at: new Date().toISOString() });
    });
    var r = await D.softDeleteMessage(messageId);
    if (r && r.error && snapshot) {
      // Roll back.
      setThreadMessages(function (ms) {
        return patchMessageById(ms, { id: messageId, deleted_at: snapshot.deleted_at || null });
      });
    }
  }

  // ── Settings ────────────────────────────────────────────────────────────

  async function deleteConversation(convId) {
    // Confirmation handled by the caller (in-app modal). No native confirm.
    await D.deleteConversation(convId);
    setConversations(function (cs) { return cs.filter(function (c) { return c.id !== convId; }); });
    closeConversation();
  }

  // ── Realtime: conversations (incoming) ──────────────────────────────────

  useEffect(function () {
    if (!authUser) return;
    var uid = authUser.id;

    async function handleInsert(payload) {
      var conv = payload.new;
      if (conv.requester_id === uid) return;
      if (conv.user1_id !== uid && conv.user2_id !== uid) return;
      var partnerId = conv.user1_id === uid ? conv.user2_id : conv.user1_id;
      var pr = await fetchProfilesByIds([partnerId], PARTNER_FIELDS);
      var partner = (pr.data && pr.data[0]) || { id: partnerId, name: "Player", avatar: "PL" };

      if (conv.status === "pending" && isFriendId(partnerId)) {
        await D.updateConversationStatus(conv.id, "accepted");
        var acceptedConv = Object.assign({}, conv, { status: "accepted", partner: partner, hasUnread: !!conv.last_message_at });
        setConversations(function (cs) {
          if (cs.some(function (c) { return c.id === conv.id; })) return cs;
          return [acceptedConv].concat(cs);
        });
        return;
      }

      var enriched = Object.assign({}, conv, { partner: partner });
      setRequests(function (rs) {
        if (rs.some(function (r) { return r.id === conv.id; })) return rs;
        return [enriched].concat(rs);
      });
    }

    var convChannel = supabase.channel("convs:" + uid)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations", filter: "user1_id=eq." + uid }, handleInsert)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations", filter: "user2_id=eq." + uid }, handleInsert)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" },
        function (payload) {
          var conv = payload.new;
          if (conv.user1_id !== uid && conv.user2_id !== uid) return;
          if (conv.status === "accepted") {
            setRequests(function (rs) { return rs.filter(function (r) { return r.id !== conv.id; }); });
            if (activeConvRef.current && activeConvRef.current.id === conv.id) {
              setActiveConv(function (ac) { return Object.assign({}, ac, { status: "accepted" }); });
              activeConvRef.current = Object.assign({}, activeConvRef.current, { status: "accepted" });
            }
          }
          setConversations(function (cs) {
            return cs.map(function (c) {
              if (c.id !== conv.id) return c;
              var hasUnread = conv.status === "accepted" && conv.last_message_sender_id !== uid &&
                (!c.lastReadAt || new Date(conv.last_message_at) > new Date(c.lastReadAt));
              return Object.assign({}, c, {
                last_message_preview: conv.last_message_preview,
                last_message_at: conv.last_message_at,
                last_message_sender_id: conv.last_message_sender_id,
                status: conv.status,
                hasUnread: hasUnread,
              });
            });
          });
        }
      )
      .subscribe();

    return function () { supabase.removeChannel(convChannel); };
  }, [authUser && authUser.id]);

  // ── Realtime: messages in active conversation ──────────────────────────

  useEffect(function () {
    if (!authUser || !activeConv) return;
    var uid = authUser.id;
    var convId = activeConv.id;

    var msgChannel = supabase.channel("msgs:" + convId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: "conversation_id=eq." + convId },
        function (payload) {
          var msg = payload.new;
          // No longer skip own messages — dedupe by id so multi-tab sync works.
          setThreadMessages(function (ms) { return appendMessageIfNew(ms, msg); });
          if (msg.sender_id !== uid) {
            D.upsertRead(uid, convId);
            setConversations(function (cs) {
              return cs.map(function (c) { return c.id === convId ? Object.assign({}, c, { hasUnread: false }) : c; });
            });
          }
        }
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages", filter: "conversation_id=eq." + convId },
        function (payload) {
          var msg = payload.new;
          setThreadMessages(function (ms) { return patchMessageById(ms, msg); });
        }
      )
      .subscribe();

    return function () { supabase.removeChannel(msgChannel); };
  }, [authUser && authUser.id, activeConv && activeConv.id]);

  // ── Realtime: partner's read receipts ───────────────────────────────────

  useEffect(function () {
    if (!authUser || !activeConv || activeConv.status !== "accepted") return;
    var uid = authUser.id;
    var convId = activeConv.id;
    var partnerId = (activeConv.partner && activeConv.partner.id) ||
      (activeConv.user1_id === uid ? activeConv.user2_id : activeConv.user1_id);
    if (!partnerId) return;

    function handlePartnerRead(payload) {
      var row = payload.new;
      if (!row || row.user_id !== partnerId) return;
      if (row.last_read_at) setPartnerLastReadAt(row.last_read_at);
    }

    var readsChannel = supabase.channel("reads:" + convId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads", filter: "conversation_id=eq." + convId }, handlePartnerRead)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "message_reads", filter: "conversation_id=eq." + convId }, handlePartnerRead)
      .subscribe();

    return function () { supabase.removeChannel(readsChannel); };
  }, [authUser && authUser.id, activeConv && activeConv.id]);

  // ── Realtime: reactions for messages in the active conversation ────────

  useEffect(function () {
    if (!authUser || !activeConv) return;

    var rxChannel = supabase.channel("rx:" + activeConv.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" },
        function (payload) {
          var rx = payload.new;
          if (!threadIdsRef.current[rx.message_id]) return;
          setReactions(function (rs) {
            var cur = rs[rx.message_id] || [];
            // Drop optimistic placeholders for (user, emoji) — real row supersedes.
            var filtered = cur.filter(function (r) {
              if (r.id === rx.id) return false;
              if (r._optimistic && r.user_id === rx.user_id && r.emoji === rx.emoji) return false;
              return true;
            });
            return Object.assign({}, rs, { [rx.message_id]: filtered.concat([rx]) });
          });
        }
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" },
        function (payload) {
          var rx = payload.old;
          if (!rx || !threadIdsRef.current[rx.message_id]) return;
          setReactions(function (rs) {
            return Object.assign({}, rs, {
              [rx.message_id]: (rs[rx.message_id] || []).filter(function (r) { return r.id !== rx.id; }),
            });
          });
        }
      )
      .subscribe();

    return function () { supabase.removeChannel(rxChannel); };
  }, [authUser && authUser.id, activeConv && activeConv.id]);

  function resetDMs() {
    setConversations([]); setRequests([]); setActiveConv(null);
    setThreadMessages([]); setReactions({}); setMsgDraft("");
    setReplyTo(null); setEditingId(null);
    setPartnerLastReadAt(null);
    activeConvRef.current = null;
  }

  function totalUnread() {
    return conversations.reduce(function (s, c) { return s + (c.hasUnread ? 1 : 0); }, 0) + requests.length;
  }

  return {
    conversations: conversations, requests: requests, activeConv: activeConv,
    threadMessages: threadMessages, reactions: reactions,
    threadLoading: threadLoading, msgDraft: msgDraft, setMsgDraft: setMsgDraft, sending: sending,
    replyTo: replyTo, setReplyTo: setReplyTo, clearReplyTo: function () { setReplyTo(null); },
    editingId: editingId, editDraft: editDraft, setEditDraft: setEditDraft,
    partnerLastReadAt: partnerLastReadAt,
    loadConversations: loadConversations, openConversation: openConversation,
    openOrStartConversation: openOrStartConversation, closeConversation: closeConversation,
    sendMessage: sendMessage, acceptRequest: acceptRequest, declineRequest: declineRequest,
    toggleReaction: toggleReaction, startEdit: startEdit, cancelEdit: cancelEdit,
    submitEdit: submitEdit, deleteMessage: deleteMessage,
    deleteConversation: deleteConversation, resetDMs: resetDMs, totalUnread: totalUnread,
  };
}
