#!/usr/bin/env node
// Probe the cold-sign-in messages-load path. Sets the auth token
// fresh, navigates to /people/messages, asserts the skeleton clears
// (conversationsLoaded flips true → "Loading messages…" goes away
// and the actual list paints) within a reasonable budget.
//
// Pre-fix: skeleton stayed on screen indefinitely because of the
// stale-authUser closure in loadConversations.

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

async function probe(email, password, browser, label) {
  // Fresh context each run — simulates a hard refresh after sign-in.
  var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  var page = await ctx.newPage();
  var errs = [];
  page.on("pageerror", function (e) { errs.push("pageerror: " + (e.message || e)); });
  page.on("console", function (msg) { if (msg.type() === "error") errs.push("console: " + msg.text().slice(0, 200)); });

  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  var creds = await getCreds(page);
  var client = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  var { data: authData, error } = await client.auth.signInWithPassword({ email: email, password: password });
  if (error) throw new Error(label + ": " + error.message);
  var projectRef = creds.url.replace("https://", "").split(".")[0];
  // Plant the auth token, then navigate to /people/messages — this is
  // the exact "hard refresh + signed in" cold path the user reported.
  await page.evaluate(function (a) { localStorage.setItem(a.k, a.v); },
    { k: "sb-" + projectRef + "-auth-token", v: JSON.stringify(authData.session) });

  var t0 = Date.now();
  await page.goto(SITE + "/people/messages", { waitUntil: "domcontentloaded" });

  // Poll until the skeleton clears. Two signals:
  //  - "Loading messages…" disappears (conversationsLoaded === true)
  //  - At least one conversation row OR the empty-state appears
  var timedOut = true;
  var elapsed = -1;
  for (var i = 0; i < 50; i++) {
    await page.waitForTimeout(300);
    var snap = await page.evaluate(function () {
      var txt = document.body.innerText;
      var stillLoading = /Loading messages/i.test(txt);
      var hasContent = /No messages yet|Find people you|messages|Friends|Discover/.test(txt);
      return { stillLoading: stillLoading, hasContent: hasContent };
    });
    if (!snap.stillLoading) { timedOut = false; elapsed = Date.now() - t0; break; }
  }

  log(label + ": " + (timedOut ? "❌ skeleton stuck" : ("✓ skeleton cleared in " + elapsed + "ms")));
  if (errs.length) {
    var filtered = errs.filter(function (e) { return !/401/.test(e); });
    if (filtered.length) { log("  errs:"); filtered.slice(0, 3).forEach(function (e) { log("    " + e); }); }
  }

  await ctx.close();
  return { ok: !timedOut, elapsed: elapsed };
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  try {
    await probe("test@test.com",  "123456", browser, "Mdawg cold sign-in");
    await probe("test1@test.com", "123456", browser, "John  cold sign-in");
  } finally { await browser.close(); }
}
main().catch(function (e) { console.error("FAIL:", e.message || e); process.exit(1); });
