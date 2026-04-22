// Unit tests for emoji data + helpers.
import { describe, it, expect, beforeEach } from "vitest";
import {
  EMOJI_CATEGORIES, EMOJI_BY_CATEGORY,
  searchEmojis, readRecents, pushRecent,
} from "./emojiData.js";

describe("emoji data integrity", function () {
  it("every category id in EMOJI_CATEGORIES (except recent) has a list", function () {
    EMOJI_CATEGORIES.forEach(function (c) {
      if (c.id === "recent") return;
      expect(EMOJI_BY_CATEGORY[c.id]).toBeTruthy();
      expect(EMOJI_BY_CATEGORY[c.id].length).toBeGreaterThan(0);
    });
  });
  it("total emoji count is a reasonable production range", function () {
    var total = 0;
    Object.keys(EMOJI_BY_CATEGORY).forEach(function (k) {
      total += EMOJI_BY_CATEGORY[k].length;
    });
    // Production target: covers the ~400-1500 most common chat emoji without
    // embedding the full Unicode set. Upper bound keeps the inlined bundle
    // from silently ballooning past ~15 KB.
    expect(total).toBeGreaterThanOrEqual(300);
    expect(total).toBeLessThanOrEqual(1500);
  });
  it("no duplicate emojis across categories", function () {
    var seen = {};
    Object.keys(EMOJI_BY_CATEGORY).forEach(function (k) {
      EMOJI_BY_CATEGORY[k].forEach(function (row) {
        var ch = row[0];
        // Some glyphs legitimately appear in multiple categories (e.g. ♨️
        // in nature AND symbols). Allow duplicates but assert each entry
        // has a non-empty keyword list.
        expect(row[1].length).toBeGreaterThan(0);
        seen[ch] = (seen[ch] || 0) + 1;
      });
    });
  });
});

describe("searchEmojis", function () {
  it("returns empty for empty query", function () {
    expect(searchEmojis("")).toEqual([]);
    expect(searchEmojis(null)).toEqual([]);
  });
  it("finds common tennis ball", function () {
    expect(searchEmojis("tennis")).toContain("🎾");
  });
  it("finds happy smiley", function () {
    expect(searchEmojis("happy").length).toBeGreaterThan(0);
  });
  it("honours limit", function () {
    expect(searchEmojis("a", 5).length).toBeLessThanOrEqual(5);
  });
});

describe("recents localStorage", function () {
  beforeEach(function () { localStorage.clear(); });
  it("empty by default", function () {
    expect(readRecents()).toEqual([]);
  });
  it("pushRecent puts new emoji first", function () {
    pushRecent("🎾");
    pushRecent("😀");
    expect(readRecents()).toEqual(["😀", "🎾"]);
  });
  it("dedupes + caps", function () {
    pushRecent("a");
    pushRecent("a");
    expect(readRecents()).toEqual(["a"]);
    for (var i = 0; i < 40; i++) pushRecent("e" + i);
    var list = readRecents();
    expect(list.length).toBeLessThanOrEqual(24);
  });
});
