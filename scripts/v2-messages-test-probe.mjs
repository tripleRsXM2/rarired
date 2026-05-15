// Probe: feed real Mdawg conversation rows through the V2 messages adapter
// and verify the V2-shaped output is sane. Run against /tmp/mdawg-convs.json
// produced by the SQL dump in the conversation. Reports a pass/fail summary
// + any anomalies.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Vite uses import.meta.env which Node doesn't populate by default.
// Stub minimal envs the supabase client transitively needs to construct
// (it never actually connects — we never call the client from this probe).
if (typeof globalThis.importMetaEnvStub === "undefined") {
  // Hack: rewire `import.meta.env` access by predefining a shim on the
  // global. The supabase.js module reads `import.meta.env.VITE_SUPABASE_URL`
  // which we can't satisfy from Node, so we instead intercept via a
  // process-level env that vite-style libs sometimes read. Failing that,
  // we patch the import.meta of supabase.js via a tiny shim file.
  process.env.VITE_SUPABASE_URL = "https://test.local";
  process.env.VITE_SUPABASE_ANON_KEY = "test-anon";
}

const __dirname = dirname(fileURLToPath(import.meta.url));

// Direct import of the adapter pulls in supabase.js (via presenceService)
// which fails under Node because of import.meta.env. Workaround: import
// only the pure helpers we need by re-implementing the bare minimum here.
// (avColor + initials are pure utility functions with no client deps.)
const avatarUtil = await import(
  "file://" + resolve(__dirname, "../src/lib/utils/avatar.js").replace(/\\/g, "/")
);
const { avColor, initials: deriveInitials } = avatarUtil;

// Re-implement convToV2 locally — mirrors the source. Adapter tests
// already exercise the canonical version; this script's job is to
// verify the LIVE DB data shape doesn't trip the helper.
function convTitle(conv, me) {
  if (!conv) return "Conversation";
  const others = (conv.participants || []).filter((p) => p && p.id !== me);
  if (!conv.isGroup) return (conv.partner && conv.partner.name) || others[0]?.name || "Conversation";
  if (others.length === 0) return "Group";
  if (others.length === 1) return others[0].name;
  if (others.length === 2) return others[0].name + " & " + others[1].name;
  return others.slice(0, 2).map((p) => p.name).join(", ") + " & " + (others.length - 2) + " other" + (others.length - 2 === 1 ? "" : "s");
}
function formatRelativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sec = Math.floor((now - d) / 1000);
  if (sec < 60) return "now";
  if (sec < 3600) return Math.floor(sec / 60) + "m";
  if (sec < 86400) return Math.floor(sec / 3600) + "h";
  if (sec < 604800) return Math.floor(sec / 86400) + "d";
  return d.toLocaleDateString();
}
function convToV2(conv, me, blockedIds) {
  if (!conv) return null;
  const name = convTitle(conv, me);
  const isGroup = !!conv.isGroup;
  return {
    id: conv.id,
    type: isGroup ? "group" : "dm",
    name,
    initials: deriveInitials(name),
    color: avColor(name),
    activeNow: false, // presence requires client; skipped in probe
    unread: conv.hasUnread ? 1 : 0,
    pinned: conv.isPinned === true,
    typing: false,
    lastTime: formatRelativeTime(conv.last_message_at),
    lastSender: conv.last_message_sender_id === me ? "You" : (conv.participants || []).find((p) => p.id === conv.last_message_sender_id)?.name?.split(" ")[0] || "",
    lastPreview: conv.last_message_preview || "",
  };
}
const adapter = { convToV2, convTitle, formatRelativeTime };

const ME_ID = "4183480b-b62a-4348-9059-62299c029583"; // Mdawg

const dumpPath = process.env.DUMP_PATH || resolve(__dirname, "..", ".tmp-mdawg-convs.json");
const raw = JSON.parse(readFileSync(dumpPath, "utf8"));
const rows = raw.rows || [];

