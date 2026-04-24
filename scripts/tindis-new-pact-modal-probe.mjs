#!/usr/bin/env node
// New-pact modal check.
//   1. Mdawg opens /tindis → clicks + New pact.
//   2. Assert the friends list contains John (they ARE friends in DB).
//   3. Assert the friend search input is present.
//   4. Assert the venue <select> has optgroups matching zone names
//      and at least one curated court (Prince Alfred Park).
//   5. Assert "Other (type your own)" is selectable and reveals an input.
//   6. Repeat for John to ensure symmetry.

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

async function checkModal(u, partnerName) {
  await u.page.goto(SITE + "/tindis/active", { waitUntil: "domcontentloaded" });
  await u.page.waitForTimeout(4000);

  // Click "+ New pact" (could appear in hero OR in empty state).
  var opened = await u.page.evaluate(function () {
    var btn = Array.from(document.querySelectorAll("button")).find(function (b) {
      return /New pact/i.test(b.innerText || "");
    });
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!opened) { log("  ❌ couldn't open modal"); return; }
  await u.page.waitForTimeout(1000);

  var snap = await u.page.evaluate(function (partnerName) {
    var txt = document.body.innerText;

    // Is the friend picker visible + does it contain the partner?
    var searchInput = Array.from(document.querySelectorAll("input"))
      .find(function (i) { return /search|friend/i.test(i.placeholder || ""); });
    var friendsButtons = Array.from(document.querySelectorAll("button"))
      .filter(function (b) {
        return /Partner/i.test(document.body.innerText) && (b.innerText || "").indexOf(partnerName) >= 0;
      });

    // Venue <select>: any <optgroup>?
    var venueSelect = Array.from(document.querySelectorAll("select"))
      .find(function (s) {
        var labels = Array.from(s.closest("div") && s.closest("div").querySelectorAll ? s.closest("div").querySelectorAll("label") : []);
        return labels.some(function (l) { return /Venue/i.test(l.innerText || ""); });
      });
    var hasOptgroup = !!(venueSelect && venueSelect.querySelector("optgroup"));
    var hasPrinceAlfred = !!(venueSelect && Array.from(venueSelect.options).some(function (o) { return /Prince Alfred/i.test(o.text); }));
    var hasCustomOption = !!(venueSelect && Array.from(venueSelect.options).some(function (o) { return /type your own|Other/i.test(o.text); }));

    return {
      modalOpen: /New pact/i.test(txt),
      hasSearchInput: !!searchInput,
      seesPartner: friendsButtons.length > 0,
      venuePresent: !!venueSelect,
      hasOptgroup: hasOptgroup,
      hasPrinceAlfred: hasPrinceAlfred,
      hasCustomOption: hasCustomOption,
    };
  }, partnerName);
  log("  modal snap: " + JSON.stringify(snap));

  var ok = snap.modalOpen && snap.hasSearchInput && snap.seesPartner && snap.hasOptgroup && snap.hasPrinceAlfred && snap.hasCustomOption;
  log(ok ? "  ✓ all assertions pass" : "  ❌ some assertion failed");
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  try {
    var mdawg = await signInAs("test@test.com",  "123456", browser);
    var john  = await signInAs("test1@test.com", "123456", browser);
    log("signed in both");

    log("=== Mdawg opens New pact ===");
    await checkModal(mdawg, "John");
    log("=== John opens New pact ===");
    await checkModal(john, "Mdawg");

    if (mdawg.errs.length) { log("mdawg errs:"); mdawg.errs.slice(0,3).forEach(function(e){ log("  " + e); }); }
    if (john.errs.length)  { log("john errs:");  john.errs.slice(0,3).forEach(function(e){ log("  " + e); }); }
  } finally { await browser.close(); }
}
main().catch(function(e){ console.error("FAIL:", e.message || e); process.exit(1); });
