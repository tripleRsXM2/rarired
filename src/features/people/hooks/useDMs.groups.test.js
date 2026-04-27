// useDMs — group conversations (Phase 2).
//
// Locks the multi-party path on the hook:
//   1. Doubles invite (3 partners) materialises the group via
//      createGroupConversation + sends the draft.
//   2. Singles invite still hits the 1:1 draft path (no group RPC).
//   3. block_conflict surfaces a stable error code without mutating state.
//   4. loadConversations hydrates isGroup + participants, keeps `partner`
//      populated for 1:1 rows.
//   5. Realtime INSERT on conversation_participants triggers conv
//      hydration when the user is added to a new group from elsewhere.
//
// Mirrors the mock layout in useDMs.test.js — keep the shapes in sync.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────

var onHandlers = {};
function fakeChannel(name) {
  var self = {
    _name: name,
    on: function (ev, cfg, cb) {
      var key = (cfg.table || "_") + ":" + (cfg.event || ev);
      onHandlers[key] = onHandlers[key] || [];
      onHandlers[key].push(cb);
      return self;
    },
    subscribe: function () { return self; },
    send: function () { return self; },
  };
  return self;
}

var mockMaybeSingle = vi.fn();
var mockSelectFromConversations = vi.fn();
var mockPartsSelect = vi.fn();

vi.mock("../../../lib/supabase.js", function () {
  return {
    supabase: {
      channel: function (name) { return fakeChannel(name); },
      removeChannel: function () {},
      from: function (table) {
        if (table === "conversations") {
          return {
            select: function () {
              return {
                eq: function () {
                  return { maybeSingle: function () { return mockSelectFromConversations(); } };
                },
              };
            },
          };
        }
        if (table === "conversation_participants") {
          return {
            select: function () {
              return {
                eq: function () { return mockPartsSelect(); },
              };
            },
          };
        }
        return {
          select: function () { return { eq: function () { return { maybeSingle: function () { return Promise.resolve({ data: null, error: null }); } }; } }; },
        };
      },
    },
  };
});

var mockFetchConversations = vi.fn();
var mockGetOrCreate = vi.fn();
var mockCreateGroup = vi.fn();
var mockFetchThread = vi.fn();
var mockFetchReactions = vi.fn();
var mockFetchReads = vi.fn();
var mockSendMessage = vi.fn();
var mockUpdateConvLastMsg = vi.fn();
var mockUpsertRead = vi.fn();
var mockFetchPartnerRead = vi.fn();
var mockUpdateStatus = vi.fn();
var mockFetchPartnerReadsForConvs = vi.fn();
var mockFetchPinned = vi.fn();
var mockUpdatePresence = vi.fn();

vi.mock("../services/dmService.js", function () {
  return {
    fetchConversations: function () { return mockFetchConversations(); },
    getOrCreateConversation: function () { return mockGetOrCreate(); },
    createGroupConversation: function (ids) { return mockCreateGroup(ids); },
    fetchThread: function () { return mockFetchThread(); },
    fetchReactions: function () { return mockFetchReactions(); },
    fetchReads: function () { return mockFetchReads(); },
    sendMessage: function () { return mockSendMessage.apply(null, arguments); },
    updateConversationLastMessage: function () { return mockUpdateConvLastMsg.apply(null, arguments); },
    upsertRead: function () { return mockUpsertRead(); },
    fetchPartnerRead: function () { return mockFetchPartnerRead(); },
    fetchPartnerReadsForConvs: function () { return mockFetchPartnerReadsForConvs(); },
    updateConversationStatus: function () { return mockUpdateStatus.apply(null, arguments); },
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
    editMessage: vi.fn(),
    softDeleteMessage: vi.fn(),
    deleteConversation: vi.fn(),
    declineConversation: vi.fn(),
    updatePresence: function () { return mockUpdatePresence(); },
    fetchPinnedConversationIds: function () { return mockFetchPinned(); },
    pinConversationRow: vi.fn().mockResolvedValue({ data: {}, error: null }),
    unpinConversationRow: vi.fn().mockResolvedValue({ error: null }),
    fetchMutedConversationIds: function () { return Promise.resolve({ data: [], error: null }); },
    muteConversationRow:   function () { return Promise.resolve({ data: null, error: null }); },
    unmuteConversationRow: function () { return Promise.resolve({ data: null, error: null }); },
  };
});

