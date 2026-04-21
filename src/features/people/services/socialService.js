// src/features/people/services/socialService.js
import { supabase } from "../../../lib/supabase.js";

export function fetchFriendRequests(userId){
  return supabase.from('friend_requests').select('*').or('sender_id.eq.'+userId+',receiver_id.eq.'+userId);
}
export function fetchBlocks(userId){
  return supabase.from('blocks').select('blocked_id').eq('blocker_id',userId);
}
export { fetchProfilesByIds } from "../../../lib/db.js";
export function fetchSuggestedPlayers(userId, suburb, excludeIds){
  return supabase.from('profiles').select('id,name,avatar,skill,suburb,ranking_points,matches_played,last_active,show_online_status,show_last_seen')
    .neq('id',userId).eq('suburb',suburb||"Sydney")
    .not('id','in','('+excludeIds.join(',')+')')
    .limit(6);
}
// Same declared skill level, excluding the viewer, current friends, pending
// requests, blocked users, and whoever's already covered by the suburb-based
// suggestions. Used by the Discover surface.
export function fetchSameSkillPlayers(userId, skill, excludeIds, limit){
  if(!skill) return Promise.resolve({data:[]});
  var q=supabase.from('profiles').select('id,name,avatar,skill,suburb,ranking_points,matches_played,last_active,show_online_status,show_last_seen')
    .neq('id',userId).eq('skill',skill);
  if(excludeIds&&excludeIds.length) q=q.not('id','in','('+excludeIds.join(',')+')');
  return q.limit(limit||6);
}
export function searchProfilesByName(userId, query){
  return supabase.from('profiles').select('id,name,avatar,skill,suburb,ranking_points,matches_played,wins,privacy,last_active,show_online_status,show_last_seen')
    .ilike('name','%'+query+'%').neq('id',userId).limit(10);
}
export function insertFriendRequest(senderId, receiverId){
  return supabase.from('friend_requests').insert({sender_id:senderId,receiver_id:receiverId}).select('id').single();
}
export function updateFriendRequestStatus(requestId, status){
  return supabase.from('friend_requests').update({status:status,updated_at:new Date().toISOString()}).eq('id',requestId);
}
export function deleteFriendRequest(requestId){
  return supabase.from('friend_requests').delete().eq('id',requestId);
}
export function deleteFriendRequestBetween(userA, userB){
  return supabase.from('friend_requests').delete()
    .or('and(sender_id.eq.'+userA+',receiver_id.eq.'+userB+'),and(sender_id.eq.'+userB+',receiver_id.eq.'+userA+')');
}
export function insertBlock(blockerId, blockedId){
  return supabase.from('blocks').insert({blocker_id:blockerId,blocked_id:blockedId});
}
export function deleteBlock(blockerId, blockedId){
  return supabase.from('blocks').delete().eq('blocker_id',blockerId).eq('blocked_id',blockedId);
}
