// Global setup for vitest: jest-dom matchers + a minimal
// matchMedia polyfill for components that use responsive hooks.
import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = function (q) {
    return {
      matches: false, media: q, addListener: function () {}, removeListener: function () {},
      addEventListener: function () {}, removeEventListener: function () {}, onchange: null,
      dispatchEvent: function () { return false; },
    };
  };
}

if (typeof window !== "undefined" && !window.scrollTo) {
  window.scrollTo = function () {};
}

// Element.prototype.scrollIntoView is not implemented in jsdom.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// In-memory localStorage / sessionStorage polyfills.
// jsdom in CI sometimes ships a Storage interface where setItem is a getter
// (Object.create on the prototype) — calling the method as `localStorage.setItem(...)`
// then errors with "is not a function". This shim wraps the globals with a
// proper Storage-shaped object so test code reads/writes round-trip.
// Idempotent: skips if a working setItem is already present.
function installStorageShim(target, key) {
  function makeStore() {
    var data = {};
    return {
      get length() { return Object.keys(data).length; },
      key: function (i) { return Object.keys(data)[i] || null; },
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      clear: function () { data = {}; },
    };
  }
  try {
    var existing = target[key];
    if (existing && typeof existing.setItem === "function") {
      // Verify a round-trip works — some jsdom builds expose setItem but
      // throw on call. If round-trip fails, swap in the shim.
      existing.setItem("__cs_test__", "1");
      var r = existing.getItem("__cs_test__");
      existing.removeItem("__cs_test__");
      if (r === "1") return;
    }
  } catch (_) { /* fall through to shim install */ }
  Object.defineProperty(target, key, {
    value: makeStore(),
    writable: true,
    configurable: true,
  });
}

if (typeof window !== "undefined") {
  installStorageShim(window, "localStorage");
  installStorageShim(window, "sessionStorage");
}
if (typeof globalThis !== "undefined") {
  // Mirror onto the global so non-window-namespaced reads work too.
  if (typeof globalThis.localStorage   === "undefined") globalThis.localStorage   = window.localStorage;
  if (typeof globalThis.sessionStorage === "undefined") globalThis.sessionStorage = window.sessionStorage;
}
