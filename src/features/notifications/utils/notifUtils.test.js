// src/features/notifications/utils/notifUtils.test.js
//
// Module 11 Slice 2 — locks the lifecycle filter contract.
//
// The whole notification centre's "what's visible right now" question
// reduces to isActiveForUser(n). These tests keep the rule honest.

import { describe, it, expect } from "vitest";
import {
  isActionable,
  isActiveForUser,
  countsAsUnread,
  groupNotifications,
} from "./notifUtils.js";
import { NOTIF_TYPES, getTypeMeta, isVisibleInCentre } from "../types.js";

// ─────────────────────────────────────────────────────────────────────
// Type registry contract
// ─────────────────────────────────────────────────────────────────────

describe("NOTIF_TYPES registry", function () {
  it("is keyed by every type the migration backfills entity_type for", function () {
    var sqlMigrationTypes = [
      "match_tag", "match_disputed", "match_correction_requested",
      "match_counter_proposed", "match_corrected", "match_confirmed",
      "match_voided", "match_expired", "match_deleted", "match_reminder",
      "casual_match_logged",
      "match_invite_claimed", "match_invite_declined",
      "friend_request", "request_accepted",
      "message_request", "message_request_accepted", "message",
      "challenge_received", "challenge_accepted", "challenge_declined", "challenge_expired",
      "league_invite", "league_joined",
      "like", "comment",
    ];
    sqlMigrationTypes.forEach(function (type) {
      expect(NOTIF_TYPES[type], "registry missing " + type).toBeTruthy();
    });
  });

  it("flags exactly the action_required types Slice 1 backfilled true", function () {
    // Mirrors the SQL CASE in 20260427_notification_lifecycle_v1.sql.
    var expectedActionable = [
      "match_tag", "match_disputed", "match_correction_requested",
      "match_counter_proposed", "match_reminder",
      "friend_request", "message_request", "challenge_received",
    ];
    expectedActionable.forEach(function (type) {
      expect(NOTIF_TYPES[type].action_required, type + " should be actionable").toBe(true);
    });
    // Spot-check a few that should NOT be actionable.
    ["match_confirmed", "casual_match_logged", "like", "league_joined", "request_accepted"]
      .forEach(function (type) {
        expect(NOTIF_TYPES[type].action_required, type + " should NOT be actionable").toBe(false);
      });
  });

  it("getTypeMeta returns UNKNOWN_TYPE for unregistered types (defensive)", function () {
    var meta = getTypeMeta("totally_made_up_type");
    expect(meta).toBeTruthy();
    expect(meta.action_required).toBe(false);
    expect(meta.entity_type).toBe(null);
  });

  it("isVisibleInCentre filters out 'message' (DM unread surfaces via People nav)", function () {
    expect(isVisibleInCentre("message")).toBe(false);
    expect(isVisibleInCentre("match_tag")).toBe(true);
    expect(isVisibleInCentre("challenge_received")).toBe(true);
  });

  it("renotify_on_update is false for every V1 type", function () {
    // V1 contract: re-firing an active row never re-pushes. Future
    // types that need this (e.g. dispute escalation) should set it
    // explicitly + add a test here proving they did so.
    Object.keys(NOTIF_TYPES).forEach(function (type) {
      expect(NOTIF_TYPES[type].renotify_on_update, type).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// isActionable
// ─────────────────────────────────────────────────────────────────────

describe("isActionable", function () {
  it("true for unresolved match_tag", function () {
    expect(isActionable({ type: "match_tag" })).toBe(true);
  });

  it("false once resolved_at is set", function () {
    expect(isActionable({ type: "match_tag", resolved_at: "2026-01-01" })).toBe(false);
  });

  it("false for informational types regardless of read state", function () {
    expect(isActionable({ type: "match_confirmed" })).toBe(false);
    expect(isActionable({ type: "casual_match_logged" })).toBe(false);
    expect(isActionable({ type: "like" })).toBe(false);
  });

  it("false for unknown types", function () {
    expect(isActionable({ type: "totally_made_up" })).toBe(false);
    expect(isActionable(null)).toBe(false);
    expect(isActionable(undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// isActiveForUser — THE canonical centre filter
// ─────────────────────────────────────────────────────────────────────

describe("isActiveForUser", function () {
  it("hides 'message' notifications (DM unread lives elsewhere)", function () {
    expect(isActiveForUser({ type: "message" })).toBe(false);
  });

  it("hides resolved rows", function () {
    expect(isActiveForUser({ type: "match_tag", resolved_at: "2026-01-01" })).toBe(false);
    expect(isActiveForUser({ type: "match_confirmed", resolved_at: "2026-01-01" })).toBe(false);
  });

  it("hides dismissed rows", function () {
    expect(isActiveForUser({ type: "match_confirmed", dismissed_at: "2026-01-01" })).toBe(false);
  });

  it("hides expired rows past their window", function () {
    var pastIso = new Date(Date.now() - 60_000).toISOString();
    expect(isActiveForUser({ type: "match_tag", expires_at: pastIso })).toBe(false);
  });

  it("keeps actionable rows visible AFTER read (until resolved)", function () {
    // The whole point of the lifecycle: opening a match_tag doesn't
    // hide it. The user still owes a response.
    expect(isActiveForUser({
      type: "match_tag",
      read_at: "2026-01-01T00:00:00Z",
      read: true,
    })).toBe(true);
  });

  it("hides informational rows once read_at is set", function () {
    expect(isActiveForUser({
      type: "match_confirmed",
      read_at: "2026-01-01T00:00:00Z",
    })).toBe(false);
  });

  it("hides informational rows with legacy read=true (no read_at)", function () {
    // Backward compat: pre-Slice-1 rows have read=true but no read_at.
    expect(isActiveForUser({ type: "match_confirmed", read: true })).toBe(false);
  });

  it("keeps unread informational rows visible", function () {
    expect(isActiveForUser({ type: "match_confirmed" })).toBe(true);
    expect(isActiveForUser({ type: "casual_match_logged" })).toBe(true);
  });

  it("returns false for null / undefined", function () {
    expect(isActiveForUser(null)).toBe(false);
    expect(isActiveForUser(undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// countsAsUnread — badge count rule
// ─────────────────────────────────────────────────────────────────────

describe("countsAsUnread", function () {
  it("counts unresolved actionable AFTER read (still needs attention)", function () {
    expect(countsAsUnread({
      type: "match_tag",
      read_at: "2026-01-01T00:00:00Z",
    })).toBe(true);
  });

  it("does NOT count read informational", function () {
    expect(countsAsUnread({
      type: "match_confirmed",
      read_at: "2026-01-01T00:00:00Z",
    })).toBe(false);
  });

  it("counts unread informational", function () {
    expect(countsAsUnread({ type: "match_confirmed" })).toBe(true);
  });

  it("does NOT count resolved", function () {
    expect(countsAsUnread({ type: "match_tag", resolved_at: "2026-01-01" })).toBe(false);
  });

  it("does NOT count dismissed", function () {
    expect(countsAsUnread({ type: "match_confirmed", dismissed_at: "2026-01-01" })).toBe(false);
  });

  it("does NOT count expired", function () {
    var past = new Date(Date.now() - 60_000).toISOString();
    expect(countsAsUnread({ type: "match_tag", expires_at: past })).toBe(false);
  });

  it("does NOT count 'message' rows (DM badge owned by People nav)", function () {
    expect(countsAsUnread({ type: "message" })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// groupNotifications — single list, actionables soft-pinned, no sections
// ─────────────────────────────────────────────────────────────────────

describe("groupNotifications", function () {
  it("filters out resolved/dismissed/expired rows before rendering", function () {
    var input = [
      { id: "a", type: "match_confirmed", created_at: "2026-04-01T00:00:00Z" },
      { id: "b", type: "match_confirmed", resolved_at: "2026-04-01T00:00:00Z", created_at: "2026-04-02T00:00:00Z" },
      { id: "c", type: "match_confirmed", dismissed_at: "2026-04-01T00:00:00Z", created_at: "2026-04-03T00:00:00Z" },
    ];
    var items = groupNotifications(input);
    expect(items.length).toBe(1);
    expect(items[0].n.id).toBe("a");
  });

  it("soft-pins unresolved actionables above newer informational rows", function () {
    var input = [
      // Newer informational
      { id: "info", type: "match_confirmed", created_at: "2026-04-10T00:00:00Z" },
      // Older but unresolved actionable
      { id: "act",  type: "match_tag",       created_at: "2026-04-01T00:00:00Z" },
    ];
    var items = groupNotifications(input);
    expect(items[0].n.id).toBe("act");
    expect(items[1].n.id).toBe("info");
  });

  it("returns newest first when both rows are the same lifecycle class", function () {
    var input = [
      { id: "old", type: "match_confirmed", created_at: "2026-04-01T00:00:00Z" },
      { id: "new", type: "match_confirmed", created_at: "2026-04-10T00:00:00Z" },
    ];
    var items = groupNotifications(input);
    expect(items[0].n.id).toBe("new");
    expect(items[1].n.id).toBe("old");
  });

  it("collapses 2+ likes on the same match into a like_group", function () {
    var input = [
      { id: "l1", type: "like", match_id: "M1", created_at: "2026-04-01" },
      { id: "l2", type: "like", match_id: "M1", created_at: "2026-04-02" },
      { id: "l3", type: "like", match_id: "M2", created_at: "2026-04-01" },  // different match → single
    ];
    var items = groupNotifications(input);
    var groups  = items.filter(function (i) { return i.kind === "like_group"; });
    var singles = items.filter(function (i) { return i.kind === "single"; });
    expect(groups.length).toBe(1);
    expect(groups[0].items.length).toBe(2);
    expect(singles.length).toBe(1);
  });

  it("collapses 2+ comments on the same match into a comment_group", function () {
    var input = [
      { id: "c1", type: "comment", match_id: "M1", created_at: "2026-04-01" },
      { id: "c2", type: "comment", match_id: "M1", created_at: "2026-04-02" },
    ];
    var items = groupNotifications(input);
    expect(items.length).toBe(1);
    expect(items[0].kind).toBe("comment_group");
  });

  it("threads dispute-family rows for the same match into one item", function () {
    var input = [
      { id: "tag", type: "match_tag",       match_id: "M1", created_at: "2026-04-01" },
      { id: "cnf", type: "match_confirmed", match_id: "M1", created_at: "2026-04-02" },
    ];
    var items = groupNotifications(input);
    expect(items.length).toBe(1);
    expect(items[0].kind).toBe("thread");
    // Primary should be the unresolved actionable (the tag), since the
    // confirmed row is informational; both stay alive in the thread.
    expect(items[0].primary.id).toBe("tag");
    expect(items[0].context.length).toBe(1);
    expect(items[0].context[0].id).toBe("cnf");
  });

  it("excludes 'message' rows from the centre entirely", function () {
    var input = [
      { id: "m", type: "message", match_id: "C1", created_at: "2026-04-10" },
      { id: "n", type: "match_confirmed", created_at: "2026-04-09" },
    ];
    var items = groupNotifications(input);
    expect(items.length).toBe(1);
    expect(items[0].n.id).toBe("n");
  });
});
