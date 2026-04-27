// supabase/functions/send-push/index.ts
//
// Web Push fan-out. Runs in the Supabase Edge runtime (Deno). Two
// invocation modes:
//
//   1. self_test: true             — sends the supplied payload only
//                                    to the caller's own enabled
//                                    subscriptions. Used by the
//                                    Settings "Send test" button.
//
//   2. notification_id: <uuid>     — looks up the in-app notification
//                                    row, derives the recipient from
//                                    notifications.user_id, builds a
//                                    payload from notifications.type
//                                    + entity_id, applies the
//                                    recipient's push category prefs,
//                                    fans out to their enabled
//                                    subscriptions. Idempotent via
//                                    notification_push_log.
//
// Auth model:
//   - Requires the caller's auth.users JWT (Supabase clients always
//     send it). We use the JWT to identify the caller for self_test
//     and for the standing-check on cross-user notifications:
//     a notification_id is only accepted if the caller is the
//     notification's from_user_id OR the notification's user_id
//     (recipient — for self-notifications). Anything else is
//     rejected as forbidden.
//   - The function uses SUPABASE_SERVICE_ROLE_KEY internally so it
//     can read push_subscriptions across users (RLS would otherwise
//     hide rows the caller didn't own).
//
// Env vars (set via `supabase secrets set ...`):
//   - VAPID_PUBLIC_KEY        — base64url, no padding
//   - VAPID_PRIVATE_KEY       — base64url, no padding
//   - VAPID_SUBJECT           — "mailto:ops@courtsync.app" or "https://…"
//   - SUPABASE_URL            — provided by Supabase automatically
//   - SUPABASE_SERVICE_ROLE_KEY — provided by Supabase automatically

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
// @negrel/webpush is published on JSR (jsr.io/@negrel/webpush). The
// esm.sh JSR proxy resolves it for the Deno bundler. The bare
// `https://esm.sh/@negrel/webpush@0.3.0` (npm namespace) returns 404.
//
// Bumped from 0.3.0 → 0.5.0 because 0.3.0 throws inside
// importVapidKeys on the current Supabase Edge Runtime:
//   "Failed to execute 'importKey' on 'SubtleCrypto': Argument 2
//    can not be converted to a dictionary"
// (Captured via push_subscriptions.last_failure_reason after the
// diagnostic patch landed.)
import * as webpush from "https://esm.sh/jsr/@negrel/webpush@0.5.0";

// ─── Types ────────────────────────────────────────────────────────────

interface Subscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled: boolean;
}

interface PushPayload {
  type: string;
  title: string;
  body: string;
  url: string;
  entityId?: string | null;
  eventId?: string | null;
}

// ─── Env / clients ────────────────────────────────────────────────────

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")  ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")     ?? "mailto:ops@courtsync.app";
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")      ?? "";
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error("[send-push] VAPID keys missing — function will reject every request");
}

// Service-role client. Used after we've verified the caller's identity.
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── VAPID key handling ───────────────────────────────────────────
//
// Our env stores the VAPID keys as base64url-encoded raw bytes:
//   VAPID_PUBLIC_KEY  — 65-byte uncompressed P-256 point (0x04 || X || Y)
//                       → 87 base64url chars
//   VAPID_PRIVATE_KEY — 32-byte private scalar `d`
//                       → 43 base64url chars
//
// But @negrel/webpush's importVapidKeys expects JsonWebKey objects,
// not strings. Calling it with strings fails with the cryptic
// "Argument 2 can not be converted to a dictionary" because the
// underlying SubtleCrypto.importKey("jwk", …) requires a JWK dict
// as the second argument. We rebuild the JWKs from the raw bytes
// before calling the library.

