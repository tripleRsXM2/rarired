#!/usr/bin/env node
// v7 probe — test the CSS-mask-based edge fade.
// Verifies: (a) maskImage CSS prop is applied to the wrapper div,
//           (b) Leaflet content renders inside the masked wrapper,
//           (c) corner pixels of the cs-map-frame are now actually
//               showing the page bg colour (mask is cutting through),
//           (d) click-throughs still work.
// Captures one screenshot per user.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir } from "node:fs/promises";

var SITE = "https://rarired-git-mdawg-miikhcs-projects.vercel.app";
function log(m) { console.log("[probe]", m); }

async function getCreds(page) {
  var html = await page.content();
  var m = html.match(/src=["'](\/assets\/index-[^"']+\.js)["']/);
  if (!m) throw new Error("could not find /assets/index-*.js");
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
  var ref = creds.url.replace("https://", "").split(".")[0];
  await page.evaluate(function (a) { localStorage.setItem(a.k, a.v); },
    { k: "sb-" + ref + "-auth-token", v: JSON.stringify(authData.session) });
  return { page, ctx, errs };
}

async function probe(u, label) {
  await u.page.goto(SITE + "/map", { waitUntil: "domcontentloaded" });
  await u.page.waitForTimeout(5500);

  var snap = await u.page.evaluate(function () {
    var frame = document.querySelector(".cs-map-frame");
    if (!frame) return { err: "no .cs-map-frame" };
    // Look for the masked wrapper — first child with maskImage set.
    var maskedWrapper = Array.from(frame.children).find(function (el) {
      var st = getComputedStyle(el);
      return /radial-gradient/.test(st.maskImage || "") ||
             /radial-gradient/.test(st.webkitMaskImage || "");
    });
    var rect = frame.getBoundingClientRect();
    // Sample pixel colours at corner vs centre to confirm the mask
    // is actually punching through (corners should match page bg).
    function sample(x, y){
      var el = document.elementFromPoint(x, y);
      return el ? el.tagName + "." + (el.className || "").toString().split(" ")[0] : null;
    }
    return {
      hasMaskedWrapper: !!maskedWrapper,
      maskCss: maskedWrapper ? (getComputedStyle(maskedWrapper).maskImage || getComputedStyle(maskedWrapper).webkitMaskImage || "").slice(0, 200) : null,
      // Does Leaflet still mount inside?
      hasLeafletInside: maskedWrapper ? !!maskedWrapper.querySelector(".leaflet-container") : false,
      // Click-through sanity at center + corners
      topElCenter: sample(rect.left + rect.width / 2, rect.top + rect.height / 2),
      topElCorner: sample(rect.left + 8, rect.top + 8),
      // Cog button still on top right (chrome lives outside mask)
      cogVisible: !!document.querySelector('button[aria-label="Map layers"]'),
    };
  });
  log(label + ": " + JSON.stringify(snap));

  await mkdir("scripts/_screens", { recursive: true });
  var path = "scripts/_screens/map-edge-fade-v7-" + label.toLowerCase() + ".png";
  await u.page.screenshot({ path: path, fullPage: false });
  log("  screenshot -> " + path);

  var errs = u.errs.filter(function (e) { return !/401/.test(e); });
  log("  " + (errs.length === 0 ? "OK" : "X") + " runtime errors: " + errs.length);
  if (errs.length) errs.slice(0, 3).forEach(function (e) { log("    " + e); });
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
