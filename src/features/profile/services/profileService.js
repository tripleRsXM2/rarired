// src/features/profile/services/profileService.js
import { supabase } from "../../../lib/supabase.js";

export function fetchProfile(userId){
  return supabase.from('profiles').select('*').eq('id',userId).single();
}
export function upsertProfile(payload){
  return supabase.from('profiles').upsert(payload,{onConflict:'id'});
}
export function defaultProfile(user, avatarInitials){
  var name=user.user_metadata.name||user.email.split("@")[0];
  return {
    id:user.id, name:name, suburb:"", skill:"Intermediate", style:"All-Court",
    bio:"", avatar:avatarInitials, avatar_url:null, availability:{},
    ranking_points:1000, wins:0, losses:0, matches_played:0,
    streak_count:0, streak_type:null, home_zone:null,
  };
}
