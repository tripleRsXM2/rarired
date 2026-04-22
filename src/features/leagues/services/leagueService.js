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

export function rpcArchiveLeague(leagueId) {
  return supabase.rpc("archive_league", { p_league_id: leagueId });
}
