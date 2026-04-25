#!/usr/bin/env node
// Probe the heat-map toggle + the home-badge offset.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

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
  return { page, ctx, userId: authData.user.id, client, errs };
}

async function probe(u, label) {
  await u.page.goto(SITE + "/map", { waitUntil: "domcontentloaded" });
  await u.page.waitForTimeout(5500);

  // Initial: heat on. Check toggle button + polygon fill present.
  var initial = await u.page.evaluate(function () {
    var btn = Array.from(document.querySelectorAll("button"))
      .find(function (b) { return /Heat on|Heat off/.test(b.innerText || ""); });
    var paths = Array.from(document.querySelectorAll("path[fill][stroke]"));
    var filledZones = paths.filter(function (p) {
      var f = p.getAttribute("fill") || "";
      var op = p.getAttribute("fill-opacity") || (p.style && p.style.fillOpacity) || "";
      return f && f !== "none" && f !== "transparent" && op !== "0";
    });
    return {
      hasToggleBtn: !!btn,
      btnLabel: btn ? btn.innerText.trim() : null,
      filledZoneCount: filledZones.length,
    };
  });
  log(label + " heat ON: " + JSON.stringify(initial));

  // Click toggle, re-check.
  if (initial.hasToggleBtn) {
    await u.page.evaluate(function () {
      var btn = Array.from(document.querySelectorAll("button"))
        .find(function (b) { return /Heat on/.test(b.innerText || ""); });
      if (btn) btn.click();
    });
    await u.page.waitForTimeout(800);
    var off = await u.page.evaluate(function () {
      var btn = Array.from(document.querySelectorAll("button"))
        .find(function (b) { return /Heat on|Heat off/.test(b.innerText || ""); });
      // After toggle, polygons should have fill-opacity 0
      var paths = Array.from(document.querySelectorAll("path"));
      var anyFilled = paths.some(function (p) {
        var op = (p.style && p.style.fillOpacity) || p.getAttribute("fill-opacity");
        return op && Number(op) > 0.05;
      });
      return {
        btnLabel: btn ? btn.innerText.trim() : null,
        anyFilled: anyFilled,
      };
    });
    log(label + " heat OFF: " + JSON.stringify(off));
  }

  // Bundle has the iconAnchor offset
  var snap = await u.page.evaluate(async function () {
    var s = Array.from(document.scripts).map(function (x) { return x.src; })
                 .find(function (x) { return /\/assets\/index-.*\.js/.test(x); });
    if (!s) return { err: "no bundle" };
    var r = await fetch(s);
    var js = await r.text();
    return {
      hasBigIconAnchor: /iconAnchor:\[30,90\]|iconAnchor: ?\[30, ?90\]/.test(js),
      hasHeatToggleCopy: /Heat on|Heat off/.test(js),
    };
  });
  log(label + " bundle: " + JSON.stringify(snap));

  var errs = u.errs.filter(function (e) { return !/401/.test(e); });
  log("  " + (errs.length === 0 ? "✓" : "❌") + " no runtime errors");
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