function base64UrlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildVapidJwks(publicB64: string, privateB64: string): {
  publicKey: JsonWebKey; privateKey: JsonWebKey;
} {
  const pubBytes = base64UrlToBytes(publicB64);
  // Expect 65-byte uncompressed: 0x04 || X(32) || Y(32). Anything
  // else is a malformed key and will fail loud here, not 500 lines
  // deep inside the library.
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error(
      "VAPID_PUBLIC_KEY: expected 65-byte uncompressed P-256 point starting with 0x04 (got " +
      pubBytes.length + " bytes, leading byte 0x" + pubBytes[0].toString(16) + ")",
    );
  }
  const x = bytesToBase64Url(pubBytes.slice(1, 33));
  const y = bytesToBase64Url(pubBytes.slice(33, 65));

  const publicKey: JsonWebKey = {
    kty:     "EC",
    crv:     "P-256",
    x, y,
    ext:     true,
    key_ops: ["verify"],
  };
  const privateKey: JsonWebKey = {
    kty:     "EC",
    crv:     "P-256",
    x, y,                  // public coords MUST be present on the private JWK
    d:       privateB64,   // private scalar — already base64url-encoded
    ext:     true,
    key_ops: ["sign"],
  };
  return { publicKey, privateKey };
}

// VAPID details — built once on cold-start.
let vapidPromise: Promise<webpush.ApplicationServer> | null = null;
async function getVapid(): Promise<webpush.ApplicationServer> {
  if (vapidPromise) return vapidPromise;
  vapidPromise = (async () => {
    const importedKeys = await webpush.importVapidKeys(
      buildVapidJwks(VAPID_PUBLIC, VAPID_PRIVATE),
      { extractable: false },
    );
    return await webpush.ApplicationServer.new({
      contactInformation: VAPID_SUBJECT,
      vapidKeys: importedKeys,
    });
  })();
  return vapidPromise;
}

// ─── Helpers ──────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({}, CORS_HEADERS, { "content-type": "application/json" }),
  });
}

// Push-worthy types → category in notification_preferences.
// Types absent from this map are NOT pushed (anything noisy: like,
// comment, match_deleted etc).
const PUSH_TYPE_TO_CATEGORY: Record<string, string> = {
  match_tag:                    "result_reviews",
  match_disputed:               "result_reviews",
  match_correction_requested:   "result_reviews",
  match_counter_proposed:       "result_reviews",
  match_reminder:               "result_reviews",
  match_confirmed:              "match_updates",
  match_voided:                 "match_updates",
  match_expired:                "match_updates",
  challenge_received:           "match_invites",
  challenge_accepted:           "match_updates",
  challenge_declined:           "match_updates",
  challenge_expired:            "match_updates",
  friend_request:               "system_updates",
  request_accepted:             "system_updates",
  league_invite:                "league_updates",
  league_joined:                "league_updates",
  // Module 12 Slice 2 — owner lifecycle transitions are intentionally
  // NOT mapped here in V1: lifecycle events are in-app only. A type
  // missing from this map causes the dispatch path to skip the push
  // (see the early-return on `!category` below). Mirrors
  // PUSH_WORTHY_TYPES in notificationService.js + push_category=null
  // in src/features/notifications/types.js. The payload template
  // cases below are kept (cheap dead code) so re-enabling push later
  // only requires re-adding the four lines above.
  pact_proposed:                "match_invites",
  pact_claimed:                 "match_invites",
  pact_confirmed:               "match_invites",
  pact_booked:                  "match_updates",
  pact_cancelled:               "match_updates",
  message_request:              "match_updates",
  message_request_accepted:     "match_updates",
  // Module 9: opponent-invite outcomes — sit under match_updates
  // because they're status changes on a match the logger already
  // knows about (not a brand-new invite TO them).
  match_invite_claimed:         "match_updates",
  match_invite_declined:        "match_updates",
  // Module 9.1.5: informational heads-up that a casual match was
  // logged with the recipient. Sits under match_updates — same
  // bucket as match_confirmed / match_voided which are also
  // "FYI, your match changed status" pushes.
  casual_match_logged:          "match_updates",
};

