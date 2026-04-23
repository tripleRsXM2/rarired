#!/usr/bin/env node
/**
 * scripts/dm-state-probe.mjs
 *
 * Verifies:
 *   1. URL deep linking — /people/messages/<convId> updates on open,
 *      and a hard reload to that URL lands back in the same thread.
 *   2. "Sent/Seen" receipt renders on my last non-deleted message.
 *
 * Usage: node scripts/dm-state-probe.mjs <email> <pw>
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

var [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("usage: node scripts/dm-state-probe.mjs <email> <password>");
  process.exit(2);
}
var SITE = "https://rarired-git-mdawg-miikhcs-projects.vercel.app";

function log(m) { console.log("[probe]", m); }

async function getSupabaseCreds(page) {
  var html = await page.content();
  var bundleMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  var res = await fetch(SITE + bundleMatch[1]);
  var js = await res.text();
  return {
    url: js.match(/(https:\/\/[a-z0-9]+\.supabase\.co)/)[1],
    key: js.match(/(eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/)[1],
  };
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  var page = await ctx.newPage();

  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  var creds = await getSupabaseCreds(page);
  log("auth against " + creds.url);
  var client = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  var { data: authData, error: authErr } = await client.auth.signInWithPassword({ email, password });
  if (authErr) { log("auth failed: " + authErr.message); await browser.close(); process.exit(1); }
  log("signed in as " + authData.user.id);

  var projectRef = creds.url.replace("https://", "").split(".")[0];
  await page.evaluate(function (args) {
    localStorage.setItem(args.k, args.v);
  }, { k: "sb-" + projectRef + "-auth-token", v: JSON.stringify(authData.session) });

  // Step 1: land on /people/messages, open first conv, check URL.
  await page.goto(SITE + "/people/messages", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  log("landed on /people/messages, url = " + await page.url());

  var firstConvClick = await page.evaluate(function () {
    // Conv rows are buttons with inner text matching "<Name>\n..." and a
    // date/time snippet. Click the first one.
    var buttons = Array.from(document.querySelectorAll("button"));
    var row = buttons.find(function (b) {
      var txt = (b.innerText || "").trim();
      if (!txt || txt.length > 200) return false;
      return /\n/.test(txt) && !/Notifications|Log in|Message John|Message Mdawg|Send/i.test(txt)
          && b.offsetWidth > 150;
    });
    if (!row) return { ok: false, total: buttons.length };
    row.click();
    return { ok: true, text: (row.innerText || "").slice(0, 80) };
  });
  log("clicked conv: " + JSON.stringify(firstConvClick));
  await page.waitForTimeout(1500);
  var urlAfterOpen = await page.url();
  log("url after open = " + urlAfterOpen);

  var convIdMatch = urlAfterOpen.match(/\/people\/messages\/([0-9a-f-]{36})/);
  if (!convIdMatch) {
    log("❌ URL did NOT update to /people/messages/<convId> — deep linking broken");
  } else {
    log("✓ URL updated with convId " + convIdMatch[1]);
  }

  // Step 2: check Sent/Seen receipt is rendered somewhere.
  var receiptState = await page.evaluate(function () {
    var bodyText = document.body.innerText || "";
    return {
      hasSent: /· Sent\b/.test(bodyText),
      hasSeen: /· Seen\b/.test(bodyText),
      bodySnippet: bodyText.slice(-400),
    };
  });
  log("receipt state: Sent=" + receiptState.hasSent + "  Seen=" + receiptState.hasSeen);
  if (!receiptState.hasSent && !receiptState.hasSeen) {
    log("  body tail: " + JSON.stringify(receiptState.bodySnippet));
  }

  // Step 3: HARD RELOAD — does the URL persist + thread stay open?
  if (convIdMatch) {
    var convId = convIdMatch[1];
    log("reloading to test URL persistence...");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2800);
    var urlAfterReload = await page.url();
    log("url after reload = " + urlAfterReload);

    // Thread-open signal: look for the input bar "Message <name>..." OR
    // any bubble text. If we're on the list-only view, those won't exist.
    var postReload = await page.evaluate(function () {
      var ta = document.querySelector('textarea[placeholder^="Message "]');
      return {
        inputPresent: !!ta,
        placeholder: ta ? ta.placeholder : null,
        // The thread back button exists in thread view only.
        backBtnPresent: !!Array.from(document.querySelectorAll('button[aria-label="Back"]')).length,
      };
    });
    log("post-reload thread state: " + JSON.stringify(postReload));

    if (urlAfterReload.indexOf("/people/messages/" + convId) < 0) {
      log("❌ URL did NOT persist across reload");
    } else if (!postReload.inputPresent) {
      log("❌ URL persisted but thread did NOT re-open");
    } else {
      log("✓ URL persisted AND thread re-opened on reload");
    }
  }

  await browser.close();
  log("done.");
}

main().catch(function (e) { console.error("FAIL:", e); process.exit(1); });
