// useDMs — state transition tests.
//
// We mock the supabase client + dmService so we can drive the hook purely
// from scripted payloads. The goal is to lock the behaviours that matter
// for production: switching conversations scrubs transient state, sending
// is optimistic, realtime INSERT dedupes by id (multi-tab safe),
// optimistic reactions rollback on failure.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────

var onHandlers = {};
function fakeChannel(name) {
  var self = {
    _name: name,
    on: function (ev, cfg, cb) {
      var key = cfg.table + ":" + cfg.event;
      onHandlers[key] = onHandlers[key] || [];
      onHandlers[key].push(cb);
      return self;
    },
    subscribe: function () { return self; },
  };
  return self;
}

vi.mock("../../../lib/supabase.js", function () {
  return {
    supabase: {
      channel: function (name) { return fakeChannel(name); },
      removeChannel: function () {},
    },
  };
});

var mockFetchConversations = vi.fn();
var mockGetOrCreate = vi.fn();
var mockFetchThread = vi.fn();
var mockFetchReactions = vi.fn();
var mockFetchReads = vi.fn();
var mockSendMessage = vi.fn();
var mockUpdateConvLastMsg = vi.fn();
var mockUpsertRead = vi.fn();
var mockFetchPartnerRead = vi.fn();
var mockUpdateStatus = vi.fn();
var mockAddReaction = vi.fn();
var mockRemoveReaction = vi.fn();
var mockEditMessage = vi.fn();
var mockSoftDelete = vi.fn();
var mockDeleteConv = vi.fn();
var mockDecline = vi.fn();
var mockUpdatePresence = vi.fn();
var mockFetchPinned = vi.fn();
var mockPinRow = vi.fn();
var mockUnpinRow = vi.fn();

vi.mock("../services/dmService.js", function () {
  return {
    fetchConversations: function () { return mockFetchConversations(); },
    getOrCreateConversation: function () { return mockGetOrCreate(); },
    fetchThread: function () { return mockFetchThread(); },
    fetchReactions: function () { return mockFetchReactions(); },
    fetchReads: function () { return mockFetchReads(); },
    sendMessage: function () { return mockSendMessage.apply(null, arguments); },
    updateConversationLastMessage: function () { return mockUpdateConvLastMsg.apply(null, arguments); },
    upsertRead: function () { return mockUpsertRead(); },
    fetchPartnerRead: function () { return mockFetchPartnerRead(); },
    updateConversationStatus: function () { return mockUpdateStatus.apply(null, arguments); },
    addReaction: function () { return mockAddReaction.apply(null, arguments); },
    removeReaction: function () { return mockRemoveReaction.apply(null, arguments); },
    editMessage: function () { return mockEditMessage.apply(null, arguments); },
    softDeleteMessage: function () { return mockSoftDelete.apply(null, arguments); },
    deleteConversation: function () { return mockDeleteConv.apply(null, arguments); },
    declineConversation: function () { return mockDecline.apply(null, arguments); },
    updatePresence: function () { return mockUpdatePresence.apply(null, arguments); },
    fetchPinnedConversationIds: function () { return mockFetchPinned.apply(null, arguments); },
    pinConversationRow: function () { return mockPinRow.apply(null, arguments); },
    unpinConversationRow: function () { return mockUnpinRow.apply(null, arguments); },
  };
});

vi.mock("../services/socialService.js", function () {
  return { fetchProfilesByIds: function () { return Promise.resolve({ data: [] }); } };
});

vi.mock("../../notifications/services/notificationService.js", function () {
  return {
    insertNotification: vi.fn().mockResolvedValue({ error: null }),
    upsertMessageNotification: vi.fn().mockResolvedValue({ error: null }),
  };
});

import { useDMs } from "./useDMs.js";

