// Locks the local profile cache that backs the "instant names" Phase 1
// stub in useDMs. If this regresses, the messages list flashes
// "Loading…" on every cold load — which the user explicitly reported.

import { describe, it, expect, beforeEach } from "vitest";
import {
  getCachedProfile,
  getCachedProfiles,
  setCachedProfiles,
  clearProfileCache,
} from "./profileCache.js";

var KEY = "courtsync.profileCache.v1";

describe("profileCache", function () {
  beforeEach(function () {
    localStorage.clear();
  });

  it("setCachedProfiles + getCachedProfile round-trips id → name", function () {
    setCachedProfiles([{ id: "u1", name: "Alex", avatar: "AX", avatar_url: null, skill: "3.5", suburb: "Bondi" }]);
    var p = getCachedProfile("u1");
    expect(p).toBeTruthy();
    expect(p.id).toBe("u1");
    expect(p.name).toBe("Alex");
    expect(p.avatar).toBe("AX");
    expect(p.skill).toBe("3.5");
    expect(p.suburb).toBe("Bondi");
    expect(typeof p._cachedAt).toBe("number");
  });

  it("getCachedProfiles returns a map keyed by id, missing ids omitted", function () {
    setCachedProfiles([
      { id: "u1", name: "Alex" },
      { id: "u2", name: "Sam" },
    ]);
    var map = getCachedProfiles(["u1", "u2", "u-missing"]);
    expect(map.u1.name).toBe("Alex");
    expect(map.u2.name).toBe("Sam");
    expect(map["u-missing"]).toBeUndefined();
  });

  it("evicts FIFO past MAX_ENTRIES (501 set, oldest gone)", function () {
    var batch = [];
    for (var i = 0; i < 501; i++) {
      batch.push({ id: "u" + i, name: "Player " + i });
    }
    // Insert one at a time so insertion order is deterministic — a single
    // setCachedProfiles call also preserves order, but stepping makes the
    // FIFO assertion unambiguous.
    batch.forEach(function (p) { setCachedProfiles([p]); });

    expect(getCachedProfile("u0")).toBeNull();         // oldest evicted
    expect(getCachedProfile("u1")).toBeTruthy();       // next-oldest kept
    expect(getCachedProfile("u500")).toBeTruthy();     // newest kept
  });

  it("getCachedProfile returns null for unknown id", function () {
    expect(getCachedProfile("nope")).toBeNull();
    expect(getCachedProfile(null)).toBeNull();
    expect(getCachedProfile(undefined)).toBeNull();
  });

  it("tolerates malformed localStorage payload — no throw, returns null", function () {
    localStorage.setItem(KEY, "{not-valid-json");
    expect(function () { getCachedProfile("u1"); }).not.toThrow();
    expect(getCachedProfile("u1")).toBeNull();
    // And a subsequent write recovers cleanly.
    setCachedProfiles([{ id: "u1", name: "Alex" }]);
    expect(getCachedProfile("u1").name).toBe("Alex");
  });

  it("ignores entries without an id", function () {
    setCachedProfiles([{ name: "Nameless" }, null, undefined, { id: "u1", name: "Alex" }]);
    expect(getCachedProfile("u1").name).toBe("Alex");
  });

  it("clearProfileCache wipes the store", function () {
    setCachedProfiles([{ id: "u1", name: "Alex" }]);
    clearProfileCache();
    expect(getCachedProfile("u1")).toBeNull();
  });

  it("re-write of an existing id updates in place (no double-evict)", function () {
    setCachedProfiles([{ id: "u1", name: "Alex" }]);
    setCachedProfiles([{ id: "u1", name: "Alex Z" }]);
    expect(getCachedProfile("u1").name).toBe("Alex Z");
  });
});
