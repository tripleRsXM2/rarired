// src/lib/analytics.js
//
// Thin analytics emitter. Every meaningful user action fires one event via
// track(name, props). Writes go to the public.events table — fire-and-forget,
// wrapped in try/catch so instrumentation can never break the UX.
//
// First-party only. No third-party SDKs, no marketing pixels. Data lives in
// our own Supabase Postgres, RLS-gated so authenticated users can only insert
// rows for themselves (or null for anon). See docs/privacy-and-storage.md
// for the full storage classification.
//
// Session ID is a tab-scoped UUID in sessionStorage. Survives reloads within
// the same tab, not across tabs (by design — each tab is an independent session).
//
// Module 9.2 — analytics opt-out. Users who flip the toggle in
// Settings → Privacy & Storage stop emitting events from THIS device.
// Stored in localStorage (`cs_analytics_opt_out`) so the choice
// survives reloads + logout, but stays device-scoped (no DB column,
// no cross-device sync — keeps the implementation surface small for
// V1 and means a logged-out browser respects the previous user's
// choice on this device, which matches user expectation).
//
// Events are opinionated: see /docs/analytics-events.md for the full taxonomy
// and per-event props. If you're adding a new event type, register it there
// in the same commit.

import { supabase } from "./supabase.js";

var SESSION_KEY = "cs_session_id";
var OPT_OUT_KEY = "cs_analytics_opt_out";

// Read the opt-out flag. Treats anything truthy in localStorage as
// opted-out so a manual `localStorage.setItem("cs_analytics_opt_out", "1")`
// (or "true") works regardless of the toggle UI.
export function getAnalyticsOptOut() {
  try {
    if (typeof localStorage === "undefined") return false;
    var v = localStorage.getItem(OPT_OUT_KEY);
    return v === "1" || v === "true";
  } catch (_e) {
    return false;
  }
}

// Set / clear the opt-out flag. Pass true to opt out, false to opt back in.
// Writes "1" / removes the key — keeps storage clean when the user re-opts-in.
export function setAnalyticsOptOut(value) {
  try {
    if (typeof localStorage === "undefined") return;
    if (value) localStorage.setItem(OPT_OUT_KEY, "1");
    else       localStorage.removeItem(OPT_OUT_KEY);
  } catch (_e) {
    /* swallow — opt-out is best-effort */
  }
}

function getSessionId() {
  try {
    var existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    var fresh = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : String(Date.now()) + "-" + Math.random().toString(36).slice(2);
    sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch (_e) {
    // sessionStorage disabled (private mode, SSR) — fall back to a non-persistent id.
    return "nosession";
  }
}

// Fire-and-forget. We deliberately DO NOT await this — instrumentation must
// never block a user-visible action. If the insert fails (network, RLS), the
// event is dropped silently. Every step has .catch guards so a broken
// analytics pipeline can never bubble up as an unhandled rejection.
export function track(event, props) {
  if (!event || typeof event !== "string") return;
  // Module 9.2 — short-circuit BEFORE touching sessionStorage so an
  // opted-out user doesn't even leave behind a session id.
  if (getAnalyticsOptOut()) return;
  try {
    var payload = {
      event: event,
      props: props || {},
      session_id: getSessionId(),
    };
    supabase.auth.getUser()
      .then(function (r) {
        var uid = (r && r.data && r.data.user && r.data.user.id) || null;
        payload.user_id = uid;
        // RLS: authenticated users can only insert rows with user_id = auth.uid()
        // or null. Anonymous events write with user_id null (allowed).
        return supabase.from("events").insert(payload);
      })
      .then(function () { /* success — noop */ })
      .catch(function () { /* swallow: instrumentation must not throw */ });
  } catch (_e) {
    // Swallow — see comment above.
  }
}

// Convenience: record that a React-rendered page / surface was viewed. Takes
// the same props as track() but prefixes the event with a standard 'view'
// semantic so consumers can filter cleanly.
export function trackView(event, props) {
  track(event, props);
}
