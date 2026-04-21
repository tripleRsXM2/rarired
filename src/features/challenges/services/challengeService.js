// src/features/challenges/services/challengeService.js
// Thin Supabase wrapper around the public.challenges table. RLS does most of
// the gating; we just need to compose the right queries. State transitions
// are validated client-side (and by the table's CHECK constraint).
import { supabase } from "../../../lib/supabase.js";

// All challenges where the current user is either the challenger or the
// challenged party, newest first. Used by useChallenges.loadChallenges.
export function fetchChallengesForUser(userId) {
  return supabase
    .from("challenges")
    .select("*")
    .or("challenger_id.eq." + userId + ",challenged_id.eq." + userId)
    .order("created_at", { ascending: false })
    .limit(50);
}

export function insertChallenge(payload) {
  return supabase.from("challenges").insert(payload).select("*").single();
}

// Status transitions — the client picks the new status, RLS lets either
// party update, the CHECK constraint enforces the enum.
export function updateChallengeStatus(challengeId, status, extra) {
  var patch = Object.assign({ status: status, responded_at: new Date().toISOString() }, extra || {});
  return supabase.from("challenges").update(patch).eq("id", challengeId).select("*").single();
}

// On conversion to a real match, mark the challenge completed and link the
// match_id. Called from useMatchHistory after submitMatch when the source
// challenge id is known.
export function markChallengeCompleted(challengeId, matchId) {
  return supabase.from("challenges")
    .update({ status: "completed", completed_at: new Date().toISOString(), match_id: matchId })
    .eq("id", challengeId)
    .select("*")
    .single();
}

export function deleteChallenge(challengeId) {
  return supabase.from("challenges").delete().eq("id", challengeId);
}
