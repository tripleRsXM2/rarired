// src/features/pacts/services/pactService.js
//
// Thin Supabase wrappers for the TINDIS match_pacts surface. Keeps the
// hook agnostic of table shape — if we rename columns, this is the only
// file that moves.
//
// Naming convention: operations that change state at the DB return the
// fresh row so the caller can updateLocal-without-refetch. RLS enforces
// auth on every query — the client doesn't pass auth.uid() explicitly.

import { supabase } from "../../../lib/supabase.js";

// Fields every view needs. Participants are resolved separately via
// fetchProfilesByIds because Supabase RLS on profiles means we can't
// rely on a join returning consistent shape for partner_id.
var PACT_SELECT = [
  "id", "proposer_id", "partner_id", "zone_id", "venue", "court",
  "scheduled_at", "skill", "message",
  "proposer_agreed", "partner_agreed", "status",
  "booked_by", "booking_ref", "total_cost_cents",
  "split_mode", "proposer_share_cents", "partner_share_cents",
  "proposer_paid", "partner_paid",
  "match_id", "expires_at", "created_at", "updated_at",
].join(",");

// ── Reads ────────────────────────────────────────────────────────────

// Pacts involving the viewer (either side). Includes cancelled/expired
// for the History sub-tab; caller partitions.
export function fetchMyPacts(userId) {
  return supabase.from("match_pacts")
    .select(PACT_SELECT)
    .or("proposer_id.eq." + userId + ",partner_id.eq." + userId)
    .order("scheduled_at", { ascending: true });
}

// Open-court postings in a zone (anyone can read; RLS already permits).
// Optional skill filter for the discovery surface.
export function fetchOpenCourts(zoneId, skill, limit) {
  var q = supabase.from("match_pacts")
    .select(PACT_SELECT)
    .is("partner_id", null)
    .eq("status", "proposed")
    .gt("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit || 30);
  if (zoneId) q = q.eq("zone_id", zoneId);
  if (skill)  q = q.eq("skill", skill);
  return q;
}

// ── Writes ───────────────────────────────────────────────────────────

// Propose a pact. Direct pact: partner_id set. Open-court: partner_id
// null, zone_id required so it can be discovered. Expires in 48h.
export function createPact(payload) {
  var expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  var row = Object.assign({}, payload, {
    status: "proposed",
    proposer_agreed: true,
    partner_agreed: false,
    expires_at: expires,
  });
  return supabase.from("match_pacts").insert(row).select(PACT_SELECT).single();
}

// Partner taps Agree on a direct pact (or a claimed open pact). When
// both agreed, flip status → confirmed. Proposer tapping Agree uses
// the same path; the column it writes is different, computed client-side.
export function setAgreement(pactId, side, agreed) {
  var patch = {};
  if (side === "proposer") patch.proposer_agreed = agreed;
  if (side === "partner")  patch.partner_agreed  = agreed;
  return supabase.from("match_pacts")
    .update(patch).eq("id", pactId).select(PACT_SELECT).single();
}

// Once both agreed, flip to 'confirmed'. Client-side computed transition,
// kept separate so RLS-denied overlaps can be retried without redoing the
// agreement write.
export function confirmPact(pactId) {
  return supabase.from("match_pacts")
    .update({ status: "confirmed" })
    .eq("id", pactId)
    .select(PACT_SELECT).single();
}

// Mark the pact as booked. Accepts optional booking_ref + cost + split
// params so the post-book UI can attach them in a single write.
export function bookPact(pactId, patch) {
  var up = Object.assign({ status: "booked" }, patch || {});
  return supabase.from("match_pacts")
    .update(up).eq("id", pactId).select(PACT_SELECT).single();
}

// Paid toggles — each side flips their own flag only.
export function setPaid(pactId, side, paid) {
  var patch = {};
  if (side === "proposer") patch.proposer_paid = paid;
  if (side === "partner")  patch.partner_paid  = paid;
  return supabase.from("match_pacts")
    .update(patch).eq("id", pactId).select(PACT_SELECT).single();
}

export function cancelPact(pactId) {
  return supabase.from("match_pacts")
    .update({ status: "cancelled" })
    .eq("id", pactId)
    .select(PACT_SELECT).single();
}

// Attach a freshly-logged match_history row to the pact. Called by the
// score flow after a match lands that converts a booked pact.
export function attachMatchToPact(pactId, matchId) {
  return supabase.from("match_pacts")
    .update({ status: "played", match_id: matchId })
    .eq("id", pactId)
    .select(PACT_SELECT).single();
}

// Claim an open court — atomic RPC prevents a double-claim race.
export function claimOpenPact(pactId) {
  return supabase.rpc("claim_open_pact", { p_pact_id: pactId });
}

// Client-side expiry sweep. Called on mount + every minute while the
// tab is visible. Only hits the rows the viewer can see (RLS scoped).
export function expireProposedPacts(userId) {
  return supabase.from("match_pacts")
    .update({ status: "expired" })
    .eq("status", "proposed")
    .or("proposer_id.eq." + userId + ",partner_id.eq." + userId)
    .lt("expires_at", new Date().toISOString());
}

// Fire the server-side stale-pact sweep. Idempotent. Wider than the
// client-scoped expireProposedPacts above — also handles confirmed
// rows past scheduled_at, booked rows past the 7-day grace period,
// and hard-deletes terminal rows older than 30 days. See
// supabase/migrations/20260424_sweep_stale_pacts.sql for the rules.
export function sweepStalePacts() {
  return supabase.rpc("sweep_stale_pacts");
}

// ── Money math helpers (pure — no network) ──────────────────────────

// Compute per-side share in cents given mode + total. Custom requires
// explicit shares; caller is expected to validate they sum to total.
export function computeShares(total, mode, customA, customB) {
  var t = total || 0;
  if (mode === "proposer_pays") return { a: 0, b: t };    // partner owes everything
  if (mode === "partner_pays")  return { a: t, b: 0 };    // proposer owes everything (you shouted)
  if (mode === "custom")        return { a: customA || 0, b: customB || 0 };
  // 50_50 default — partner rounds up so proposer eats the cent of asymmetry.
  var half = Math.floor(t / 2);
  return { a: half, b: t - half };
}

// Build a tel: / payment deep-link. AU-first: PayID is email/phone, so
// we can't deep-link it universally — we fall back to a "Copy amount
// + handle" affordance in the UI. Venmo / PayPal.me are the only ones
// with standard deep-link URIs.
//
// Returns { primary, secondary, copyText } — primary is a clickable
// launch URL when possible; copyText is the always-available fallback.
export function buildPaymentLinks(amountCents, handle, method, note) {
  var dollars = ((amountCents || 0) / 100).toFixed(2);
  var n = note || "Tennis split";
  if (method === "venmo" && handle) {
    return {
      primary: "venmo://paycharge?txn=pay&recipients=" +
        encodeURIComponent(handle) + "&amount=" + dollars +
        "&note=" + encodeURIComponent(n),
      label: "Open Venmo",
      copyText: handle + " · $" + dollars,
    };
  }
  if (method === "paypal" && handle) {
    return {
      primary: "https://paypal.me/" + encodeURIComponent(handle) + "/" + dollars,
      label: "Open PayPal",
      copyText: "paypal.me/" + handle + " · $" + dollars,
    };
  }
  // PayID / Beem / Zelle all default to copy-paste.
  return {
    primary: null,
    label: null,
    copyText: (handle ? handle + " · " : "") + "$" + dollars,
  };
}
