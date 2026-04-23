// src/features/profile/hooks/useCurrentUser.js
import { useState } from "react";
import { initials } from "../../../lib/utils/avatar.js";
import { fetchProfile, upsertProfile, defaultProfile } from "../services/profileService.js";
import { supabase } from "../../../lib/supabase.js";

var INITIAL_PROFILE={name:"Your Name",suburb:"Sydney",skill:"Intermediate",style:"All-Court",bio:"",avatar:"YN",availability:{}};

export function useCurrentUser(){
  var [profile,setProfile]=useState(INITIAL_PROFILE);
  var [profileDraft,setProfileDraft]=useState(INITIAL_PROFILE);
  var [editingAvail,setEditingAvail]=useState(false);
  var [availDraft,setAvailDraft]=useState({});
  var [showOnboarding,setShowOnboarding]=useState(false);
  var [onboardStep,setOnboardStep]=useState(1);
  var [onboardDraft,setOnboardDraft]=useState({skill:"Intermediate",style:"All-Court",suburb:""});

  async function loadProfile(user){
    var init=initials(user.user_metadata.name||user.email);
    var r=await fetchProfile(user.id);
    var isNewUser=!r.data;
    var defaults=defaultProfile(user,init);
    var loaded;
    if(r.data){
      loaded=r.data;
      setProfile(r.data); setProfileDraft(r.data);
    } else {
      loaded=defaults;
      setProfile(defaults); setProfileDraft(defaults);
      await upsertProfile(defaults);
    }
    return { profile:loaded, isNew:isNewUser };
  }

  function triggerOnboarding(){
    setOnboardDraft({skill:"Intermediate",style:"All-Court",suburb:""});
    setOnboardStep(1);
    setShowOnboarding(true);
  }

  // Stat columns (wins/losses/ranking_points/matches_played/streak_*) are
  // DB-owned — the profiles_locked_columns_guard trigger rejects any
  // client-side UPDATE that touches them. Legit updates flow through
  // bump_stats_for_match(p_match_id), a security-definer RPC that reads
  // the authoritative match row and rewrites both participants' stats.
  //
  // We used to do wins+1 arithmetic in the client, which is a trivial
  // exploit (just upsert ranking_points:999999). Removed.
  async function bumpMatchStats(authUserId, matchId){
    if (!matchId) return;
    var r = await supabase.rpc('bump_stats_for_match', { p_match_id: matchId });
    if (r.error) {
      console.warn("[bumpMatchStats] RPC error:", r.error.message);
      return;
    }
    // Refetch to pull the new stats into the UI (only for the signed-in user).
    var fresh = await fetchProfile(authUserId);
    if (fresh.data) {
      setProfile(function (prev) {
        if (!prev.id || prev.id !== authUserId) return prev;
        return fresh.data;
      });
    }
  }

  async function refreshProfileUI(userId){
    var r=await fetchProfile(userId);
    if(r.data) setProfile(function(prev){
      if(!prev.id||prev.id!==userId) return prev;
      return r.data;
    });
  }

  function resetProfile(){
    // Full sign-out reset — clear profile + every piece of transient edit
    // state (availability editor, onboarding wizard) so the next session
    // starts at a clean slate regardless of where the previous user left off.
    setProfile(INITIAL_PROFILE);
    setProfileDraft(INITIAL_PROFILE);
    setEditingAvail(false);
    setAvailDraft({});
    setShowOnboarding(false);
    setOnboardStep(1);
    setOnboardDraft({skill:"Intermediate",style:"All-Court",suburb:""});
  }

  return {
    profile, setProfile, profileDraft, setProfileDraft,
    editingAvail, setEditingAvail, availDraft, setAvailDraft,
    showOnboarding, setShowOnboarding,
    onboardStep, setOnboardStep, onboardDraft, setOnboardDraft,
    loadProfile, triggerOnboarding, bumpMatchStats, refreshProfileUI, resetProfile,
  };
}
