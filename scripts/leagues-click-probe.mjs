#!/usr/bin/env node
// Verify clicking an active league row renders the detail view
// (not a blank screen). Captures JS console errors.

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
  page.on("pageerror", function (e) { errs.push(String(e.message || e)); });
  page.on("console", function (msg) {
    if (msg.type() === "error") errs.push("console: " + msg.text());
  });
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  var creds = await getCreds(page);
  var client = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  var { data: authData } = await client.auth.signInWithPassword({ email, password });
  var projectRef = creds.url.replace("https://", "").split(".")[0];
  await page.evaluate(function (a) { localStorage.setItem(a.k, a.v); },
    { k: "sb-" + projectRef + "-auth-token", v: JSON.stringify(authData.session) });
  return { page, ctx, userId: authData.user.id, errs };
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  try {
    var m = await signInAs("test@test.com", "123456", browser);
    await m.page.goto(SITE + "/tournaments/leagues", { waitUntil: "domcontentloaded" });
    await m.page.waitForTimeout(4000);

    var snap1 = await m.page.evaluate(function () {
      return { url: location.pathname + location.search, bodyLen: document.body.innerText.length, text: document.body.innerText.slice(0, 400) };
    });
    log("leagues list: " + JSON.stringify(snap1));

    // Click first league row
    var clicked = await m.page.evaluate(function () {
      // LeagueRow is the clickable wrapper with league.status active text
      var rows = Array.from(document.querySelectorAll("div")).filter(function (d) {
        return /ACTIVE/.test(d.innerText || "") && d.onclick == null && (d.getAttribute("style") || "").indexOf("cursor") >= 0;
      });
      // Simpler: click any row with "ACTIVE" in it
      var row = Array.from(document.querySelectorAll("div")).find(function (d) {
        var s = (d.getAttribute("style") || "");
        return /cursor:\s*pointer/.test(s) && /ACTIVE/.test(d.innerText || "");
      });
      if (row) { row.click(); return true; }
      return false;
    });
    log("clicked league row: " + clicked);
    await m.page.waitForTimeout(2500);

    var snap2 = await m.page.evaluate(function () {
      return {
        url: location.pathname + location.search,
        bodyLen: document.body.innerText.length,
        text: document.body.innerText.slice(0, 400),
        hasBack: /Back to leagues/.test(document.body.innerText),
        hasStandings: /Standings/.test(document.body.innerText),
      };
    });
    log("after click: " + JSON.stringify(snap2));
    log("errors: " + JSON.stringify(m.errs));

  } finally { await browser.close(); }
}
main().catch(function (e) { console.error("FAIL:", e); process.exit(1); });
