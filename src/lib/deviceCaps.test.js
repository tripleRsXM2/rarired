// src/lib/deviceCaps.test.js
//
// Pure-function detection tests. Every helper takes a (nav, win) pair
// so we can fake the environment without touching jsdom globals.

import { describe, it, expect } from "vitest";
import {
  isIOS,
  isAndroid,
  getIOSVersion,
  isSupportedIOSForWebPush,
  isStandalonePWA,
  supportsServiceWorker,
  supportsNotifications,
  supportsPush,
  couldSupportPush,
  supportsBadging,
  getBrowserType,
  getDeviceType,
  deviceSnapshot,
} from "./deviceCaps.js";

// Fake builders ──────────────────────────────────────────────────────

function nav(opts) {
  return Object.assign({
    userAgent: "",
    platform: "",
    maxTouchPoints: 0,
  }, opts || {});
}
function win(opts) {
  opts = opts || {};
  var w = {
    matchMedia: opts.matchMedia || (function () { return { matches: false }; }),
  };
  // Honour explicit undefined as "key absent" so `'Notification' in w`
  // reads false. Object.assign keeps undefined values as own properties.
  if (!Object.prototype.hasOwnProperty.call(opts, "Notification")) w.Notification = function () {};
  else if (opts.Notification != null) w.Notification = opts.Notification;
  if (!Object.prototype.hasOwnProperty.call(opts, "PushManager")) w.PushManager = function () {};
  else if (opts.PushManager != null) w.PushManager = opts.PushManager;
  return w;
}
// Common fake user-agent strings
var UA_IPHONE_17 = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
var UA_IPHONE_16_4 = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15";
var UA_IPHONE_15 = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15";
var UA_IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
var UA_ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
var UA_DESKTOP_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
var UA_SAMSUNG = "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/22.0 Chrome/115.0.0.0 Mobile Safari/537.36";

// ─────────────────────────────────────────────────────────────────────
// Platform detection
// ─────────────────────────────────────────────────────────────────────

describe("isIOS", function () {
  it("iPhone UA → true", function () { expect(isIOS(nav({ userAgent: UA_IPHONE_17 }))).toBe(true); });
  it("Android UA → false", function () { expect(isIOS(nav({ userAgent: UA_ANDROID_CHROME }))).toBe(false); });
  it("Desktop Chrome → false", function () { expect(isIOS(nav({ userAgent: UA_DESKTOP_CHROME }))).toBe(false); });
  it("iPadOS desktop-mode (MacIntel + touch) → true", function () {
    expect(isIOS(nav({ userAgent: UA_IPAD_DESKTOP, platform: "MacIntel", maxTouchPoints: 5 }))).toBe(true);
  });
  it("Real Mac (MacIntel, no touch) → false", function () {
    expect(isIOS(nav({ userAgent: UA_DESKTOP_CHROME, platform: "MacIntel", maxTouchPoints: 0 }))).toBe(false);
  });
});

describe("isAndroid", function () {
  it("Android UA → true",  function () { expect(isAndroid(nav({ userAgent: UA_ANDROID_CHROME }))).toBe(true); });
  it("iPhone UA → false",   function () { expect(isAndroid(nav({ userAgent: UA_IPHONE_17 }))).toBe(false); });
});

// ─────────────────────────────────────────────────────────────────────
// iOS version + supported-for-web-push
// ─────────────────────────────────────────────────────────────────────

describe("getIOSVersion", function () {
  it("17.2 parses",      function () { expect(getIOSVersion(nav({ userAgent: UA_IPHONE_17 }))).toEqual({ major: 17, minor: 2 }); });
  it("16.4 parses",      function () { expect(getIOSVersion(nav({ userAgent: UA_IPHONE_16_4 }))).toEqual({ major: 16, minor: 4 }); });
  it("15.5 parses",      function () { expect(getIOSVersion(nav({ userAgent: UA_IPHONE_15 }))).toEqual({ major: 15, minor: 5 }); });
  it("non-iOS → null",   function () { expect(getIOSVersion(nav({ userAgent: UA_ANDROID_CHROME }))).toBe(null); });
  it("iPadOS desktop UA returns null (no version segment)", function () {
    expect(getIOSVersion(nav({ userAgent: UA_IPAD_DESKTOP, platform: "MacIntel", maxTouchPoints: 5 }))).toBe(null);
  });
});

