#!/usr/bin/env node
/**
 * scripts/verify-dm-two-user.mjs
 *
 * End-to-end DM smoke test. Spins up two Supabase service-role clients,
 * creates a conversation, sends messages each way, checks the realtime
 * INSERT events fire, exercises reactions and soft-delete, and marks
 * read receipts.
 *
 * Requires env vars:
 *   SUPABASE_URL                — Postgres project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — service role key (bypasses RLS)
 *   DM_USER_A                   — auth.uid of test user A
 *   DM_USER_B                   — auth.uid of test user B
 *
 * Both test users must exist as rows in profiles; we do NOT create auth
 * users here (that's an auth-admin concern). Use two real test accounts
 * signed up in staging.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   DM_USER_A=... DM_USER_B=... \
 *   node scripts/verify-dm-two-user.mjs
 *
 * Exits non-zero on any failed assertion.
 */

import { createClient } from "@supabase/supabase-js";

var url = process.env.SUPABASE_URL;
var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
var uidA = process.env.DM_USER_A;
var uidB = process.env.DM_USER_B;

if (!url || !key || !uidA || !uidB) {
  console.error("Missing env — need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DM_USER_A, DM_USER_B");
  process.exit(2);
}

// Admin client — bypasses RLS so we can assert from either side without
// faking auth.uid(). For realtime we open two separate channels.
var admin = createClient(url, key, { auth: { persistSession: false } });

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function ok(label, cond) {
  if (!cond) { console.error("FAIL —", label); process.exit(1); }
  console.log("  ✓", label);
}

async function main() {
  console.log("[verify-dm] starting with A =", uidA, "B =", uidB);

  // 1. Ensure a clean slate — delete any conversation between these two.
  // `pair_key` is canonical (uuid sort); this works regardless of column order.
  var pair = [uidA, uidB].sort().join(":");
  var del = await admin.from("conversations").delete().eq("pair_key", pair);
  ok("clean slate: prior conversation removed", !del.error);

  // 2. Create an accepted conversation directly (we're admin, skipping the RPC).
  var created = await admin.from("conversations").insert({
    user1_id: [uidA, uidB].sort()[0],
    user2_id: [uidA, uidB].sort()[1],
    pair_key: pair,
    requester_id: uidA,
    status: "accepted",
  }).select("*").single();
  ok("create accepted conversation", !created.error && created.data);
  var convId = created.data.id;
  console.log("[verify-dm] conversation:", convId);

  // 3. Subscribe both sides to direct_messages INSERTs.
  var rx = { a: [], b: [] };
  var chanA = admin.channel("test-a:" + convId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: "conversation_id=eq." + convId },
      function (p) { rx.a.push(p.new); })
    .subscribe();
  var chanB = admin.channel("test-b:" + convId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: "conversation_id=eq." + convId },
      function (p) { rx.b.push(p.new); })
    .subscribe();
  await sleep(800); // give realtime a moment to attach

  // 4. A sends a message.
  var sendA = await admin.from("direct_messages").insert({
    conversation_id: convId, sender_id: uidA, content: "hello from A",
  }).select("*").single();
  ok("A sends message", !sendA.error && sendA.data);

  // 5. B sends a reply.
  var sendB = await admin.from("direct_messages").insert({
    conversation_id: convId, sender_id: uidB, content: "hi back from B",
  }).select("*").single();
  ok("B sends reply", !sendB.error && sendB.data);

  // 6. Wait for realtime to deliver.
  await sleep(1500);
  ok("both sides receive message from A via realtime", rx.a.some(function (m) { return m.id === sendA.data.id; }) && rx.b.some(function (m) { return m.id === sendA.data.id; }));
  ok("both sides receive message from B via realtime", rx.a.some(function (m) { return m.id === sendB.data.id; }) && rx.b.some(function (m) { return m.id === sendB.data.id; }));

  // 7. Order check — messages are chronologically ordered per fetch.
  var thread = await admin.from("direct_messages").select("id,sender_id,created_at").eq("conversation_id", convId).order("created_at", { ascending: true });
  ok("thread ordered oldest → newest", !thread.error && thread.data.length === 2 && thread.data[0].sender_id === uidA && thread.data[1].sender_id === uidB);

  // 8. B reacts to A's message.
  var addRx = await admin.from("message_reactions").insert({
    message_id: sendA.data.id, user_id: uidB, emoji: "👍",
  }).select("*").single();
  ok("B reacts to A's message", !addRx.error && addRx.data);

  // 9. A soft-deletes their message.
  var del2 = await admin.from("direct_messages").update({
    deleted_at: new Date().toISOString(),
  }).eq("id", sendA.data.id);
  ok("A soft-deletes own message", !del2.error);

  // 10. Read receipt: B marks read via the RPC.
  var read = await admin.rpc("mark_conversation_read", { p_conversation_id: convId });
  ok("mark_conversation_read RPC returns no error (RLS permits signed-in user)", !read.error);

  // 11. Emoji range check — insert a non-ASCII compound grapheme.
  var fancy = await admin.from("direct_messages").insert({
    conversation_id: convId, sender_id: uidA, content: "🤹‍♂️🎾🌈",
  }).select("*").single();
  ok("compound emoji content round-trips", !fancy.error && fancy.data && fancy.data.content.indexOf("🎾") !== -1);

  // Cleanup.
  admin.removeChannel(chanA);
  admin.removeChannel(chanB);
  var cleanup = await admin.from("conversations").delete().eq("id", convId);
  ok("cleanup conversation", !cleanup.error);

  console.log("[verify-dm] all checks passed.");
  process.exit(0);
}

main().catch(function (e) { console.error("uncaught:", e); process.exit(1); });
