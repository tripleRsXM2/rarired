#!/usr/bin/env node
// Probe the four UX fixes from this round:
//   1. Toast renders above modals (z-index 10000)
//   2. AuthModal centred + capped to viewport
//   3. Anonymous map shows blurred avatars + sign-in nudge
//   4. Messages page renders the skeleton list while loading

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

async function bundleSnap(u, label) {
  await u.page.goto(SITE + "/people/messages", { waitUntil: "domcontentloaded" });
  await u.page.waitForTimeout(3500);
  return u.page.evaluate(async function () {
    var s = Array.from(document.scripts).map(function (x) { return x.src; })
                 .find(function (x) { return /\/assets\/index-.*\.js/.test(x); });
    if (!s) return { err: "no bundle" };
    var r = await fetch(s);
    var js = await r.text();
    return {
      hasToastZ:           /zIndex:1e4|zIndex:10000/.test(js),
      hasAuthCentered:     /alignItems:"center",justifyContent:"center"/.test(js) || /alignItems: ?"center",\s*justifyContent: ?"center"/.test(js),
      hasBlurFilter:       /filter:"?blur\(/.test(js) || /filter:.*blur\(/.test(js),
      hasSignInNudge:      /sign in to see who they are/.test(js),
      hasSkeleton:         /cs-skeleton/.test(js),
      hasLoadingMessages:  /Loading messages/.test(js),
    };
  });
}

async function probe(u, label) {
  var snap = await bundleSnap(u, label);
  log(label + " bundle: " + JSON.stringify(snap));
  var errs = u.errs.filter(function (e) { return !/401/.test(e); });
  log("  " + (errs.length === 0 ? "✓" : "❌") + " no runtime errors on /people/messages");
  if (errs.length) errs.slice(0, 3).forEach(function (e) { log("  " + e); });
}

async function probeAnon(browser) {
  var ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
  var page = await ctx.newPage();
  await page.goto(SITE + "/map", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  var snap = await page.evaluate(function () {
    var imgs = Array.from(document.querySelectorAll("img"));
    var blurredImgs = imgs.filter(function (i) {
      var s = getComputedStyle(i);
      return /blur\(/.test(s.filter || "") || /blur\(/.test(s.backdropFilter || "");
    });
    var meta = document.querySelector('meta[name="viewport"]');
    return {
      url: location.pathname,
      bodyLen: document.body.innerText.length,
      blurredImgCount: blurredImgs.length,
      viewport: meta ? meta.getAttribute("content") : null,
    };
  });
  log("anon /map: " + JSON.stringify(snap));
  await ctx.close();
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  try {
    var mdawg = await signInAs("test@test.com",  "123456", browser);
    var john  = await signInAs("test1@test.com", "123456", browser);
    await probe(mdawg, "Mdawg");
    await probe(john,  "John");
    await probeAnon(browser);
  } finally { await browser.close(); }
}
main().catch(function (e) { console.error("FAIL:", e.message || e); process.exit(1); });