var mockFetchProfilesByIds = vi.fn();
vi.mock("../services/socialService.js", function () {
  return { fetchProfilesByIds: function () { return mockFetchProfilesByIds.apply(null, arguments); } };
});
// useDMs imports fetchProfilesByIds from "../services/socialService.js" — but
// some flows (the participants channel) re-import; mock both in case.
vi.mock("../../../lib/db.js", function () {
  return { fetchProfilesByIds: function () { return mockFetchProfilesByIds.apply(null, arguments); } };
});

var mockUpsertMessageNotification = vi.fn();
var mockInsertNotification = vi.fn();
vi.mock("../../notifications/services/notificationService.js", function () {
  return {
    insertNotification: function () { return mockInsertNotification.apply(null, arguments); },
    upsertMessageNotification: function () { return mockUpsertMessageNotification.apply(null, arguments); },
  };
});

import { useDMs } from "./useDMs.js";

function resetMocks() {
  onHandlers = {};
  [mockFetchConversations, mockGetOrCreate, mockCreateGroup, mockFetchThread,
   mockFetchReactions, mockFetchReads, mockSendMessage, mockUpdateConvLastMsg,
   mockUpsertRead, mockFetchPartnerRead, mockUpdateStatus,
   mockFetchPartnerReadsForConvs, mockFetchPinned, mockUpdatePresence,
   mockFetchProfilesByIds, mockUpsertMessageNotification, mockInsertNotification,
   mockSelectFromConversations, mockPartsSelect]
    .forEach(function (m) { m.mockReset(); });
  mockFetchConversations.mockResolvedValue({ data: [] });
  mockFetchThread.mockResolvedValue({ data: [] });
  mockFetchReactions.mockResolvedValue({ data: [] });
  mockFetchReads.mockResolvedValue({ data: [] });
  mockFetchPartnerReadsForConvs.mockResolvedValue({ data: [] });
  mockUpsertRead.mockResolvedValue({ error: null });
  mockFetchPartnerRead.mockResolvedValue({ data: null });
  mockUpdateConvLastMsg.mockResolvedValue({ error: null });
  mockUpdatePresence.mockResolvedValue({ error: null });
  mockFetchPinned.mockResolvedValue({ data: [] });
  mockFetchProfilesByIds.mockResolvedValue({ data: [] });
  mockUpsertMessageNotification.mockResolvedValue({ error: null });
  mockInsertNotification.mockResolvedValue({ error: null });
  mockSelectFromConversations.mockResolvedValue({ data: null, error: null });
  mockPartsSelect.mockResolvedValue({ data: [], error: null });
}

function fireRealtime(table, event, payload) {
  var key = table + ":" + event;
  (onHandlers[key] || []).forEach(function (cb) { cb(payload); });
}

var authUser = { id: "me-uid" };
var p1 = { id: "p1", name: "Alex" };
var p2 = { id: "p2", name: "Sam" };
var p3 = { id: "p3", name: "Riley" };

