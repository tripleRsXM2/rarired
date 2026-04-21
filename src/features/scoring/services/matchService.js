// src/features/scoring/services/matchService.js
import { supabase } from "../../../lib/supabase.js";

export function fetchOwnMatches(userId){
  return supabase.from('match_history').select('*').eq('user_id',userId).order('created_at',{ascending:false});
}
// Single query for all matches where current user is the opponent
export function fetchOpponentMatches(userId){
  return supabase.from('match_history').select('*').eq('opponent_id',userId)
    .in('status',['pending_confirmation','confirmed','disputed','pending_reconfirmation','voided']).order('created_at',{ascending:false});
}
export function fetchFeedLikes(userId, matchIds){
  return supabase.from('feed_likes').select('match_id').eq('user_id',userId).in('match_id',matchIds);
}
export function fetchFeedLikeCounts(matchIds){
  return supabase.from('feed_likes').select('match_id').in('match_id',matchIds);
}
export function fetchFeedComments(matchIds){
  return supabase.from('feed_comments').select('id,match_id,user_id,body,created_at').in('match_id',matchIds).order('created_at',{ascending:true});
}
export function insertMatch(payload){
  return supabase.from('match_history').insert(payload).select('id').single();
}
export function deleteMatchRow(matchId, ownerId){
  return supabase.from('match_history').delete().eq('id',matchId).eq('user_id',ownerId);
}
export function markMatchTagStatus(matchId, status, returnData){
  var q=supabase.from('match_history').update({tag_status:status,status:status==='accepted'?'confirmed':'expired'}).eq('id',matchId);
  if(returnData) return q.select('*').single();
  return q;
}
export function confirmMatchAndUpdateStats(matchId){
  return supabase.rpc('confirm_match_and_update_stats',{p_match_id:matchId});
}
export function acceptCorrectionRpc(matchId){
  return supabase.rpc('accept_correction_and_update_stats',{p_match_id:matchId});
}
export function voidMatchRpc(matchId, reason){
  return supabase.rpc('void_match',{p_match_id:matchId,p_reason:reason||'voided'});
}
// Propose a correction (initial dispute or counter-proposal).
// Uses a SECURITY DEFINER RPC so the write succeeds regardless of which
// party calls it — a direct .update() would fail under RLS for the opponent
// because they don't own the match_history row.
// The RPC also writes match_revisions atomically, so we no longer do that
// separately on the client.
// nextStatus: 'disputed'               — opponent is acting, submitter must respond
//             'pending_reconfirmation' — submitter is counter-proposing, opponent must respond
export function proposeCorrection(matchId, proposal, reasonCode, reasonDetail, nextStatus){
  return supabase.rpc('propose_match_correction', {
    p_match_id:    matchId,
    p_reason_code: reasonCode,
    p_reason_detail: reasonDetail || null,
    p_proposal:    proposal,
    p_next_status: nextStatus,
  });
}
export function fetchMatchById(matchId){
  return supabase.from('match_history').select('*').eq('id',matchId).single();
}
export function updateMatch(matchId, payload){
  return supabase.from('match_history').update(payload).eq('id',matchId);
}
// Server-side enforcement runs on a pg_cron schedule (see supabase/migrations).
// Client-side calls are a best-effort fallback: trigger the same RPC whenever a
// user loads their history. RPC is SECURITY DEFINER so it handles both submitter
// and opponent sides regardless of which party logged in.
export function expireStaleMatches(){
  return supabase.rpc('expire_stale_matches');
}
// Legacy fallbacks (kept for offline/RLS compatibility) — now cover both sides
// of the match via .or() so an opponent logging in can expire matches they're
// party to, not just matches they submitted.
export function expireStalePendingMatches(userId){
  return supabase.from('match_history')
    .update({status:'expired'})
    .or('user_id.eq.'+userId+',opponent_id.eq.'+userId)
    .eq('status','pending_confirmation')
    .lt('expires_at',new Date().toISOString());
}
export function expireDisputedMatches(userId){
  var now=new Date().toISOString();
  return supabase.from('match_history')
    .update({status:'voided',voided_at:now,voided_reason:'timeout',current_proposal:null,proposal_by:null,pending_action_by:null})
    .or('user_id.eq.'+userId+',opponent_id.eq.'+userId)
    .in('status',['disputed','pending_reconfirmation'])
    .lt('dispute_expires_at',now);
}
