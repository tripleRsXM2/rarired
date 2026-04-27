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
  // Slice 2 addition.
  TOURNAMENT_ACTIVE:  "tournament_active",
};

// ─────────────────────────────────────────────────────────────────────
// Featured-band slide shape (carousel band)
// ─────────────────────────────────────────────────────────────────────
//
// The Active now band is a horizontal carousel where every slide
// shares the same editorial template (eyebrow → headline → optional
// big-stat → caption → meta line → action button(s)). Per-type
// content varies but the slot structure is fixed so the band code
// can render without branching on type.
//
// Slide shape:
//   {
//     id:           string,
//     type:         CARD_TYPE.*,
//     priority:     1 | 2,
//     eyebrow:      'ACTIVE LEAGUE' | 'LEAGUE INVITE' | …
//     headline:     string,                 // big title
//     bigStat?:     { value, label } | null // e.g. {'#1', 'YOUR RANK'}
//     caption?:     string | null,          // record / format / date
//     metaLine?:    string | null,          // "Last match: Won vs X"
//     metaTone?:    'win' | 'loss' | null,  // colorises a portion
//     primary:      { label, onClick, kind: 'arrow' | 'filled' },
//     secondary?:   { label, onClick, kind: 'outline' } | null,
//   }
//
// Helpers below derive the slide from raw hook rows. They pair with
// the existing card normalizers — same data, denser display surface.

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