function resetMocks() {
  onHandlers = {};
  [mockFetchConversations, mockGetOrCreate, mockFetchThread, mockFetchReactions,
   mockFetchReads, mockSendMessage, mockUpdateConvLastMsg, mockUpsertRead,
   mockFetchPartnerRead, mockUpdateStatus, mockAddReaction, mockRemoveReaction,
   mockEditMessage, mockSoftDelete, mockDeleteConv, mockDecline, mockUpdatePresence,
   mockFetchPinned, mockPinRow, mockUnpinRow]
    .forEach(function (m) { m.mockReset(); });
  mockFetchConversations.mockResolvedValue({ data: [] });
  mockFetchThread.mockResolvedValue({ data: [] });
  mockFetchReactions.mockResolvedValue({ data: [] });
  mockFetchReads.mockResolvedValue({ data: [] });
  mockUpsertRead.mockResolvedValue({ error: null });
  mockFetchPartnerRead.mockResolvedValue({ data: null });
  mockUpdateConvLastMsg.mockResolvedValue({ error: null });
  mockUpdatePresence.mockResolvedValue({ error: null });
  mockFetchPinned.mockResolvedValue({ data: [] });
  mockPinRow.mockResolvedValue({ data: {}, error: null });
  mockUnpinRow.mockResolvedValue({ error: null });
}

function fireRealtime(table, event, payload) {
  var key = table + ":" + event;
  (onHandlers[key] || []).forEach(function (cb) { cb(payload); });
}

var authUser = { id: "me-uid" };
var convA = { id: "conv-a", user1_id: "me-uid", user2_id: "p1", status: "accepted", partner: { id: "p1", name: "Alex" } };
var convB = { id: "conv-b", user1_id: "me-uid", user2_id: "p2", status: "accepted", partner: { id: "p2", name: "Sam" } };

describe("useDMs — switching conversations scrubs transient state", function () {
  beforeEach(resetMocks);

  it("clears replyTo + editingId + draft when opening a different conv", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });

    await act(async function () { await hook.result.current.openConversation(convA); });

    act(function () {
      hook.result.current.setMsgDraft("half-typed");
      hook.result.current.setReplyTo({ id: "m1", content: "original" });
      hook.result.current.startEdit({ id: "m2", content: "editing this" });
    });

    expect(hook.result.current.msgDraft).toBe("half-typed");
    expect(hook.result.current.replyTo).toBeTruthy();
    expect(hook.result.current.editingId).toBe("m2");

    await act(async function () { await hook.result.current.openConversation(convB); });

    expect(hook.result.current.msgDraft).toBe("");
    expect(hook.result.current.replyTo).toBeNull();
    expect(hook.result.current.editingId).toBeNull();
    expect(hook.result.current.editDraft).toBe("");
  });
});

describe("useDMs — realtime INSERT dedupes by id (multi-tab)", function () {
  beforeEach(resetMocks);

  it("applies own-sender realtime messages (not skipped)", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    await act(async function () { await hook.result.current.openConversation(convA); });

    // Simulate another tab sending: realtime arrives with sender_id = me.
    await act(async function () {
      fireRealtime("direct_messages", "INSERT", { new: { id: "m-remote", conversation_id: "conv-a", sender_id: "me-uid", content: "from other tab", created_at: "2026-04-22T10:00:00Z" } });
    });
    expect(hook.result.current.threadMessages.some(function (m) { return m.id === "m-remote"; })).toBe(true);
  });

  it("dedupes when send() echoed back via realtime", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    await act(async function () { await hook.result.current.openConversation(convA); });

    mockSendMessage.mockResolvedValue({ data: { id: "m-1", conversation_id: "conv-a", sender_id: "me-uid", content: "hi", created_at: "2026-04-22T10:00:00Z" }, error: null });
    act(function () { hook.result.current.setMsgDraft("hi"); });
    await act(async function () { await hook.result.current.sendMessage("hi"); });

    // Server realtime echoes the same row.
    await act(async function () {
      fireRealtime("direct_messages", "INSERT", { new: { id: "m-1", conversation_id: "conv-a", sender_id: "me-uid", content: "hi", created_at: "2026-04-22T10:00:00Z" } });
    });
    expect(hook.result.current.threadMessages.filter(function (m) { return m.id === "m-1"; }).length).toBe(1);
  });
});

