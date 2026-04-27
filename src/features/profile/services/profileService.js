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
  // skill MUST be one of the values in SKILL_LEVELS (lib/constants/
  // domain.js) — the old "Intermediate" bare value was retired when
  // the ladder was split into Intermediate 1 / Intermediate 2. Picking
  // 'Intermediate 1' as the seed keeps a fresh-default profile in a
  // valid CHECK-constrained state. Onboarding immediately replaces
  // this with the user's actual self-assessment.
  return {
    id:user.id, name:name, suburb:"", skill:"Intermediate 1", style:"All-Court",
    bio:"", avatar:avatarInitials, avatar_url:null, availability:{},
    ranking_points:1000, wins:0, losses:0, matches_played:0,
    streak_count:0, streak_type:null, home_zone:null,
  };
}
