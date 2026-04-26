// src/lib/analytics.test.js
//
// Module 9.2 — opt-out gate tests. The track() Supabase insert is fire-
// and-forget and we don't want this suite to need a network mock, so
// these tests exercise the opt-out helpers directly. The integration
// behaviour ("track no-ops when opted out") is verified by spying on
// supabase.auth.getUser — if track() short-circuits, getUser is never
// called.

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getAnalyticsOptOut,
  setAnalyticsOptOut,
  track,
  trackView,
} from "./analytics.js";
import { supabase } from "./supabase.js";

describe("analytics opt-out helpers", function () {
  beforeEach(function () {
    try { localStorage.clear(); } catch (_) {}
  });

  it("defaults to opted-IN when nothing is stored", function () {
    expect(getAnalyticsOptOut()).toBe(false);
  });

  it("returns true when localStorage contains '1'", function () {
    localStorage.setItem("cs_analytics_opt_out", "1");
    expect(getAnalyticsOptOut()).toBe(true);
  });

  it("returns true when localStorage contains 'true'", function () {
    localStorage.setItem("cs_analytics_opt_out", "true");
    expect(getAnalyticsOptOut()).toBe(true);
  });

  it("treats other truthy strings as opted IN (strict to '1' / 'true')", function () {
    // Defensive: a stray value should not silently flip the user out.
    localStorage.setItem("cs_analytics_opt_out", "yes");
    expect(getAnalyticsOptOut()).toBe(false);
  });

  it("setAnalyticsOptOut(true) writes '1'", function () {
    setAnalyticsOptOut(true);
    expect(localStorage.getItem("cs_analytics_opt_out")).toBe("1");
    expect(getAnalyticsOptOut()).toBe(true);
  });

  it("setAnalyticsOptOut(false) removes the key (no zombie value)", function () {
    localStorage.setItem("cs_analytics_opt_out", "1");
    setAnalyticsOptOut(false);
    expect(localStorage.getItem("cs_analytics_opt_out")).toBeNull();
    expect(getAnalyticsOptOut()).toBe(false);
  });

  it("round-trips a flip-on then flip-off cleanly", function () {
    setAnalyticsOptOut(true);
    setAnalyticsOptOut(false);
    setAnalyticsOptOut(true);
    expect(getAnalyticsOptOut()).toBe(true);
    setAnalyticsOptOut(false);
    expect(getAnalyticsOptOut()).toBe(false);
  });
});

describe("track() opt-out short-circuit", function () {
  beforeEach(function () {
    try { localStorage.clear(); } catch (_) {}
  });

  it("track() does NOT call supabase.auth.getUser when opted out", function () {
    var spy = vi.spyOn(supabase.auth, "getUser");
    setAnalyticsOptOut(true);
    track("test_event", { foo: "bar" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("track() DOES call supabase.auth.getUser when opted in (default)", function () {
    var spy = vi.spyOn(supabase.auth, "getUser").mockReturnValue(Promise.resolve({ data: { user: null } }));
    track("test_event", { foo: "bar" });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("trackView() also short-circuits on opt-out (delegates to track)", function () {
    var spy = vi.spyOn(supabase.auth, "getUser");
    setAnalyticsOptOut(true);
    trackView("page_viewed", {});
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("track() with empty event name does nothing regardless of opt-out", function () {
    var spy = vi.spyOn(supabase.auth, "getUser");
    track("", {});
    track(null, {});
    track(undefined, {});
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
