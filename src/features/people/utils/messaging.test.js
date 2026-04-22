// Unit tests for pure messaging helpers.
import { describe, it, expect, beforeEach } from "vitest";
import {
  formatMessageTime, previewify,
  computeUnreadDividerIdx, computeLastSeenByPartnerIdx,
  groupReactions, appendMessageIfNew, patchMessageById,
  computeContextMenuPos, validateDraft, MESSAGE_MAX,
  hiddenMsgsKey, readHiddenMsgs, writeHiddenMsgs, filterHiddenMessages,
} from "./messaging.js";

describe("formatMessageTime", function () {
  it("returns '' for falsy / invalid", function () {
    expect(formatMessageTime("")).toBe("");
    expect(formatMessageTime(null)).toBe("");
    expect(formatMessageTime("notadate")).toBe("");
  });
  it("returns 'now' under a minute", function () {
    var now = new Date("2026-04-22T10:00:30Z");
    expect(formatMessageTime("2026-04-22T10:00:00Z", now)).toBe("now");
  });
  it("returns Nm ago under an hour", function () {
    var now = new Date("2026-04-22T10:15:00Z");
    expect(formatMessageTime("2026-04-22T10:00:00Z", now)).toBe("15m ago");
  });
  it("returns time-of-day when same calendar day (local tz)", function () {
    // Use two local-tz timestamps an hour apart so "same day" holds in any
    // tz the test runs in. `toDateString()` is always local.
    var t0 = new Date(2026, 3, 22, 10, 0, 0);  // local 10:00
    var t1 = new Date(2026, 3, 22, 16, 0, 0);  // local 16:00 same day
    var out = formatMessageTime(t0.toISOString(), t1);
    expect(out).toMatch(/\d{2}:\d{2}/);
  });
});

describe("previewify", function () {
  it("collapses whitespace + caps length", function () {
    expect(previewify("hello\n\n\tworld")).toBe("hello world");
    expect(previewify("x".repeat(120), 20).length).toBeLessThanOrEqual(20);
  });
  it("handles null + empty", function () {
    expect(previewify(null)).toBe("");
    expect(previewify(undefined)).toBe("");
    expect(previewify("")).toBe("");
  });
});

describe("computeUnreadDividerIdx", function () {
  var me = "me";
  var them = "them";
  var msgs = [
    { id: "a", sender_id: me, created_at: "2026-04-22T10:00:00Z" },
    { id: "b", sender_id: them, created_at: "2026-04-22T10:01:00Z" },
    { id: "c", sender_id: them, created_at: "2026-04-22T10:02:00Z" },
  ];
  it("returns -1 when no lastReadAt", function () {
    expect(computeUnreadDividerIdx(msgs, me, null)).toBe(-1);
  });
  it("returns idx of first unread from other party after lastReadAt", function () {
    expect(computeUnreadDividerIdx(msgs, me, "2026-04-22T10:00:30Z")).toBe(1);
  });
  it("returns -1 when nothing is unread", function () {
    expect(computeUnreadDividerIdx(msgs, me, "2026-04-22T11:00:00Z")).toBe(-1);
  });
});

describe("computeLastSeenByPartnerIdx", function () {
  var me = "me";
  var them = "them";
  var msgs = [
    { id: "a", sender_id: me, created_at: "2026-04-22T10:00:00Z" },
    { id: "b", sender_id: them, created_at: "2026-04-22T10:01:00Z" },
    { id: "c", sender_id: me, created_at: "2026-04-22T10:02:00Z" },
    { id: "d", sender_id: me, created_at: "2026-04-22T10:03:00Z" },
  ];
  it("returns -1 without partnerLastReadAt", function () {
    expect(computeLastSeenByPartnerIdx(msgs, me, null)).toBe(-1);
  });
  it("finds the most recent of mine the partner has read", function () {
    expect(computeLastSeenByPartnerIdx(msgs, me, "2026-04-22T10:02:30Z")).toBe(2);
  });
  it("skips deleted mine", function () {
    var withDeleted = msgs.slice();
    withDeleted[2] = Object.assign({}, withDeleted[2], { deleted_at: "2026-04-22T10:04:00Z" });
    expect(computeLastSeenByPartnerIdx(withDeleted, me, "2026-04-22T10:02:30Z")).toBe(0);
  });
});

