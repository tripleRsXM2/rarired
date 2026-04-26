// src/features/trust/services/trustService.js
//
// Module 10 (Slice 2) — client-facing trust service.
//
// Three responsibilities:
//
//   1. submitPostMatchFeedback(...) — wraps the SECURITY DEFINER RPC.
//      The RPC handles eligibility, recalc, and unique-violation gating;
//      this function just shapes the call + maps known error codes to
//      stable client-side strings.
//
//   2. fetchTrustBadge(userId) — single-user lookup against the
//      player_trust_public view. Returns ONLY public columns
//      (public_badge, confidence_level, counts) — numerical scores
//      are never exposed by the view, so client code can never
//      accidentally render trust_score / reliability_score.
//
//   3. fetchTrustBadgesForUsers(userIds) — bulk lookup. Used by
//      FeedCard and Discover to render badges next to player names
//      without N+1 queries.
//
// Design principle: this service is pure data plumbing. Visibility
// rules ("don't render the badge for new/building") live in
// trustLevels.js so they're testable independently.

import { supabase } from "../../../lib/supabase.js";

// Map server-side P0001 RAISE messages back to user-friendly strings.
// Anything not in this list bubbles up as the raw server message.
var ERROR_COPY = {
  "not authenticated":
    "Sign in to leave feedback.",
  "cannot review yourself":
    "You can't review yourself.",
  "match not found":
    "We couldn't find that match.",
  "feedback only allowed on confirmed or in-flight ranked matches":
    "Feedback is available once the match is confirmed.",
  "feedback requires a linked opponent (no freetext matches)":
    "Feedback is only available for matches against linked CourtSync players.",
  "you were not a party to this match":
    "You can only leave feedback on your own matches.",
  "reviewed user must be the opponent of the match":
    "You can only leave feedback for your opponent.",
};

// Best-effort map: try exact then prefix match (server RAISE uses
// printf-style "...status: %s" which we can't match exactly without
// the runtime arg).
function friendlyErrorMessage(rawMessage) {
  if (!rawMessage) return "Could not save feedback. Please try again.";
  if (ERROR_COPY[rawMessage]) return ERROR_COPY[rawMessage];
  // Prefix match for status-eligibility error which has a runtime suffix.
  for (var key in ERROR_COPY) {
    if (rawMessage.indexOf(key) === 0) return ERROR_COPY[key];
  }
  return rawMessage;
}

// ─────────────────────────────────────────────────────────────────────
// Submit feedback
// ─────────────────────────────────────────────────────────────────────
//
// payload: {
//   matchId:            string,
//   reviewedUserId:     string (uuid),
//   wouldPlayAgain:     boolean | null,
//   showedUp:           boolean | null,
//   scoreFeltFair:      boolean | null,
//   sportsmanshipIssue: boolean (default false),
//   noShowReport:       boolean (default false),
//   privateNote:        string | null  (max 500 chars),
// }
//
// Returns:
//   { ok: true,  feedbackId: <uuid>, error: null }              — success
//   { ok: false, error: { code, message, raw } }                 — failure
//
// Common failure codes:
//   - 'duplicate'     — UNIQUE(match_id, reviewer_id) — already reviewed
//   - 'unauthorized'  — caller not signed in
//   - 'ineligible'    — match status / not a party / freetext / self-review
//   - 'unknown'       — anything else
export async function submitPostMatchFeedback(payload) {
  var p = payload || {};
  var note = (p.privateNote == null) ? null : String(p.privateNote).slice(0, 500);

  var r = await supabase.rpc("submit_post_match_feedback", {
    p_match_id:            p.matchId,
    p_reviewed_user_id:    p.reviewedUserId,
    p_would_play_again:    p.wouldPlayAgain ?? null,
    p_showed_up:           p.showedUp ?? null,
    p_score_felt_fair:     p.scoreFeltFair ?? null,
    p_sportsmanship_issue: !!p.sportsmanshipIssue,
    p_no_show_report:      !!p.noShowReport,
    p_private_note:        note,
  });

  if (r.error) {
    var raw = r.error.message || String(r.error);
    var code = "unknown";
    if (r.error.code === "23505") code = "duplicate";
    else if (raw === "not authenticated") code = "unauthorized";
    else if (raw === "cannot review yourself"
          || raw.indexOf("feedback only allowed") === 0
          || raw.indexOf("feedback requires a linked opponent") === 0
          || raw === "you were not a party to this match"
          || raw === "reviewed user must be the opponent of the match"
          || raw === "match not found") code = "ineligible";
    return {
      ok: false,
      error: {
        code: code,
        message: code === "duplicate"
          ? "You've already reviewed this match."
          : friendlyErrorMessage(raw),
        raw: raw,
      },
    };
  }

  // RPC returns the new feedback row's UUID as data.
  return { ok: true, feedbackId: r.data, error: null };
}

// ─────────────────────────────────────────────────────────────────────
// Trust-badge lookups (public columns only)
// ─────────────────────────────────────────────────────────────────────

// Single-user lookup. Returns null if no row exists yet (e.g., a user
// who signed up after the migration backfill but before any state
// change triggered recalc — shouldn't happen post-Slice-1, but stays
// defensive).
export async function fetchTrustBadge(userId) {
  if (!userId) return null;
  var r = await supabase
    .from("player_trust_public")
    .select("user_id,public_badge,confidence_level,confirmed_matches_count,ranked_confirmed_matches_count")
    .eq("user_id", userId)
    .maybeSingle();
  if (r.error) {
    // Don't surface a broken trust read as a UI error — badges are an
    // enhancement, not a critical path. Log and return null.
    console.warn("[trust] fetchTrustBadge:", r.error.message || r.error);
    return null;
  }
  return r.data || null;
}

// Bulk lookup. Returns a map: { [userId]: { public_badge, confidence_level, ... } }.
// Skipped users (no row) are simply absent from the map — callers handle
// "no badge" as the absence case.
export async function fetchTrustBadgesForUsers(userIds) {
  if (!userIds || !userIds.length) return {};
  // Dedupe + drop falsy
  var ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return {};

  var r = await supabase
    .from("player_trust_public")
    .select("user_id,public_badge,confidence_level,confirmed_matches_count,ranked_confirmed_matches_count")
    .in("user_id", ids);
  if (r.error) {
    console.warn("[trust] fetchTrustBadgesForUsers:", r.error.message || r.error);
    return {};
  }

  var out = {};
  (r.data || []).forEach(function (row) { out[row.user_id] = row; });
  return out;
}
