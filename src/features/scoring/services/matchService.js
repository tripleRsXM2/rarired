// src/features/scoring/services/matchService.js
import { supabase } from "../../../supabase.js";

export function fetchOwnMatches(userId){
  return supabase.from('match_history').select('*').eq('user_id',userId).order('created_at',{ascending:false});
}
export function fetchTaggedMatches(userId){
  return supabase.from('match_history').select('*').eq('tagged_user_id',userId).eq('tag_status','accepted').order('created_at',{ascending:false});
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
export function deleteMatchRow(matchId, ownerId){
  return supabase.from('match_history').delete().eq('id',matchId).eq('user_id',ownerId);
}
export function markMatchTagStatus(matchId, status, returnData){
  var q=supabase.from('match_history').update({tag_status:status}).eq('id',matchId);
  if(returnData) return q.select('*').single();
  return q;
}
