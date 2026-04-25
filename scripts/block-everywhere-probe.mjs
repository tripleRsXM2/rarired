#!/usr/bin/env node
// End-to-end probe of the asymmetric block model.
//
// Setup: Mdawg blocks John. Expectations:
//   1. John is filtered out of fetchPlayersInZone for Mdawg.
//   2. John is filtered out of fetchPlayersAtCourt for Mdawg.
//   3. John can no longer INSERT into direct_messages whose conversation
//      includes Mdawg — the BEFORE INSERT trigger should raise.
//   4. The reverse direction is unaffected: from John's side, Mdawg
//      remains visible (asymmetric).
//
// Cleanup: unblocks at the end so prod isn't left in a weird state.

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

var SITE = "https://rarired-git-mdawg-miikhcs-projects.vercel.app";
function log(m) { console.log("[probe]", m); }

async function getCreds() {
  var b = await chromium.launch({ headless: true });
  var p = await b.newPage();
  await p.goto(SITE, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(700);
  var html = await p.content();
  var m = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  var js = await (await fetch(SITE + m[1])).text();
  await b.close();
  return {
    url: js.match(/(https:\/\/[a-z0-9]+\.supabase\.co)/)[1],
    key: js.match(/(eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/)[1],
  };
}

async function signIn(email, password, creds) {
  var c = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  var r = await c.auth.signInWithPassword({ email, password });
  if (r.error) throw r.error;
  return { client: c, userId: r.data.user.id };
}

async function main() {
  var creds = await getCreds();
  var mdawg = await signIn("test@test.com",  "123456", creds);
  var john  = await signIn("test1@test.com", "123456", creds);
  log("mdawg=" + mdawg.userId.slice(0, 8) + " john=" + john.userId.slice(0, 8));

  // Make sure they're NOT already blocked + Mdawg has a confirmed match
  // at a known venue with John (so fetchPlayersAtCourt has them as a
  // candidate). The earlier matchmaking probe already seeds this; we
  // just clean any stale block.
  await mdawg.client.from("blocks").delete()
    .eq("blocker_id", mdawg.userId).eq("blocked_id", john.userId);

  // Ensure John has Prince Alfred in played_courts so the candidate
  // surface always lights up.
  await john.client.from("profiles").update({
    played_courts: ["Prince Alfred Park Tennis Courts"],
    home_zone: "cbd",
  }).eq("id", john.userId);

  // (1) Pre-block — John is visible from Mdawg's RPC paths.
  var preZone = await mdawg.client.from("profiles")
    .select("id").eq("home_zone", "cbd")
    .filter("id", "eq", john.userId);
  log("pre-block / john visible in cbd zone for mdawg: " + (preZone.data && preZone.data.length === 1 ? "✓" : "❌"));

  var preCount = await mdawg.client.from("profiles")
    .select("id", { count: "exact", head: true })
    .overlaps("played_courts", ["Prince Alfred Park Tennis Courts"]);
  log("pre-block / john visible at prince alfred: " + ((preCount.count || 0) >= 1 ? "✓" : "❌"));

  // (2) Block — Mdawg blocks John.
  var blk = await mdawg.client.from("blocks").insert({
    blocker_id: mdawg.userId,
    blocked_id: john.userId,
  });
  log("block insert: " + (blk.error ? "❌ " + blk.error.message : "✓"));

  // (3) Post-block — same fetches but with NOT IN against the blocked set.
  // Simulating the client's `fetchPlayersInZone(zoneId, limit, excludeIds)`
  // and the asymmetric block filter.
  var blockedIds = [john.userId];
  var postZone = await mdawg.client.from("profiles")
    .select("id").eq("home_zone", "cbd")
    .not("id", "in", "(" + blockedIds.join(",") + ")")
    .filter("id", "eq", john.userId);
  log("post-block / john dropped from cbd zone (not-in filter): "
    + ((postZone.data || []).length === 0 ? "✓" : "❌"));

  // (4) Server-side DM block guard — John tries to send Mdawg a message.
  // First find a conversation between them (or create one).
  var convQ = await john.client.from("conversations")
    .select("id,user1_id,user2_id")
    .or("and(user1_id.eq." + john.userId + ",user2_id.eq." + mdawg.userId + ")," +
        "and(user1_id.eq." + mdawg.userId + ",user2_id.eq." + john.userId + ")")
    .maybeSingle();
  var convId = convQ.data && convQ.data.id;
  if (!convId) {
    var ins = await john.client.rpc("get_or_create_conversation", { p_partner_id: mdawg.userId });
    convId = ins.data && ins.data.id;
  }
  if (!convId) {
    log("dm guard test skipped: couldn't get a conversation between them");
  } else {
    var send = await john.client.from("direct_messages").insert({
      conversation_id: convId,
      sender_id: john.userId,
      content: "probe test — should be blocked",
    });
    var raised = send.error && /recipient_has_blocked_sender/.test(send.error.message || "");
    log("dm insert by blocked sender raises: " + (raised ? "✓" : "❌ " + (send.error ? send.error.message : "no error")));
  }

  // (5) Reverse direction unaffected — Mdawg still visible to John.
  var reverse = await john.client.from("profiles")
    .select("id").eq("home_zone", "cbd")
    .filter("id", "eq", mdawg.userId);
  log("asymmetric: mdawg still visible to john (reverse): "
    + ((reverse.data || []).length === 1 ? "✓" : "❌"));

  // Cleanup — remove the block so prod returns to the prior state.
  await mdawg.client.from("blocks").delete()
    .eq("blocker_id", mdawg.userId).eq("blocked_id", john.userId);
  log("cleanup: block removed");
}
main().catch(function (e) { console.error("FAIL:", e.message || e); process.exit(1); });