describe("useDMs — sending messages", function () {
  beforeEach(resetMocks);

  it("happy path: appends to thread, clears draft, keeps replyTo in snapshot on failure", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    await act(async function () { await hook.result.current.openConversation(convA); });

    mockSendMessage.mockResolvedValueOnce({ data: { id: "m-1", conversation_id: "conv-a", sender_id: "me-uid", content: "hello", created_at: "2026-04-22T10:00:00Z" }, error: null });
    await act(async function () { await hook.result.current.sendMessage("hello"); });

    expect(hook.result.current.threadMessages.length).toBe(1);
    expect(hook.result.current.threadMessages[0].content).toBe("hello");
    expect(hook.result.current.msgDraft).toBe("");
  });

  it("rejects empty / too-long drafts", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    await act(async function () { await hook.result.current.openConversation(convA); });

    await act(async function () { await hook.result.current.sendMessage("   "); });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("restores the draft + replyTo if send fails", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    await act(async function () { await hook.result.current.openConversation(convA); });
    act(function () { hook.result.current.setReplyTo({ id: "m-orig", content: "reply to this" }); });

    mockSendMessage.mockResolvedValueOnce({ data: null, error: { message: "network blew up" } });
    await act(async function () { await hook.result.current.sendMessage("will fail"); });

    expect(hook.result.current.msgDraft).toBe("will fail");
    expect(hook.result.current.replyTo).toBeTruthy();
  });
});

describe("useDMs — optimistic reactions", function () {
  beforeEach(resetMocks);

  it("adds optimistically, replaces with server row on success", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    mockFetchThread.mockResolvedValueOnce({ data: [{ id: "m-1", sender_id: "p1", content: "hi", created_at: "2026-04-22T10:00:00Z" }] });
    await act(async function () { await hook.result.current.openConversation(convA); });

    mockAddReaction.mockResolvedValueOnce({ data: { id: "rx-1", message_id: "m-1", user_id: "me-uid", emoji: "👍" }, error: null });
    await act(async function () { await hook.result.current.toggleReaction("m-1", "👍"); });

    var rx = hook.result.current.reactions["m-1"] || [];
    expect(rx.length).toBe(1);
    expect(rx[0].emoji).toBe("👍");
    expect(rx[0]._optimistic).toBeFalsy();
    expect(rx[0].id).toBe("rx-1");
  });

  it("rolls back when server rejects", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    mockFetchThread.mockResolvedValueOnce({ data: [{ id: "m-1", sender_id: "p1", content: "hi", created_at: "2026-04-22T10:00:00Z" }] });
    await act(async function () { await hook.result.current.openConversation(convA); });

    mockAddReaction.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await act(async function () { await hook.result.current.toggleReaction("m-1", "❤️"); });

    var rx = hook.result.current.reactions["m-1"] || [];
    expect(rx.length).toBe(0);
  });
});

describe("useDMs — openOrStartConversation error surface", function () {
  beforeEach(resetMocks);

  it("returns { error:null } on happy path", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    mockGetOrCreate.mockResolvedValueOnce({
      data: { id: "c-new", user1_id: "me-uid", user2_id: "p-new", status: "accepted", requester_id: "me-uid", last_message_at: null },
      error: null,
    });
    mockFetchThread.mockResolvedValueOnce({ data: [] });
    var result;
    await act(async function () {
      result = await hook.result.current.openOrStartConversation({ id: "p-new", name: "New" });
    });
    expect(result).toBeTruthy();
    expect(result.error).toBeNull();
  });

  it("returns a human-readable error on RPC failure", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    mockGetOrCreate.mockResolvedValueOnce({ data: null, error: { message: "network blew up" } });
    var result;
    await act(async function () {
      result = await hook.result.current.openOrStartConversation({ id: "p-new", name: "New" });
    });
    expect(result.error).toBe("network blew up");
  });

  it("returns a cooldown error when declined cooldown is active", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    var inOneDay = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    mockGetOrCreate.mockResolvedValueOnce({
      data: { id: "c-dec", user1_id: "me-uid", user2_id: "p-dec", status: "declined", requester_id: "me-uid", request_cooldown_until: inOneDay },
      error: null,
    });
    var result;
    await act(async function () {
      result = await hook.result.current.openOrStartConversation({ id: "p-dec", name: "Block" });
    });
    expect(result.error).toMatch(/can't message Block right now/);
  });
});

