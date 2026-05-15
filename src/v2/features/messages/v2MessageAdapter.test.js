// v2MessageAdapter.test.js — PR1 of the v2-messages-wiring series.
// Verifies the V1 → V2 mapping helpers used by MessagesScreen.

import { describe, it, expect } from "vitest";
import {
  convTitle,
  convToV2,
  msgToV2,
  senderName,
  senderInitial,
} from "./v2MessageAdapter.js";

const ME = "uid-me";
const ALEX = "uid-alex";
const BREN = "uid-bren";
const CASS = "uid-cass";

function dmConv(partner, last_message_at, last_preview, last_sender, hasUnread) {
  return {
    id: "c-1",
    isGroup: false,
    status: "accepted",
    partner: partner,
    participants: [{ id: ME, name: "You" }, partner],
    user1_id: ME,
    user2_id: partner.id,
    last_message_at: last_message_at,
    last_message_preview: last_preview,
    last_message_sender_id: last_sender,
    hasUnread: !!hasUnread,
  };
}

function groupConv(participants, last_message_at, last_preview, last_sender, hasUnread) {
  return {
    id: "c-g",
    isGroup: true,
    status: "accepted",
    partner: null,
    participants: participants,
    last_message_at: last_message_at,
    last_message_preview: last_preview,
    last_message_sender_id: last_sender,
    hasUnread: !!hasUnread,
  };
}

describe("convTitle", () => {
  it("returns partner name for 1:1", () => {
    expect(convTitle(dmConv({ id: ALEX, name: "Alex" }, null, "", null, false), ME)).toBe("Alex");
  });
  it("returns single name for group of 2 (one other)", () => {
    expect(convTitle(groupConv([{ id: ME, name: "You" }, { id: ALEX, name: "Alex" }], null, "", null, false), ME)).toBe("Alex");
  });
  it("joins 2 names with &", () => {
    expect(convTitle(groupConv([
      { id: ME, name: "You" },
      { id: ALEX, name: "Alex" },
      { id: BREN, name: "Bren" },
    ], null, "", null, false), ME)).toBe("Alex & Bren");
  });
  it("3 others gets a '& 1 other' suffix", () => {
    expect(convTitle(groupConv([
      { id: ME, name: "You" },
      { id: ALEX, name: "Alex" },
      { id: BREN, name: "Bren" },
      { id: CASS, name: "Cass" },
    ], null, "", null, false), ME)).toBe("Alex, Bren & 1 other");
  });
});

describe("convToV2", () => {
  it("maps a 1:1 with unread", () => {
    var raw = dmConv({ id: ALEX, name: "Alex" }, new Date().toISOString(), "yo", ALEX, true);
    var v2 = convToV2(raw, ME, { pinnedConvIds: [], typingConvs: {} });
    expect(v2.id).toBe("c-1");
    expect(v2.type).toBe("dm");
    expect(v2.name).toBe("Alex");
    expect(v2.unread).toBe(1);
    expect(v2.lastSender).toBe("Alex");
    expect(v2.lastPreview).toBe("yo");
    expect(v2.pinned).toBe(false);
    expect(v2.typing).toBe(false);
    expect(typeof v2.initials).toBe("string");
    expect(typeof v2.color).toBe("string");
  });

  it("labels last sender as 'You' when meId sent it", () => {
    var raw = dmConv({ id: ALEX, name: "Alex" }, new Date().toISOString(), "see ya", ME, false);
    var v2 = convToV2(raw, ME, { pinnedConvIds: [], typingConvs: {} });
    expect(v2.lastSender).toBe("You");
    expect(v2.unread).toBe(0);
  });

  it("reflects pinned + typing state from dmsState", () => {
    var raw = dmConv({ id: ALEX, name: "Alex" }, new Date().toISOString(), "", null, false);
    var v2 = convToV2(raw, ME, { pinnedConvIds: ["c-1"], typingConvs: { "c-1": Date.now() } });
    expect(v2.pinned).toBe(true);
    expect(v2.typing).toBe(true);
  });

  it("maps a group with last sender resolved", () => {
    var raw = groupConv([
      { id: ME, name: "You" },
      { id: ALEX, name: "Alex" },
      { id: BREN, name: "Bren" },
    ], new Date().toISOString(), "hello", BREN, true);
    var v2 = convToV2(raw, ME, { pinnedConvIds: [], typingConvs: {} });
    expect(v2.type).toBe("group");
    expect(v2.name).toBe("Alex & Bren");
    expect(v2.lastSender).toBe("Bren");
  });
});