describe("useDMs — openConversationWith group invite", function () {
  beforeEach(resetMocks);

  it("doubles invite creates one group conversation with three participants", async function () {
    mockCreateGroup.mockResolvedValueOnce({ data: "conv-grp-1", error: null });
    mockSendMessage.mockResolvedValueOnce({
      data: { id: "m-1", conversation_id: "conv-grp-1", sender_id: "me-uid", content: "hi all", created_at: "2026-04-27T10:00:00Z" },
      error: null,
    });

    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });

    var result;
    await act(async function () {
      result = await hook.result.current.openConversationWith([p1, p2, p3], { draft: "hi all" });
    });
    expect(result).toEqual({ error: null });

    // Group RPC called once with the three other ids — caller is added by the RPC.
    expect(mockCreateGroup).toHaveBeenCalledTimes(1);
    expect(mockCreateGroup).toHaveBeenCalledWith(["p1", "p2", "p3"]);
    // No 1:1 fallback.
    expect(mockGetOrCreate).not.toHaveBeenCalled();

    // activeConv reflects the group.
    var ac = hook.result.current.activeConv;
    expect(ac).toBeTruthy();
    expect(ac.id).toBe("conv-grp-1");
    expect(ac.isGroup).toBe(true);
    expect(ac.participants.length).toBe(4); // me + 3
    expect(ac.partner).toBeNull();

    // Now send the staged draft.
    await act(async function () { await hook.result.current.sendMessage("hi all"); });
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    // Group fan-out: one upsertMessageNotification per non-self participant.
    expect(mockUpsertMessageNotification).toHaveBeenCalledTimes(3);
  });

  it("singles invite still creates a 2-party conversation via the draft path", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });

    await act(async function () {
      await hook.result.current.openConversationWith(p1, { draft: "hi" });
    });

    expect(mockCreateGroup).not.toHaveBeenCalled();
    // 1:1 stays in draft mode until first send.
    var ac = hook.result.current.activeConv;
    expect(ac).toBeTruthy();
    expect(ac.isDraft).toBe(true);
    expect(ac.isGroup).toBeFalsy();

    // sendMessage triggers get_or_create_conversation (the canonical 1:1 RPC).
    mockGetOrCreate.mockResolvedValueOnce({
      data: { id: "c-new", user1_id: "me-uid", user2_id: "p1", status: "accepted", requester_id: "me-uid" },
      error: null,
    });
    mockSendMessage.mockResolvedValueOnce({
      data: { id: "m-1", conversation_id: "c-new", sender_id: "me-uid", content: "hi", created_at: "2026-04-27T10:00:00Z" },
      error: null,
    });
    await act(async function () { await hook.result.current.sendMessage("hi"); });
    expect(mockGetOrCreate).toHaveBeenCalledTimes(1);
  });

  it("block_conflict surfaces a stable error code and does not mutate state", async function () {
    mockCreateGroup.mockResolvedValueOnce({ data: null, error: { code: "block_conflict", message: "block_conflict" } });
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });

    var result;
    await act(async function () {
      result = await hook.result.current.openConversationWith([p1, p2, p3], { draft: "hi" });
    });

    expect(result).toEqual({ error: { code: "block_conflict" } });
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(hook.result.current.activeConv).toBeNull();
    expect(hook.result.current.conversations).toEqual([]);
  });
});

describe("useDMs — loadConversations hydrates isGroup + participants", function () {
  beforeEach(resetMocks);

  it("attaches isGroup, participants[], and partner (1:1 only)", async function () {
    mockFetchConversations.mockResolvedValueOnce({
      data: [
        {
          id: "conv-grp",
          user1_id: "me-uid", user2_id: "p1",
          status: "accepted", is_group: true,
          last_message_at: "2026-04-27T10:00:00Z",
          last_message_sender_id: "p1",
          participant_ids: ["me-uid", "p1", "p2"],
          requester_id: "me-uid",
        },
        {
          id: "conv-11",
          user1_id: "me-uid", user2_id: "p3",
          status: "accepted", is_group: false,
          last_message_at: "2026-04-27T09:00:00Z",
          last_message_sender_id: "me-uid",
          participant_ids: ["me-uid", "p3"],
          requester_id: "me-uid",
        },
      ],
    });
    mockFetchProfilesByIds.mockResolvedValue({
      data: [
        { id: "p1", name: "Alex" },
        { id: "p2", name: "Sam" },
        { id: "p3", name: "Riley" },
      ],
    });

    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    await act(async function () { await hook.result.current.loadConversations(); });
    // Phase-2 enrichment is fire-and-forget — flush microtasks.
    await act(async function () { await Promise.resolve(); });
    await act(async function () { await Promise.resolve(); });
    await act(async function () { await Promise.resolve(); });

    var convs = hook.result.current.conversations;
    expect(convs.length).toBe(2);
    var grp = convs.find(function (c) { return c.id === "conv-grp"; });
    var oneToOne = convs.find(function (c) { return c.id === "conv-11"; });
    expect(grp.isGroup).toBe(true);
    expect(grp.partner).toBeNull();
    expect(grp.participants.length).toBe(3);
    expect(oneToOne.isGroup).toBe(false);
    expect(oneToOne.partner).toBeTruthy();
    expect(oneToOne.partner.id).toBe("p3");
    expect(oneToOne.participants.length).toBe(2);
  });
});