describe("useDMs — pinned conversations", function () {
  beforeEach(resetMocks);

  it("loads pinned ids from the service on bootstrap", async function () {
    mockFetchPinned.mockResolvedValueOnce({ data: [{ conversation_id: "c-a", pinned_at: "t1" }, { conversation_id: "c-b", pinned_at: "t0" }] });
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    await act(async function () { await hook.result.current.loadConversations(); });
    // fetchPinnedConversationIds is fire-and-forget — wait a microtask.
    await act(async function () { await Promise.resolve(); });
    expect(hook.result.current.pinnedConvIds).toEqual(["c-a", "c-b"]);
  });

  it("pinConversation adds optimistically and commits", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    await act(async function () {
      var r = await hook.result.current.pinConversation("c-new");
      expect(r.error).toBeNull();
    });
    expect(hook.result.current.pinnedConvIds).toEqual(["c-new"]);
    expect(mockPinRow).toHaveBeenCalledWith("me-uid", "c-new");
  });

  it("pinConversation rolls back on server error", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    mockPinRow.mockResolvedValueOnce({ data: null, error: { message: "nope" } });
    await act(async function () {
      var r = await hook.result.current.pinConversation("c-fail");
      expect(r.error).toBe("nope");
    });
    expect(hook.result.current.pinnedConvIds).toEqual([]);
  });

  it("unpinConversation removes + commits", async function () {
    mockFetchPinned.mockResolvedValueOnce({ data: [{ conversation_id: "c-a" }] });
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    await act(async function () { await hook.result.current.loadConversations(); });
    await act(async function () { await Promise.resolve(); });

    await act(async function () {
      var r = await hook.result.current.unpinConversation("c-a");
      expect(r.error).toBeNull();
    });
    expect(hook.result.current.pinnedConvIds).toEqual([]);
    expect(mockUnpinRow).toHaveBeenCalledWith("me-uid", "c-a");
  });
});

describe("useDMs — delete", function () {
  beforeEach(resetMocks);

  it("soft-deletes optimistically, rolls back on error", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    mockFetchThread.mockResolvedValueOnce({ data: [{ id: "m-1", sender_id: "me-uid", content: "oops", created_at: "2026-04-22T10:00:00Z" }] });
    await act(async function () { await hook.result.current.openConversation(convA); });

    // Happy path: delete applies.
    mockSoftDelete.mockResolvedValueOnce({ error: null });
    await act(async function () { await hook.result.current.deleteMessage("m-1"); });
    expect(hook.result.current.threadMessages[0].deleted_at).toBeTruthy();

    // Now seed a fresh message + error path.
    mockFetchThread.mockResolvedValueOnce({ data: [{ id: "m-2", sender_id: "me-uid", content: "keep", created_at: "2026-04-22T10:01:00Z" }] });
    await act(async function () { await hook.result.current.closeConversation(); });
    await act(async function () { await hook.result.current.openConversation(convA); });

    mockSoftDelete.mockResolvedValueOnce({ error: { message: "nope" } });
    await act(async function () { await hook.result.current.deleteMessage("m-2"); });
    // Rolled back → still not deleted.
    expect(hook.result.current.threadMessages[0].deleted_at).toBeFalsy();
  });

  it("deleteConversation removes locally and clears active", async function () {
    var hook = renderHook(function () { return useDMs({ authUser: authUser }); });
    await act(async function () { await hook.result.current.openConversation(convA); });
    mockDeleteConv.mockResolvedValueOnce({ error: null });
    await act(async function () { await hook.result.current.deleteConversation("conv-a"); });
    expect(hook.result.current.activeConv).toBeNull();
    // No window.confirm call anywhere.
    expect(mockDeleteConv).toHaveBeenCalledWith("conv-a");
  });
});
