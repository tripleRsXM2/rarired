// src/lib/deviceCaps.js
//
// Device + capability detection for the push-notification flow.
// Pure functions — every detector takes a `nav` (navigator-like) and
// `win` (window-like) parameter so we can unit-test without jsdom
// patching every property. Production callers pass nothing and they
// default to the live `navigator` / `window`.
//
// Why custom detection (not a UA library): the spec wants tight rules
// for iOS/iPadOS Web Push (≥16.4 + Home-Screen PWA) and we don't want
// to ship a 30 KB UA parser to a few-hundred-byte detection job.
//
// Every helper here is read-only and side-effect free. The actual
// PushManager subscribe/unsubscribe lives in src/lib/pushClient.js.

/* global navigator, window */

function getNav(nav) { return nav || (typeof navigator !== "undefined" ? navigator : null); }
function getWin(win) { return win || (typeof window !== "undefined" ? window : null); }

// ─────────────────────────────────────────────────────────────────────
// Platform detection
// ─────────────────────────────────────────────────────────────────────

// iOS or iPadOS. iPadOS reports as "MacIntel" + has touch — we sniff
// `MacIntel + maxTouchPoints > 1` so newer iPads aren't misidentified
// as desktop Safari.
export function isIOS(nav) {
  var n = getNav(nav);
  if (!n) return false;
  var ua = n.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS desktop-mode quirk
  if (n.platform === "MacIntel" && (n.maxTouchPoints || 0) > 1) return true;
  return false;
}

export function isAndroid(nav) {
  var n = getNav(nav);
  if (!n) return false;
  return /Android/i.test(n.userAgent || "");
}

// Returns { major, minor } | null. Reads "OS X 16_4" / "iPhone OS 17_2"
// segments out of the UA. Best-effort — Apple doesn't expose a clean
// API and the UA can be spoofed.
export function getIOSVersion(nav) {
  var n = getNav(nav);
  if (!n || !isIOS(n)) return null;
  var ua = n.userAgent || "";
  // Standard form: "OS 16_4_1" / "OS 17_0"
  var m = ua.match(/OS (\d+)_(\d+)(?:_(\d+))?/);
  if (!m) {
    // iPadOS desktop-mode UA: doesn't carry "OS X..", so we can't read
    // the version. Treat as "unknown" — caller falls back to letting
    // the user attempt enable, browser will reject if unsupported.
    return null;
  }
  return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10) };
}

// iOS/iPadOS Web Push requires 16.4+. We err on the permissive side
// when version is unknown (return true) — let the underlying PushManager
// be the final judge.
export function isSupportedIOSForWebPush(nav) {
  var n = getNav(nav);
  if (!isIOS(n)) return false;
  var v = getIOSVersion(n);
  if (!v) return true; // unknown — let the browser decide
  if (v.major > 16) return true;
  if (v.major === 16 && v.minor >= 4) return true;
  return false;
}

// Browser sniff — coarse, only used for analytics + the Settings UI's
// "Chrome on Android, Safari on iPhone" copy. Not a security boundary.
export function getBrowserType(nav) {
  var n = getNav(nav);
  if (!n) return "unknown";
  var ua = n.userAgent || "";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/EdgA?\//.test(ua)) return "edge";
  if (/CriOS|Chrome/i.test(ua) && !/EdgA?\//.test(ua)) return "chrome";
  if (/FxiOS|Firefox/i.test(ua)) return "firefox";
  if (/Safari/i.test(ua) && !/CriOS|Chrome|FxiOS/i.test(ua)) return "safari";
  return "unknown";
}

export function getDeviceType(nav) {
  var n = getNav(nav);
  if (isIOS(n)) return "ios";
  if (isAndroid(n)) return "android";
  return "desktop";
}

// ─────────────────────────────────────────────────────────────────────
// PWA / capability detection
// ─────────────────────────────────────────────────────────────────────

// True when the page is running as a Home-Screen / installed PWA. iOS
// uses navigator.standalone; everywhere else uses display-mode media
// query.
export function isStandalonePWA(nav, win) {
  var n = getNav(nav);
  var w = getWin(win);
  if (!w) return false;
  // iOS Home Screen
  if (n && n.standalone === true) return true;
  // Android / desktop installed PWA
  try {
    if (w.matchMedia && w.matchMedia("(display-mode: standalone)").matches) return true;
    if (w.matchMedia && w.matchMedia("(display-mode: minimal-ui)").matches) return true;
  } catch (_) {
    // matchMedia unavailable in non-DOM environments
  }
  return false;
}

export function supportsServiceWorker(nav) {
  var n = getNav(nav);
  return !!(n && "serviceWorker" in n);
}

export function supportsNotifications(win) {
  var w = getWin(win);
  return !!(w && "Notification" in w);
}

// Combined predicate. Push API needs SW + Notification + PushManager
// + (on iOS) being a Home-Screen PWA on 16.4+. Returns true when the
// device CAN attempt subscription — UI gates on this before showing
// the Enable button.
export function supportsPush(nav, win) {
  var n = getNav(nav);
  var w = getWin(win);
  if (!supportsServiceWorker(n)) return false;
  if (!supportsNotifications(w)) return false;
  if (!w || !("PushManager" in w)) return false;

  if (isIOS(n)) {
    if (!isSupportedIOSForWebPush(n)) return false;
    if (!isStandalonePWA(n, w)) return false;
  }
  return true;
}

// Lighter helper — "could push work here under any circumstance?".
// Used by the Settings UI to render the "Add to Home Screen first"
// guidance vs the unsupported fallback. (iOS Safari 16.4+ tab returns
// true here even though the actual subscribe will fail — that's
// intentional: we want to invite the user into the install flow
// rather than show a blanket unsupported message.)
export function couldSupportPush(nav, win) {
  var n = getNav(nav);
  var w = getWin(win);
  if (!supportsServiceWorker(n)) return false;
  if (!w || !("PushManager" in w)) return false;
  if (isIOS(n)) return isSupportedIOSForWebPush(n);
  return true;
}

// App badge support — Chrome on macOS / Android, some others. Not a
// blocker for push; surfaced so the Settings card can opportunistically
// show "App icon shows unread count" when present.
export function supportsBadging(nav) {
  var n = getNav(nav);
  if (!n) return false;
  return typeof n.setAppBadge === "function" && typeof n.clearAppBadge === "function";
}

// ─────────────────────────────────────────────────────────────────────
// Snapshot for storing alongside push_subscriptions rows
// ─────────────────────────────────────────────────────────────────────
//
// Rows track which kind of device subscribed — drives debug + the
// future "manage devices" UI.
export function deviceSnapshot(nav, win) {
  var n = getNav(nav);
  return {
    user_agent:        (n && n.userAgent) || null,
    device_type:       getDeviceType(n),
    browser:           getBrowserType(n),
    is_standalone_pwa: isStandalonePWA(n, win),
  };
}
