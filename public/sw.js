/* CourtSync service worker — push notifications.
 *
 * Scope: served from /sw.js so it controls the whole origin (`/`).
 *
 * Responsibilities:
 *   1. Receive push events from the backend, validate the payload,
 *      display a system notification.
 *   2. Handle notification clicks — route to an existing app URL,
 *      focus an open tab if there is one, otherwise open a new one.
 *   3. Stay quiet about everything else: no offline caching, no
 *      install prompts, no asset interception. (Adding caching is a
 *      separate slice when we want the app to work offline — push
 *      doesn't need it and we don't want to ship a stale-asset
 *      bug while we iterate.)
 *
 * Payload contract (matches docs/push-notifications.md taxonomy):
 *   {
 *     title:    string,
 *     body:     string,
 *     url:      string,    // app-relative, e.g. "/home?highlightMatchId=abc"
 *     tag?:     string,    // collapse key, default = type
 *     type?:    string,    // for icon/sound tweaks if we add them later
 *     entityId?: string,
 *     eventId?:  string,   // for client-side dedupe / focus-existing-window
 *   }
 *
 * If the payload is malformed we still show a fallback "New activity"
 * notification rather than failing silently — silent push (push event
 * with no UI shown) is treated as abuse by browsers and can revoke
 * the permission.
 */

/* global self, clients */

var DEFAULT_ICON  = "/icons/icon-192.png";
var DEFAULT_BADGE = "/icons/icon-192.png";

// Lifecycle: take control immediately on install/activate so a fresh
// version replaces the previous one without requiring a tab close.
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  var data = parsePayload(event);
  var title = data.title || "CourtSync";
  var options = {
    body:    data.body || "",
    icon:    data.icon || DEFAULT_ICON,
    badge:   data.badge || DEFAULT_BADGE,
    tag:     data.tag || data.type || "courtsync",
    // renotify on the same tag — replaces the previous notification
    // (so the user gets one row per match/dispute/league instead of a
    // stack) but still pings on each update.
    renotify: true,
    data: {
      url:      data.url || "/home",
      type:     data.type || null,
      entityId: data.entityId || null,
      eventId:  data.eventId || null,
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/home";
  event.waitUntil(openOrFocus(url));
});

// ─── Helpers ──────────────────────────────────────────────────────────

// Defensive payload parsing — push events can carry no data at all
// (test pushes from Chrome DevTools), or non-JSON, or partial JSON.
// We never throw out of the push handler; that revokes the permission.
function parsePayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json() || {};
  } catch (_) {
    try {
      var text = event.data.text();
      // Plain-text fallback — show as the body of a generic notification.
      if (text) return { title: "CourtSync", body: text };
      return {};
    } catch (__) {
      return {};
    }
  }
}

// Focus an already-open CourtSync tab if one exists on a matching origin;
// otherwise open a new tab at the click-target URL.
async function openOrFocus(url) {
  var absoluteUrl = new URL(url, self.location.origin).href;
  var winClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

  for (var i = 0; i < winClients.length; i++) {
    var c = winClients[i];
    // Same origin, app already open → focus + navigate (postMessage so
    // the SPA router can pick up the deep-link without a hard reload).
    try {
      var u = new URL(c.url);
      if (u.origin === self.location.origin) {
        await c.focus();
        try { c.postMessage({ type: "navigate", url: absoluteUrl }); } catch (_) {}
        return;
      }
    } catch (_) {}
  }
  // No window open — spawn a new one. iOS PWA delivers this as a deep-
  // link launch.
  if (self.clients.openWindow) {
    return self.clients.openWindow(absoluteUrl);
  }
}
