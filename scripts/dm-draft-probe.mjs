#!/usr/bin/env node
/**
 * scripts/dm-draft-probe.mjs
 *
 * End-to-end check that draft conversations work on the live preview:
 *   1. Sign in as Mdawg (test@test.com)
 *   2. Find a profile for whom there's no existing conversation
 *   3. Click "Message" → draft should open (thread UI should appear,
 *      not bounce back to conversation list)
 *   4. Verify nothing new lands in the other user's (John's) inbox
 *      via a parallel check
 *
 * Usage: node scripts/dm-draft-probe.mjs
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

var SITE = "https://rarired-git-mdawg-miikhcs-projects.vercel.app";

function log(m) { console.log("[probe]", m); }

async function getCreds(page) {
  var res = await page.content();
  var m = res.match(/src="(\/assets\/index-[^"]+\.js)"/);
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
  return { page, ctx, userId: authData.user.id, creds, client };
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  try {
    log("signing in Mdawg + John");
    var mdawg = await signInAs("test@test.com", "123456", browser);
    var john  = await signInAs("test1@test.com", "123456", browser);

    // Capture John's notification tray state BEFORE Mdawg does anything.
    var beforeJohnNotifs = await john.client
      .from("notifications").select("id,type,created_at,from_user_id")
      .eq("user_id", john.userId)
      .order("created_at", { ascending: false }).limit(5);
    var beforeIds = new Set((beforeJohnNotifs.data || []).map(function (n) { return n.id; }));
    log("John's notifications before: " + (beforeJohnNotifs.data || []).length);

    // Capture John's conversations BEFORE.
    var beforeJohnConvs = await john.client
      .from("conversations").select("id,user1_id,user2_id,status,last_message_at")
      .or("user1_id.eq." + john.userId + ",user2_id.eq." + john.userId);
    var beforeConvIds = new Set((beforeJohnConvs.data || []).map(function (c) { return c.id; }));
    log("John's conversations before: " + (beforeJohnConvs.data || []).length);

    // We need a fresh partner for Mdawg — one with whom there's NO
    // existing conversation. If John already has a conv with Mdawg,
    // delete it so this test exercises the draft path.
    var pairConv = (beforeJohnConvs.data || []).find(function (c) {
      return (c.user1_id === mdawg.userId && c.user2_id === john.userId) ||
             (c.user2_id === mdawg.userId && c.user1_id === john.userId);
    });
    if (pairConv) {
      log("pair conv exists (" + pairConv.id + ") — removing for clean test");
      await mdawg.client.from("conversations").delete().eq("id", pairConv.id);
      await mdawg.page.waitForTimeout(800);
    }

    // Open Mdawg's People tab and tap "Message" on John.
    log("mdawg → /people/friends");
    await mdawg.page.goto(SITE + "/people/friends", { waitUntil: "domcontentloaded" });
    await mdawg.page.waitForTimeout(5000);

    var clickResult = await mdawg.page.evaluate(function () {
      // Find the specific row containing "John" in its own text and
      // click the Message button inside THAT row (not a parent div
      // whose innerText merges siblings).
      var rows = Array.from(document.querySelectorAll("div")).filter(function (d) {
        var direct = Array.from(d.childNodes).filter(function (n) { return n.nodeType === 3; })
          .map(function (n) { return n.textContent.trim(); }).join(" ");
        // Match John's name appearing as the row's OWN direct-text heading
        return /\bJohn\b/.test((d.querySelector("div") && d.querySelector("div").innerText) || "")
            && d.querySelector('button') &&
            Array.from(d.querySelectorAll('button')).some(function(b){ return (b.innerText||"").trim()==="Message"; });
      });
      if (!rows.length) return { ok: false, reason: "no John row with Message button", rowsChecked: document.querySelectorAll("div").length };
      var firstRow = rows[0];
      var msgBtn = Array.from(firstRow.querySelectorAll('button')).find(function(b){ return (b.innerText||"").trim()==="Message"; });
      msgBtn.click();
      return { ok: true, rowText: (firstRow.innerText || "").slice(0, 60) };
    });
    log("click Message on John: " + JSON.stringify(clickResult));
    if (!clickResult.ok) { await browser.close(); process.exit(1); }

    await mdawg.page.waitForTimeout(2500);

    // Check: URL is /people/messages (bare — draft doesn't deep-link).
    // The thread input bar should be visible (= draft opened).
    var state = await mdawg.page.evaluate(function () {
      var ta = document.querySelector('textarea[placeholder^="Message "]');
      var back = document.querySelector('button[aria-label="Back"]');
      return {
        url: window.location.pathname,
        threadOpen: !!ta,
        placeholder: ta ? ta.placeholder : null,
        backBtn: !!back,
      };
    });
    log("after-click state: " + JSON.stringify(state));

    if (!state.threadOpen) {
      log("❌ FAIL: thread did not open after tapping Message on a new partner");
      await browser.close();
      process.exit(1);
    } else {
      log("✓ thread opened with draft");
    }

    // Check John side — nothing new should have landed.
    var afterJohnConvs = await john.client
      .from("conversations").select("id,user1_id,user2_id")
      .or("user1_id.eq." + john.userId + ",user2_id.eq." + john.userId);
    var newConvs = (afterJohnConvs.data || []).filter(function (c) { return !beforeConvIds.has(c.id); });
    log("John's NEW conversations after draft open: " + newConvs.length);
    if (newConvs.length > 0) {
      log("❌ FAIL: a conversation leaked into John's inbox despite draft");
      console.log(JSON.stringify(newConvs, null, 2));
      await browser.close();
      process.exit(1);
    } else {
      log("✓ John saw no new conversation");
    }

    var afterJohnNotifs = await john.client
      .from("notifications").select("id,type,from_user_id")
      .eq("user_id", john.userId)
      .order("created_at", { ascending: false }).limit(5);
    var newNotifs = (afterJohnNotifs.data || []).filter(function (n) { return !beforeIds.has(n.id); });
    log("John's NEW notifications after draft open: " + newNotifs.length);
    if (newNotifs.length > 0) {
      log("❌ FAIL: notification leaked despite draft");
      console.log(JSON.stringify(newNotifs, null, 2));
      await browser.close();
      process.exit(1);
    } else {
      log("✓ John got no notification");
    }

    // Type a message + send → should materialize the conv + message_request notif.
    log("typing + sending first message");
    var typed = await mdawg.page.evaluate(async function () {
      var ta = document.querySelector('textarea[placeholder^="Message "]');
      if (!ta) return { ok: false, reason: "no textarea" };
      var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(ta, "hello from the probe");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      return { ok: true };
    });
    log("typed: " + JSON.stringify(typed));
    await mdawg.page.waitForTimeout(300);

    var sent = await mdawg.page.evaluate(function () {
      var sendBtn = Array.from(document.querySelectorAll("button")).find(function (b) {
        return (b.innerText || "").trim() === "Send";
      });
      if (!sendBtn) return { ok: false, reason: "no Send button" };
      sendBtn.click();
      return { ok: true };
    });
    log("sent: " + JSON.stringify(sent));
    await mdawg.page.waitForTimeout(2500);

    // Now John SHOULD have a conversation + a message_request notification.
    var afterSendConvs = await john.client
      .from("conversations").select("id,status,last_message_preview")
      .or("user1_id.eq." + john.userId + ",user2_id.eq." + john.userId);
    var stillNew = (afterSendConvs.data || []).filter(function (c) { return !beforeConvIds.has(c.id); });
    log("John's NEW convs after send: " + stillNew.length);
    if (stillNew.length !== 1) {
      log("❌ FAIL: expected exactly one conv after send, got " + stillNew.length);
    } else {
      log("✓ conv materialized: status=" + stillNew[0].status + " preview=" + stillNew[0].last_message_preview);
    }

    var afterSendNotifs = await john.client
      .from("notifications").select("id,type,from_user_id,metadata")
      .eq("user_id", john.userId)
      .order("created_at", { ascending: false }).limit(5);
    var stillNewN = (afterSendNotifs.data || []).filter(function (n) { return !beforeIds.has(n.id); });
    log("John's NEW notifs after send: " + stillNewN.length);
    stillNewN.forEach(function (n) { log("  - " + n.type + " from " + n.from_user_id); });

    log("done.");
  } finally {
    await browser.close();
  }
}

main().catch(function (e) { console.error("FAIL:", e); process.exit(2); });
