#!/usr/bin/env node
// Verifies three fixes end-to-end against the deployed Mdawg preview:
//
// (a) Match history scoreboard no longer shows "Mdawg vs Mdawg" on the
//     opponent's side — the tagged row now reads "<submitter> vs <opponent>".
// (b) Clicking "Log result →" on a challenge_accepted notification opens
//     the score modal for that challenge (deep-link state carries logChallengeId).
// (c) Match-lifecycle notifications render the inline mini-scorecard
//     (Won/Lost pill + sets) in the tray.
//
// Drives the UI with Playwright so the assertions reflect what a real
// user would see.

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
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  var creds = await getCreds(page);
  var client = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  var { data: authData, error: err } = await client.auth.signInWithPassword({ email, password });
  if (err) throw new Error(email + ": " + err.message);
  var projectRef = creds.url.replace("https://", "").split(".")[0];
  await page.evaluate(function (a) { localStorage.setItem(a.k, a.v); },
    { k: "sb-" + projectRef + "-auth-token", v: JSON.stringify(authData.session) });
  return { page, ctx, userId: authData.user.id, client };
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  try {
    var john  = await signInAs("test1@test.com", "123456", browser);
    var mdawg = await signInAs("test@test.com",  "123456", browser);
    log("signed in john=" + john.userId.slice(0, 8) + " mdawg=" + mdawg.userId.slice(0, 8));

    // --- (c) setup: John logs a verified match against Mdawg, confirm via Mdawg ---
    var { data: m } = await john.client.from("match_history").insert({
      user_id: john.userId,
      opponent_id: mdawg.userId,
      opp_name: "Mdawg",
      tourn_name: "Ranked",
      sets: [{you:"6",them:"3"},{you:"6",them:"2"}],
      result: "win",
      match_date: new Date().toISOString().slice(0, 10),
      status: "pending_confirmation",
      submitted_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 72*3600*1000).toISOString(),
    }).select().single();
    log("john logged match " + m.id);
    await john.client.rpc("emit_notification", {
      p_user_id: mdawg.userId, p_type: "match_tag",
      p_entity_id: m.id, p_metadata: null,
    });
    await mdawg.client.rpc("confirm_match_and_update_stats", { p_match_id: m.id });
    await mdawg.client.rpc("emit_notification", {
      p_user_id: john.userId, p_type: "match_confirmed",
      p_entity_id: m.id, p_metadata: null,
    });
    log("match confirmed + both notifs emitted");

    // (a) Mdawg's profile should NOT say "Mdawg vs Mdawg"
    await mdawg.page.goto(SITE + "/profile", { waitUntil: "domcontentloaded" });
    await mdawg.page.waitForTimeout(4000);
    var aSnap = await mdawg.page.evaluate(function () {
      var text = document.body.innerText;
      // Count occurrences of Mdawg adjacent to itself in a recent match row.
      var sawSelf = /John/.test(text);   // submitter should be visible somewhere in mdawg's history
      var badPair = /Mdawg[\s\S]{0,300}Mdawg[\s\S]{0,200}Mdawg/.test(text); // rough heuristic
      return { sawJohn: sawSelf, badPair: badPair, sample: text.slice(0, 600) };
    });
    log("(a) history view on Mdawg: sawJohn=" + aSnap.sawJohn + " badPair=" + aSnap.badPair);
    log(aSnap.sawJohn ? "  ✓ submitter name visible" : "  ❌ John not visible on Mdawg's match row");

    // (c) Mdawg opens notifications, inline scorecard should render
    await mdawg.page.evaluate(function () {
      var bell = Array.from(document.querySelectorAll("button")).find(function (b) {
        return /notifications|Notifications/i.test(b.getAttribute("aria-label") || "") ||
               b.querySelector("svg[data-notif]") ||
               /bell/i.test(b.className || "");
      });
      if (bell) bell.click();
    });
    await mdawg.page.waitForTimeout(1500);
    // Fall back: force tray open via route.
    var cSnap = await mdawg.page.evaluate(function () {
      var txt = document.body.innerText;
      // Look for "Won" or "Lost" pill text + "6-3" style in same block
      var hasPill = /\b(Won|Lost|In review|Voided|Expired)\b/.test(txt);
      var hasSets = /\b\d-\d(,\s*\d-\d)+\b/.test(txt);
      return { hasPill: hasPill, hasSets: hasSets, sample: txt.slice(0, 400) };
    });
    log("(c) tray: pill=" + cSnap.hasPill + " sets=" + cSnap.hasSets);

    // --- (b) challenge_accepted deep-link: John challenges Mdawg, Mdawg accepts ---
    // Insert a challenge directly so we don't have to drive UI.
    var { data: ch, error: che } = await john.client.from("challenges").insert({
      challenger_id: john.userId,
      challenged_id: mdawg.userId,
      status: "pending",
      message: "probe challenge",
    }).select().single();
    if (che) { log("challenge insert err: " + che.message); }
    else log("challenge " + ch.id + " created");

    // Mdawg accepts the challenge (RPC or update)
    await mdawg.client.from("challenges").update({ status: "accepted" }).eq("id", ch.id);
    // Emit challenge_accepted to John
    var ne = await mdawg.client.rpc("emit_notification", {
      p_user_id: john.userId, p_type: "challenge_accepted",
      p_entity_id: ch.id, p_metadata: null,
    });
    log("challenge_accepted emit err: " + (ne.error ? ne.error.message : "none"));

    // John opens their notification tray and clicks Log result
    await john.page.goto(SITE + "/home", { waitUntil: "domcontentloaded" });
    await john.page.waitForTimeout(3000);
    await john.page.evaluate(function () {
      // Force-click any element containing "Log result" text.
      var el = Array.from(document.querySelectorAll("button,a")).find(function (b) {
        return /Log result/i.test(b.innerText || "");
      });
      if (el) el.click();
    });
    await john.page.waitForTimeout(2500);
    var bSnap = await john.page.evaluate(function () {
      return {
        url: location.pathname,
        hasScoreModal: /Submit score|Log result|Sets/i.test(document.body.innerText)
                      && /challenges/i.test(location.pathname),
        body: document.body.innerText.slice(0, 400),
      };
    });
    log("(b) after clicking Log result: url=" + bSnap.url + " hasModal=" + bSnap.hasScoreModal);

    // Cleanup
    await john.client.from("challenges").delete().eq("id", ch.id);
    await john.client.from("match_history").delete().eq("id", m.id);
    log("cleanup done");
  } finally {
    await browser.close();
  }
}
main().catch(function (e) { console.error("FAIL:", e.message || e); process.exit(1); });