// Active league the viewer is a member of.
//
// Slice 2: when the league's detail cache is populated (members +
// standings already loaded by the hub's lazy-fetch effect), the
// subtitle gets a richer "Rank N · X matches played" line derived
// from league_standings. Without the cache we keep the terse Slice 1
// subtitle — the cache typically warms within a few hundred ms of
// hub mount, so most users see the rich version on second render.
//
// `viewerStanding` is the viewer's row from league_standings, or
// null if the cache hasn't loaded yet.
// `memberCount` is the number of `active` league_members.
export function normalizeActiveLeague(lg, handlers, opts) {
  opts = opts || {};
  var viewerStanding = opts.viewerStanding || null;
  var memberCount    = (opts.memberCount != null) ? opts.memberCount : null;

  var subtitleParts = [];
  if (viewerStanding && viewerStanding.rank) {
    subtitleParts.push(rankText(viewerStanding.rank) + " of " + (memberCount || "—"));
  }
  if (viewerStanding && typeof viewerStanding.played === "number") {
    subtitleParts.push(viewerStanding.played + " " + pluralize(viewerStanding.played, "match", "matches") + " played");
  }
  // Fallback when the detail cache hasn't filled yet — terse but
  // honest, no fake numbers.
  if (subtitleParts.length === 0) {
    if (lg.mode)         subtitleParts.push(lg.mode === "casual" ? "Casual league" : "Ranked league");
    if (lg.match_format) subtitleParts.push(formatMatchFormat(lg.match_format));
  }

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

// Active tournament the viewer is entered in.
// Predicate (validated against useTournamentManager — see hub):
//   isEntered(t.id) && t.status !== 'completed'
// covers both enrolling (status null/undefined) and active (live).
//
// Subtitle uses entrant count + tournStatus().label so users see a
// coherent "Live · 8/16 entered" or "Open · 4 entered" line. The
// status pill carries the same tournStatus().label so they read
// together without redundancy (pill = state, subtitle = headcount).
export function normalizeActiveTournament(tournament, handlers, opts) {
  opts = opts || {};
  var statusInfo  = opts.statusInfo || { label: "", color: null };
  var entrantCount = (tournament.entrants || []).length;
  var size = tournament.size || null;

  // Tone derivation:
  //   Live   → green (it's running)
  //   Open / N left → accent (recruiting; you're in)
  //   else   → neutral
  var tone =
    statusInfo.label === "Live" ? "green" :
    (statusInfo.label === "Open" || /\sleft$/.test(statusInfo.label || "")) ? "accent" :
    "neutral";

  var subtitleParts = [];
  if (entrantCount && size)        subtitleParts.push(entrantCount + " / " + size + " entered");
  else if (entrantCount)           subtitleParts.push(entrantCount + " entered");
  if (tournament.format)           subtitleParts.push(humaniseTournamentFormat(tournament.format));

  return {
    id:          "tournament_active_" + tournament.id,
    type:        CARD_TYPE.TOURNAMENT_ACTIVE,
    priority:    2,
    title:       tournament.name || "Tournament",
    subtitle:    subtitleParts.join(" · ") || "Tournament",
    statusLabel: statusInfo.label || "Tournament",
    statusTone:  tone,
    accentLeft:  null,
    primaryCta: {
      label: "Open tournament",
      onClick: function () { return handlers.openTournament(tournament.id); },
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

// Convenience: build the full Active now card list across leagues,
// challenges, and (Slice 2) tournaments. Returns a new array — does
// not mutate inputs.
export function buildActiveNowCards(args) {
  var leagues       = args.leagues       || [];
  var challenges    = args.challenges    || [];
  var tournaments   = args.tournaments   || [];
  var profileMap    = args.profileMap    || {};
  var detailCache   = args.detailCache   || {};
  var viewerId      = args.viewerId;
  var handlers      = args.handlers      || {};
  // Slice 2: tournament predicate + status helpers. Passed in by the
  // hub from useTournamentManager so this util stays React-free.
  var isEntered      = args.isEntered      || function () { return false; };
  var tournStatus    = args.tournStatus    || function () { return { label: "", color: null }; };

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
  //
  // Slice 2: when the detail cache has the league's standings +
  // members, derive the viewer's rank + played count for a richer
  // subtitle. Cache hits are best-effort — terse fallback otherwise.
  leagues.forEach(function (lg) {
    if (lg.my_status !== "active") return;
    if (!isActive(lg)) return;
    var detail   = detailCache[lg.id] || null;
    var standing = detail && (detail.standings || []).find(function (s) { return s.user_id === viewerId; });
    var memberCount = detail && (detail.members || []).filter(function (m) { return m.status === "active"; }).length;
    cards.push(normalizeActiveLeague(lg, handlers, { viewerStanding: standing || null, memberCount: memberCount || null }));
  });

  // Accepted challenges ready to play (priority 2).
  challenges.forEach(function (ch) {
    if (ch.status !== "accepted") return;
    if (ch.challenger_id !== viewerId && ch.challenged_id !== viewerId) return;
    cards.push(normalizeAcceptedChallenge(ch, handlers, profileMap, viewerId));
  });

  // Active tournaments (priority 2). Predicate audit (Slice 2):
  //   isEntered(t.id) AND status !== 'completed' AND status !== 'cancelled'
  // Covers the three live states: enrolling (no status set), 'active',
  // and any other non-terminal value. Verified against
  // useTournamentManager.tournStatus + isEntered.
  tournaments.forEach(function (tn) {
    if (!isEntered(tn.id)) return;
    if (tn.status === "completed" || tn.status === "cancelled") return;
    var statusInfo = tournStatus(tn);
    cards.push(normalizeActiveTournament(tn, handlers, { statusInfo: statusInfo }));
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

// "1st", "2nd", "3rd", "4th"... Used in the rich active-league
// subtitle ("2nd of 8 · 3 matches played"). Cheap inline impl
// rather than pulling a date-fns / numeral dep.
function rankText(rank) {
  if (rank == null) return "";
  var n = parseInt(rank, 10);
  if (isNaN(n)) return String(rank);
  var mod10  = n % 10;
  var mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return n + "st";
  if (mod10 === 2 && mod100 !== 12) return n + "nd";
  if (mod10 === 3 && mod100 !== 13) return n + "rd";
  return n + "th";
}

function humaniseTournamentFormat(format) {
  if (format === "knockout") return "Knockout";
  if (format === "league")   return "League";
  if (format === "ladder")   return "Ladder";
  return format;
}

// ─────────────────────────────────────────────────────────────────────
// Slide normalizers (carousel band)
// ─────────────────────────────────────────────────────────────────────

// Pick the viewer's most-recent confirmed match in this league —
// powers the "Last match: Won/Lost vs X" caption on a league slide.
function lastLeagueResultMeta(detail, leagueId, viewerId, profileMap) {
  if (!detail || !detail.recent || !leagueId || !viewerId) return null;
  var rows = detail.recent.filter(function (m) {
    if (m.status !== "confirmed") return false;
    if (m.league_id && m.league_id !== leagueId) return false;
    return m.user_id === viewerId || m.opponent_id === viewerId;
  });
  rows.sort(function (a, b) {
    var ad = a.confirmed_at ? new Date(a.confirmed_at).getTime() : 0;
    var bd = b.confirmed_at ? new Date(b.confirmed_at).getTime() : 0;
    return bd - ad;
  });
  var last = rows[0];
  if (!last) return null;
  var viewerIsSubmitter = last.user_id === viewerId;
  var iWon = viewerIsSubmitter ? (last.result === "win") : (last.result === "loss");
  var oppId = viewerIsSubmitter ? last.opponent_id : last.user_id;
  var oppP = profileMap && profileMap[oppId];
  var oppName = (oppP && oppP.name) || null;
  var line = "Last match: " + (iWon ? "Won" : "Lost") + (oppName ? (" vs " + oppName) : "");
  return { line: line, tone: iWon ? "win" : "loss" };
}

export function buildLeagueInviteSlide(lg, handlers, opts) {
  opts = opts || {};
  return {
    id:        "slide_league_invite_" + lg.id,
    type:      CARD_TYPE.LEAGUE_INVITE,
    priority:  1,
    eyebrow:   "League invite",
    headline:  lg.name || "League invite",
    bigStat:   null,
    caption:   (opts.memberCount ? (opts.memberCount + " " + pluralize(opts.memberCount, "player")) : null),
    metaLine:  lg.mode === "casual" ? "Casual league" : "Ranked league",
    primary:   { kind: "filled",  label: "Accept",  onClick: function () { return handlers.acceptInvite(lg.id); } },
    secondary: { kind: "outline", label: "Decline", onClick: function () { return handlers.declineInvite(lg.id, lg.name); } },
  };
}

export function buildIncomingChallengeSlide(ch, handlers, profileMap) {
  var fromName = (profileMap && profileMap[ch.challenger_id] && profileMap[ch.challenger_id].name) || "Someone";
  var captionParts = [];
  if (ch.match_format) captionParts.push(ch.match_format === "best_of_3" ? "Best of 3" : (ch.match_format === "one_set" ? "One set" : ch.match_format));
  if (ch.proposed_at)  captionParts.push("Proposed " + cheapDate(ch.proposed_at));
  return {
    id:        "slide_challenge_incoming_" + ch.id,
    type:      CARD_TYPE.CHALLENGE_INCOMING,
    priority:  1,
    eyebrow:   "Challenge",
    headline:  fromName + " challenged you",
    bigStat:   null,
    caption:   captionParts.join(" · ") || null,
    metaLine:  null,
    primary:   { kind: "filled",  label: "Accept",  onClick: function () { return handlers.acceptChallenge(ch); } },
    secondary: { kind: "outline", label: "Decline", onClick: function () { return handlers.declineChallenge(ch); } },
  };
}

export function buildActiveLeagueSlide(lg, handlers, opts) {
  opts = opts || {};
  var standing    = opts.viewerStanding || null;
  var memberCount = opts.memberCount || null;
  var rank        = standing && standing.rank;
  var record      = standing
    ? (standing.wins != null ? standing.wins : 0) + "-" + (standing.losses != null ? standing.losses : 0)
    : null;
  var meta        = opts.lastMeta || null;
  var captionParts = [];
  if (record)        captionParts.push(record);
  if (memberCount)   captionParts.push(memberCount + " " + pluralize(memberCount, "player"));
  return {
    id:        "slide_league_active_" + lg.id,
    type:      CARD_TYPE.LEAGUE_ACTIVE,
    priority:  2,
    // Eyebrow drops the "Active" prefix because the band's own
    // header already reads "ACTIVE NOW" — repeating it on every
    // slide reads as redundant.
    eyebrow:   "League",
    headline:  lg.name || "League",
    bigStat:   rank ? { value: "#" + rank, label: "Your rank" } : null,
    caption:   captionParts.join(" · ") || null,
    metaLine:  meta && meta.line,
    metaTone:  meta && meta.tone,
    primary:   { kind: "arrow", label: "Open league", onClick: function () { return handlers.openLeague(lg.id); } },
    secondary: null,
  };
}

export function buildAcceptedChallengeSlide(ch, handlers, profileMap, viewerId) {
  var oppId   = ch.challenger_id === viewerId ? ch.challenged_id : ch.challenger_id;
  var oppName = (profileMap && profileMap[oppId] && profileMap[oppId].name) || "Opponent";
  var captionParts = ["Accepted"];
  if (ch.match_format) captionParts.push(ch.match_format === "best_of_3" ? "Best of 3" : (ch.match_format === "one_set" ? "One set" : ch.match_format));
  return {
    id:        "slide_challenge_ready_" + ch.id,
    type:      CARD_TYPE.CHALLENGE_READY,
    priority:  2,
    eyebrow:   "Ready to play",
    headline:  "You vs " + oppName,
    bigStat:   null,
    caption:   captionParts.join(" · "),
    metaLine:  "Log result when played",
    primary:   { kind: "arrow", label: "Log result", onClick: function () { return handlers.logChallenge(ch); } },
    secondary: null,
  };
}

export function buildActiveTournamentSlide(tn, handlers, opts) {
  opts = opts || {};
  var statusInfo  = opts.statusInfo || { label: "" };
  var entrants    = (tn.entrants || []).length;
  var size        = tn.size || null;
  var bigVal      = entrants && size ? (entrants + "/" + size) : (entrants ? String(entrants) : null);
  return {
    id:        "slide_tournament_active_" + tn.id,
    type:      CARD_TYPE.TOURNAMENT_ACTIVE,
    priority:  2,
    // Same reasoning as League — band header carries "ACTIVE NOW".
    eyebrow:   "Tournament",
    headline:  tn.name || "Tournament",
    bigStat:   bigVal ? { value: bigVal, label: "Entered" } : null,
    caption:   [statusInfo.label, tn.format && humaniseTournamentFormat(tn.format)].filter(Boolean).join(" · ") || null,
    metaLine:  null,
    primary:   { kind: "arrow", label: "Open tournament", onClick: function () { return handlers.openTournament(tn.id); } },
    secondary: null,
  };
}

// Composition: build all slides priority-sorted. Same comparator
// as the cards use so the band order matches the natural priority
// rhythm. Returns [] when no active items exist — caller renders
// an empty state in that case.
export function buildFeaturedSlides(args) {
  var leagues       = args.leagues       || [];
  var challenges    = args.challenges    || [];
  var tournaments   = args.tournaments   || [];
  var profileMap    = args.profileMap    || {};
  var detailCache   = args.detailCache   || {};
  var viewerId      = args.viewerId;
  var handlers      = args.handlers      || {};
  var isEntered     = args.isEntered     || function () { return false; };
  var tournStatus   = args.tournStatus   || function () { return { label: "" }; };

  var slides = [];

  leagues.forEach(function (lg) {
    if (lg.my_status !== "invited") return;
    var detail   = detailCache[lg.id];
    var memberCount = detail && (detail.members || []).filter(function (m) { return m.status === "active"; }).length;
    slides.push(buildLeagueInviteSlide(lg, handlers, { memberCount: memberCount || null }));
  });

  challenges.forEach(function (ch) {
    if (ch.status !== "pending" || ch.challenged_id !== viewerId) return;
    slides.push(buildIncomingChallengeSlide(ch, handlers, profileMap));
  });

  leagues.forEach(function (lg) {
    if (lg.my_status !== "active" || !isActive(lg)) return;
    var detail      = detailCache[lg.id] || null;
    var standing    = detail && (detail.standings || []).find(function (s) { return s.user_id === viewerId; });
    var memberCount = detail && (detail.members || []).filter(function (m) { return m.status === "active"; }).length;
    var lastMeta    = detail && lastLeagueResultMeta(detail, lg.id, viewerId, profileMap);
    slides.push(buildActiveLeagueSlide(lg, handlers, {
      viewerStanding: standing || null,
      memberCount:    memberCount || null,
      lastMeta:       lastMeta || null,
    }));
  });

  challenges.forEach(function (ch) {
    if (ch.status !== "accepted") return;
    if (ch.challenger_id !== viewerId && ch.challenged_id !== viewerId) return;
    slides.push(buildAcceptedChallengeSlide(ch, handlers, profileMap, viewerId));
  });

  tournaments.forEach(function (tn) {
    if (!isEntered(tn.id)) return;
    if (tn.status === "completed" || tn.status === "cancelled") return;
    slides.push(buildActiveTournamentSlide(tn, handlers, { statusInfo: tournStatus(tn) }));
  });

  return slides.sort(compareCards);
}

// Same cheap relative date as the card path, exported via the
// lower-down formatRelativeDate? — duplicated locally so the slide
// builders are independent of the card builders. Trivial cost.
function cheapDate(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  var diffD = Math.round((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (diffD === 0)  return "today";
  if (diffD === 1)  return "tomorrow";
  if (diffD === -1) return "yesterday";
  if (diffD > 1 && diffD < 7)   return "in " + diffD + " days";
  if (diffD < -1 && diffD > -7) return Math.abs(diffD) + " days ago";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
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