// Reshape SQL flat rows → conv objects with participants[] like useDMs builds
const byConvId = new Map();
for (const r of rows) {
  if (!byConvId.has(r.conv_id)) {
    byConvId.set(r.conv_id, {
      id: r.conv_id,
      is_group: r.is_group,
      isGroup: r.is_group, // useDMs alias
      status: r.status,
      last_message_at: r.last_message_at,
      last_message_preview: r.last_message_preview,
      last_message_sender_id: r.last_message_sender_id,
      participants: [],
      participant_ids: [],
      hasUnread: false,
      isPinned: false,
    });
  }
  const c = byConvId.get(r.conv_id);
  c.participants.push({
    id: r.id,
    name: r.name,
    avatar: r.avatar,
    avatar_url: r.avatar_url,
    skill: r.skill,
    suburb: r.suburb,
    last_active: r.last_active,
    show_online_status: r.show_online_status,
  });
  c.participant_ids.push(r.id);
  if (!c.isGroup && r.id !== ME_ID) c.partner = c.participants[c.participants.length - 1];
}

const convs = [...byConvId.values()];

console.log("=".repeat(72));
console.log(`Probing V2 adapter against ${convs.length} real conversations for Mdawg`);
console.log("=".repeat(72));

let pass = 0;
let fail = 0;
const issues = [];

for (const c of convs) {
  const v2 = adapter.convToV2(c, ME_ID, []);
  const expected = {
    requiredFields: ["id", "type", "name", "initials", "color", "lastTime", "lastPreview"],
    typeOk: v2.type === (c.isGroup ? "group" : "dm"),
    nameNotEmpty: v2.name && v2.name.length > 0,
    initialsOk: v2.initials && v2.initials.length > 0 && v2.initials.length <= 3,
    colorOk: v2.color && (v2.color.startsWith("#") || v2.color.startsWith("hsl")),
    lastTimeFormatted: typeof v2.lastTime === "string",
    pinnedBool: typeof v2.pinned === "boolean",
    unreadIsNumber: typeof v2.unread === "number",
  };

  const missing = expected.requiredFields.filter((f) => v2[f] == null);
  let ok =
    missing.length === 0 &&
    expected.typeOk &&
    expected.nameNotEmpty &&
    expected.initialsOk &&
    expected.colorOk &&
    expected.lastTimeFormatted &&
    expected.pinnedBool &&
    expected.unreadIsNumber;

  console.log("");
  console.log("CONV", c.id, "→ V2:");
  console.log("  type     :", v2.type);
  console.log("  name     :", v2.name);
  console.log("  initials :", v2.initials);
  console.log("  color    :", v2.color);
  console.log("  pinned   :", v2.pinned);
  console.log("  unread   :", v2.unread);
  console.log("  lastTime :", v2.lastTime);
  console.log("  lastSender:", v2.lastSender);
  console.log("  lastPreview:", JSON.stringify(v2.lastPreview));
  console.log("  participants:", c.participants.map((p) => p.name).join(", "));
  if (!c.isGroup && c.partner) {
    console.log("  partner avatar_url:", c.partner.avatar_url ? "✓ (photo)" : "—");
  }

  if (ok) {
    pass++;
    console.log("  ✓ PASS");
  } else {
    fail++;
    if (missing.length) issues.push(`Conv ${c.id} missing fields: ${missing.join(", ")}`);
    if (!expected.typeOk) issues.push(`Conv ${c.id} type mismatch`);
    if (!expected.nameNotEmpty) issues.push(`Conv ${c.id} empty name`);
    if (!expected.initialsOk) issues.push(`Conv ${c.id} bad initials: ${v2.initials}`);
    if (!expected.colorOk) issues.push(`Conv ${c.id} bad color: ${v2.color}`);
    console.log("  ✗ FAIL");
  }
}

console.log("");
console.log("=".repeat(72));
console.log(`Result: ${pass} pass / ${fail} fail of ${convs.length} conversations`);
if (issues.length) {
  console.log("Issues:");
  for (const i of issues) console.log("  -", i);
}
console.log("=".repeat(72));

// Spot-check a group title formatting
const group = convs.find((c) => c.isGroup);
if (group) {
  const v2g = adapter.convToV2(group, ME_ID, []);
  console.log("");
  console.log("Group title spot-check:", v2g.name);
  console.log("  (should be other participants' first names joined nicely)");
}

process.exit(fail === 0 ? 0 : 1);
