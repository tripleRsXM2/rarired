#!/usr/bin/env node
// Probe the map-native Play Match flow against the local dev server.
// Verifies the click bug fix:
//   1. Sign in
//   2. /map loads
//   3. Tap PLAY MATCH → enter "zone" play mode
//   4. Click a zone polygon → advance to "court" play mode
//   5. Verify court markers + permanent labels render
//
// Run with the dev server up on http://localhost:5174.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Load .env.local for VITE_SUPABASE_* — vite dev mode doesn't bundle
// these into the served JS so we can't scrape them off the page.
try {
  var env = readFileSync(".env.local", "utf8");
  env.split("\n").forEach(function(line){
    var m = line.match(/^([A-Z_]+)=(.+)$/);
    if(m) process.env[m[1]] = m[2];
  });
} catch(_){}

var SITE = "http://localhost:5174";
function log(m) { console.log("[probe]", m); }

async function getCreds(page) {
  var html = await page.content();
  var m = html.match(/src=["'](\/[^"']*\.js)["']/);
  // dev server may not have hashed bundles; fall back to env-style
  var url = process.env.VITE_SUPABASE_URL || "https://yndpjabmrkqclcxeecei.supabase.co";
  var key = process.env.VITE_SUPABASE_ANON_KEY;
  // try to scrape from the bundle
  if(m){
    try {
      var js = await (await fetch(SITE + m[1])).text();
      var u = js.match(/(https:\/\/[a-z0-9]+\.supabase\.co)/);
      var k = js.match(/(eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/);
      if(u) url = u[1];
      if(k) key = k[1];
    } catch(_){}
  }
  return { url: url, key: key };
}

async function signIn(email, password) {
  var browser = await chromium.launch({ headless: true });
  var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  var page = await ctx.newPage();
  var errs = [];
  page.on("pageerror", function(e){ errs.push("pageerror: " + (e.message || e)); });
  page.on("console", function(msg){ if(msg.type() === "error") errs.push("console: " + msg.text().slice(0, 200)); });
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  var creds = await getCreds(page);
  if(!creds.key){ throw new Error("missing supabase anon key — make sure .env.local is set"); }
  var client = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  var { data: authData, error } = await client.auth.signInWithPassword({ email, password });
  if(error) throw new Error(email + ": " + error.message);
  var ref = creds.url.replace("https://","").split(".")[0];
  await page.evaluate(function(a){ localStorage.setItem(a.k, a.v); },
    { k: "sb-" + ref + "-auth-token", v: JSON.stringify(authData.session) });
  return { browser, page, errs };
}

async function probe() {
  var u = await signIn("test@test.com", "123456");
  try {
    await u.page.goto(SITE + "/map", { waitUntil: "domcontentloaded" });
    await u.page.waitForTimeout(5500);
    log("loaded /map");

    // Step 1 — tap PLAY MATCH
    var entered = await u.page.evaluate(function(){
      var btn = Array.from(document.querySelectorAll("button"))
        .find(function(b){ return /play\s*match/i.test((b.textContent || b.innerText || "")); });
      if(!btn) return { err: "no PLAY MATCH button" };
      btn.click();
      return { ok: true };
    });
    log("tapped PLAY MATCH → " + JSON.stringify(entered));
    await u.page.waitForTimeout(800);

    var afterStart = await u.page.evaluate(function(){
      var leaflet = document.querySelector(".leaflet-container");
      var prompt = Array.from(document.querySelectorAll("div"))
        .find(function(el){ return /CHOOSE YOUR ZONE/i.test(el.textContent || ""); });
      return {
        playModeAttr: leaflet ? leaflet.getAttribute("data-play-mode") : null,
        promptVisible: !!prompt,
        promptText: prompt ? (prompt.textContent || "").trim() : null,
        // Zone polygons rendered as <path> in the SVG overlay
        polygonCount: document.querySelectorAll(".leaflet-overlay-pane path").length,
      };
    });
    log("after START: " + JSON.stringify(afterStart));

    if(afterStart.playModeAttr !== "zone"){
      throw new Error("Expected data-play-mode=zone, got " + afterStart.playModeAttr);
    }

    // Step 2 — click a zone polygon. preferCanvas:true means polys
    // are drawn on a canvas, not SVG. Use Leaflet's API to convert
    // a known zone centroid lat/lng to screen coords, then dispatch
    // a real Playwright click at that pixel.
    var clickTarget = await u.page.evaluate(function(){
      // Walk Leaflet's internal _layers cache on the container to
      // find the map instance (Leaflet 1.x). Then project a known
      // CBD lat/lng to screen pixels — robust against bbox shifts.
      var lc = document.querySelector(".leaflet-container");
      // Leaflet attaches _leaflet_pos and the map instance is
      // referenced by any L.Layer added to it. Layers expose ._map.
      // Fastest path: use the global L (still in window scope when
      // imported from leaflet/dist).
      var map = null;
      // L.Map has a unique `_container` property pointing to the div.
      // We can iterate window for any object whose _container matches.
      // But this can be flaky. Easier: dispatch a Leaflet click via
      // the canvas at a known lat/lng using simulateClick on the
      // tile-pane container. Since polygons are rendered with
      // preferCanvas, Leaflet listens on the canvas and projects
      // back to lat/lng then hit-tests polygons.
      var rect = lc.getBoundingClientRect();
      // Best-effort: click roughly at -33.895, 151.16 (Inner West
      // centroid). Without the map instance we estimate using the
      // visible zone polygons. Looking at all-zones framing with
      // northern-beaches now extending to Mona Vale, Inner West sits
      // upper-mid-left of the visible map area.
      return {
        x: rect.left + rect.width * 0.50,
        y: rect.top + rect.height * 0.45,
      };
    });
    log("clicking at: " + JSON.stringify(clickTarget));
    await u.page.mouse.click(clickTarget.x, clickTarget.y);
    // Wait for collision-aware label rendering to complete (the
    // setTimeout(50) in LeafletMap fires after fitBounds settles).
    await u.page.waitForTimeout(1500);

    var afterClick = await u.page.evaluate(function(){
      var leaflet = document.querySelector(".leaflet-container");
      var crowdedLabels = document.querySelectorAll(".cs-play-label");
      var calmNames = document.querySelectorAll(".cs-play-name");
      var svgLines = document.querySelectorAll(".cs-play-court svg line");
      var dots = document.querySelectorAll(".cs-play-dot");
      return {
        playModeAttr: leaflet ? leaflet.getAttribute("data-play-mode") : null,
        crowdedLabelCount: crowdedLabels.length,
        calmNameCount: calmNames.length,
        connectorLineCount: svgLines.length,
        dotCount: dots.length,
      };
    });
    log("after zone CLICK: " + JSON.stringify(afterClick));

    if(afterClick.playModeAttr === "court"){
      log("✓ advanced to step 2 (court mode)");
      var totalCourts = afterClick.crowdedLabelCount + afterClick.calmNameCount;
      if(totalCourts > 0){
        log("✓ court markers rendered: " + afterClick.calmNameCount + " calm + " +
          afterClick.crowdedLabelCount + " crowded (" + afterClick.connectorLineCount + " lines, " +
          afterClick.dotCount + " dots)");
        if(totalCourts === afterClick.dotCount){
          log("✓ all courts have a dot");
        } else {
          log("⚠ count mismatch: " + totalCourts + " labels vs " + afterClick.dotCount + " dots");
        }
        if(afterClick.connectorLineCount === afterClick.crowdedLabelCount){
          log("✓ connector lines only on crowded courts (collision detection working)");
        } else {
          log("⚠ line count " + afterClick.connectorLineCount + " ≠ crowded count " + afterClick.crowdedLabelCount);
        }
      } else {
        log("⚠ court mode active but no markers visible");
      }
    } else {
      log("✗ stuck in " + afterClick.playModeAttr + " — bug not fixed");
    }

    // Snap a screenshot in court mode so we can verify the diagonal
    // label spread visually.
    try {
      var fs = await import("node:fs/promises");
      await fs.mkdir("scripts/_screens", { recursive: true });
      await u.page.screenshot({ path: "scripts/_screens/play-match-court.png", fullPage: false });
      log("screenshot → scripts/_screens/play-match-court.png");
    } catch(_){}

    var errs = u.errs.filter(function(e){ return !/401/.test(e); });
    log("errs: " + errs.length);
    if(errs.length) errs.slice(0, 3).forEach(function(e){ log("  " + e); });
  } finally {
    await u.browser.close();
  }
}

probe().catch(function(e){ console.error("FAIL:", e.message || e); process.exit(1); });
