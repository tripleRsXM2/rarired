// src/features/scoring/utils/inviteUrl.test.js
//
// Pure-function tests for the invite URL helpers.

import { describe, it, expect } from "vitest";
import {
  buildInviteUrl,
  parseInvitePath,
  isValidTokenShape,
  buildShareText,
} from "./inviteUrl.js";

var SAMPLE_TOKEN = "abcDEF123-_xyzABCdef456ghiJKL789mnoPQRstuVWX";  // 43 chars, base64url

describe("isValidTokenShape", function () {
  it("accepts a 43-char base64url token", function () {
    expect(isValidTokenShape(SAMPLE_TOKEN)).toBe(true);
  });
  it("rejects too-short tokens", function () {
    expect(isValidTokenShape("abc123")).toBe(false);
  });
  it("rejects tokens with '+' or '/' (not URL-safe)", function () {
    expect(isValidTokenShape("aaaaaaaaaaaaaaaa+aaaa")).toBe(false);
    expect(isValidTokenShape("aaaaaaaaaaaaaaaa/aaaa")).toBe(false);
  });
  it("rejects null / undefined / non-string", function () {
    expect(isValidTokenShape(null)).toBe(false);
    expect(isValidTokenShape(undefined)).toBe(false);
    expect(isValidTokenShape(42)).toBe(false);
  });
  it("rejects empty string", function () {
    expect(isValidTokenShape("")).toBe(false);
  });
});

describe("buildInviteUrl", function () {
  it("composes origin + /invite/match/ + token", function () {
    expect(buildInviteUrl(SAMPLE_TOKEN, "https://courtsync.app"))
      .toBe("https://courtsync.app/invite/match/" + SAMPLE_TOKEN);
  });
  it("returns null for a malformed token", function () {
    expect(buildInviteUrl("nope", "https://courtsync.app")).toBe(null);
  });
});

describe("parseInvitePath", function () {
  it("extracts the token from /invite/match/<token>", function () {
    expect(parseInvitePath("/invite/match/" + SAMPLE_TOKEN)).toBe(SAMPLE_TOKEN);
  });
  it("strips trailing slash", function () {
    expect(parseInvitePath("/invite/match/" + SAMPLE_TOKEN + "/")).toBe(SAMPLE_TOKEN);
  });
  it("strips ? query and # fragment", function () {
    expect(parseInvitePath("/invite/match/" + SAMPLE_TOKEN + "?foo=bar")).toBe(SAMPLE_TOKEN);
    expect(parseInvitePath("/invite/match/" + SAMPLE_TOKEN + "#section")).toBe(SAMPLE_TOKEN);
  });
  it("returns null for non-invite paths", function () {
    expect(parseInvitePath("/home")).toBe(null);
    expect(parseInvitePath("/invite")).toBe(null);
    expect(parseInvitePath("/invite/match/")).toBe(null);
  });
  it("returns null when the trailing segment isn't token-shaped", function () {
    expect(parseInvitePath("/invite/match/short")).toBe(null);
  });
  it("returns null on null / empty input", function () {
    expect(parseInvitePath(null)).toBe(null);
    expect(parseInvitePath("")).toBe(null);
  });
});

describe("buildShareText", function () {
  it("includes logger + URL", function () {
    var s = buildShareText("Mikey T", "Stranger Sam", "https://x.app/invite/match/abc");
    expect(s).toContain("Mikey T");
    expect(s).toContain("https://x.app/invite/match/abc");
    expect(s).toContain("CourtSync");
  });
  it("falls back to 'A friend' when logger missing", function () {
    var s = buildShareText("", "Sam", "https://x.app/invite/match/abc");
    expect(s).toContain("A friend");
  });
});