// Title + body + URL templates per type. Concise on purpose — payloads
// land on the lock screen, so we never include private match details.
function buildPayloadForType(type: string, fromName: string | null, entityId: string | null): PushPayload {
  const safeName = fromName || "Someone";
  switch (type) {
    case "match_tag":
      return {
        type, title: "New match logged",
        body:  `${safeName} logged a match with you. Confirm or dispute.`,
        url:   "/home" + (entityId ? `?highlightMatchId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "match_disputed":
    case "match_correction_requested":
      return {
        type, title: "Match disputed",
        body:  `${safeName} disputed your match result. Review needed.`,
        url:   "/home" + (entityId ? `?highlightMatchId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "match_counter_proposed":
      return {
        type, title: "Counter-proposal received",
        body:  `${safeName} counter-proposed a correction. Review needed.`,
        url:   "/home" + (entityId ? `?highlightMatchId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "match_reminder":
      return {
        type, title: "Match awaiting confirmation",
        body:  "A pending match expires soon. Confirm or dispute now.",
        url:   "/home" + (entityId ? `?highlightMatchId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "match_confirmed":
      return {
        type, title: "Match confirmed",
        body:  `${safeName} confirmed your match. Stats updated.`,
        url:   "/home" + (entityId ? `?highlightMatchId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "match_voided":
      return {
        type, title: "Match voided",
        body:  "A match between you and another player was voided.",
        url:   "/home" + (entityId ? `?highlightMatchId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "match_expired":
      return {
        type, title: "Match expired",
        body:  "A pending match expired without confirmation.",
        url:   "/home" + (entityId ? `?highlightMatchId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "challenge_received":
      return {
        type, title: "New challenge",
        body:  `${safeName} challenged you. Accept, decline, or counter.`,
        url:   "/tournaments/challenges" + (entityId ? `?highlightChallengeId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "challenge_accepted":
      return {
        type, title: "Challenge accepted",
        body:  `${safeName} accepted your challenge. Time to play.`,
        url:   "/tournaments/challenges" + (entityId ? `?highlightChallengeId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "challenge_declined":
      return {
        type, title: "Challenge declined",
        body:  `${safeName} declined your challenge.`,
        url:   "/tournaments/challenges" + (entityId ? `?highlightChallengeId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "challenge_expired":
      return {
        type, title: "Challenge expired",
        body:  "A challenge expired without a response.",
        url:   "/tournaments/challenges" + (entityId ? `?highlightChallengeId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "friend_request":
      return {
        type, title: "New friend request",
        body:  `${safeName} wants to add you as a friend.`,
        url:   "/people/requests",
        entityId,
      };
    case "request_accepted":
      return {
        type, title: "Friend request accepted",
        body:  `${safeName} accepted your friend request.`,
        url:   "/profile",
        entityId,
      };
    case "league_invite":
      return {
        type, title: "League invite",
        body:  `${safeName} invited you to a league.`,
        url:   "/tournaments/leagues" + (entityId ? `?highlightLeagueId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "league_joined":
      return {
        type, title: "Player joined league",
        body:  `${safeName} joined your league.`,
        url:   "/tournaments/leagues" + (entityId ? `?highlightLeagueId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    // Module 12 Slice 2 — owner lifecycle transitions. Body deliberately
    // omits the league name (kept private off the lock screen — same
    // rule as match payloads).
    case "league_completed":
      return {
        type, title: "League completed",
        body:  `${safeName} marked a league season as complete. Final standings are locked.`,
        url:   "/tournaments/leagues" + (entityId ? `?highlightLeagueId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "league_archived":
      return {
        type, title: "League archived",
        body:  `${safeName} archived a league. Standings are read-only.`,
        url:   "/tournaments/leagues" + (entityId ? `?highlightLeagueId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "league_cancelled":
      return {
        type, title: "League cancelled",
        body:  `${safeName} cancelled a league before completion.`,
        url:   "/tournaments/leagues" + (entityId ? `?highlightLeagueId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "league_voided":
      return {
        type, title: "League voided",
        body:  `${safeName} voided a league. It's been removed from your list.`,
        url:   "/tournaments/leagues",
        entityId,
      };
    case "pact_proposed":
      return {
        type, title: "New pact",
        body:  `${safeName} proposed a match. Tap to agree or decline.`,
        url:   "/tindis/active" + (entityId ? `?highlightPactId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "pact_claimed":
      return {
        type, title: "Open court claimed",
        body:  `${safeName} claimed your open court.`,
        url:   "/tindis/active" + (entityId ? `?highlightPactId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "pact_confirmed":
      return {
        type, title: "Pact confirmed",
        body:  "Both sides agreed. Book the court when you're ready.",
        url:   "/tindis/active" + (entityId ? `?highlightPactId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "pact_booked":
      return {
        type, title: "Pact booked",
        body:  "Court booked. See the split + confirmation #.",
        url:   "/tindis/active" + (entityId ? `?highlightPactId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "pact_cancelled":
      return {
        type, title: "Pact cancelled",
        body:  "A pact was cancelled.",
        url:   "/tindis/history" + (entityId ? `?highlightPactId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "message_request":
      return {
        type, title: "New message",
        body:  `${safeName} sent you a message.`,
        url:   "/people/messages",
        entityId,
      };
    case "message_request_accepted":
      return {
        type, title: "Message request accepted",
        body:  `${safeName} accepted your message.`,
        url:   "/people/messages",
        entityId,
      };
    case "match_invite_claimed":
      // entityId here is the match_history.id (set by the SECURITY
      // DEFINER claim_match_invite RPC). Land the logger on the feed
      // with the match highlighted; the existing ActionReviewDrawer
      // then takes over for confirm/dispute.
      return {
        type, title: "Opponent joined CourtSync",
        body:  `${safeName} claimed your match. They'll confirm or dispute next.`,
        url:   "/home" + (entityId ? `?highlightMatchId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "match_invite_declined":
      return {
        type, title: "Invite declined",
        body:  `${safeName} marked your invite as 'not me'. Re-issue or void the match.`,
        url:   "/home" + (entityId ? `?highlightMatchId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    case "casual_match_logged":
      // Module 9.1.5 — informational. Body deliberately understates:
      // there's nothing the recipient must do, but they should know.
      return {
        type, title: "Casual match logged",
        body:  `${safeName} logged a casual match with you. View it in your feed.`,
        url:   "/home" + (entityId ? `?highlightMatchId=${encodeURIComponent(entityId)}` : ""),
        entityId,
      };
    default:
      return {
        type, title: "CourtSync update",
        body:  "You have a new update.",
        url:   "/home",
        entityId,
      };
  }
}

// Encrypt + send a single push. Returns the raw push-service status
// code so the caller can prune 404/410.
async function sendOne(sub: Subscription, payload: PushPayload, ttl: number) {
  const server = await getVapid();
  const subscriber = server.subscribe(
    {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
  );
  const data = new TextEncoder().encode(JSON.stringify(payload));
  return await subscriber.pushTextMessage(data, { urgency: "normal", ttl });
}

// ─── Main handler ─────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")    return jsonResponse(405, { error: "method_not_allowed" });

  // Identify the caller from their JWT. We don't trust the body for
  // identity; only used for routing the request.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponse(401, { error: "missing_auth" });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return jsonResponse(401, { error: "invalid_auth" });
  const callerId = userData.user.id;

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse(400, { error: "bad_json" }); }

  // ── Mode 1: self_test ────────────────────────────────────────────
  if (body.self_test === true) {
    const payload: PushPayload = Object.assign({
      type:  "system",
      title: "CourtSync test",
      body:  "Push notifications are working on this device.",
      url:   "/home",
    }, body.payload || {});
    const result = await fanOut(callerId, payload);
    return jsonResponse(200, { ok: true, ...result });
  }

  // ── Mode 2: notification_id ─────────────────────────────────────
  const notifId: string | undefined = body.notification_id;
  if (!notifId) return jsonResponse(400, { error: "missing_notification_id" });

  // Idempotency: bail if we've already pushed this notification.
  const { data: existingLog } = await admin
    .from("notification_push_log")
    .select("notification_id")
    .eq("notification_id", notifId)
    .maybeSingle();
  if (existingLog) return jsonResponse(200, { ok: true, skipped: "already_sent" });

  // Load the notification + the sender's display name (for body copy).
  const { data: notif, error: notifErr } = await admin
    .from("notifications")
    .select("id, user_id, from_user_id, type, entity_id, match_id")
    .eq("id", notifId)
    .maybeSingle();
  if (notifErr || !notif) return jsonResponse(404, { error: "notification_not_found" });

  // Authorisation: caller must be either the recipient (self-push) or
  // the from_user_id (cross-user). Anything else is forbidden — this
  // is the gate that stops a malicious user from triggering pushes
  // for arbitrary notifications they didn't author or receive.
  if (callerId !== notif.user_id && callerId !== notif.from_user_id) {
    return jsonResponse(403, { error: "forbidden" });
  }

  const category = PUSH_TYPE_TO_CATEGORY[notif.type];
  if (!category) {
    // Type isn't push-worthy. Still log so future re-fires no-op.
    await admin.from("notification_push_log").upsert({
      notification_id: notifId, device_count: 0, last_error: "type_not_push_worthy",
    });
    return jsonResponse(200, { ok: true, skipped: "type_not_push_worthy" });
  }

  // Recipient's category preference (default-on via helper).
  const { data: prefs } = await admin
    .rpc("get_notification_prefs", { p_user_id: notif.user_id })
    .single();
  if (prefs && prefs[category] === false) {
    await admin.from("notification_push_log").upsert({
      notification_id: notifId, device_count: 0, last_error: "muted_by_recipient",
    });
    return jsonResponse(200, { ok: true, skipped: "muted_by_recipient" });
  }

  // Sender display name — non-blocking lookup. Push body says
  // "Someone" if the lookup fails.
  let fromName: string | null = null;
  if (notif.from_user_id) {
    const { data: prof } = await admin
      .from("profiles").select("name").eq("id", notif.from_user_id).maybeSingle();
    fromName = prof?.name ?? null;
  }

  const entityId = (notif.entity_id || notif.match_id || null) as string | null;
  const payload  = buildPayloadForType(notif.type, fromName, entityId);
  // Use the notification id as the eventId for client-side dedupe.
  payload.eventId = notif.id;

  const result = await fanOut(notif.user_id, payload);

  // Log success even if 0 devices — prevents re-fire spam.
  await admin.from("notification_push_log").upsert({
    notification_id: notifId,
    device_count:    result.sent,
    last_error:      result.errors.length ? JSON.stringify(result.errors).slice(0, 1000) : null,
  });

  return jsonResponse(200, { ok: true, ...result });
});

// ─── Fan out a payload to every enabled subscription for one user ──

async function fanOut(userId: string, payload: PushPayload): Promise<{ sent: number; pruned: number; errors: { endpoint: string; status: number | string }[]; }> {
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, enabled")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (error) return { sent: 0, pruned: 0, errors: [{ endpoint: "lookup", status: error.message }] };
  if (!subs || subs.length === 0) return { sent: 0, pruned: 0, errors: [] };

  let sent = 0;
  let pruned = 0;
  const errors: { endpoint: string; status: number | string }[] = [];

  // Default TTL: 24h. Match-confirmation reminders use the same;
  // future slice can pass per-type TTLs.
  const TTL = 60 * 60 * 24;

  // Sequential rather than parallel — small N, easier to log, and
  // some push services rate-limit aggressive bursts.
  for (const sub of (subs as Subscription[])) {
    try {
      await sendOne(sub, payload, TTL);
      sent++;
      await admin
        .from("push_subscriptions")
        .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
        .eq("id", sub.id);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status ?? "error";
      // Capture whatever upstream said so a human can read it from
      // the DB instead of cracking open function logs. Keep it short
      // — APNs error bodies can be verbose; 500 chars is enough to
      // identify the rejection reason.
      const reason = (() => {
        const parts: string[] = [];
        parts.push("status=" + String(status));
        if (e?.message)            parts.push("msg=" + String(e.message));
        if (e?.response?.statusText) parts.push("text=" + String(e.response.statusText));
        try {
          if (e?.response && typeof e.response.text === "function") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            // (best-effort; some webpush libraries don't expose the body)
          }
        } catch (_) { /* swallow */ }
        if (e?.body)               parts.push("body=" + String(e.body).slice(0, 200));
        return parts.join(" | ").slice(0, 500);
      })();
      console.error("[send-push] delivery failed:", sub.endpoint, reason);
      errors.push({ endpoint: sub.endpoint, status });
      const isGone = status === 404 || status === 410;
      if (isGone) {
        pruned++;
        await admin
          .from("push_subscriptions")
          .update({
            enabled: false,
            last_failure_at: new Date().toISOString(),
            last_failure_reason: reason,
          })
          .eq("id", sub.id);
      } else {
        await admin
          .from("push_subscriptions")
          .update({
            last_failure_at: new Date().toISOString(),
            last_failure_reason: reason,
            failure_count: ((sub as any).failure_count || 0) + 1,
          })
          .eq("id", sub.id);
      }
    }
  }
  return { sent, pruned, errors };
}
