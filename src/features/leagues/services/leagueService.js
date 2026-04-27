// src/features/leagues/services/leagueService.js
//
// Thin Supabase wrappers for the Module 7 leagues RPCs + read queries.
// No business logic here — orchestration lives in useLeagues. Each
// function returns the raw supabase response `{data, error}` so the
// hook can handle errors consistently.

import { supabase } from "../../../lib/supabase.js";

// ── READS ────────────────────────────────────────────────────────────────────

// Every league the viewer is a member of (any membership status except the
// sentinels we filter out at read time). RLS already scopes this to them.
export function fetchMyLeagues(userId) {
  // We can't simply "SELECT * FROM leagues" because non-member leagues are
  // hidden by RLS — but that's exactly what we want. The .order keeps the
  // most recently touched league at the top.
  return supabase
    .from("leagues")
    .select("*, league_members!inner(status,role)")
    .eq("league_members.user_id", userId)
    .in("league_members.status", ["invited", "active"])
    .order("updated_at", { ascending: false });
}

export function fetchLeague(leagueId) {
  return supabase
    .from("leagues")
    .select("*")
    .eq("id", leagueId)
    .maybeSingle();
}

// Members of a league + their profile info (so the UI can render names/avatars
// without a second roundtrip). RLS ensures only co-members can read.
export function fetchLeagueMembers(leagueId) {
  return supabase
    .from("league_members")
    .select("id, league_id, user_id, role, status, invited_by, joined_at, created_at")
    .eq("league_id", leagueId)
    .order("status", { ascending: true });
}

export function fetchLeagueStandings(leagueId) {
  return supabase
    .from("league_standings")
    .select("*")
    .eq("league_id", leagueId)
    .order("rank", { ascending: true, nullsFirst: false });
}

// Confirmed league matches — used for the "Recent activity" strip on the
// league detail page.
export function fetchLeagueRecentMatches(leagueId, limit) {
  return supabase
    .from("match_history")
    .select("*")
    .eq("league_id", leagueId)
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: false })
    .limit(limit || 10);
}

// Module 7.5 — given a candidate set of league ids (typically the viewer's
// own active leagues filtered by mode), return the subset where the
// `opponentId` is ALSO an active member. Used by ScoreModal to show only
// leagues both players are eligible for.
//
// RLS lets a viewer see league_members rows for any league they themselves
// are in, so this works without a SECURITY DEFINER RPC.
export function fetchOpponentActiveLeagueIds(opponentId, candidateLeagueIds) {
  if (!opponentId || !candidateLeagueIds || !candidateLeagueIds.length) {
    return Promise.resolve({ data: [], error: null });
  }
  return supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", opponentId)
    .eq("status", "active")
    .in("league_id", candidateLeagueIds);
}

// ── RPCs (SECURITY DEFINER — server enforces auth + ownership) ───────────────

export function rpcCreateLeague(params) {
  return supabase.rpc("create_league", {
    p_name:                     params.name,
    p_description:              params.description || null,
    p_start_date:               params.start_date || null,
    p_end_date:                 params.end_date || null,
    p_max_members:              params.max_members || null,
    p_match_format:             params.match_format || "best_of_3",
    p_tiebreak_format:          params.tiebreak_format || "standard",
    p_max_matches_per_opponent: params.max_matches_per_opponent || null,
    p_win_points:               params.win_points != null ? params.win_points : 3,
    p_loss_points:              params.loss_points != null ? params.loss_points : 0,
    p_draw_points:              params.draw_points != null ? params.draw_points : 0,
    // Module 7.5: ranked or casual mode (default 'ranked'). DB CHECK
    // validates the value; the validate_match_league trigger enforces
    // that league matches' match_type matches the league mode.
    p_mode:                     params.mode === "casual" ? "casual" : "ranked",
  });
}

export function rpcInviteToLeague(leagueId, userId) {
  return supabase.rpc("invite_to_league", {
    p_league_id: leagueId,
    p_user_id:   userId,
  });
}

export function rpcRespondToLeagueInvite(leagueId, accept) {
  return supabase.rpc("respond_to_league_invite", {
    p_league_id: leagueId,
    p_accept:    !!accept,
  });
}

export function rpcRemoveLeagueMember(leagueId, userId) {
  return supabase.rpc("remove_league_member", {
    p_league_id: leagueId,
    p_user_id:   userId,
  });
}

// ── Lifecycle RPCs (Module 12 Slice 2) ───────────────────────────────────────
//
// All four are SECURITY DEFINER, owner-only. Each accepts an optional
// `reason` (one of the values in LIFECYCLE_REASONS — DB CHECK enforces)
// and an optional free-text `note`. Server-side they:
//   • lock standings (standings_locked_at)
//   • write a league_status_events audit row
//   • emit an audit_log row (best-effort)
//   • fan a notification out to every active member except the actor
//   • resolve any pending league_invite notifs for the league
//
// The thin wrappers below intentionally don't validate reason — the DB's
// leagues_status_reason_check constraint owns that surface, and we want
// any future enum additions to require only a docs+constant change.

export function rpcCompleteLeague(leagueId, reason, note) {
  return supabase.rpc("complete_league", {
    p_league_id: leagueId,
    p_reason:    reason || "season_finished",
    p_note:      note   || null,
  });
}

export function rpcArchiveLeague(leagueId, reason, note) {
  return supabase.rpc("archive_league", {
    p_league_id: leagueId,
    p_reason:    reason || "inactive",
    p_note:      note   || null,
  });
}

export function rpcCancelLeague(leagueId, reason, note) {
  return supabase.rpc("cancel_league", {
    p_league_id: leagueId,
    p_reason:    reason || "cancelled_by_creator",
    p_note:      note   || null,
  });
}

export function rpcVoidLeague(leagueId, reason, note) {
  return supabase.rpc("void_league", {
    p_league_id: leagueId,
    p_reason:    reason || "created_by_mistake",
    p_note:      note   || null,
  });
}
