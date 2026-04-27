// src/features/tournaments/utils/competeNormalize.js
//
// Module 13 (Compete hub Slice 1) — pure helpers that shape raw hook
// rows into the normalized "Active now" card model. Kept React-free
// and side-effect-free so the hub page can compose without owning
// state for the cards themselves.
//
// **Card shape contract** (consumed by ActiveCompetitionCard):
//
//   {
//     id:            string,           // unique within the page
//     type:          string,           // see CARD_TYPE constants below
//     priority:      1 | 2 | 3,        // 1 = action-required, 2 = ongoing
//     title:         string,
//     subtitle?:     string,
//     meta?:         string,           // small grey line under subtitle
//     statusLabel:   string,           // pill copy (uppercase rendered)
//     statusTone:    'accent' | 'green' | 'orange' | 'red' | 'neutral',
//     primaryCta:    { label, onClick },
//     secondaryCta?: { label, onClick },
//     accentLeft?:   'orange' | 'accent' | null,  // priority-1 left rule
//   }
//
// We intentionally do NOT pass DOM/event handlers through to the
// helpers; instead each normalize* function takes a `handlers` bag of
// already-bound callbacks. The page wires the bindings once.

import { isActive } from "../../leagues/utils/leagueLifecycle.js";

// ─────────────────────────────────────────────────────────────────────
// Card type tags
// ─────────────────────────────────────────────────────────────────────

export var CARD_TYPE = {
  LEAGUE_INVITE:      "league_invite",
  CHALLENGE_INCOMING: "challenge_incoming",
  LEAGUE_ACTIVE:      "league_active",
  CHALLENGE_READY:    "challenge_ready",
};

// ─────────────────────────────────────────────────────────────────────
// Tiny formatting helpers
// ─────────────────────────────────────────────────────────────────────

function profileName(profileMap, userId, fallback) {
  if (!userId) return fallback || "Player";
  var p = profileMap && profileMap[userId];
  return (p && p.name) ? p.name : (fallback || "Player");
}

function pluralize(n, singular, plural) {
  return n === 1 ? singular : (plural || (singular + "s"));
}

// ─────────────────────────────────────────────────────────────────────
// Priority 1 — action required
// ─────────────────────────────────────────────────────────────────────

// Pending league invite the viewer hasn't responded to yet.
// Recipient = the viewer (lg.my_status === 'invited').
export function normalizeLeagueInvite(lg, handlers, opts) {
  opts = opts || {};
  var memberCount = (opts.memberCount != null) ? opts.memberCount : null;
  var subtitleParts = [];
  if (lg.mode)        subtitleParts.push(lg.mode === "casual" ? "Casual league" : "Ranked league");
  if (memberCount != null) subtitleParts.push(memberCount + " " + pluralize(memberCount, "player"));

  return {
    id:          "league_invite_" + lg.id,
    type:        CARD_TYPE.LEAGUE_INVITE,
    priority:    1,
    title:       lg.name + " · invite",
    subtitle:    subtitleParts.join(" · ") || "Private league",
    statusLabel: "Needs you",
    statusTone:  "orange",
    accentLeft:  "orange",
    primaryCta: {
      label: "Accept",
      onClick: function () { return handlers.acceptInvite(lg.id); },
    },
    secondaryCta: {
      label: "Decline",
      onClick: function () { return handlers.declineInvite(lg.id, lg.name); },
    },
  };
}

