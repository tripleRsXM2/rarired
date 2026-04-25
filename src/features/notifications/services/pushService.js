// src/features/notifications/services/pushService.js
//
// Supabase reads/writes for the push-notification feature. All client
// surface; the actual push *send* lives in a Supabase Edge Function.
//
// Tables: push_subscriptions, notification_preferences. Both are RLS-
// gated to the signed-in user — no cross-user reads.

import { supabase } from "../../../lib/supabase.js";

// ─────────────────────────────────────────────────────────────────────
// push_subscriptions
// ─────────────────────────────────────────────────────────────────────

// Upsert an endpoint+keys row. UNIQUE (user_id, endpoint) means
// re-subscribing the same browser is a no-op (just touches updated_at
// + flips enabled back on if it was disabled).
export function upsertPushSubscription(payload) {
  return supabase
    .from("push_subscriptions")
    .upsert(payload, { onConflict: "user_id,endpoint" })
    .select()
    .single();
}

// Disable (don't delete) so we keep history for debugging the
// "permission denied → re-enabled" path. Only callable for the
// signed-in user; RLS rejects cross-user updates.
export function disablePushSubscription(endpoint) {
  return supabase
    .from("push_subscriptions")
    .update({ enabled: false })
    .eq("endpoint", endpoint);
}

// Delete a row entirely — used when the user explicitly clears state
// from a different device or when the endpoint has rotated and we
// want a clean slate.
export function deletePushSubscription(endpoint) {
  return supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
}

// List the signed-in user's enabled subscriptions. Drives the future
// "Manage devices" UI; not used in V1 outside of debug.
export function listMyPushSubscriptions() {
  return supabase
    .from("push_subscriptions")
    .select("id,endpoint,device_type,browser,is_standalone_pwa,enabled,created_at,last_success_at,last_failure_at,failure_count")
    .order("created_at", { ascending: false });
}

// ─────────────────────────────────────────────────────────────────────
// notification_preferences
// ─────────────────────────────────────────────────────────────────────

// Reads via the SECURITY-DEFINER-stable helper so a user without a row
// gets the default-on payload back without an upsert side-effect.
export async function fetchMyPushPrefs(userId) {
  if (!userId) return { data: null, error: null };
  return supabase.rpc("get_notification_prefs", { p_user_id: userId }).single();
}

// Save (upsert) the user's preference row. RLS gates user_id = auth.uid().
export function saveMyPushPrefs(userId, patch) {
  if (!userId) return Promise.resolve({ data: null, error: { message: "Not signed in" } });
  return supabase
    .from("notification_preferences")
    .upsert(Object.assign({ user_id: userId }, patch), { onConflict: "user_id" })
    .select()
    .single();
}

// ─────────────────────────────────────────────────────────────────────
// Self test push (slice 6 wires the Edge Function; this is the client
// trigger). Calls the send-push function with `{ self_test: true }`
// so the Edge Function knows to send to the caller only and no one
// else, regardless of payload.
// ─────────────────────────────────────────────────────────────────────

export async function sendSelfTestPush() {
  return supabase.functions.invoke("send-push", {
    body: {
      self_test: true,
      payload: {
        title: "CourtSync test",
        body:  "Push notifications are working on this device.",
        url:   "/home",
        type:  "system",
      },
    },
  });
}
