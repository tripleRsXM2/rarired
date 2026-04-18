// src/features/scoring/services/matchService.js
import { supabase } from "../../../supabase.js";

export function fetchOwnMatches(userId){
  return supabase.from('match_history').select('*').eq('user_id',userId).order('created_at',{ascending:false});
}
export function fetchTaggedMatches(userId){
  return supabase.from('match_history').select('*').eq('opponent_id',userId).eq('status','confirmed').order('created_at',{ascending:false});
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
export function confirmMatch(matchId){
  return supabase.from('match_history')
    .update({status:'confirmed', confirmed_at:new Date().toISOString()})
    .eq('id',matchId)
    .select('*').single();
}
export function disputeMatch(matchId, raisedBy, reason){
  return supabase.from('match_history')
    .update({status:'disputed', dispute_raised_by:raisedBy, dispute_reason:reason||null})
    .eq('id',matchId);
}
export function requestMatchRevision(matchId, requestedBy, reason, snapshot){
  return supabase.from('match_history')
    .update({revision_requested_by:requestedBy, revision_reason:reason||null, original_snapshot:snapshot})
    .eq('id',matchId);
}
export function expireStalePendingMatches(userId){
  // Client-side expiry check since we don't have pg_cron
  return supabase.from('match_history')
    .update({status:'expired'})
    .eq('user_id',userId)
    .eq('status','pending_confirmation')
    .lt('expires_at',new Date().toISOString());
}
