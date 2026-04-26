// src/features/scoring/utils/inviteUrl.js
//
// Build / parse opponent-invite URLs. Lives at /invite/match/<token>.
// One source of truth so the share card, the auth-redirect, and the
// landing page all stay in sync.
//
// Token format: 43-char base64url string emitted by create_match_invite.
// We don't validate length here — preview_match_invite is the
// authoritative check. We DO sanity-check shape so we don't accept
// something that obviously isn't a token (e.g. someone pasting a URL
// fragment).

var INVITE_PATH_PREFIX = "/invite/match/";

// Regex: base64url alphabet, no padding. Length is allowed to be
// 16-128 to be tolerant of any future token-size change.
var TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

// Build the full share URL given the token. `origin` defaults to the
// browser's current origin; tests / SSR can pass an override.
export function buildInviteUrl(token, origin) {
  if (!isValidTokenShape(token)) return null;
  var base = origin || (typeof window !== "undefined" ? window.location.origin : "");
  return base + INVITE_PATH_PREFIX + token;
}

// Pull the token out of an inbound path. Used by App.jsx to detect
// /invite/match/<token>. Returns null when the path doesn't match.
export function parseInvitePath(pathname) {
  if (!pathname) return null;
  if (pathname.indexOf(INVITE_PATH_PREFIX) !== 0) return null;
  var rest = pathname.slice(INVITE_PATH_PREFIX.length);
  // Strip trailing slash + any query/fragment that snuck in via
  // an over-zealous router preserver.
  rest = rest.split("?")[0].split("#")[0];
  if (rest.endsWith("/")) rest = rest.slice(0, -1);
  if (!isValidTokenShape(rest)) return null;
  return rest;
}

export function isValidTokenShape(token) {
  return typeof token === "string" && TOKEN_RE.test(token);
}

// Default share-text builder. Logger name + invitee name + URL.
// Kept short so the SMS / WhatsApp preview doesn't truncate the link.
export function buildShareText(loggerName, invitedName, url) {
  var who = (loggerName || "A friend").trim();
  return who + " logged your tennis match on CourtSync. Confirm or dispute the result here: " + url;
}
