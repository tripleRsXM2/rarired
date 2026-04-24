#!/usr/bin/env node
// Tindis tab smoke probe — signs in as both test users, navigates to
// /tindis, captures any pageerror / console.error and a DOM snapshot.
// Tests with test@test.com (Mdawg) and test1@test.com (John) per the
// standing rule from the user.

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
  page.on("console", function (msg) { if (msg.type() === "error") errs.push("console: " + msg.text().slice(0, 240)); });
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
  await u.page.goto(SITE + "/tindis", { waitUntil: "domcontentloaded" });
  await u.page.waitForTimeout(4000);
  var snap = await u.page.evaluate(function () {
    return {
      url: location.pathname,
      bodyLen: document.body.innerText.length,
      text: document.body.innerText.slice(0, 400),
      hasHeader: /TINDIS|Tindis/.test(document.body.innerText),
      hasNav: !!document.querySelector('[class*="Sidebar"], nav'),
    };
  });
  log("=== " + label + " ===");
  log("  url/body: " + JSON.stringify({ url: snap.url, len: snap.bodyLen, hasHeader: snap.hasHeader }));
  log("  text: " + JSON.stringify(snap.text));
  if (u.errs.length) {
    log("  ERRORS (" + u.errs.length + "):");
    u.errs.slice(0, 8).forEach(function (e) { log("    " + e); });
  } else {
    log("  ✓ no errors");
  }
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  try {
    var mdawg = await signInAs("test@test.com",  "123456", browser);
    var john  = await signInAs("test1@test.com", "123456", browser);
    await probe(mdawg, "Mdawg (test@test.com)");
    await probe(john,  "John  (test1@test.com)");
  } finally {
    await browser.close();
  }
}
main().catch(function (e) { console.error("FAIL:", e.message || e); process.exit(1); });