describe("msgToV2", () => {
  var conv = dmConv({ id: ALEX, name: "Alex" }, null, "", null, false);

  it("marks me-sent rows as side:'me'", () => {
    var v2 = msgToV2({
      id: "m-1", conversation_id: "c-1", sender_id: ME,
      content: "ping", created_at: new Date().toISOString(), deleted_at: null,
    }, conv, ME);
    expect(v2.side).toBe("me");
    expect(v2.from).toBe("You");
    expect(v2.text).toBe("ping");
  });

  it("marks partner rows as side:'them' and uses partner name", () => {
    var v2 = msgToV2({
      id: "m-2", conversation_id: "c-1", sender_id: ALEX,
      content: "pong", created_at: new Date().toISOString(), deleted_at: null,
    }, conv, ME);
    expect(v2.side).toBe("them");
    expect(v2.from).toBe("Alex");
    expect(v2.avatar).toBe("A");
  });

  it("shows 'Message deleted' when deleted_at is set", () => {
    var v2 = msgToV2({
      id: "m-3", conversation_id: "c-1", sender_id: ALEX,
      content: "oops", created_at: new Date().toISOString(),
      deleted_at: new Date().toISOString(),
    }, conv, ME);
    expect(v2.text).toBe("Message deleted");
  });

  it("leaves kind/score/invite/confirm undefined for plain text rows", () => {
    var v2 = msgToV2({
      id: "m-4", conversation_id: "c-1", sender_id: ALEX,
      content: "hi", created_at: new Date().toISOString(), deleted_at: null,
    }, conv, ME);
    expect(v2.kind).toBeUndefined();
    expect(v2.score).toBeUndefined();
    expect(v2.invite).toBeUndefined();
    expect(v2.confirm).toBeUndefined();
  });

  // Slice A of the structured-widgets work — the schema gained
  // kind/payload/entity_id columns (migration 20260516). The adapter
  // now unpacks each known kind onto the bubble prop the v2
  // MessagesScreen.Bubble dispatcher reads.
  it("unpacks a 'score' row onto m.score", () => {
    var row = {
      id: "m-s", conversation_id: "c-1", sender_id: ALEX,
      content: "Final score 6-4 6-3",
      created_at: new Date().toISOString(), deleted_at: null,
      kind: "score", entity_id: "match-xyz",
      payload: { surface: "hard", duration: "1h12", p1: "Alex", p2: "You", sets: [[4,6],[3,6]] },
    };
    var v2 = msgToV2(row, conv, ME);
    expect(v2.kind).toBe("score");
    expect(v2.score.surface).toBe("hard");
    expect(v2.score.sets).toEqual([[4,6],[3,6]]);
    expect(v2.entity_id).toBe("match-xyz");
  });

  it("unpacks an 'invite' row onto m.invite", () => {
    var row = {
      id: "m-i", conversation_id: "c-1", sender_id: ALEX,
      content: "Want to play Sat 9am?", created_at: new Date().toISOString(),
      deleted_at: null,
      kind: "invite", entity_id: "challenge-1",
      payload: { round: "Casual", date: "Sat 9am", court: "Local park", vs: "Alex" },
    };
    var v2 = msgToV2(row, conv, ME);
    expect(v2.kind).toBe("invite");
    expect(v2.invite.date).toBe("Sat 9am");
    expect(v2.invite.vs).toBe("Alex");
    expect(v2.entity_id).toBe("challenge-1");
  });

  it("unpacks a 'confirm' row onto m.confirm", () => {
    var row = {
      id: "m-c", conversation_id: "c-1", sender_id: ALEX,
      content: "Logged 6-4 6-3", created_at: new Date().toISOString(),
      deleted_at: null,
      kind: "confirm", entity_id: "match-xyz",
      payload: { league: "Casual", p1: "Alex", p2: "You", sets: [[6,4],[6,3]] },
    };
    var v2 = msgToV2(row, conv, ME);
    expect(v2.kind).toBe("confirm");
    expect(v2.confirm.league).toBe("Casual");
    expect(v2.confirm.sets).toEqual([[6,4],[6,3]]);
    expect(v2.entity_id).toBe("match-xyz");
  });

  it("falls back to plain text when a structured row is deleted", () => {
    var row = {
      id: "m-d", conversation_id: "c-1", sender_id: ALEX,
      content: "Logged 6-4 6-3", created_at: new Date().toISOString(),
      deleted_at: new Date().toISOString(),
      kind: "confirm", entity_id: "match-xyz",
      payload: { league: "Casual", p1: "Alex", p2: "You", sets: [[6,4],[6,3]] },
    };
    var v2 = msgToV2(row, conv, ME);
    expect(v2.text).toBe("Message deleted");
    expect(v2.kind).toBeUndefined();
    expect(v2.confirm).toBeUndefined();
  });

  it("ignores unknown kinds (forward compatibility)", () => {
    var row = {
      id: "m-u", conversation_id: "c-1", sender_id: ALEX,
      content: "new widget", created_at: new Date().toISOString(),
      deleted_at: null,
      kind: "future_widget", payload: { foo: "bar" },
    };
    var v2 = msgToV2(row, conv, ME);
    expect(v2.kind).toBeUndefined();
    expect(v2.text).toBe("new widget");
  });
});

describe("senderName / senderInitial", () => {
  var conv = dmConv({ id: ALEX, name: "Alex" }, null, "", null, false);
  it("resolves me as 'You'", () => {
    expect(senderName(ME, conv, ME)).toBe("You");
    expect(senderInitial(ME, conv, ME)).toBe("Y");
  });
  it("resolves partner from conv participants", () => {
    expect(senderName(ALEX, conv, ME)).toBe("Alex");
    expect(senderInitial(ALEX, conv, ME)).toBe("A");
  });
  it("falls back to 'Player' for unknown ids", () => {
    expect(senderName("uid-unknown", conv, ME)).toBe("Player");
  });
});