describe("groupReactions", function () {
  it("groups by emoji preserving insertion order of users", function () {
    var rows = [
      { id: "1", emoji: "👍", user_id: "a" },
      { id: "2", emoji: "❤️", user_id: "b" },
      { id: "3", emoji: "👍", user_id: "b" },
    ];
    expect(groupReactions(rows)).toEqual({ "👍": ["a", "b"], "❤️": ["b"] });
  });
  it("handles empty / null gracefully", function () {
    expect(groupReactions(null)).toEqual({});
    expect(groupReactions([])).toEqual({});
  });
});

describe("appendMessageIfNew + patchMessageById", function () {
  it("appendMessageIfNew returns same ref when id already present", function () {
    var msgs = [{ id: "a", content: "hi" }];
    var out = appendMessageIfNew(msgs, { id: "a", content: "hi" });
    expect(out).toBe(msgs);
  });
  it("appends when new", function () {
    var msgs = [{ id: "a", content: "hi" }];
    var out = appendMessageIfNew(msgs, { id: "b", content: "yo" });
    expect(out).not.toBe(msgs);
    expect(out.length).toBe(2);
  });
  it("patchMessageById returns same ref when id not found", function () {
    var msgs = [{ id: "a", content: "hi" }];
    expect(patchMessageById(msgs, { id: "x", content: "zz" })).toBe(msgs);
  });
  it("patches matching row", function () {
    var msgs = [{ id: "a", content: "hi" }];
    var out = patchMessageById(msgs, { id: "a", deleted_at: "t" });
    expect(out[0].deleted_at).toBe("t");
    expect(out[0].content).toBe("hi");
  });
});

describe("computeContextMenuPos", function () {
  it("positions below anchor when space allows", function () {
    var rect = { top: 100, bottom: 140, left: 200, width: 120 };
    var pos = computeContextMenuPos(rect, 1000, 800, 200, 280);
    expect(pos.top).toBe(144);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });
  it("flips above when below overflows", function () {
    var rect = { top: 600, bottom: 650, left: 200, width: 120 };
    var pos = computeContextMenuPos(rect, 1000, 700, 200, 280);
    // "below" would be at 654 with h=280 -> 934 > 700; must flip.
    expect(pos.top).toBe(600 - 280 - 4);
  });
  it("clamps top to 8 when anchor near the top", function () {
    var rect = { top: 5, bottom: 40, left: 10, width: 100 };
    var pos = computeContextMenuPos(rect, 400, 800, 200, 280);
    expect(pos.top).toBeGreaterThanOrEqual(8);
  });
  it("clamps left so menu never overflows right edge", function () {
    var rect = { top: 100, bottom: 140, left: 380, width: 20 };
    var pos = computeContextMenuPos(rect, 400, 800, 200, 280);
    expect(pos.left + 200).toBeLessThanOrEqual(400 - 8 + 1);
  });
});

describe("validateDraft", function () {
  it("rejects empty", function () {
    expect(validateDraft("   ").ok).toBe(false);
    expect(validateDraft("").ok).toBe(false);
    expect(validateDraft(null).ok).toBe(false);
  });
  it("trims then accepts", function () {
    var v = validateDraft("  hi  ");
    expect(v.ok).toBe(true);
    expect(v.value).toBe("hi");
  });
  it("flags too long, trims to MESSAGE_MAX", function () {
    var big = "x".repeat(MESSAGE_MAX + 10);
    var v = validateDraft(big);
    expect(v.ok).toBe(false);
    expect(v.value.length).toBe(MESSAGE_MAX);
    expect(v.reason).toBe("too_long");
  });
});

describe("hidden-messages localStorage", function () {
  beforeEach(function () { localStorage.clear(); });
  it("writes + reads round-trip per user", function () {
    writeHiddenMsgs("u1", { a: true });
    expect(readHiddenMsgs("u1")).toEqual({ a: true });
    expect(readHiddenMsgs("u2")).toEqual({});
  });
  it("namespaces by user", function () {
    expect(hiddenMsgsKey("u1")).not.toBe(hiddenMsgsKey("u2"));
  });
  it("survives garbage in storage", function () {
    localStorage.setItem(hiddenMsgsKey("u1"), "not-json");
    expect(readHiddenMsgs("u1")).toEqual({});
  });
  it("filterHiddenMessages excludes hidden ids", function () {
    var msgs = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(filterHiddenMessages(msgs, { b: true }).map(function (m) { return m.id; })).toEqual(["a", "c"]);
  });
});
