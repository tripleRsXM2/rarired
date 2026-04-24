#!/usr/bin/env node
// Phase 0 probe: Tindis nav entry gone, /tindis route still works.
//
// Why both: the nav removal must visibly drop the chip; the route
// preservation must keep old deep-links (pact notifications + bookmarks)
// alive for at least Phase 0 → Phase 3 transition period.

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
  var { data: authData, error: err } = await client.auth.signInWithPassword({ email, password });
  if (err) throw new Error(email + ": " + err.message);
  var projectRef = creds.url.replace("https://", "").split(".")[0];
  await page.evaluate(function (a) { localStorage.setItem(a.k, a.v); },
    { k: "sb-" + projectRef + "-auth-token", v: JSON.stringify(authData.session) });
  return { page, ctx, userId: authData.user.id, client, errs };
}

async function check(u, label) {
  // 1. Home page should NOT show Tindis in nav.
  await u.page.goto(SITE + "/home", { waitUntil: "domcontentloaded" });
  await u.page.waitForTimeout(3500);
  var navSnap = await u.page.evaluate(function () {
    // Look at the sidebar + the mobile tab strip. Tindis should not
    // appear in either. Text "Feed", "Map", "Compete" SHOULD.
    var txt = document.body.innerText;
    return {
      hasTindisInNav: /(^|\s)Tindis(\s|$)/i.test(txt),
      hasFeed:     /Feed/i.test(txt),
      hasMap:      /Map/i.test(txt),
      hasCompete:  /Compete/i.test(txt),
    };
  });
  log(label + " nav: " + JSON.stringify(navSnap));

  // 2. /tindis URL should still resolve — old deep-links work.
  await u.page.goto(SITE + "/tindis/active", { waitUntil: "domcontentloaded" });
  await u.page.waitForTimeout(3500);
  var routeSnap = await u.page.evaluate(function () {
    return {
      url: location.pathname,
      hasHeader: /TINDIS/i.test(document.body.innerText),
      hasEmpty: /No active pacts|Start one with a friend/i.test(document.body.innerText),
    };
  });
  log(label + " /tindis route: " + JSON.stringify(routeSnap));

  // 3. Pass/fail summary.
  var nav_ok   = !navSnap.hasTindisInNav && navSnap.hasFeed && navSnap.hasMap && navSnap.hasCompete;
  var route_ok = routeSnap.url.indexOf("/tindis") === 0 && routeSnap.hasHeader;
  log("  " + (nav_ok ? "✓" : "❌") + " nav chip removed + other tabs intact");
  log("  " + (route_ok ? "✓" : "❌") + " /tindis route still renders");
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  try {
    var mdawg = await signInAs("test@test.com",  "123456", browser);
    var john  = await signInAs("test1@test.com", "123456", browser);
    await check(mdawg, "Mdawg");
    await check(john,  "John");
    if (mdawg.errs.length) { log("mdawg errs:"); mdawg.errs.slice(0,3).forEach(function(e){ log("  " + e); }); }
    if (john.errs.length)  { log("john errs:");  john.errs.slice(0,3).forEach(function(e){ log("  " + e); }); }
  } finally { await browser.close(); }
}
main().catch(function(e){ console.error("FAIL:", e.message || e); process.exit(1); });
