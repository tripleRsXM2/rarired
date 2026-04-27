// src/features/people/services/socialService.js
import { supabase } from "../../../lib/supabase.js";

export function fetchFriendRequests(userId){
  return supabase.from('friend_requests').select('*').or('sender_id.eq.'+userId+',receiver_id.eq.'+userId);
}
export function fetchBlocks(userId){
  return supabase.from('blocks').select('blocked_id').eq('blocker_id',userId);
}
export { fetchProfilesByIds, fetchVisibleProfilesByIds } from "../../../lib/db.js";
export function fetchSuggestedPlayers(userId, suburb, excludeIds){
  // Module 6: case-insensitive, trimmed suburb match. Old exact-string match
  // missed "Bondi" vs "bondi " variants. ilike with the suburb literal still
  // works as exact-text in the absence of % wildcards but ignores case.
  var s=(suburb||"Sydney").trim();
  return supabase.from('profiles').select('id,name,avatar,avatar_url,skill,suburb,ranking_points,matches_played,last_active,show_online_status,show_last_seen')
    .neq('id',userId).ilike('suburb',s)
    .not('id','in','('+excludeIds.join(',')+')')
    .limit(6);
}
// Same declared skill level, excluding the viewer, current friends, pending
// requests, blocked users, and whoever's already covered by the suburb-based
// suggestions. Used by the Discover surface.
// Matches candidates by *tier*, not exact sub-level. With the 9-rung
// skill ladder, an "Intermediate 2" looking for hits is still a sensible
// match for "Intermediate 1" and "Intermediate 3" — the variance inside
// a tier is the normal range of a casual game. Exact sub-level equality
// would shrink the pool to near-zero at seed scale.
//
// Handles legacy bare values too ("Intermediate" → same as any
// "Intermediate N"), via SKILL_TIER_MEMBERS built from the authoritative
// SKILL_LEVELS list.
var SKILL_TIER_MEMBERS = {
  "Beginner":     ["Beginner",     "Beginner 1",     "Beginner 2"],
  "Intermediate": ["Intermediate", "Intermediate 1", "Intermediate 2"],
  "Advanced":     ["Advanced",     "Advanced 1",     "Advanced 2", "Competitive"],
};

function tierFor(skill){
  if(!skill) return null;
  if(skill.indexOf("Beginner")===0)     return "Beginner";
  if(skill.indexOf("Intermediate")===0) return "Intermediate";
  if(skill.indexOf("Advanced")===0)     return "Advanced";
  if(skill==="Competitive")             return "Advanced";
  return null;
}

export function fetchSameSkillPlayers(userId, skill, excludeIds, limit){
  if(!skill) return Promise.resolve({data:[]});
  var tier=tierFor(skill);
  var members=(tier&&SKILL_TIER_MEMBERS[tier])||[skill];
  var q=supabase.from('profiles').select('id,name,avatar,avatar_url,skill,suburb,ranking_points,matches_played,last_active,show_online_status,show_last_seen')
    .neq('id',userId).in('skill',members);
  if(excludeIds&&excludeIds.length) q=q.not('id','in','('+excludeIds.join(',')+')');
  return q.limit(limit||6);
}
export function searchProfilesByName(userId, query){
  return supabase.from('profiles').select('id,name,avatar,avatar_url,skill,suburb,ranking_points,matches_played,wins,privacy,last_active,show_online_status,show_last_seen')
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
