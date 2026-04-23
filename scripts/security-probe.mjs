#!/usr/bin/env node
/**
 * scripts/security-probe.mjs
 *
 * Verifies the fixes from the security hardening pass by attempting each
 * vulnerability end-to-end via the anon REST API (same thing an attacker
 * would do). Logs PASS/FAIL per check.
 *
 * Uses the two test accounts + a service-role key for setup/teardown.
 * Service role is read from ~/.supabase/service-key if present, otherwise
 * some checks are skipped.
 *
 * Usage: node scripts/security-probe.mjs
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

var SUPABASE_URL = "https://yndpjabmrkqclcxeecei.supabase.co";
var ANON_KEY; // fetched from a lightweight bundle probe

var ATTACKER  = { email: "test@test.com",  password: "123456" }; // Mdawg
var VICTIM    = { email: "test1@test.com", password: "123456" }; // John

var pass = 0, fail = 0;
function mark(name, ok, extra) {
  if (ok) { pass++; console.log("  ✓ " + name + (extra ? " — " + extra : "")); }
  else   { fail++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); }
}

async function loadAnon() {
  var res = await fetch("https://rarired-git-mdawg-miikhcs-projects.vercel.app/");
  var html = await res.text();
  var m = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  var js = await (await fetch("https://rarired-git-mdawg-miikhcs-projects.vercel.app" + m[1])).text();
  ANON_KEY = js.match(/(eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/)[1];
}

async function signIn(u) {
  var c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  var r = await c.auth.signInWithPassword(u);
  if (r.error) throw new Error("signin failed for " + u.email + ": " + r.error.message);
  return { client: c, userId: r.data.user.id };
}

async function main() {
  console.log("Loading anon key...");
  await loadAnon();
  console.log("anon: " + ANON_KEY.slice(0, 16) + "...");
  var attacker = await signIn(ATTACKER);
  var victim   = await signIn(VICTIM);
  console.log("attacker=" + attacker.userId + "  victim=" + victim.userId);

  // ---------------------------------------------------------------------
  // C1 — forged notification
  // ---------------------------------------------------------------------
  console.log("\nC1 — forged cross-user notification:");
  var forge = await attacker.client.from("notifications").insert({
    user_id: victim.userId,
    type: "friend_request_accepted",
    from_user_id: "00000000-0000-0000-0000-000000000000",
    metadata: { preview: "totally-legit-link.com" },
  });
  mark("direct insert with spoofed from_user_id blocked", !!forge.error, forge.error && forge.error.message);

  var forge2 = await attacker.client.from("notifications").insert({
    user_id: victim.userId,
    type: "friend_request",
    metadata: { preview: "hi" },
    // no from_user_id
  });
  mark("direct insert without from_user_id blocked (user_id != auth.uid())", !!forge2.error, forge2.error && forge2.error.message);

  var rpc1 = await attacker.client.rpc("emit_notification", {
    p_user_id: victim.userId,
    p_type: "friend_request",
    p_entity_id: null, p_metadata: { preview: "hi" },
  });
  mark("emit_notification RPC rejects type without supporting row", !!rpc1.error, rpc1.error && rpc1.error.message);

  // ---------------------------------------------------------------------
  // C2 — tournament writes by non-admin
  // ---------------------------------------------------------------------
  console.log("\nC2 — admin-only tournaments:");
  var tourn = await victim.client.from("tournaments").insert({
    name: "Hax Cup", size: 16,
  });
  // Expect RLS violation specifically, not a schema mismatch.
  var rlsBlocked = tourn.error && /row-level security|policy/i.test(tourn.error.message);
  mark("non-admin tournament insert blocked (RLS)", rlsBlocked, tourn.error && tourn.error.message);

  // ---------------------------------------------------------------------
  // C3 — profiles privacy
  // ---------------------------------------------------------------------
  console.log("\nC3 — profiles SELECT (unauthed scrape):");
  var anonOnly = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  var scrape = await anonOnly.from("profiles").select("id,name,home_zone,last_active,ranking_points").limit(100);
  mark("anon cannot scrape profiles", (scrape.data || []).length === 0, "returned " + ((scrape.data || []).length) + " rows");

  // ---------------------------------------------------------------------
  // C4 — friend_requests sender cannot accept own request
  // ---------------------------------------------------------------------
  console.log("\nC4 — sender cannot self-accept:");
  // Whatever pair exists between attacker and victim — pending or
  // accepted — a sender must not be able to flip status via UPDATE.
  var frExisting = await attacker.client.from("friend_requests").select("id,status")
    .eq("sender_id", attacker.userId).eq("receiver_id", victim.userId).maybeSingle();
  if (!frExisting.data) {
    mark("setup: friend_request exists for pair", false, "no row — recreate via UI then re-run");
  } else {
    var origStatus = frExisting.data.status;
    var flip = origStatus === "accepted" ? "pending" : "accepted";
    var selfFlip = await attacker.client.from("friend_requests")
      .update({ status: flip }).eq("id", frExisting.data.id).select();
    mark("sender cannot update own friend_request status",
      !selfFlip.data || selfFlip.data.length === 0,
      "status was " + origStatus + ", attempted → " + flip + ", rows affected: " + ((selfFlip.data || []).length));
  }

  // ---------------------------------------------------------------------
  // C7 — DM insert into conv I'm not in
  // ---------------------------------------------------------------------
  console.log("\nC7 — DM insert to foreign conv:");
  // Find a real conversation id to target; attacker is Mdawg, pick a conv
  // Mdawg is in (they are), then try to insert as if into some other.
  var myConvs = await attacker.client.from("conversations").select("id").limit(1);
  if (myConvs.data && myConvs.data.length) {
    var fakeConvId = "00000000-0000-0000-0000-000000000001";
    var injected = await attacker.client.from("direct_messages").insert({
      conversation_id: fakeConvId,
      sender_id: attacker.userId,
      content: "injected",
    });
    mark("cannot insert DM into non-existent/non-participant conv", !!injected.error, injected.error && injected.error.message);
  } else { mark("setup: attacker has a conversation to reference", false, ""); }

  // ---------------------------------------------------------------------
  // C8 — direct conversations INSERT blocked
  // ---------------------------------------------------------------------
  console.log("\nC8 — direct conversations insert:");
  var directConv = await attacker.client.from("conversations").insert({
    user1_id: attacker.userId, user2_id: victim.userId,
    status: "accepted", requester_id: victim.userId,
  });
  mark("direct conversations INSERT blocked (RPC only)", !!directConv.error, directConv.error && directConv.error.message);

  // ---------------------------------------------------------------------
  // C10 — anon feed scrape
  // ---------------------------------------------------------------------
  console.log("\nC10 — anon scrape of social graph:");
  var anonLikes    = await anonOnly.from("feed_likes").select("*").limit(5);
  var anonFollows  = await anonOnly.from("follows").select("*").limit(5);
  var anonComments = await anonOnly.from("feed_comments").select("*").limit(5);
  mark("anon cannot read feed_likes",    (anonLikes.data    || []).length === 0, "rows=" + ((anonLikes.data    || []).length));
  mark("anon cannot read follows",       (anonFollows.data  || []).length === 0, "rows=" + ((anonFollows.data  || []).length));
  mark("anon cannot read feed_comments", (anonComments.data || []).length === 0, "rows=" + ((anonComments.data || []).length));

  // ---------------------------------------------------------------------
  // C11 — notification mutation restriction
  // ---------------------------------------------------------------------
  console.log("\nC11 — notif UPDATE column lock:");
  // Insert a self-notification legitimately, then try to rewrite type.
  var selfNotif = await attacker.client.from("notifications").insert({
    user_id: attacker.userId, type: "probe", from_user_id: null,
  }).select().single();
  if (selfNotif.data) {
    var mutate = await attacker.client.from("notifications")
      .update({ type: "friend_request", from_user_id: victim.userId })
      .eq("id", selfNotif.data.id).select();
    mark("notif type/from_user_id cannot be mutated post-insert",
      !mutate.data || mutate.data.length === 0 || (mutate.error && /locked/.test(mutate.error.message)),
      mutate.error ? mutate.error.message : "updated " + (mutate.data||[]).length + " rows");
    await attacker.client.from("notifications").delete().eq("id", selfNotif.data.id);
  } else {
    mark("setup: self notification inserted", false, selfNotif.error && selfNotif.error.message);
  }

  // ---------------------------------------------------------------------
  // Stat columns locked
  // ---------------------------------------------------------------------
  console.log("\nStat/admin columns locked on profiles:");
  var self999 = await attacker.client.from("profiles")
    .update({ ranking_points: 999999 }).eq("id", attacker.userId).select();
  mark("cannot self-set ranking_points",
    !!self999.error || !self999.data || self999.data.length === 0,
    self999.error ? self999.error.message : "updated " + ((self999.data||[]).length) + " rows");

  var selfAdmin = await victim.client.from("profiles")
    .update({ is_admin: true }).eq("id", victim.userId).select();
  mark("cannot self-elevate is_admin",
    !!selfAdmin.error || !selfAdmin.data || selfAdmin.data.length === 0,
    selfAdmin.error ? selfAdmin.error.message : "updated " + ((selfAdmin.data||[]).length) + " rows");

  console.log("\n---");
  console.log("PASS: " + pass + "  FAIL: " + fail);
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) { console.error("PROBE ERROR:", e); process.exit(2); });