describe("useDMs — group_added notification fan-out (Gap 1)", function () {
  beforeEach(resetMocks);

  // The group_added rows are inserted server-side inside the
  // create_group_conversation RPC (see migration
  // 20260501_group_added_notification.sql), so on the client side the
  // contract is: createGroupConversation resolves successfully, no
  // additional client-side notification calls are made for group_added,
  // and the existing notifications realtime channel (subscribed by
  // useNotifications) will surface the new rows. This test locks the
  // client-side half of that contract: no extra insertNotification
  // calls of type group_added fire from useDMs (avoids accidental
  // double-fan-out if someone later "helpfully" adds a client write).
  it("does not call insertNotification for group_added on the client", async function () {
    mockCreateGroup.mockResolvedValueOnce({ data: "conv-grp-2", error: null });
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });

    await act(async function () {
      await hook.result.current.openConversationWith([p1, p2, p3], { draft: "" });
    });

    // The RPC was called — server fans out group_added rows.
    expect(mockCreateGroup).toHaveBeenCalledTimes(1);
    expect(mockCreateGroup).toHaveBeenCalledWith(["p1", "p2", "p3"]);
    // No client-side group_added insert (server-only path).
    var groupAddedCalls = mockInsertNotification.mock.calls.filter(function (call) {
      return call[0] && call[0].type === "group_added";
    });
    expect(groupAddedCalls.length).toBe(0);
  });
});

describe("useDMs — realtime conversations UPDATE bubbles to top (Gap 2)", function () {
  beforeEach(resetMocks);

  function makeConv(id, ts, partnerId) {
    return {
      id: id,
      user1_id: "me-uid", user2_id: partnerId,
      status: "accepted", is_group: false,
      last_message_at: ts,
      last_message_sender_id: partnerId,
      participant_ids: ["me-uid", partnerId],
      requester_id: "me-uid",
    };
  }

  it("incoming UPDATE on the bottom conv bubbles it to the top of the list", async function () {
    mockFetchConversations.mockResolvedValueOnce({
      data: [
        makeConv("c-A", "2026-04-27T12:00:00Z", "p1"),
        makeConv("c-B", "2026-04-27T11:00:00Z", "p2"),
        makeConv("c-C", "2026-04-27T10:00:00Z", "p3"),
      ],
    });
    mockFetchProfilesByIds.mockResolvedValue({
      data: [{ id: "p1", name: "Alex" }, { id: "p2", name: "Sam" }, { id: "p3", name: "Riley" }],
    });

    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    await act(async function () { await hook.result.current.loadConversations(); });
    await act(async function () { await Promise.resolve(); await Promise.resolve(); });

    // Initial order: A, B, C (newest first).
    var initial = hook.result.current.conversations.map(function (c) { return c.id; });
    expect(initial).toEqual(["c-A", "c-B", "c-C"]);

    // Fire a realtime UPDATE on c-C with a fresher timestamp.
    await act(async function () {
      fireRealtime("conversations", "UPDATE", {
        new: {
          id: "c-C",
          user1_id: "me-uid", user2_id: "p3",
          status: "accepted",
          last_message_at: "2026-04-27T13:00:00Z",
          last_message_preview: "fresh ping",
          last_message_sender_id: "p3",
        },
      });
      await Promise.resolve();
    });

    var after = hook.result.current.conversations.map(function (c) { return c.id; });
    expect(after).toEqual(["c-C", "c-A", "c-B"]);
  });
});

describe("useDMs — realtime conversation_participants INSERT", function () {
  beforeEach(resetMocks);

  it("fires conv hydration and lands the new conv in the list", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    // Bootstrap so the hook's effects (including the participants channel) have mounted.
    await act(async function () { await hook.result.current.loadConversations(); });
    await act(async function () { await Promise.resolve(); });

    // Mock the follow-up fetches the participants handler does.
    mockSelectFromConversations.mockResolvedValueOnce({
      data: {
        id: "conv-new", user1_id: "creator", user2_id: "me-uid",
        status: "accepted", is_group: true,
        last_message_at: "2026-04-27T10:00:00Z", last_message_sender_id: "creator",
      },
      error: null,
    });
    mockPartsSelect.mockResolvedValueOnce({
      data: [{ user_id: "me-uid" }, { user_id: "creator" }, { user_id: "p2" }],
      error: null,
    });
    mockFetchProfilesByIds.mockResolvedValueOnce({
      data: [
        { id: "creator", name: "Creator" },
        { id: "p2", name: "Sam" },
        { id: "me-uid", name: "Me" },
      ],
    });

    await act(async function () {
      fireRealtime("conversation_participants", "INSERT", {
        new: { conversation_id: "conv-new", user_id: "me-uid" },
      });
      // Let the awaits inside the handler resolve.
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    var landed = hook.result.current.conversations.find(function (c) { return c.id === "conv-new"; });
    expect(landed).toBeTruthy();
    expect(landed.isGroup).toBe(true);
    expect(landed.participants.length).toBe(3);
  });
});
