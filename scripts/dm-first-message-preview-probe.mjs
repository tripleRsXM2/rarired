#!/usr/bin/env node
/**
 * scripts/dm-first-message-preview-probe.mjs
 *
 * Full end-to-end check of the "first message preview on recipient side" fix.
 *   1. Reset state: nuke the Mdawg↔John conv + friendship so we always
 *      exercise the non-friend first-DM path.
 *   2. Mdawg signs in, opens compose for John (draft), types + sends
 *      one message.
 *   3. John signs in and reads notifications + the request row. The
 *      preview text should be non-null after a short wait (realtime
 *      UPDATE has to propagate).
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
  return { page, ctx, userId: authData.user.id, client };
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  try {
    log("signing in Mdawg + John");
    var mdawg = await signInAs("test@test.com", "123456", browser);
    var john  = await signInAs("test1@test.com", "123456", browser);

    // -- Reset state so this is a clean first-DM-from-non-friend run.
    log("resetting state");
    // Delete any existing Mdawg↔John conv (either client can — both are parties).
    var existing = await mdawg.client.from("conversations").select("id")
      .or(
        "and(user1_id.eq." + mdawg.userId + ",user2_id.eq." + john.userId + "),and(user2_id.eq." + mdawg.userId + ",user1_id.eq." + john.userId + ")"
      );
    if (existing.data && existing.data.length) {
      for (var i = 0; i < existing.data.length; i++) {
        await mdawg.client.from("conversations").delete().eq("id", existing.data[i].id);
      }
      log("deleted " + existing.data.length + " existing conv(s)");
    }
    // Break friendship so the first DM goes into requests, not auto-accepted.
    var fr = await mdawg.client.from("friend_requests").select("id,status")
      .or(
        "and(sender_id.eq." + mdawg.userId + ",receiver_id.eq." + john.userId + "),and(sender_id.eq." + john.userId + ",receiver_id.eq." + mdawg.userId + ")"
      );
    if (fr.data && fr.data.length && fr.data[0].status === "accepted") {
      // Delete the accepted row (RLS lets either party delete).
      await mdawg.client.from("friend_requests").delete().eq("id", fr.data[0].id);
      log("unfriended for test");
    } else {
      log("already non-friends: " + JSON.stringify(fr.data));
    }

    // -- Mdawg: simulate compose-and-send via JS client (bypasses the
    // UI selector fragility; the UI's openOrStartConversation + sendMessage
    // do exactly this under the hood).
    log("mdawg → get_or_create_conversation + insert first DM");
    var gc = await mdawg.client.rpc("get_or_create_conversation", { other_id: john.userId }).single();
    if (gc.error) throw new Error("get_or_create: " + gc.error.message);
    var convId = gc.data.id;
    log("conv materialized: " + convId + " status=" + gc.data.status);

    var ins = await mdawg.client.from("direct_messages").insert({
      conversation_id: convId, sender_id: mdawg.userId,
      content: "hey john — first message from the probe",
    }).select().single();
    if (ins.error) throw new Error("dm insert: " + ins.error.message);
    log("dm inserted at " + ins.data.created_at);

    // Emit the message_request notification the UI would emit.
    await mdawg.client.rpc("emit_notification", {
      p_user_id: john.userId, p_type: "message_request",
      p_entity_id: convId, p_metadata: null,
    });

    // -- John: open messages + check the request row shows the preview.
    log("john → /people/messages");
    await john.page.goto(SITE + "/people/messages", { waitUntil: "domcontentloaded" });
    await john.page.waitForTimeout(6000);

    var johnState = await john.page.evaluate(function () {
      var pane = document.querySelector(".cs-dm-list-pane");
      var htmlPreview = pane ? pane.innerText.slice(0, 400) : "(no pane)";
      // Find the Mdawg row + extract the preview paragraph.
      var bodyText = document.body.innerText;
      return {
        listPaneText: htmlPreview,
        hasWantsToMessage: /wants to message you/.test(bodyText),
        // Extract any quoted preview text ("foo") that appears near the Mdawg row.
        quotedPreview: (bodyText.match(/"([^"]{3,100})"/) || [])[1] || null,
      };
    });
    log("john's list state: " + JSON.stringify(johnState, null, 2));

    // The preview text renders as either a quoted string (inside the
    // request-card "wants to message you" layout) OR as plain text
    // under the partner name (accepted-conv row layout). Accept either.
    var probe = "hey john — first message from the probe";
    if (johnState.listPaneText.indexOf(probe) >= 0) {
      log("✓ PREVIEW VISIBLE in John's conversation pane");
    } else {
      log("❌ preview NOT visible in John's view");
    }

    // -- Also poll the DB directly.
    var { data: johnConvs } = await john.client.from("conversations")
      .select("id,status,last_message_preview,last_message_sender_id")
      .or("user1_id.eq." + john.userId + ",user2_id.eq." + john.userId);
    log("john DB view: " + JSON.stringify(johnConvs, null, 2));

    log("done.");
  } finally {
    await browser.close();
  }
}

main().catch(function (e) { console.error("FAIL:", e); process.exit(1); });
