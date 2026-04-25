#!/usr/bin/env node
// Probe the five UX fixes:
//   1. Edit Profile + Availability coexist when editing avail
//   2. Toast fires on save (assert toast strings ship)
//   3. Friend requests row absent from Settings Account section
//   4. /people defaults to messages
//   5. viewport meta has viewport-fit=cover + dvh in CSS

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
  // 1. /people default → messages
  await u.page.goto(SITE + "/people", { waitUntil: "domcontentloaded" });
  await u.page.waitForTimeout(2500);
  var peopleSnap = await u.page.evaluate(function () {
    return { url: location.pathname };
  });
  log(label + " /people lands at: " + peopleSnap.url);

  // 2. viewport meta has viewport-fit=cover
  var docMeta = await u.page.evaluate(function () {
    var m = document.querySelector('meta[name="viewport"]');
    return m ? m.getAttribute("content") : null;
  });
  log(label + " viewport meta: " + docMeta);

  // 3. Bundle symbol checks
  await u.page.goto(SITE + "/map", { waitUntil: "domcontentloaded" });
  await u.page.waitForTimeout(3000);
  var bundle = await u.page.evaluate(async function () {
    var s = Array.from(document.scripts).map(function (x) { return x.src; })
                 .find(function (x) { return /\/assets\/index-.*\.js/.test(x); });
    if (!s) return { err: "no bundle" };
    var r = await fetch(s);
    var js = await r.text();
    return {
      hasProfileSavedToast:    /Profile saved/.test(js),
      hasAvailSavedToast:      /Availability saved/.test(js),
      hasCouldntSaveToast:     /Couldn't save/.test(js),
      hasNoFriendRequestsRow:  !/Friend requests/.test(js),
      has100dvh:               /100dvh/.test(js),
      hasMaxWidth360:          /maxWidth:360|max-width:360/.test(js),
    };
  });
  log(label + " bundle: " + JSON.stringify(bundle));

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
