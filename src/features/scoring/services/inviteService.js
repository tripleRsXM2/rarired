// src/features/scoring/services/inviteService.js
//
// Supabase wrappers for the opponent-invite RPCs (Module 9). Every
// state transition lives in a SECURITY DEFINER function on the DB
// side; this file is just the JSON marshalling.
//
// Token lifecycle (recap):
//   1. createMatchInvite(matchId, name, contact?, expiresInHours?)
//        → { invite_id, token, expires_at }
//      The raw token is returned ONCE. After this, only the hash
//      (invisible to clients) lives on the DB. Hold onto the token
//      just long enough to put it in the share-link URL — never
//      persist it client-side beyond that.
//   2. previewMatchInvite(token)
//        → { status: 'pending'|'claimed'|'declined'|'revoked'|'expired'|'not_found', ... }
//      Public-callable so logged-out users see a safe preview.
//   3. claimMatchInvite(token)        — authenticated only
//   4. declineMatchInvite(token)      — authenticated only
//   5. revokeMatchInvite(inviteId)    — authenticated only, inviter only

import { supabase } from "../../../lib/supabase.js";

export async function createMatchInvite(matchId, invitedName, invitedContact, expiresInHours) {
  // Returns the rpc result row directly. RPCs that "returns table"
  // come back as an array; the .single() helper unwraps to one row.
  return supabase.rpc("create_match_invite", {
    p_match_id:        matchId,
    p_invited_name:    invitedName,
    p_invited_contact: invitedContact || null,
    p_expires_in_hours: expiresInHours == null ? 720 : expiresInHours,
  }).single();
}

export async function previewMatchInvite(token) {
  return supabase.rpc("preview_match_invite", { p_token: token });
}

export async function claimMatchInvite(token) {
  return supabase.rpc("claim_match_invite", { p_token: token });
}

export async function declineMatchInvite(token) {
  return supabase.rpc("decline_match_invite", { p_token: token });
}

export async function revokeMatchInvite(inviteId) {
  return supabase.rpc("revoke_match_invite", { p_invite_id: inviteId });
}
