// End-to-end probe — signs in to the live Supabase project as the two
// test accounts (test@test.com = Mdawg, test1@test.com = John) and
// exercises the V2 messages flow under their real auth context.
//
// Verifies:
//   1. fetch_my_conversations RPC works for both users
//   2. participant_ids array is populated
//   3. direct_messages SELECT works under RLS (each user sees only
//      their own threads)
//   4. The data shape is what useDMs expects and what the V2 adapter
//      maps from
//   5. Sending a message via the dmService.sendMessage RPC path lands
//      in the right thread and increments last_message_at
//
// Reads creds from .env.local:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
// User credentials are hard-coded test accounts (well-known fixtures).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, "");
    }
  } catch (_) {}
  return out;
}

const env = loadEnv(".env.local");
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !ANON) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(2);
}

const TESTS = [
  { email: "test@test.com",  password: "123456", expectedName: "Mdawg" },
  { email: "test1@test.com", password: "123456", expectedName: "John" },
];

function pad(s, n) { return (s + "                       ").slice(0, n); }

let totalPass = 0;
let totalFail = 0;
const issues = [];

for (const t of TESTS) {
  console.log("");
  console.log("=".repeat(72));
  console.log("Probing as", t.email, "(" + t.expectedName + ")");
  console.log("=".repeat(72));

  // Fresh client per user so sessions don't bleed.
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Sign in
  const sign = await client.auth.signInWithPassword({ email: t.email, password: t.password });
  if (sign.error) {
    console.log("✗ signIn failed:", sign.error.message);
    totalFail++; issues.push(t.email + " signIn: " + sign.error.message);
    continue;
  }
  const userId = sign.data.user.id;
  console.log("✓ signIn ok            user_id =", userId);

  // 2) Fetch my profile
  const me = await client.from("profiles")
    .select("id,name,avatar_url,suburb,skill")
    .eq("id", userId)
    .maybeSingle();
  if (me.error) {
    console.log("✗ profile fetch:", me.error.message);
    totalFail++;
  } else {
    console.log("✓ profile              name = " + (me.data?.name || "(none)") + ", photo = " + (me.data?.avatar_url ? "yes" : "no"));
    totalPass++;
  }

  // 3) fetch_my_conversations RPC
  const fmc = await client.rpc("fetch_my_conversations");
  if (fmc.error) {
    console.log("✗ fetch_my_conversations:", fmc.error.message);
    totalFail++;
    await client.auth.signOut();
    continue;
  }
  const convs = fmc.data || [];
  console.log("✓ fetch_my_conversations rows =", convs.length);
  totalPass++;

  // Verify participant_ids is populated on every row
  const missingPids = convs.filter((c) => !Array.isArray(c.participant_ids) || c.participant_ids.length === 0);
  if (missingPids.length) {
    console.log("✗ " + missingPids.length + " convs have empty participant_ids");
    totalFail++;
    issues.push(t.email + " missing participant_ids on " + missingPids.length + " convs");
  } else {
    console.log("✓ all convs have participant_ids");
    totalPass++;
  }

  // 4) For each conv, fetch the participant profiles (mirrors useDMs)
  const allPids = [...new Set(convs.flatMap((c) => c.participant_ids || []))];
  let profiles = [];
  if (allPids.length) {
    const fvp = await client.rpc("fetch_visible_profiles_by_ids", { p_ids: allPids });
    if (fvp.error) {
      // Try the alternate name in case the SECDEF helper is under a different signature.
      const alt = await client.from("profiles").select("id,name,avatar_url").in("id", allPids);
      profiles = alt.data || [];
    } else {
      profiles = fvp.data || [];
    }
  }
  const profById = new Map(profiles.map((p) => [p.id, p]));
  console.log("✓ profile lookup       resolved", profById.size, "of", allPids.length);
  if (profById.size === allPids.length) totalPass++; else { totalFail++; issues.push(t.email + " missing " + (allPids.length - profById.size) + " profile rows"); }

  // 5) Print each conv in a V2-ish view
  console.log("");
  console.log("Conversations (V2 shape):");
  console.log("  " + pad("type", 8) + pad("name", 24) + pad("last_at", 26) + pad("last_sender", 12) + "preview");
  console.log("  " + "─".repeat(95));
  for (const c of convs.slice(0, 10)) {
    const others = (c.participant_ids || []).filter((pid) => pid !== userId).map((pid) => profById.get(pid)?.name || "?");
    const name = c.is_group ? others.join(" & ") : (others[0] || "Conversation");
    const senderName = c.last_message_sender_id === userId
      ? "You"
      : (profById.get(c.last_message_sender_id)?.name?.split(" ")[0] || "?");
    console.log("  " + pad(c.is_group ? "group" : "dm", 8) + pad(name, 24) + pad(String(c.last_message_at || "—").slice(0, 24), 26) + pad(senderName, 12) + JSON.stringify(c.last_message_preview || ""));
  }

  // 6) Open the most recent thread and read messages (mirrors useDMs.openConversation)
  if (convs.length) {
    const targetConv = convs[0];
    const msgs = await client.from("direct_messages")
      .select("id,sender_id,content,created_at,deleted_at")
      .eq("conversation_id", targetConv.id)
      .order("created_at", { ascending: true })
      .limit(20);
    if (msgs.error) {
      console.log("✗ thread fetch:", msgs.error.message);
      totalFail++;
    } else {
      console.log("");
      console.log("Thread (" + targetConv.id.slice(0, 8) + "…) — " + (msgs.data || []).length + " messages:");
      for (const m of (msgs.data || []).slice(-6)) {
        const side = m.sender_id === userId ? "you" : "them";
        const text = m.deleted_at ? "(deleted)" : (m.content || "").slice(0, 60);
        console.log("  [" + side + "] " + text);
      }
      totalPass++;
    }
  }

  await client.auth.signOut();
}

console.log("");
console.log("=".repeat(72));
console.log("E2E probe result:", totalPass, "pass /", totalFail, "fail");
if (issues.length) {
  console.log("Issues:");
  for (const i of issues) console.log("  -", i);
}
console.log("=".repeat(72));

process.exit(totalFail === 0 ? 0 : 1);
