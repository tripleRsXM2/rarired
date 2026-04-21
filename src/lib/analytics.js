// src/lib/analytics.js
//
// Thin analytics emitter. Every meaningful user action fires one event via
// track(name, props). Writes go to the public.events table — fire-and-forget,
// wrapped in try/catch so instrumentation can never break the UX.
//
// Session ID is a tab-scoped UUID in sessionStorage. Survives reloads within
// the same tab, not across tabs (by design — each tab is an independent session).
//
// Events are opinionated: see /docs/analytics-events.md for the full taxonomy
// and per-event props. If you're adding a new event type, register it there
// in the same commit.

import { supabase } from "./supabase.js";

var SESSION_KEY = "cs_session_id";

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