// Incoming challenge the viewer needs to accept or decline.
// `ch.challenger_id` is the sender; viewer is the challenged_id.
export function normalizeIncomingChallenge(ch, handlers, profileMap) {
  var fromName  = profileName(profileMap, ch.challenger_id, "Someone");
  var subtitleParts = [];
  if (ch.match_format)   subtitleParts.push(formatMatchFormat(ch.match_format));
  if (ch.proposed_at)    subtitleParts.push("Proposed " + formatRelativeDate(ch.proposed_at));
  else if (ch.created_at) subtitleParts.push("Sent " + formatRelativeDate(ch.created_at));

  return {
    id:          "challenge_incoming_" + ch.id,
    type:        CARD_TYPE.CHALLENGE_INCOMING,
    priority:    1,
    title:       fromName + " challenged you",
    subtitle:    subtitleParts.join(" · ") || "Set up the match",
    statusLabel: "Respond",
    statusTone:  "accent",
    accentLeft:  "accent",
    primaryCta: {
      label: "Accept",
      onClick: function () { return handlers.acceptChallenge(ch); },
    },
    secondaryCta: {
      label: "Decline",
      onClick: function () { return handlers.declineChallenge(ch); },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Priority 2 — ongoing
// ─────────────────────────────────────────────────────────────────────

// Active league the viewer is a member of. Subtitle stays terse in
// Slice 1 — richer "next opponent" / "rank N" data lives in the
// league detail surface. Slice 2 can layer on detail-cache derived
// content here once we settle the lazy-load policy.
export function normalizeActiveLeague(lg, handlers) {
  var subtitleParts = [];
  if (lg.mode)         subtitleParts.push(lg.mode === "casual" ? "Casual league" : "Ranked league");
  if (lg.match_format) subtitleParts.push(formatMatchFormat(lg.match_format));

  return {
    id:          "league_active_" + lg.id,
    type:        CARD_TYPE.LEAGUE_ACTIVE,
    priority:    2,
    title:       lg.name,
    subtitle:    subtitleParts.join(" · ") || "Active league",
    statusLabel: "Active",
    statusTone:  "green",
    accentLeft:  null,
    primaryCta: {
      label: "Open league",
      onClick: function () { return handlers.openLeague(lg.id); },
    },
  };
}

// Accepted challenge — both players agreed, match hasn't been logged
// yet. Primary action is "Log result" (opens the score modal flow
// the existing ChallengesPanel uses).
export function normalizeAcceptedChallenge(ch, handlers, profileMap, viewerId) {
  // The opponent is whichever party isn't the viewer.
  var opponentId = ch.challenger_id === viewerId ? ch.challenged_id : ch.challenger_id;
  var opponentName = profileName(profileMap, opponentId, "Opponent");

  var subtitleParts = ["Accepted"];
  if (ch.match_format) subtitleParts.push(formatMatchFormat(ch.match_format));

  return {
    id:          "challenge_ready_" + ch.id,
    type:        CARD_TYPE.CHALLENGE_READY,
    priority:    2,
    title:       "You vs " + opponentName,
    subtitle:    subtitleParts.join(" · "),
    meta:        "Log result when played",
    statusLabel: "Ready",
    statusTone:  "accent",
    accentLeft:  null,
    primaryCta: {
      label: "Log result",
      onClick: function () { return handlers.logChallenge(ch); },
    },
    secondaryCta: {
      label: "Open challenges",
      onClick: function () { return handlers.openChallenges(); },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Composition: build the full priority-sorted list
// ─────────────────────────────────────────────────────────────────────

// Sort comparator. Stable within a priority bucket — leagues before
// challenges within the same bucket so the hub keeps a predictable
// reading rhythm even when two cards are equally "priority 1". The
// caller can pass already-ordered inputs for finer control.
export function compareCards(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  // Stable tiebreak by type tag — alphabetical so leagues sort before
  // challenges (l < c is false, but in V1 we don't care about that
  // order beyond it being deterministic).
  if (a.type < b.type) return -1;
  if (a.type > b.type) return 1;
  return 0;
}

// Convenience: build the full Active now card list for Slice 1's
// data sources (leagues + challenges). Tournaments deferred per the
// Slice 1 plan. Returns a new array — does not mutate inputs.
export function buildActiveNowCards(args) {
  var leagues       = args.leagues       || [];
  var challenges    = args.challenges    || [];
  var profileMap    = args.profileMap    || {};
  var detailCache   = args.detailCache   || {};
  var viewerId      = args.viewerId;
  var handlers      = args.handlers      || {};

  var cards = [];

  // Pending invites first (priority 1).
  leagues.forEach(function (lg) {
    if (lg.my_status !== "invited") return;
    var members = (detailCache[lg.id] && detailCache[lg.id].members) || null;
    var memberCount = members ? members.filter(function (m) { return m.status === "active"; }).length : null;
    cards.push(normalizeLeagueInvite(lg, handlers, { memberCount: memberCount }));
  });

  // Incoming challenges (priority 1).
  challenges.forEach(function (ch) {
    if (ch.status !== "pending" || ch.challenged_id !== viewerId) return;
    cards.push(normalizeIncomingChallenge(ch, handlers, profileMap));
  });

  // Active leagues (priority 2). Voided leagues are pre-filtered at
  // the useLeagues hook boundary — defensive `isActive` here too in
  // case a future caller passes the unfiltered list.
  leagues.forEach(function (lg) {
    if (lg.my_status !== "active") return;
    if (!isActive(lg)) return;
    cards.push(normalizeActiveLeague(lg, handlers));
  });

  // Accepted challenges ready to play (priority 2).
  challenges.forEach(function (ch) {
    if (ch.status !== "accepted") return;
    if (ch.challenger_id !== viewerId && ch.challenged_id !== viewerId) return;
    cards.push(normalizeAcceptedChallenge(ch, handlers, profileMap, viewerId));
  });

  return cards.sort(compareCards);
}

// ─────────────────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────────────────

function formatMatchFormat(mf) {
  if (mf === "one_set")    return "One set";
  if (mf === "best_of_3")  return "Best of 3";
  if (mf === "best_of_5")  return "Best of 5";
  return mf;
}

// Cheap relative-date formatter — keep dependencies out. "today" /
// "yesterday" / "N days ago" / "in N days". Falls back to ISO date
// for things further out than a week.
function formatRelativeDate(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  var now    = new Date();
  var oneDay = 24 * 60 * 60 * 1000;
  var diffMs = d.getTime() - now.getTime();
  var diffD  = Math.round(diffMs / oneDay);
  if (diffD === 0)  return "today";
  if (diffD === 1)  return "tomorrow";
  if (diffD === -1) return "yesterday";
  if (diffD > 1 && diffD < 7)   return "in " + diffD + " days";
  if (diffD < -1 && diffD > -7) return Math.abs(diffD) + " days ago";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
