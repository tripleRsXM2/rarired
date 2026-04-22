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
