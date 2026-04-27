#!/usr/bin/env node
/**
 * scripts/group-conv-rls-probe.mjs
 *
 * Phase 3 probe for the 20260430_group_conversations.sql migration.
 *
 * Four checks:
 *   (a) Non-participant cannot read a group conv or its messages.
 *   (b) create_group_conversation raises 'block_conflict' when any pair of
 *       prospective members has a blocks row in either direction.
 *   (c) guard_dm_insert_block raises 'recipient_has_blocked_sender' when a
 *       block exists between the sender and ANY other participant of the
 *       group conv at insert time.
 *   (d) After A creates a group with B + C, the notifications table contains
 *       one 'group_added' row for each of B and C with from_user_id = A and
 *       entity_id = the group conversation id. Locks the server-side fan-out
 *       added in 20260501_group_added_notification.sql.
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  — provisions test users / blocks / cleanup
 *   SUPABASE_ANON_KEY          — used for the auth-context auth.signInWith*
 *
 * Pattern modelled on scripts/phase1b-dm-prefill-probe.mjs (auth bootstrap)
 * and scripts/verify-dm-two-user.mjs (admin client provisioning).
 *
 * Exits non-zero on any failed assertion. Cleans up at the end (best effort
 * — service-role client deletes the auth users it created, which cascades).
 */

import { createClient } from "@supabase/supabase-js";

var URL = process.env.SUPABASE_URL;
var SR  = process.env.SUPABASE_SERVICE_ROLE_KEY;
var AK  = process.env.SUPABASE_ANON_KEY;

if (!URL || !SR || !AK) {
  console.error("Missing env — need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY");
  process.exit(2);
}

var admin = createClient(URL, SR, { auth: { persistSession: false } });

function rand() { return Math.random().toString(36).slice(2, 10); }
function ok(label, cond, extra) {
  if (!cond) { console.error("  FAIL —", label, extra ? "→ " + JSON.stringify(extra) : ""); process.exitCode = 1; return false; }
  console.log("  ok  ", label);
  return true;
}

async function createUser(tag) {
  var email = "rlsprobe-" + tag + "-" + rand() + "@example.test";
  var password = "Password123!" + rand();
  var { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error) throw new Error("createUser " + tag + ": " + error.message);
  // profile row — match_history+conversations FKs require it.
  await admin.from("profiles").upsert({
    id: data.user.id,
    name: "RLS Probe " + tag,
  });
  return { id: data.user.id, email, password };
}

async function authedClient(user) {
  var c = createClient(URL, AK, { auth: { persistSession: false, autoRefreshToken: false } });
  var { data, error } = await c.auth.signInWithPassword({
    email: user.email, password: user.password,
  });
  if (error) throw new Error("signIn " + user.email + ": " + error.message);
  return c;
}

