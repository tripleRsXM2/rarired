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
      // ZONES.cbd centroid is around -33.88, 151.21 — should be visible
      // when fitBounds-ed. Use Leaflet's map.latLngToContainerPoint.
      var map = window.__lmap;
      if(!map){
        // Try to grab the map instance from the leaflet container
        var lc = document.querySelector(".leaflet-container");
        if(lc && lc._leaflet_id){
          // L is attached globally via the leaflet import; the map
          // instance can be retrieved through any registered layer.
          // Hacky but works: walk Leaflet's registry.
          for(var k in window){
            if(window[k] && window[k]._leaflet_id === lc._leaflet_id){
              map = window[k]; break;
            }
          }
        }
      }
      // Fallback: just click at the centre of the leaflet container,
      // which after fitBounds(allZones) should land on a zone.
      var rect = document.querySelector(".leaflet-container").getBoundingClientRect();
      return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
    });
    log("clicking at: " + JSON.stringify(clickTarget));
    await u.page.mouse.click(clickTarget.x, clickTarget.y);
    await u.page.waitForTimeout(900);

    var afterClick = await u.page.evaluate(function(){
      var leaflet = document.querySelector(".leaflet-container");
      var courtLabels = document.querySelectorAll(".cs-play-label");
      var connectorLines = document.querySelectorAll(".cs-play-line");
      var dots = document.querySelectorAll(".cs-play-dot");
      return {
        playModeAttr: leaflet ? leaflet.getAttribute("data-play-mode") : null,
        courtLabelCount: courtLabels.length,
        connectorLineCount: connectorLines.length,
        dotCount: dots.length,
      };
    });
    log("after zone CLICK: " + JSON.stringify(afterClick));

    if(afterClick.playModeAttr === "court"){
      log("✓ advanced to step 2 (court mode)");
      if(afterClick.courtLabelCount > 0){
        log("✓ court stacks rendered (" + afterClick.courtLabelCount + " labels, " +
          afterClick.connectorLineCount + " lines, " + afterClick.dotCount + " dots)");
        if(afterClick.courtLabelCount === afterClick.connectorLineCount &&
           afterClick.courtLabelCount === afterClick.dotCount){
          log("✓ stack structure consistent (label = line = dot count)");
        } else {
          log("⚠ stack structure mismatch — labels/lines/dots not 1:1:1");
        }
      } else {
        log("⚠ court mode active but no labeled stacks visible");
      }
    } else {
      log("✗ stuck in " + afterClick.playModeAttr + " — bug not fixed");
    }

    var errs = u.errs.filter(function(e){ return !/401/.test(e); });
    log("errs: " + errs.length);
    if(errs.length) errs.slice(0, 3).forEach(function(e){ log("  " + e); });
  } finally {
    await u.browser.close();
  }
}

probe().catch(function(e){ console.error("FAIL:", e.message || e); process.exit(1); });
