#!/usr/bin/env node
// Probe the post-feedback zone panel:
//   - Message-only action bar (no Challenge CTA)
//   - Full zone roster with home-court flag icon
//   - Book link is now an SVG external-link icon, not text
//
// Bundle symbol check + clean-load on both test accounts.

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

async function probe(u, label) {
  await u.page.goto(SITE + "/map", { waitUntil: "domcontentloaded" });
  await u.page.waitForTimeout(5000);
  var snap = await u.page.evaluate(async function () {
    var s = Array.from(document.scripts).map(function (x) { return x.src; })
                 .find(function (x) { return /\/assets\/index-.*\.js/.test(x); });
    if (!s) return { err: "no bundle" };
    var r = await fetch(s);
    var js = await r.text();
    return {
      // New copy present
      hasCourtsFilterCopy: /Courts · tap one/.test(js),
      hasHomeFirstCopy:    /home first/.test(js),
      hasZoneRosterCopy:   /Players in this zone/.test(js),
      hasPlaysAtTooltip:   /Plays at/.test(js),
      // Old copy gone
      noChallengeTooltip:  !/Challenges are 1-on-1/.test(js),
      noBookArrowText:     !/>Book ↗</.test(js) && !/"Book\s*↗"/.test(js),
      noChallengeLiteralInBar: !/\bChallenge\b(?=[^]*selectedCount !== 1)/.test(js),
      // Still works: compose modal + partners[]
      hasComposeHeader:    /New message to|New message ·/.test(js),
      hasTonePicker:       /Casual/.test(js) && /Neutral/.test(js),
    };
  });
  log(label + " bundle: " + JSON.stringify(snap));
  var errs = u.errs.filter(function (e) { return !/401/.test(e); });
  log("  " + (errs.length === 0 ? "✓" : "❌") + " /map loads clean");
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
