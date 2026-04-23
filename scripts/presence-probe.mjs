#!/usr/bin/env node
// Drive both accounts into the app, wait for the heartbeat to fire,
// and inspect last_active in the DB. If last_active is still null on
// the server after a few seconds, touchPresence() is failing silently.

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
  var errors = [];
  var profileUpdates = [];
  page.on("pageerror", function (e) { errors.push("pageerror: " + e.message); });
  page.on("console", function (m) {
    if (m.type() === "error" || m.type() === "warning") errors.push("[" + m.type() + "] " + m.text());
  });
  page.on("request", function (req) {
    var u = req.url();
    if (/\/rest\/v1\/profiles/.test(u)) {
      profileUpdates.push(req.method() + " " + u.slice(u.indexOf("/rest/")) + (req.postData() ? " body=" + req.postData().slice(0, 160) : ""));
    }
  });
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  var creds = await getCreds(page);
  var client = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  var { data: authData, error: authErr } = await client.auth.signInWithPassword({ email, password });
  if (authErr) throw new Error("auth " + email + ": " + authErr.message);
  var projectRef = creds.url.replace("https://", "").split(".")[0];
  await page.evaluate(function (args) {
    localStorage.setItem(args.k, args.v);
  }, { k: "sb-" + projectRef + "-auth-token", v: JSON.stringify(authData.session) });
  return { page, ctx, userId: authData.user.id, client, errors, profileUpdates };
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  try {
    log("reset both last_active fields to null via privileged client…");
    // Use Mdawg's authenticated client to null their own, + John via John.
    var resetMdawg = await signInAs("test@test.com", "123456", browser);
    await resetMdawg.client.from("profiles").update({ last_active: null }).eq("id", resetMdawg.userId);
    var resetJohn = await signInAs("test1@test.com", "123456", browser);
    await resetJohn.client.from("profiles").update({ last_active: null }).eq("id", resetJohn.userId);
    await resetMdawg.ctx.close();
    await resetJohn.ctx.close();

    log("signing both back in, loading /home…");
    var mdawg = await signInAs("test@test.com", "123456", browser);
    var john  = await signInAs("test1@test.com", "123456", browser);

    var t0 = Date.now();
    await Promise.all([
      mdawg.page.goto(SITE + "/home", { waitUntil: "domcontentloaded" }),
      john.page.goto(SITE + "/home",  { waitUntil: "domcontentloaded" }),
    ]);

    // usePresenceHeartbeat calls touchPresence() on mount. Give it 5s.
    log("waiting 5s for heartbeat…");
    await new Promise(function (r) { setTimeout(r, 5000); });

    // Repro what touchPresence does, from the authenticated client.
    // Same identity + same RLS context as the browser would use.
    log("direct touchPresence-equivalent call as Mdawg:");
    var direct = await mdawg.client.from("profiles")
      .update({ last_active: new Date().toISOString() })
      .eq("id", mdawg.userId)
      .select("id,last_active");
    log("  data=" + JSON.stringify(direct.data) + " error=" + (direct.error ? direct.error.message : "null"));

    var { data: after } = await mdawg.client
      .from("profiles").select("id,name,last_active,show_online_status")
      .in("id", [mdawg.userId, john.userId]);
    log("after heartbeat:");
    (after || []).forEach(function (p) {
      log("  " + p.name + " last_active=" + p.last_active);
    });

    log("profile-table writes captured from mdawg's browser:");
    mdawg.profileUpdates.forEach(function (u) { log("  " + u); });
    log("profile-table writes captured from john's browser:");
    john.profileUpdates.forEach(function (u) { log("  " + u); });

    var stillNull = (after || []).filter(function (p) { return !p.last_active; });
    if (stillNull.length) {
      log("❌ last_active still null for: " + stillNull.map(function (p) { return p.name; }).join(", "));
      log("console/page errors captured from mdawg:");
      mdawg.errors.slice(-20).forEach(function (e) { log("  " + e); });
      log("console/page errors captured from john:");
      john.errors.slice(-20).forEach(function (e) { log("  " + e); });
    } else {
      log("✓ heartbeat reached DB for both");
    }

    // Now — does Mdawg's conv-list view show John's green dot?
    log("opening /people/messages on Mdawg…");
    await mdawg.page.goto(SITE + "/people/messages", { waitUntil: "domcontentloaded" });
    await mdawg.page.waitForTimeout(4000);

    var presenceInUI = await mdawg.page.evaluate(function () {
      // Look for elements with green-ish background inside .cs-dm-list-pane
      // that suggest a presence dot, and grab any text that mentions
      // "Active" / "Last seen".
      var pane = document.querySelector(".cs-dm-list-pane");
      var paneText = pane ? pane.innerText : "(no pane)";
      // Find any element whose computed backgroundColor contains "34" (greenish
      // hex 22c55e ~ rgb(34,197,94)) — rough heuristic for presence dots.
      var allEls = Array.from(document.querySelectorAll("div,span"));
      var greenDots = allEls.filter(function (el) {
        var bg = getComputedStyle(el).backgroundColor;
        var w = el.getBoundingClientRect().width;
        var h = el.getBoundingClientRect().height;
        return w > 4 && w < 20 && h > 4 && h < 20 && /^rgb\(\s*34\s*,/.test(bg);
      });
      return {
        paneText: paneText,
        greenDotCount: greenDots.length,
        pageHasActiveText: /Active now|Last seen/.test(document.body.innerText),
      };
    });
    log("ui presence check:");
    log("  " + JSON.stringify(presenceInUI));

    log("done.");
  } finally {
    await browser.close();
  }
}

main().catch(function (e) { console.error("FAIL:", e); process.exit(1); });
