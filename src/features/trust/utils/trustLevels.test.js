// src/features/trust/utils/trustLevels.test.js
//
// Module 10 (Slice 2) — visibility-rule tests.
//
// The whole product principle around trust badges is "positive/neutral
// only, never publicly shame." These tests guard the contract so a
// future refactor can't accidentally surface 'new' / 'building' as a
// public chip — that'd read as a soft negative ("they're new, beware")
// even though we picked positive copy.

import { describe, it, expect } from "vitest";
import {
  BADGE_VALUES,
  shouldShowBadgePublic,
  badgeLabel,
  badgeDescription,
  badgeColor,
} from "./trustLevels.js";

describe("BADGE_VALUES", function () {
  it("matches the canonical list locked in the migration's CHECK constraint", function () {
    expect(BADGE_VALUES).toEqual(["new", "building", "responsive", "reliable", "confirmed"]);
  });

  it("does NOT include any negative-tone values", function () {
    var negative = ["flagged", "unreliable", "warning", "bad", "suspicious"];
    negative.forEach(function (v) {
      expect(BADGE_VALUES).not.toContain(v);
    });
  });
});

describe("shouldShowBadgePublic — anti-shame contract", function () {
  it("hides 'new' from public surfaces", function () {
    expect(shouldShowBadgePublic("new")).toBe(false);
  });

  it("hides 'building' from public surfaces", function () {
    expect(shouldShowBadgePublic("building")).toBe(false);
  });

  it("shows 'responsive' on public surfaces", function () {
    expect(shouldShowBadgePublic("responsive")).toBe(true);
  });

  it("shows 'reliable' on public surfaces", function () {
    expect(shouldShowBadgePublic("reliable")).toBe(true);
  });

  it("shows 'confirmed' on public surfaces", function () {
    expect(shouldShowBadgePublic("confirmed")).toBe(true);
  });

  it("returns false for unknown / null / empty values", function () {
    expect(shouldShowBadgePublic(null)).toBe(false);
    expect(shouldShowBadgePublic(undefined)).toBe(false);
    expect(shouldShowBadgePublic("")).toBe(false);
    expect(shouldShowBadgePublic("flagged")).toBe(false);
    expect(shouldShowBadgePublic("anything-else")).toBe(false);
  });
});

describe("badgeLabel — positive-only copy", function () {
  it("returns short labels for the three public badges", function () {
    expect(badgeLabel("responsive")).toBe("Responsive");
    expect(badgeLabel("reliable")).toBe("Reliable");
    expect(badgeLabel("confirmed")).toBe("Confirmed");
  });

  it("returns labels for hidden badges (used by self-view)", function () {
    expect(badgeLabel("building")).toBe("Building history");
    expect(badgeLabel("new")).toBe("New player");
  });

  it("returns empty string for unknown badges (defensive)", function () {
    expect(badgeLabel(null)).toBe("");
    expect(badgeLabel("flagged")).toBe("");
  });

  it("never returns a negative-tone label", function () {
    BADGE_VALUES.forEach(function (b) {
      var label = badgeLabel(b).toLowerCase();
      ["bad", "warning", "fail", "unreliable", "no-show", "flag"].forEach(function (neg) {
        expect(label).not.toContain(neg);
      });
    });
  });
});

describe("badgeDescription — speaks positively", function () {
  it("returns a description for every public badge", function () {
    ["confirmed", "reliable", "responsive", "building", "new"].forEach(function (b) {
      expect(badgeDescription(b).length).toBeGreaterThan(0);
    });
  });

  it("returns empty for unknown badges", function () {
    expect(badgeDescription("flagged")).toBe("");
  });

  it("never includes negative descriptors", function () {
    BADGE_VALUES.forEach(function (b) {
      var desc = badgeDescription(b).toLowerCase();
      ["unreliable", "bad ", "warning", "no-show", "suspicious"].forEach(function (neg) {
        expect(desc).not.toContain(neg);
      });
    });
  });
});

describe("badgeColor — theme-aware token resolution", function () {
  // Minimal fake theme — real makeTheme() returns these named keys.
  var fakeTheme = {
    accent:        "#006F4A",
    text:          "#1A2A1E",
    textSecondary: "#4C5C50",
    textTertiary:  "#8A9C8E",
  };

  it("uses accent for confirmed (highest signal)", function () {
    expect(badgeColor(fakeTheme, "confirmed")).toBe(fakeTheme.accent);
  });

  it("uses text for reliable", function () {
    expect(badgeColor(fakeTheme, "reliable")).toBe(fakeTheme.text);
  });

  it("uses textSecondary for responsive", function () {
    expect(badgeColor(fakeTheme, "responsive")).toBe(fakeTheme.textSecondary);
  });

  it("uses textTertiary for hidden badges (defensive: badge wouldn't render)", function () {
    expect(badgeColor(fakeTheme, "building")).toBe(fakeTheme.textTertiary);
    expect(badgeColor(fakeTheme, "new")).toBe(fakeTheme.textTertiary);
  });

  it("returns null when theme is missing (avoid throwing in unhydrated render)", function () {
    expect(badgeColor(null, "confirmed")).toBeNull();
    expect(badgeColor(undefined, "reliable")).toBeNull();
  });
});