async function main() {
  var users = [];
  var convsToCleanup = [];
  try {
    console.log("[probe] provisioning A, B, C, D...");
    var A = await createUser("A"); users.push(A);
    var B = await createUser("B"); users.push(B);
    var C = await createUser("C"); users.push(C);
    var D = await createUser("D"); users.push(D);
    console.log("[probe] users:", { A: A.id, B: B.id, C: C.id, D: D.id });

    var aClient = await authedClient(A);
    var dClient = await authedClient(D);

    // ----- Case (a) -----
    console.log("[case a] non-participant cannot read group conv");
    var grp = await aClient.rpc("create_group_conversation", { other_ids: [B.id, C.id] });
    ok("(a) create_group_conversation succeeds for A", !grp.error && !!grp.data, grp.error);
    var groupId = grp.data;
    if (groupId) convsToCleanup.push(groupId);

    // ----- Case (d) — group_added notifications fanned to B and C -----
    console.log("[case d] group_added notifications fired to non-creators");
    // Service-role bypasses RLS so we can read the notifications rows
    // directly. Should be exactly two rows for this conv: one for B, one
    // for C. A (the creator) must NOT have a row.
    var notifs = await admin.from("notifications")
      .select("user_id, type, from_user_id, entity_id, metadata")
      .eq("type", "group_added")
      .eq("entity_id", groupId);
    ok("(d) admin can read group_added notifications for the new conv",
       !notifs.error && Array.isArray(notifs.data), notifs.error);
    var rows = notifs.data || [];
    var byUser = {};
    rows.forEach(function (r) { byUser[r.user_id] = r; });
    ok("(d) B has a group_added row", !!byUser[B.id], { rows: rows });
    ok("(d) C has a group_added row", !!byUser[C.id], { rows: rows });
    ok("(d) A (creator) does NOT have a group_added row", !byUser[A.id], { rows: rows });
    if (byUser[B.id]) {
      ok("(d) B's row has from_user_id=A", byUser[B.id].from_user_id === A.id, byUser[B.id]);
      ok("(d) B's row has entity_id=groupId", byUser[B.id].entity_id === groupId, byUser[B.id]);
    }
    if (byUser[C.id]) {
      ok("(d) C's row has from_user_id=A", byUser[C.id].from_user_id === A.id, byUser[C.id]);
    }

    // A inserts a message so direct_messages has something to deny D.
    var aMsg = await aClient.from("direct_messages").insert({
      conversation_id: groupId, sender_id: A.id, content: "hello group",
    }).select("id").single();
    ok("(a) A can insert into the group conv", !aMsg.error, aMsg.error);

    // D (not a participant) reads conversations / direct_messages.
    var dConvRead = await dClient.from("conversations").select("id").eq("id", groupId);
    ok("(a) D sees 0 rows in conversations for the group",
       !dConvRead.error && Array.isArray(dConvRead.data) && dConvRead.data.length === 0,
       dConvRead);
    var dMsgRead = await dClient.from("direct_messages").select("id").eq("conversation_id", groupId);
    ok("(a) D sees 0 rows in direct_messages for the group",
       !dMsgRead.error && Array.isArray(dMsgRead.data) && dMsgRead.data.length === 0,
       dMsgRead);
    var dPartRead = await dClient.from("conversation_participants").select("user_id").eq("conversation_id", groupId);
    ok("(a) D sees 0 rows in conversation_participants for the group",
       !dPartRead.error && Array.isArray(dPartRead.data) && dPartRead.data.length === 0,
       dPartRead);

    // ----- Case (b) -----
    console.log("[case b] block_conflict raised by create RPC");
    // B blocks A → A creating a group with B should raise.
    var ins = await admin.from("blocks").insert({ blocker_id: B.id, blocked_id: A.id });
    ok("(b) seed block B→A", !ins.error, ins.error);

    var grp2 = await aClient.rpc("create_group_conversation", { other_ids: [B.id, C.id] });
    var gotConflict = !!grp2.error && /block_conflict/i.test(grp2.error.message || "");
    ok("(b) create_group_conversation raises block_conflict",
       gotConflict, grp2.error || { data: grp2.data });

    // Tear down that block before case (c).
    await admin.from("blocks").delete().match({ blocker_id: B.id, blocked_id: A.id });

    // ----- Case (c) -----
    console.log("[case c] guard fires on insert when a participant blocks sender");
    // groupId from case (a) still has A,B,C and no blocks. Add C blocks A.
    var insC = await admin.from("blocks").insert({ blocker_id: C.id, blocked_id: A.id });
    ok("(c) seed block C→A", !insC.error, insC.error);

    var aSend = await aClient.from("direct_messages").insert({
      conversation_id: groupId, sender_id: A.id, content: "should fail",
    }).select("id").single();
    var gotBlock = !!aSend.error && /recipient_has_blocked_sender/i.test(aSend.error.message || "");
    ok("(c) guard_dm_insert_block raises recipient_has_blocked_sender",
       gotBlock, aSend.error || { data: aSend.data });

    // Cleanup the case-(c) block.
    await admin.from("blocks").delete().match({ blocker_id: C.id, blocked_id: A.id });
  } finally {
    console.log("[probe] cleanup...");
    // Delete conversations we created (cascades to messages, participants).
    for (var cid of convsToCleanup) {
      // is_group=true rows have no DELETE policy at the user level, but
      // service-role bypasses RLS.
      await admin.from("conversations").delete().eq("id", cid);
    }
    // Delete the test users (cascades to profiles via FK).
    for (var u of users) {
      try { await admin.auth.admin.deleteUser(u.id); } catch (e) { /* best-effort */ }
    }
  }

  if (process.exitCode && process.exitCode !== 0) {
    console.error("[probe] FAILED");
    process.exit(process.exitCode);
  }
  console.log("[probe] all 4 cases passed.");
}

main().catch(function (e) { console.error("uncaught:", e); process.exit(1); });
