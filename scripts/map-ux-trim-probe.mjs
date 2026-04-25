#!/usr/bin/env node
// Probe the four trims: home-toggle inline, merged home label, scope
// toggle, calendar booking icon.

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
  await u.page.waitForTimeout(4500);
  var snap = await u.page.evaluate(async function () {
    var s = Array.from(document.scripts).map(function (x) { return x.src; })
                 .find(function (x) { return /\/assets\/index-.*\.js/.test(x); });
    if (!s) return { err: "no bundle" };
    var r = await fetch(s);
    var js = await r.text();
    return {
      // A: clear-home footer button removed
      hasOldFooterCopy: /Set as home area|home area · Clear/.test(js),
      // A: home toggle copy/aria
      hasHomeAria: /Set as home zone|Your home zone — tap to clear/.test(js),
      // B: merged label — house path inside zoneLabelHtml uses M18 4 …
      hasMergedHomeLabel: /M18 4 L31 15/.test(js),
      // C: scope toggle copy
      hasScopeChips: /In zone/.test(js) && /Everywhere/.test(js),
      // D: calendar glyph (rect for body + the highlighted slot rect)
      hasCalendarSlot: /rect x="9" y="9.5" width="3.5" height="3.5"|x="9" y="9\.5"/.test(js),
    };
  });
  log(label + " bundle: " + JSON.stringify(snap));
  var errs = u.errs.filter(function (e) { return !/401/.test(e); });
  log("  " + (errs.length === 0 ? "✓" : "❌") + " /map loaded clean");
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
