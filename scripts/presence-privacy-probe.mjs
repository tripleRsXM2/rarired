#!/usr/bin/env node
/**
 * scripts/presence-privacy-probe.mjs
 *
 * Verifies the privacy toggles on profiles.show_online_status and
 * profiles.show_last_seen actually gate what the OTHER user sees.
 *
 *   1. Put John online (touch last_active=now()).
 *   2. Mdawg opens John's thread → should see green dot + "Active now".
 *   3. Flip John's show_online_status to false. Mdawg reloads.
 *      Should see NO green dot, NO "Active now". "Last seen" may still
 *      render per show_last_seen.
 *   4. Flip John's show_last_seen to false too (dot already off).
 *      Mdawg reloads → no dot, no label at all.
 *   5. Put John back to defaults.
 *
 * Each step's result logged.
 */

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
  var { data: authData, error: authErr } = await client.auth.signInWithPassword({ email, password });
  if (authErr) throw new Error("auth " + email + ": " + authErr.message);
  var projectRef = creds.url.replace("https://", "").split(".")[0];
  await page.evaluate(function (args) {
    localStorage.setItem(args.k, args.v);
  }, { k: "sb-" + projectRef + "-auth-token", v: JSON.stringify(authData.session) });
  return { page, ctx, userId: authData.user.id, client };
}

async function checkWhatMdawgSees(mdawg, label) {
  // Reload the convs list so we re-fetch partner profile state.
  await mdawg.page.goto(SITE + "/people/messages", { waitUntil: "domcontentloaded" });
  await mdawg.page.waitForTimeout(5500);
  // Click into John's thread so the header presence label renders.
  await mdawg.page.evaluate(function () {
    var row = Array.from(document.querySelectorAll(".cs-dm-list-pane button")).find(function (b) {
      return /John/.test(b.innerText || "");
    });
    if (row) row.click();
  });
  await mdawg.page.waitForTimeout(1500);

  return mdawg.page.evaluate(function () {
    var body = document.body.innerText;
    // Scope the dot count to the thread region (.cs-dm-root): the
    // sidebar has Mdawg's OWN avatar dot, which uses viewerIsSelf and
    // correctly ignores the partner's privacy toggles.
    var scope = document.querySelector(".cs-dm-root") || document.body;
    var allEls = Array.from(scope.querySelectorAll("div"));
    var presenceDots = allEls.filter(function (el) {
      var cs = getComputedStyle(el);
      if (cs.position !== "absolute") return false;
      if (cs.borderRadius !== "50%") return false;
      var r = el.getBoundingClientRect();
      if (r.width < 8 || r.width > 14) return false;
      if (cs.backgroundColor === "transparent" || cs.backgroundColor === "rgba(0, 0, 0, 0)") return false;
      return true;
    });
    return {
      dotCount: presenceDots.length,
      hasActiveNow: /Active now/.test(body),
      hasLastSeen: /Last seen/.test(body),
      hasAway:     /Away/.test(body),
    };
  });
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  try {
    log("sign in both accounts");
    var mdawg = await signInAs("test@test.com", "123456", browser);
    var john  = await signInAs("test1@test.com", "123456", browser);

    // Put John online + defaults.
    log("PHASE 1 — John online, both flags default TRUE");
    await john.client.from("profiles").update({
      last_active: new Date().toISOString(),
      show_online_status: true,
      show_last_seen: true,
    }).eq("id", john.userId);
    var r1 = await checkWhatMdawgSees(mdawg, "defaults");
    log("  result: " + JSON.stringify(r1));
    if (r1.dotCount >= 1 && r1.hasActiveNow) log("  ✓ green dot + Active now visible");
    else log("  ❌ expected dot+Active, got: " + JSON.stringify(r1));

    // Flip show_online_status off.
    log("PHASE 2 — show_online_status = FALSE (dot should vanish; last-seen still OK)");
    await john.client.from("profiles").update({
      last_active: new Date().toISOString(),
      show_online_status: false,
      show_last_seen: true,
    }).eq("id", john.userId);
    var r2 = await checkWhatMdawgSees(mdawg, "online-off");
    log("  result: " + JSON.stringify(r2));
    if (r2.dotCount === 0 && !r2.hasActiveNow) log("  ✓ no dot, no 'Active now'");
    else log("  ❌ dot should be hidden, got: " + JSON.stringify(r2));

    // Flip last_seen off too — put John slightly in the past so label
    // would have been "Last seen …"; flag should silence it.
    log("PHASE 3 — both OFF (no dot, no label of any kind)");
    var past = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago → Away range
    await john.client.from("profiles").update({
      last_active: past,
      show_online_status: false,
      show_last_seen: false,
    }).eq("id", john.userId);
    var r3 = await checkWhatMdawgSees(mdawg, "both-off");
    log("  result: " + JSON.stringify(r3));
    if (r3.dotCount === 0 && !r3.hasActiveNow && !r3.hasLastSeen && !r3.hasAway) {
      log("  ✓ no dot, no presence label");
    } else {
      log("  ❌ everything should be hidden, got: " + JSON.stringify(r3));
    }

    // Restore defaults.
    log("restore John's defaults");
    await john.client.from("profiles").update({
      last_active: new Date().toISOString(),
      show_online_status: true,
      show_last_seen: true,
    }).eq("id", john.userId);

    log("done.");
  } finally {
    await browser.close();
  }
}

main().catch(function (e) { console.error("FAIL:", e); process.exit(1); });
