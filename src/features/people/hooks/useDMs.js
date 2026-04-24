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
  // `false` until the first loadConversations() resolves. The UI distinguishes
  // "still fetching" from "fetched and empty" using this — otherwise a
  // freshly-mounted Messages view briefly shows "No messages yet" before the
  // real list renders, which the user reported as "sometimes messages don't
  // show" on mobile.
  var [conversationsLoaded, setConversationsLoaded] = useState(false);
  var [activeConv, setActiveConv] = useState(null);
  var [threadMessages, setThreadMessages] = useState([]);
  var [reactions, setReactions] = useState({});          // {messageId: [{id,emoji,user_id}]}
  var [threadLoading, setThreadLoading] = useState(false);
  var [msgDraft, setMsgDraft] = useState("");
  // Phase 1b: optional "proposed slot" block above the composer. Shape
  // { venue, date (YYYY-MM-DD), time (HH:MM) } or null. Populated by
  // openConversationWith(partner, { slot }) when a user taps a court
  // or player row from the map; user can edit or clear before send.
  // Survives inside a single active conversation; cleared on convo
  // switch and on successful send.
  var [proposedSlot, setProposedSlot] = useState(null);
  var [sending, setSending] = useState(false);
  var [replyTo, setReplyTo] = useState(null);
  var [editingId, setEditingId] = useState(null);
  var [editDraft, setEditDraft] = useState("");
  var [partnerLastReadAt, setPartnerLastReadAt] = useState(null);
  // Ordered list of pinned conversation ids, newest-pin-first. Stored as
  // an array rather than a Set so renders are stable and order is honored.
  var [pinnedConvIds, setPinnedConvIds] = useState([]);
  // Unordered set of muted conversation ids for the current user. Muting
  // is self-only — it suppresses the conv from contributing to the
  // People-tab unread badge. The other party sees no indication.
  var [mutedConvIds, setMutedConvIds] = useState([]);
  // Typing state: Map of convId → last typing-event timestamp (ms). Set
  // via a broadcast from the sender; expired entries are swept every 1.5s.
  // Shown as "typing…" in the conv list row + under the thread header.
  var [typingConvs, setTypingConvs] = useState({});
  // Cache of long-lived channels we've subscribed to purely to SEND
  // typing events on (keyed by the partner's uid). Kept alive for the
  // session so we don't pay a subscribe round-trip on every keystroke.
  var typingSendersRef = useRef({});

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

  // When the friends list first populates (loadSocial runs in parallel with
  // loadConversations during bootstrap, so friends is usually empty at the
  // moment loadConversations resolves), any pending-INCOMING conversation
  // from a friend is stuck in `requests` and invisible from the main list.
  // Re-scan whenever friends grows: move friend-incoming pendings into the
  // accepted list, both locally and in the DB.
  useEffect(function () {
    if (!authUser || !friends.length || !requests.length) return;
    var fIds = friends.map(function (f) { return f.id; });
    var hits = requests.filter(function (r) {
      return fIds.indexOf(r.partner && r.partner.id) >= 0;
    });
    if (!hits.length) return;
    // Optimistic local upgrade first so the UI updates immediately.
    setConversations(function (cs) {
      var existing = {};
      cs.forEach(function (c) { existing[c.id] = true; });
      var upgraded = hits
        .filter(function (h) { return !existing[h.id]; })
        .map(function (h) { return Object.assign({}, h, { status: "accepted", hasUnread: !!h.last_message_at }); });
      return upgraded.length ? upgraded.concat(cs) : cs;
    });
    setRequests(function (rs) {
      var ids = {};
      hits.forEach(function (h) { ids[h.id] = true; });
      return rs.filter(function (r) { return !ids[r.id]; });
    });
    // Persist to DB (fire-and-forget, idempotent).
    hits.forEach(function (h) { D.updateConversationStatus(h.id, "accepted"); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends.length, requests.length, authUser && authUser.id]);

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
    var convIds = accepted.map(function (c) { return c.id; });

    // Fire the three supplemental fetches (profiles, my reads, partner
    // reads) in parallel instead of serially. Mobile was waiting on
    // three sequential round-trips before painting the list, which felt
    // slow even on a good connection.
    var empty = { data: [] };
    var parallel = await Promise.all([
      partnerIds.length ? fetchProfilesByIds(partnerIds, PARTNER_FIELDS) : Promise.resolve(empty),
      convIds.length    ? D.fetchReads(uid, convIds)                    : Promise.resolve(empty),
      convIds.length    ? D.fetchPartnerReadsForConvs(uid, convIds)      : Promise.resolve(empty),
    ]);

    var partnerMap = {};
    (parallel[0].data || []).forEach(function (p) { partnerMap[p.id] = p; });

    var readMap = {};
    (parallel[1].data || []).forEach(function (row) { readMap[row.conversation_id] = row.last_read_at; });

    // convId → partner's last_read_at (for list "✓ Seen" indicator).
    var partnerReadMap = {};
    (parallel[2].data || []).forEach(function (row) {
      partnerReadMap[row.conversation_id] = row.last_read_at;
    });

    // Pins + mutes — fire-and-forget so the list paints fast; result
    // populates state when it lands and re-renders pick up the state.
    D.fetchPinnedConversationIds(uid).then(function (pr) {
      if (pr && pr.data) setPinnedConvIds(pr.data.map(function (p) { return p.conversation_id; }));
    });
    D.fetchMutedConversationIds(uid).then(function (mr) {
      if (mr && mr.data) setMutedConvIds(mr.data.map(function (m) { return m.conversation_id; }));
    });

    function enrich(c) {
      var pid = c.user1_id === uid ? c.user2_id : c.user1_id;
      var partner = partnerMap[pid] || { id: pid, name: "Player", avatar: "PL" };
      var lastRead = readMap[c.id];
      var partnerRead = partnerReadMap[c.id];
      var hasUnread = c.status === "accepted" && c.last_message_sender_id !== uid &&
        (!lastRead || new Date(c.last_message_at) > new Date(lastRead));
      // "Seen" indicator in the list: my last message is shown as seen
      // when I sent it AND the partner's last_read_at is >= the message's
      // timestamp. Otherwise we show "sent" (single check).
      var lastMsgSeenByPartner = c.last_message_sender_id === uid &&
        partnerRead && c.last_message_at &&
        new Date(partnerRead) >= new Date(c.last_message_at);
      return Object.assign({}, c, {
        partner: partner,
        hasUnread: hasUnread,
        lastReadAt: lastRead,
        partnerLastReadAt: partnerRead || null,
        lastMsgSeenByPartner: !!lastMsgSeenByPartner,
      });
    }

    setConversations(accepted.concat(pendingOut).map(enrich));
    setRequests(pendingIn.map(enrich));
    setConversationsLoaded(true);
  }

  // ── Pin / unpin actions ────────────────────────────────────────────────

  async function pinConversation(convId) {
    if (!authUser) return { error: "Not signed in" };
    var prev = pinnedConvIds;
    if (prev.indexOf(convId) >= 0) return { error: null };
    // Optimistic: newest-first ordering matches fetchPinnedConversationIds.
    setPinnedConvIds([convId].concat(prev));
    var r = await D.pinConversationRow(authUser.id, convId);
    if (r.error) {
      setPinnedConvIds(prev);
      return { error: (r.error && r.error.message) || "Couldn't pin that conversation" };
    }
    return { error: null };
  }

  async function unpinConversation(convId) {
    if (!authUser) return { error: "Not signed in" };
    var prev = pinnedConvIds;
    if (prev.indexOf(convId) < 0) return { error: null };
    setPinnedConvIds(prev.filter(function (id) { return id !== convId; }));
    var r = await D.unpinConversationRow(authUser.id, convId);
    if (r.error) {
      setPinnedConvIds(prev);
      return { error: (r.error && r.error.message) || "Couldn't unpin that conversation" };
    }
    return { error: null };
  }

  // ── Mute / unmute actions (self-only) ──────────────────────────────────

  async function muteConversation(convId) {
    if (!authUser) return { error: "Not signed in" };
    var prev = mutedConvIds;
    if (prev.indexOf(convId) >= 0) return { error: null };
    setMutedConvIds(prev.concat([convId]));
    var r = await D.muteConversationRow(authUser.id, convId);
    if (r.error) {
      setMutedConvIds(prev);
      return { error: (r.error && r.error.message) || "Couldn't mute that conversation" };
    }
    return { error: null };
  }

  async function unmuteConversation(convId) {
    if (!authUser) return { error: "Not signed in" };
    var prev = mutedConvIds;
    if (prev.indexOf(convId) < 0) return { error: null };
    setMutedConvIds(prev.filter(function (id) { return id !== convId; }));
    var r = await D.unmuteConversationRow(authUser.id, convId);
    if (r.error) {
      setMutedConvIds(prev);
      return { error: (r.error && r.error.message) || "Couldn't unmute that conversation" };
    }
    return { error: null };
  }

  // ── Open / switch / close — always scrub transient chat state ──────────

  function _scrubTransient() {
    setReplyTo(null);
    setEditingId(null);
    setEditDraft("");
    setMsgDraft("");
    setProposedSlot(null);
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

  // Returns { error: null | string } so callers can surface a toast without
  // reaching into Supabase. Error strings are user-facing; keep them short.
  async function openOrStartConversation(partner) {
    if (!authUser) return { error: "Not signed in" };
    var uid = authUser.id;

    // If the conversation already exists (in local state), just open it.
    var existing = [].concat(conversations, requests).find(function (c) {
      return c.partner && c.partner.id === partner.id;
    });
    if (existing) {
      await openConversation(existing);
      return { error: null };
    }

    // Otherwise — DRAFT mode. Don't touch the DB. The conversation is
    // local-only until the first message is sent; the partner sees
    // nothing (no row, no notification). We materialize the row inside
    // sendMessage() once the user actually commits something.
    //
    // Still enforce the decline cooldown client-side as a quick check;
    // the real enforcement is RLS / RPC when we go to create.
    var draft = {
      id: "draft:" + partner.id,
      isDraft: true,
      partner: partner,
      status: "draft",
      user1_id: uid,
      user2_id: partner.id,
      requester_id: uid,
      last_message_at: null,
      last_message_preview: null,
      last_message_sender_id: null,
      hasUnread: false,
      lastReadAt: null,
    };
    _scrubTransient();
    setThreadMessages([]);
    setActiveConv(draft);
    activeConvRef.current = draft;
    // Deliberately not added to conversations or requests — draft is
    // invisible in the list until send.
    return { error: null };
  }

  function closeConversation() {
    _scrubTransient();
    setActiveConv(null);
    activeConvRef.current = null;
    setThreadMessages([]);
    setReactions({});
  }

  // Phase 1b entry point for the map-centric matchmaking flow. Opens
  // (or starts as a draft) a conversation with `partner` and primes the
  // composer with an optional proposed slot + a template-interpolated
  // message. Callers just hand us the partner object and the slot —
  // the composer UI does the rest (user can edit, swap template, or
  // clear the slot before send).
  //
  // Params:
  //   partner: { id, name, avatar_url?, ... } — same shape openOrStartConversation already expects
  //   opts.slot: { venue, date, time } | null
  //   opts.templateId: one of DM_TEMPLATES[].id (default "casual")
  //   opts.draft: raw string override (wins over template)
  //
  // Behaviour:
  //   - If conversation already exists OR is a draft, opens it.
  //   - Proposed slot + interpolated draft are written AFTER _scrubTransient
  //     (openOrStartConversation calls scrub internally) so they stick.
  //   - Async — returns { error: null | string } from openOrStartConversation.
  async function openConversationWith(partner, opts) {
    if (!partner || !partner.id) return { error: "no_partner" };
    var o = opts || {};
    var r = await openOrStartConversation(partner);
    if (r && r.error) return r;
    if (o.slot) setProposedSlot(o.slot);
    if (o.draft != null) {
      setMsgDraft(o.draft);
    }
    return { error: null };
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
    // Clear the proposed-slot block too — once the message is sent the
    // slot lives in the message body itself via the template interpolation.
    setProposedSlot(null);

    // Draft materialization: if this is the user's first message to
    // someone, the conversation hasn't been created yet (see
    // openOrStartConversation — draft mode avoids writing a DB row
    // until the user actually commits something). Create it now.
    var isDraftFirstSend = conv && conv.isDraft;
    if (isDraftFirstSend) {
      var partnerProfile = conv.partner;
      var gc = await D.getOrCreateConversation(partnerProfile.id);
      if (gc.error || !gc.data) {
        setSending(false);
        setMsgDraft(v.value);
        if (replySnapshot) setReplyTo(replySnapshot);
        return { error: (gc.error && gc.error.message) || "Couldn't start that conversation." };
      }
      var row = gc.data;
      if (row.status === "pending" && isFriendId(partnerProfile.id)) {
        var ur = await D.updateConversationStatus(row.id, "accepted");
        row = (ur && ur.data) ? ur.data : Object.assign({}, row, { status: "accepted" });
      }
      if (row.status === "declined") {
        if (row.request_cooldown_until && new Date(row.request_cooldown_until) > new Date()) {
          var until = new Date(row.request_cooldown_until);
          var days = Math.max(1, Math.ceil((until - new Date()) / (24 * 3600 * 1000)));
          setSending(false);
          setMsgDraft(v.value);
          if (replySnapshot) setReplyTo(replySnapshot);
          return { error: "You can't message " + (partnerProfile.name || "this player") + " right now. Try again in " + days + " day" + (days === 1 ? "" : "s") + "." };
        }
        await D.updateConversationStatus(row.id, "pending");
        row = Object.assign({}, row, { status: "pending", requester_id: uid });
      }
      conv = Object.assign({}, row, { partner: partnerProfile, hasUnread: false });
      activeConvRef.current = conv;
      setActiveConv(conv);
      // First-time DMs from a non-friend generate a message_request
      // notification for the recipient. Friends-bypass: status=accepted,
      // no notification (the upcoming upsert_message_notification RPC
      // below collapses into the single-per-conv unread row for them).
      if (row.status === "pending") {
        insertNotification({ user_id: partnerProfile.id, type: "message_request", from_user_id: uid, entity_id: conv.id });
      }
    }

    var r = await D.sendMessage(conv.id, uid, v.value, replySnapshot ? replySnapshot.id : null);
    if (!r.error && r.data) {
      var msg = r.data;
      setThreadMessages(function (ms) { return appendMessageIfNew(ms, msg); });
      var preview = previewify(v.value, 80);
      D.updateConversationLastMessage(conv.id, preview, uid);
      // Regular DMs no longer emit a notification row — unread DMs are
      // surfaced by the People tab badge instead, driven directly off
      // conversations.hasUnread. message_request (first DM from a
      // non-friend) still fires above because it requires an explicit
      // accept/decline decision in the notification tray.
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

      // Race: the DB emits three events in order when a draft materializes
      // with its first DM:
      //   (1) INSERT conversations  (preview = null)
      //   (2) INSERT direct_messages
      //   (3) UPDATE conversations  (preview populated by trigger)
      // The UPDATE realtime can arrive WHILE the INSERT handler is
      // awaiting fetchProfilesByIds above — at that moment the
      // conversations / requests state hasn't been populated yet, so the
      // UPDATE's state.map is a no-op. When we then add the row below
      // with payload.new we'd end up with an empty preview forever
      // (until the next message).
      //
      // Fix: re-fetch the conversation row from the DB here so we pick
      // up whatever the trigger has already written, regardless of event
      // ordering.
      var fresh = await supabase.from("conversations").select("*")
        .eq("id", conv.id).maybeSingle();
      if (fresh && fresh.data) conv = fresh.data;

      if (conv.status === "pending" && isFriendId(partnerId)) {
        await D.updateConversationStatus(conv.id, "accepted");
        var acceptedConv = Object.assign({}, conv, {
          status: "accepted", partner: partner,
          hasUnread: conv.last_message_sender_id && conv.last_message_sender_id !== uid,
        });
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

    // Live-remove a conversation the moment the OTHER side deletes it.
    // conversations is REPLICA IDENTITY FULL (see 20260423_conversations_replica_full.sql)
    // so payload.old has user1_id + user2_id, letting us double-check
    // the deleted row involved this user before touching state.
    function handleDelete(payload) {
      var old = payload.old || {};
      var convId = old.id;
      if (!convId) return;
      if (old.user1_id && old.user2_id &&
          old.user1_id !== uid && old.user2_id !== uid) return;
      setConversations(function (cs) { return cs.filter(function (c) { return c.id !== convId; }); });
      setRequests(function (rs) { return rs.filter(function (r) { return r.id !== convId; }); });
      setPinnedConvIds(function (ps) { return ps.filter(function (id) { return id !== convId; }); });
      setMutedConvIds(function (ms) { return ms.filter(function (id) { return id !== convId; }); });
      if (activeConvRef.current && activeConvRef.current.id === convId) {
        setActiveConv(null);
        activeConvRef.current = null;
        setThreadMessages([]);
        setReactions({});
      }
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
          // Pending-incoming rows live in `requests`, not `conversations`.
          // When the requester sends their first DM, the DB trigger bumps
          // last_message_preview on the pending conv row. Mirror that
          // change into requests so the preview renders under the name.
          // (Previously only conversations was touched, so the recipient
          // saw "Alex wants to message you" with no message body.)
          if (conv.status === "pending") {
            setRequests(function (rs) {
              return rs.map(function (r) {
                if (r.id !== conv.id) return r;
                return Object.assign({}, r, {
                  last_message_preview: conv.last_message_preview,
                  last_message_at: conv.last_message_at,
                  last_message_sender_id: conv.last_message_sender_id,
                });
              });
            });
          }
        }
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "conversations" }, handleDelete)
      .subscribe();

    return function () { supabase.removeChannel(convChannel); };
  }, [authUser && authUser.id]);

  // ── Realtime: typing inbox ─────────────────────────────────────────────
  // Each user subscribes to their own broadcast inbox. Senders open a
  // lightweight channel pointed at the recipient's inbox (cached in
  // typingSendersRef) and call .send({ event:'typing', payload:{convId} })
  // as they type — throttled by the caller to every ~2s. We mark
  // typingConvs[convId] = now() and sweep stale entries on a 1.5s interval
  // so the indicator auto-clears 5s after the last keystroke.
  useEffect(function () {
    if (!authUser) return;
    var uid = authUser.id;
    var ch = supabase.channel("typing-inbox:" + uid);
    ch.on("broadcast", { event: "typing" }, function (msg) {
      var p = (msg && msg.payload) || {};
      if (!p.convId || p.fromUid === uid) return;
      setTypingConvs(function (prev) {
        var next = Object.assign({}, prev);
        next[p.convId] = Date.now();
        return next;
      });
    }).subscribe();
    return function () { supabase.removeChannel(ch); };
  }, [authUser && authUser.id]);

  useEffect(function () {
    var id = setInterval(function () {
      setTypingConvs(function (prev) {
        var now = Date.now();
        var next = {};
        var keep = true;
        for (var k in prev) {
          if (now - prev[k] < 5000) next[k] = prev[k];
          else keep = false;
        }
        return keep ? prev : next;
      });
    }, 1500);
    return function () { clearInterval(id); };
  }, []);

  // Sender: broadcast a typing event to the partner's inbox. Lazily
  // creates + caches a channel per partnerUid so repeated keystrokes
  // don't each pay a subscribe round-trip.
  function notifyTyping(partnerUid, convId) {
    if (!partnerUid || !convId || !authUser) return;
    var ch = typingSendersRef.current[partnerUid];
    if (!ch) {
      ch = supabase.channel("typing-inbox:" + partnerUid);
      typingSendersRef.current[partnerUid] = ch;
      ch.subscribe();
    }
    // Fire-and-forget — if the channel isn't subscribed yet, the send
    // will queue until it is (Realtime client buffers).
    ch.send({
      type: "broadcast",
      event: "typing",
      payload: { convId: convId, fromUid: authUser.id },
    });
  }

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
  //
  // We subscribe to ALL message_reactions globally and filter client-side
  // via `threadIdsRef`. This looks wasteful, but an `in.(id1,id2,…)` server
  // filter would capture ids at subscribe-time only — a reaction on a
  // message the user sends AFTER opening the conv would never arrive.
  // `message_reactions` has no `conversation_id` column to filter on, so
  // the global approach is the correct one until that's denormalised.
  // Scoped per-`activeConv` via the effect dep, so inactive convs don't
  // hold a subscription.
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

  // ── Realtime: pins (multi-device sync) ───────────────────────────────
  useEffect(function () {
    if (!authUser) return;
    var uid = authUser.id;
    var pinsChannel = supabase.channel("pins:" + uid)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_pins", filter: "user_id=eq." + uid },
        function (payload) {
          var cid = payload.new && payload.new.conversation_id;
          if (!cid) return;
          setPinnedConvIds(function (prev) {
            if (prev.indexOf(cid) >= 0) return prev;
            return [cid].concat(prev);
          });
        }
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "conversation_pins", filter: "user_id=eq." + uid },
        function (payload) {
          var cid = payload.old && payload.old.conversation_id;
          if (!cid) return;
          setPinnedConvIds(function (prev) { return prev.filter(function (id) { return id !== cid; }); });
        }
      )
      .subscribe();
    return function () { supabase.removeChannel(pinsChannel); };
  }, [authUser && authUser.id]);

  // ── Realtime: mutes (multi-device sync) ──────────────────────────────
  useEffect(function () {
    if (!authUser) return;
    var uid = authUser.id;
    var mutesChannel = supabase.channel("mutes:" + uid)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_mutes", filter: "user_id=eq." + uid },
        function (payload) {
          var cid = payload.new && payload.new.conversation_id;
          if (!cid) return;
          setMutedConvIds(function (prev) {
            if (prev.indexOf(cid) >= 0) return prev;
            return prev.concat([cid]);
          });
        }
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "conversation_mutes", filter: "user_id=eq." + uid },
        function (payload) {
          var cid = payload.old && payload.old.conversation_id;
          if (!cid) return;
          setMutedConvIds(function (prev) { return prev.filter(function (id) { return id !== cid; }); });
        }
      )
      .subscribe();
    return function () { supabase.removeChannel(mutesChannel); };
  }, [authUser && authUser.id]);

  // ── Realtime: partner profiles (presence + privacy) ─────────────────────
  // Patches every cached `partner` embed (conversations list, active thread
  // header, incoming-request rows) so a partner toggling show_online_status
  // OFF, or their last_active heartbeat firing, flips dot/label live.
  useEffect(function () {
    if (!authUser) return;
    var channel = supabase.channel("dm-partner-profiles:" + authUser.id)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "profiles",
      }, function (payload) {
        var p = payload.new; if (!p || !p.id) return;
        function patchOne(partner) {
          if (!partner || partner.id !== p.id) return partner;
          return Object.assign({}, partner, {
            last_active:        p.last_active,
            show_online_status: p.show_online_status,
            show_last_seen:     p.show_last_seen,
            name:               p.name || partner.name,
            avatar:             p.avatar != null ? p.avatar : partner.avatar,
            avatar_url:         p.avatar_url != null ? p.avatar_url : partner.avatar_url,
          });
        }
        setConversations(function (cs) {
          return cs.map(function (c) {
            if (c && c.partner && c.partner.id === p.id) {
              return Object.assign({}, c, { partner: patchOne(c.partner) });
            }
            return c;
          });
        });
        setRequests(function (rs) {
          return rs.map(function (r) {
            if (r && r.partner && r.partner.id === p.id) {
              return Object.assign({}, r, { partner: patchOne(r.partner) });
            }
            return r;
          });
        });
        setActiveConv(function (ac) {
          if (ac && ac.partner && ac.partner.id === p.id) {
            return Object.assign({}, ac, { partner: patchOne(ac.partner) });
          }
          return ac;
        });
      })
      .subscribe();
    return function () { supabase.removeChannel(channel); };
  }, [authUser && authUser.id]);

  function resetDMs() {
    setConversations([]); setRequests([]); setActiveConv(null);
    setConversationsLoaded(false);
    setThreadMessages([]); setReactions({}); setMsgDraft("");
    setReplyTo(null); setEditingId(null);
    setPartnerLastReadAt(null);
    setPinnedConvIds([]);
    setMutedConvIds([]);
    setTypingConvs({});
    // Tear down any sender-side typing channels.
    Object.keys(typingSendersRef.current).forEach(function (k) {
      try { supabase.removeChannel(typingSendersRef.current[k]); } catch (e) {}
    });
    typingSendersRef.current = {};
    activeConvRef.current = null;
  }

  function totalUnread() {
    // Muted convs don't contribute to the People-tab badge. Requests
    // always count — muting an incoming request is not a concept; they
    // need an explicit accept/decline decision.
    var mutedSet = {};
    (mutedConvIds || []).forEach(function (id) { mutedSet[id] = true; });
    var convUnread = conversations.reduce(function (s, c) {
      if (!c.hasUnread) return s;
      if (mutedSet[c.id]) return s;
      return s + 1;
    }, 0);
    return convUnread + requests.length;
  }

  return {
    conversations: conversations, requests: requests, conversationsLoaded: conversationsLoaded,
    activeConv: activeConv,
    threadMessages: threadMessages, reactions: reactions,
    threadLoading: threadLoading, msgDraft: msgDraft, setMsgDraft: setMsgDraft, sending: sending,
    replyTo: replyTo, setReplyTo: setReplyTo, clearReplyTo: function () { setReplyTo(null); },
    editingId: editingId, editDraft: editDraft, setEditDraft: setEditDraft,
    partnerLastReadAt: partnerLastReadAt,
    pinnedConvIds: pinnedConvIds,
    pinConversation: pinConversation, unpinConversation: unpinConversation,
    mutedConvIds: mutedConvIds,
    muteConversation: muteConversation, unmuteConversation: unmuteConversation,
    loadConversations: loadConversations, openConversation: openConversation,
    openOrStartConversation: openOrStartConversation,
    openConversationWith: openConversationWith,
    closeConversation: closeConversation,
    // Phase 1b — proposed-slot block surfaced in the composer. Callers
    // can read current slot + clear/update it (e.g. composer UI's
    // "remove slot" button).
    proposedSlot: proposedSlot, setProposedSlot: setProposedSlot,
    sendMessage: sendMessage, acceptRequest: acceptRequest, declineRequest: declineRequest,
    toggleReaction: toggleReaction, startEdit: startEdit, cancelEdit: cancelEdit,
    submitEdit: submitEdit, deleteMessage: deleteMessage,
    deleteConversation: deleteConversation, resetDMs: resetDMs, totalUnread: totalUnread,
    // Typing indicator surface
    typingConvs: typingConvs, notifyTyping: notifyTyping,
  };
}
