#!/usr/bin/env node
// Probe the map edge-fade overlay on the deployed Mdawg preview.
// Confirms: (1) the overlay div is in the DOM, (2) it has four
// linear-gradient stacks, (3) it doesn't steal clicks, (4) it sits
// below the chrome. Also saves a screenshot per user.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir } from "node:fs/promises";

var SITE = "https://rarired-git-mdawg-miikhcs-projects.vercel.app";
function log(m) { console.log("[probe]", m); }

async function getCreds(page) {
  var html = await page.content();
  var m = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  var js = await (await fetch(SITE + m[1])).text();
  return {
    url: js.match(/(https:\/\/[a-z0-9]+\.supabase\.co)/)[1],
    key: js.match(/(eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/)[1],
  };
}
async function signInAs(email, password, browser) {
  var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  var page = await ctx.newPage();
  var errs = [];
  page.on("pageerror", function (e) { errs.push("pageerror: " + (e.message || e)); });
  page.on("console", function (msg) { if (msg.type() === "error") errs.push("console: " + msg.text().slice(0, 200)); });
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  var creds = await getCreds(page);
  var client = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  var { data: authData, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(email + ": " + error.message);
  var projectRef = creds.url.replace("https://", "").split(".")[0];
  await page.evaluate(function (a) { localStorage.setItem(a.k, a.v); },
    { k: "sb-" + projectRef + "-auth-token", v: JSON.stringify(authData.session) });
  return { page, ctx, errs };
}

async function probe(u, label) {
  await u.page.goto(SITE + "/map", { waitUntil: "domcontentloaded" });
  await u.page.waitForTimeout(5500);

  var snap = await u.page.evaluate(async function () {
    var frame = document.querySelector(".cs-map-frame");
    if (!frame) return { err: "no .cs-map-frame" };
    // v2 uses box-shadow inset, not gradients. Detect any aria-hidden
    // child that has either a non-empty box-shadow OR linear-gradient.
    var children = Array.from(frame.children);
    var fade = children.find(function (el) {
      if (el.getAttribute("aria-hidden") !== "true") return false;
      var st = getComputedStyle(el);
      var hasShadow = st.boxShadow && st.boxShadow !== "none";
      var hasGrad = /linear-gradient/.test(st.backgroundImage);
      return hasShadow || hasGrad;
    });
    // Bundle check — does the deployed JS contain the v2 string?
    var bundleHasV2 = false, bundleHasV1 = false;
    try {
      var scripts = Array.from(document.scripts).map(function(s){ return s.src; });
      var bsrc = scripts.find(function(x){ return /\/assets\/index-.*\.js/.test(x); });
      if (bsrc) {
        var js = await (await fetch(bsrc)).text();
        bundleHasV2 = /inset 0 0 90px|inset 0 0 80px/.test(js);
        bundleHasV1 = /linear-gradient\(to right,/.test(js);
      }
    } catch(_) {}
    if (!fade) {
      return {
        err: "no fade overlay found",
        childCount: children.length,
        ariaHiddenChildren: children.filter(function (c) { return c.getAttribute("aria-hidden") === "true"; }).length,
      };
    }
    var st = getComputedStyle(fade);
    // Count how many linear-gradient stops are present (should be 4).
    var gradientCount = (st.backgroundImage.match(/linear-gradient\(/g) || []).length;
    // Sample which color the fade ends in (should match the frame bg).
    var frameBg = getComputedStyle(frame).backgroundColor;
    return {
      hasOverlay: true,
      pointerEvents: st.pointerEvents,
      zIndex: st.zIndex,
      position: st.position,
      gradientCount: gradientCount,
      boxShadow: st.boxShadow,
      bundleHasV2: bundleHasV2,
      bundleHasV1: bundleHasV1,
      frameBg: frameBg,
      // Click-through sanity: at the centre of the map, what is the
      // top-most element under the cursor? Should NOT be the fade
      // overlay (Leaflet container or marker should be on top).
      topElCenter: (function () {
        var rect = frame.getBoundingClientRect();
        var x = rect.left + rect.width / 2;
        var y = rect.top + rect.height / 2;
        var el = document.elementFromPoint(x, y);
        return el ? (el.tagName + "." + (el.className || "").toString().split(" ")[0]) : null;
      })(),
      // Click-through at corner: the fade is most opaque here. We
      // still want pointer-events to fall through to the map.
      topElCorner: (function () {
        var rect = frame.getBoundingClientRect();
        var el = document.elementFromPoint(rect.left + 8, rect.top + 8);
        return el ? (el.tagName + "." + (el.className || "").toString().split(" ")[0]) : null;
      })(),
    };
  });
  log(label + ": " + JSON.stringify(snap));

  // Screenshot for visual confirmation.
  await mkdir("scripts/_screens", { recursive: true });
  var path = "scripts/_screens/map-edge-fade-" + label.toLowerCase() + ".png";
  await u.page.screenshot({ path: path, fullPage: false });
  log("  screenshot -> " + path);

  var errs = u.errs.filter(function (e) { return !/401/.test(e); });
  log("  " + (errs.length === 0 ? "OK" : "X") + " runtime errors: " + errs.length);
  if (errs.length) errs.slice(0, 3).forEach(function (e) { log("  " + e); });
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  try {
    var mdawg = await signInAs("test@test.com",  "123456", browser);
    var john  = await signInAs("test1@test.com", "123456", browser);
    await probe(mdawg, "Mdawg");
    await probe(john,  "John");
  } finally { await browser.close(); }
}
main().catch(function (e) { console.error("FAIL:", e.message || e); process.exit(1); });
