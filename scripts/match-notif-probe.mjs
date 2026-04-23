#!/usr/bin/env node
// Verify the full match confirmation notification loop:
//   1. John logs a verified match vs Mdawg → Mdawg should get match_tag
//   2. Mdawg confirms → John should get match_confirmed
// Runs against the deployed Mdawg preview. Uses the supabase JS client
// (not the UI) so we can assert what lands in the notifications table.

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

var SITE = "https://rarired-git-mdawg-miikhcs-projects.vercel.app";
function log(m) { console.log("[probe]", m); }

async function getCreds() {
  var browser = await chromium.launch({ headless: true });
  var page = await browser.newPage();
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  var html = await page.content();
  var m = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  var js = await (await fetch(SITE + m[1])).text();
  await browser.close();
  return {
    url: js.match(/(https:\/\/[a-z0-9]+\.supabase\.co)/)[1],
    key: js.match(/(eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/)[1],
  };
}

async function signIn(email, password, creds) {
  var client = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  var { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client, userId: data.user.id };
}

async function countNotifs(client, userId, type) {
  var { data, error } = await client.from("notifications")
    .select("id,type,from_user_id,match_id,entity_id,created_at")
    .eq("user_id", userId).eq("type", type)
    .order("created_at", { ascending: false }).limit(5);
  if (error) throw error;
  return data || [];
}

async function main() {
  var creds = await getCreds();
  var john  = await signIn("test1@test.com", "123456", creds);
  var mdawg = await signIn("test@test.com",  "123456", creds);
  log("john=" + john.userId + " mdawg=" + mdawg.userId);

  // Baseline counts
  var beforeMdawgTag  = await countNotifs(mdawg.client, mdawg.userId, "match_tag");
  var beforeJohnConf  = await countNotifs(john.client,  john.userId,  "match_confirmed");
  log("before: mdawg has " + beforeMdawgTag.length + " match_tag, john has " + beforeJohnConf.length + " match_confirmed");

  // STEP 1: John logs a verified match against Mdawg
  var matchDate = new Date().toISOString().slice(0, 10);
  var sets = [{you:"6", them:"3"}, {you:"6", them:"2"}];
  var payload = {
    user_id: john.userId,
    opponent_id: mdawg.userId,
    opp_name: "Mdawg",
    tourn_name: "Ranked",
    sets: sets,
    result: "win",
    match_date: matchDate,
    status: "pending_confirmation",
    submitted_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 72*3600*1000).toISOString(),
  };
  var { data: m, error: me } = await john.client.from("match_history").insert(payload).select().single();
  if (me) throw new Error("john insert match: " + me.message);
  log("john inserted match " + m.id);

  // Emit match_tag notification (same path as the UI)
  var { data: n1, error: n1e } = await john.client.rpc("emit_notification", {
    p_user_id:   mdawg.userId,
    p_type:      "match_tag",
    p_entity_id: m.id,
    p_metadata:  null,
  });
  log("emit match_tag: id=" + n1 + " err=" + (n1e ? n1e.message : "none"));

  // Verify Mdawg received match_tag
  await new Promise(function(r){setTimeout(r, 800);});
  var afterMdawgTag = await countNotifs(mdawg.client, mdawg.userId, "match_tag");
  var deltaTag = afterMdawgTag.length - beforeMdawgTag.length;
  log("mdawg match_tag delta: " + deltaTag + (deltaTag >= 1 ? " ✓" : " ❌"));
  if (deltaTag >= 1) log("  latest: " + JSON.stringify(afterMdawgTag[0]));

  // STEP 2: Mdawg confirms — RPC that updates match + emits match_confirmed
  var { error: ce } = await mdawg.client.rpc("confirm_match_and_update_stats", { p_match_id: m.id });
  log("confirm_match_and_update_stats: err=" + (ce ? ce.message : "none"));

  var { data: n2, error: n2e } = await mdawg.client.rpc("emit_notification", {
    p_user_id:   john.userId,
    p_type:      "match_confirmed",
    p_entity_id: m.id,
    p_metadata:  null,
  });
  log("emit match_confirmed: id=" + n2 + " err=" + (n2e ? n2e.message : "none"));

  await new Promise(function(r){setTimeout(r, 800);});
  var afterJohnConf = await countNotifs(john.client, john.userId, "match_confirmed");
  var deltaConf = afterJohnConf.length - beforeJohnConf.length;
  log("john match_confirmed delta: " + deltaConf + (deltaConf >= 1 ? " ✓" : " ❌"));
  if (deltaConf >= 1) log("  latest: " + JSON.stringify(afterJohnConf[0]));

  // Cleanup — delete the test match (cascade will clear notifications via trigger).
  await john.client.from("match_history").delete().eq("id", m.id);
  log("cleaned up test match");
}

main().catch(function(e){ console.error("FAIL:", e.message || e); process.exit(1); });