describe("isSupportedIOSForWebPush", function () {
  it("17.2 → true", function () { expect(isSupportedIOSForWebPush(nav({ userAgent: UA_IPHONE_17 }))).toBe(true); });
  it("16.4 → true", function () { expect(isSupportedIOSForWebPush(nav({ userAgent: UA_IPHONE_16_4 }))).toBe(true); });
  it("15.5 → false", function () { expect(isSupportedIOSForWebPush(nav({ userAgent: UA_IPHONE_15 }))).toBe(false); });
  it("Android → false", function () { expect(isSupportedIOSForWebPush(nav({ userAgent: UA_ANDROID_CHROME }))).toBe(false); });
  it("iPadOS desktop-mode (no version) → permissive true", function () {
    expect(isSupportedIOSForWebPush(nav({ userAgent: UA_IPAD_DESKTOP, platform: "MacIntel", maxTouchPoints: 5 }))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Standalone / capabilities
// ─────────────────────────────────────────────────────────────────────

describe("isStandalonePWA", function () {
  it("iOS standalone navigator flag → true", function () {
    expect(isStandalonePWA(nav({ userAgent: UA_IPHONE_17, standalone: true }), win())).toBe(true);
  });
  it("Android display-mode standalone → true", function () {
    var w = win({ matchMedia: function () { return { matches: true }; } });
    expect(isStandalonePWA(nav({ userAgent: UA_ANDROID_CHROME }), w)).toBe(true);
  });
  it("Plain browser tab → false", function () {
    expect(isStandalonePWA(nav({ userAgent: UA_DESKTOP_CHROME }), win())).toBe(false);
  });
});

describe("supports*", function () {
  it("supportsServiceWorker true when serviceWorker in navigator", function () {
    expect(supportsServiceWorker(Object.assign(nav(), { serviceWorker: {} }))).toBe(true);
  });
  it("supportsServiceWorker false when missing", function () {
    expect(supportsServiceWorker(nav())).toBe(false);
  });
  it("supportsNotifications follows window.Notification", function () {
    expect(supportsNotifications(win())).toBe(true);
    expect(supportsNotifications(win({ Notification: undefined }))).toBe(false);
  });
});

describe("supportsPush", function () {
  it("Android Chrome (modern) → true", function () {
    var n = Object.assign(nav({ userAgent: UA_ANDROID_CHROME }), { serviceWorker: {} });
    expect(supportsPush(n, win())).toBe(true);
  });
  it("Desktop Chrome → true", function () {
    var n = Object.assign(nav({ userAgent: UA_DESKTOP_CHROME }), { serviceWorker: {} });
    expect(supportsPush(n, win())).toBe(true);
  });
  it("iPhone 17 in Safari tab (not installed) → false (needs PWA)", function () {
    var n = Object.assign(nav({ userAgent: UA_IPHONE_17 }), { serviceWorker: {} });
    expect(supportsPush(n, win())).toBe(false);
  });
  it("iPhone 17 installed PWA → true", function () {
    var n = Object.assign(nav({ userAgent: UA_IPHONE_17, standalone: true }), { serviceWorker: {} });
    expect(supportsPush(n, win())).toBe(true);
  });
  it("iPhone 15.5 even installed → false (OS too old)", function () {
    var n = Object.assign(nav({ userAgent: UA_IPHONE_15, standalone: true }), { serviceWorker: {} });
    expect(supportsPush(n, win())).toBe(false);
  });
  it("Browser without PushManager → false", function () {
    var n = Object.assign(nav({ userAgent: UA_DESKTOP_CHROME }), { serviceWorker: {} });
    expect(supportsPush(n, win({ PushManager: undefined }))).toBe(false);
  });
});

describe("couldSupportPush", function () {
  it("iPhone 17 in Safari tab → true (we want to nudge install)", function () {
    var n = Object.assign(nav({ userAgent: UA_IPHONE_17 }), { serviceWorker: {} });
    expect(couldSupportPush(n, win())).toBe(true);
  });
  it("iPhone 15.5 → false even before install", function () {
    var n = Object.assign(nav({ userAgent: UA_IPHONE_15 }), { serviceWorker: {} });
    expect(couldSupportPush(n, win())).toBe(false);
  });
  it("No service worker → false", function () {
    expect(couldSupportPush(nav(), win())).toBe(false);
  });
});

describe("supportsBadging", function () {
  it("setAppBadge present → true", function () {
    expect(supportsBadging(Object.assign(nav(), { setAppBadge: function () {}, clearAppBadge: function () {} }))).toBe(true);
  });
  it("missing → false", function () {
    expect(supportsBadging(nav())).toBe(false);
  });
});

describe("getBrowserType", function () {
  it("Chrome on Android",  function () { expect(getBrowserType(nav({ userAgent: UA_ANDROID_CHROME }))).toBe("chrome"); });
  it("Samsung Internet",   function () { expect(getBrowserType(nav({ userAgent: UA_SAMSUNG }))).toBe("samsung"); });
  it("Safari (Mac)",       function () { expect(getBrowserType(nav({ userAgent: UA_IPAD_DESKTOP }))).toBe("safari"); });
  it("Unknown UA",         function () { expect(getBrowserType(nav({ userAgent: "" }))).toBe("unknown"); });
});

describe("getDeviceType", function () {
  it("ios",     function () { expect(getDeviceType(nav({ userAgent: UA_IPHONE_17 }))).toBe("ios"); });
  it("android", function () { expect(getDeviceType(nav({ userAgent: UA_ANDROID_CHROME }))).toBe("android"); });
  it("desktop", function () { expect(getDeviceType(nav({ userAgent: UA_DESKTOP_CHROME }))).toBe("desktop"); });
});

describe("deviceSnapshot", function () {
  it("returns ua + device + browser + standalone for android tab", function () {
    var snap = deviceSnapshot(nav({ userAgent: UA_ANDROID_CHROME }), win());
    expect(snap).toEqual({
      user_agent: UA_ANDROID_CHROME,
      device_type: "android",
      browser: "chrome",
      is_standalone_pwa: false,
    });
  });
  it("flags standalone PWA on iOS", function () {
    var snap = deviceSnapshot(nav({ userAgent: UA_IPHONE_17, standalone: true }), win());
    expect(snap.is_standalone_pwa).toBe(true);
    expect(snap.device_type).toBe("ios");
  });
});
