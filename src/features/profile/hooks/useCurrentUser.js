// src/features/profile/hooks/useCurrentUser.js
import { useState } from "react";
import { initials } from "../../../lib/helpers.js";
import { fetchProfile, upsertProfile, defaultProfile } from "../services/profileService.js";

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

  function bumpMatchStats(authUserId, friendResult){
    setProfile(function(p){
      var newWins=(p.wins||0)+(friendResult==="win"?1:0);
      var newLosses=(p.losses||0)+(friendResult==="loss"?1:0);
      var newPlayed=(p.matches_played||0)+1;
      var newPts=Math.max(0,1000+newWins*15-newLosses*10);
      upsertProfile({id:authUserId,wins:newWins,losses:newLosses,matches_played:newPlayed,ranking_points:newPts});
      return Object.assign({},p,{wins:newWins,losses:newLosses,matches_played:newPlayed,ranking_points:newPts});
    });
  }

  function resetProfile(){
    setProfile(INITIAL_PROFILE);
    setProfileDraft(INITIAL_PROFILE);
  }

  return {
    profile, setProfile, profileDraft, setProfileDraft,
    editingAvail, setEditingAvail, availDraft, setAvailDraft,
    showOnboarding, setShowOnboarding,
    onboardStep, setOnboardStep, onboardDraft, setOnboardDraft,
    loadProfile, triggerOnboarding, bumpMatchStats, resetProfile,
  };
}
