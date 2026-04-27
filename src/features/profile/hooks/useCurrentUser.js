// src/features/profile/hooks/useCurrentUser.js
import { useState } from "react";
import { initials } from "../../../lib/utils/avatar.js";
import { fetchProfile, upsertProfile, defaultProfile } from "../services/profileService.js";
import { supabase } from "../../../lib/supabase.js";

// Pre-auth placeholder shown while loadProfile hasn't returned yet. We
// intentionally render this transient state in read-only surfaces but
// NEVER let it back into a save: see profileLoaded below — UI gates
// every write path on it. (See post-mortem in docs / commit a3xx.)
var INITIAL_PROFILE={name:"Your Name",suburb:"Sydney",skill:"Intermediate 1",style:"All-Court",bio:"",avatar:"YN",availability:{},played_courts:[]};

export function useCurrentUser(){
  var [profile,setProfile]=useState(INITIAL_PROFILE);
  var [profileDraft,setProfileDraft]=useState(INITIAL_PROFILE);
  // Has loadProfile resolved with real data? UI must check this before
  // letting the user fire a profile UPDATE — otherwise a stale draft
  // sourced from INITIAL_PROFILE can stomp populated columns.
  // Real-world incident: a user opened Settings + tapped Save before
  // fetchProfile returned, wiping their played_courts / bio /
  // avatar_url with empty defaults.
  var [profileLoaded,setProfileLoaded]=useState(false);
  var [editingAvail,setEditingAvail]=useState(false);
  var [availDraft,setAvailDraft]=useState({});
  var [showOnboarding,setShowOnboarding]=useState(false);
  var [onboardStep,setOnboardStep]=useState(1);
  var [onboardDraft,setOnboardDraft]=useState({skill:"Intermediate 1",style:"All-Court",suburb:""});

  async function loadProfile(user){
    var init=initials(user.user_metadata.name||user.email);
    var r=await fetchProfile(user.id);
    var defaults=defaultProfile(user,init);

    // Transient-error handling. If the request errored at all (503
    // PostgREST outage, network blip, RLS denial, etc.) we MUST NOT
    // treat the user as new — that fires the onboarding modal AND
    // overwrites their profile with `defaults`, which is what
    // triggered the 'Your game, your level' loop during the
    // 2026-04-27 PostgREST outage.
    //   • r.data + no error → load real profile
    //   • r.data is null + error → service couldn't tell us; bail
    //     gracefully, keep prior in-memory profile, do NOT upsert,
    //     do NOT mark new. Caller's loadProfile flow can retry.
    //   • r.data is null + no error → genuine new user; create
    //     defaults + upsert + flag isNew=true so onboarding fires.
    if(r.error){
      console.warn("[useCurrentUser] loadProfile error — preserving prior state:", r.error.message || r.error);
      // Don't clobber profile state when we can't read. Mark
      // unloaded so the UI's profileLoaded gate stays closed and
      // the user doesn't accidentally save a stale draft.
      setProfileLoaded(false);
      return { profile: null, isNew: false, error: r.error };
    }
    var isNewUser = !r.data;
    var loaded;
    if(r.data){
      loaded=r.data;
      setProfile(r.data); setProfileDraft(r.data);
    } else {
      loaded=defaults;
      setProfile(defaults); setProfileDraft(defaults);
      await upsertProfile(defaults);
    }
    setProfileLoaded(true);
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
    setProfileLoaded(false);
    setEditingAvail(false);
    setAvailDraft({});
    setShowOnboarding(false);
    setOnboardStep(1);
    setOnboardDraft({skill:"Intermediate 1",style:"All-Court",suburb:""});
  }

  return {
    profile, setProfile, profileDraft, setProfileDraft, profileLoaded,
    editingAvail, setEditingAvail, availDraft, setAvailDraft,
    showOnboarding, setShowOnboarding,
    onboardStep, setOnboardStep, onboardDraft, setOnboardDraft,
    loadProfile, triggerOnboarding, bumpMatchStats, refreshProfileUI, resetProfile,
  };
}
