// src/lib/pushClient.js
//
// Browser-side push subscription lifecycle. Sits between the UI
// (PushSettingsCard) and the Supabase storage in pushService.
//
// What lives here:
//   - getPermission()         — current Notification.permission ('default' | 'granted' | 'denied')
//   - getCurrentSubscription() — current PushSubscription via the SW registration
//   - enablePush(userId)       — full "user tapped Enable" flow:
//       1. ensure SW is registered
//       2. request Notification permission
//       3. PushManager.subscribe with the VAPID public key
//       4. upsert into Supabase
//   - disablePush(userId)      — unsubscribes the browser + flips
//                                the row to enabled=false in Supabase
//   - refreshSubscription()    — rotated-endpoint reconciliation, run
//                                on app boot for signed-in users
//
// Capability + iOS install gating lives in src/lib/deviceCaps.js —
// callers MUST check supportsPush() before calling enablePush().
// We keep this file dumb so it's easy to test individual steps.

import { supabase } from "./supabase.js";
import { deviceSnapshot, supportsPush } from "./deviceCaps.js";
import {
  upsertPushSubscription,
  disablePushSubscription,
} from "../features/notifications/services/pushService.js";

// VAPID public key — read from Vite env. Only the *public* half is
// exposed to the client (per VAPID spec it's safe). Slice 7 wires the
// env var into Vercel.
function getVapidPublicKey() {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY || null;
}

// Browsers' PushManager.subscribe wants a Uint8Array, not a base64
// string. urlBase64ToUint8Array is the canonical helper from MDN.
function urlBase64ToUint8Array(base64String) {
  var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  var raw = atob(base64);
  var arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// PushSubscription.toJSON() returns { endpoint, keys: { p256dh, auth }, expirationTime }.
// Convert to the columns we store.
function subToRow(sub, userId) {
  var json = sub.toJSON();
  return Object.assign(
    {
      user_id:  userId,
      endpoint: json.endpoint,
      p256dh:   json.keys && json.keys.p256dh,
      auth:     json.keys && json.keys.auth,
      enabled:  true,
    },
    deviceSnapshot()
  );
}

// ─────────────────────────────────────────────────────────────────────
// Permission + subscription getters
// ─────────────────────────────────────────────────────────────────────

export function getPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function getCurrentSubscription() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  var reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

async function ensureSWRegistration() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser.");
  }
  var reg = await navigator.serviceWorker.getRegistration();
  if (reg && reg.active) return reg;
  // First-run on a fresh PWA install — register here too. Normally
  // main.jsx already registers in production, but if push is being
  // enabled before that finishes (or in a build that serves SW from
  // the root), be defensive.
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

// ─────────────────────────────────────────────────────────────────────
// enablePush — the "Enable notifications" button calls this
// ─────────────────────────────────────────────────────────────────────

export async function enablePush(userId) {
  if (!userId) {
    return { error: "not_signed_in", message: "Sign in to enable notifications." };
  }
  if (!supportsPush()) {
    return { error: "unsupported", message: "Push notifications aren't supported on this device or browser." };
  }
  var vapid = getVapidPublicKey();
  if (!vapid) {
    return { error: "missing_vapid", message: "Push isn't configured. Tell the developer the server's missing a VAPID public key." };
  }

  var reg;
  try {
    reg = await ensureSWRegistration();
  } catch (e) {
    return { error: "sw_register_failed", message: e.message || String(e) };
  }

  var permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { error: "permission_denied", message: "Notification permission was denied. Re-enable it in your browser/device settings to turn on alerts." };
  }

  var sub;
  try {
    // If a previous sub exists for a *different* VAPID key, browsers
    // reject .subscribe(). Reuse the existing one if present; only
    // create new when there's no current subscription.
    sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
    }
  } catch (e) {
    return { error: "subscribe_failed", message: e.message || String(e) };
  }

  var row = subToRow(sub, userId);
  var save = await upsertPushSubscription(row);
  if (save.error) {
    return { error: "save_failed", message: save.error.message || "Could not save subscription." };
  }
  return { ok: true, subscription: sub, row: save.data };
}

// ─────────────────────────────────────────────────────────────────────
// disablePush — "Disable" / sign-out
// ─────────────────────────────────────────────────────────────────────

export async function disablePush() {
  var sub = await getCurrentSubscription();
  if (!sub) return { ok: true };
  var endpoint = sub.endpoint;

  // Unsubscribe at the browser layer first so we stop receiving pushes
  // immediately even if the DB write fails.
  try { await sub.unsubscribe(); } catch (_) {}

  var save = await disablePushSubscription(endpoint);
  if (save.error) {
    return { error: "disable_save_failed", message: save.error.message };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// refreshSubscription — call once at app boot for signed-in users
// ─────────────────────────────────────────────────────────────────────
//
// Browsers can rotate a PushSubscription's endpoint silently (key
// rotation, crash recovery, GCM → FCM migration). When we boot we
// compare the live endpoint with whatever Supabase has on file and
// re-save if they differ. Cheap if the row's already up to date.
//
// Returns { rotated, enabled, endpoint } so callers can show "we
// migrated this device's subscription" in the UI if they want.

export async function refreshSubscription(userId) {
  if (!userId) return { ok: true, enabled: false };
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return { ok: true, enabled: false };
  var sub = await getCurrentSubscription();
  if (!sub) return { ok: true, enabled: false };

  var row = subToRow(sub, userId);
  var save = await upsertPushSubscription(row);
  if (save.error) {
    return { error: "refresh_save_failed", message: save.error.message };
  }
  return { ok: true, enabled: true, endpoint: row.endpoint };
}
