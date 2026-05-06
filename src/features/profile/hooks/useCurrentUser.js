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
      // Don't clobber profile state when we can't read. We DO flip
      // profileLoaded → true so Settings' Save button isn't permanently
      // disabled when an RLS denial / network blip blocks the initial
      // fetch. The save itself will fail gracefully with a visible
      // toast and the user can retry. User feedback: 'after I signed
      // up, the settings get stuck at loading... it doesn't allow me
      // to save.'
      setProfileLoaded(true);
      return { profile: null, isNew: false, error: r.error };
    }
    var isNewUser = !r.data;
    var loaded;
    if(r.data){
      loaded=r.data;
      setProfile(r.data); setProfileDraft(r.data);
      // Replay any leftover onboarding state (e.g. user signed in
      // after email confirmation; cs-onb still has the typed
      // name/age/skill/zone/courts/avail).
      var refreshedExisting = await replayLeftoverOnboardingState(user.id, r.data);
      if (refreshedExisting) loaded = refreshedExisting;
    } else {
      // Brand-new user — no profile row yet. ALWAYS create it. The
      // previous midOnboarding gate skipped this write to avoid a race
      // with OnboardingFlow.flushedRef, but flushedRef's silent
      // .catch(() => {}) was hiding errors and leaving rows missing
      // entirely (verified live: 7 recent users had auth.users entries
      // with name in metadata but ZERO profile rows). User feedback:
      // 'I made a john doe account name and it still shows up as Your
      // Name. Can you fix that?' Defaults include name pulled from
      // user.user_metadata.name (set at signUp via options.data.name)
      // so even if cs-onb is empty the row gets the typed name.
      loaded = defaults;
      setProfile(defaults); setProfileDraft(defaults);
      var ur = await upsertProfile(defaults);
      if (ur && ur.error) {
        console.warn("[useCurrentUser] defaults upsert failed:", ur.error.message || ur.error);
      }
      // Overlay any leftover onboarding state on top so the typed
      // name/age/skill/etc beat the defaults (which fall back to
      // email-prefix when user_metadata.name is missing).
      var refreshed = await replayLeftoverOnboardingState(user.id, defaults);
      if (refreshed) loaded = refreshed;
    }
    setProfileLoaded(true);
    return { profile:loaded, isNew:isNewUser };
  }

  // Replay onboarding-screen state that the user typed pre-auth.
  // The OnboardingFlow stashes screen state under "cs-onb"; on email-
  // confirm-required projects, the user types a full profile but
  // auth.authUser is null so nothing gets written to the DB row. This
  // helper runs on the first authenticated loadProfile and applies
  // every typed field, then clears the localStorage. Best-effort —
  // any failure leaves the row alone but the user can still edit
  // via Settings. Idempotent: cs-onb is cleared after the upsert so
  // subsequent loadProfile calls find nothing.
  async function replayLeftoverOnboardingState(userId, baseProfile){
    if (!userId || typeof localStorage === "undefined") return null;
    var raw;
    try { raw = localStorage.getItem("cs-onb"); } catch(_) { return null; }
    if (!raw) return null;
    var stash;
    try { stash = JSON.parse(raw); } catch(_) { return null; }
    var s = stash && stash.state;
    if (!s) return null;
    var fullName = ((s.first||"").trim() + " " + (s.last||"").trim()).trim();
    var patch = { id: userId };
    var any = false;
    if (fullName)             { patch.name = fullName; patch.avatar = initials(fullName); any = true; }
    if (s.age)                { patch.age_bracket = s.age; any = true; }
    if (s.level)              { patch.skill = s.level; any = true; }
    if (s.zone)               { patch.home_zone = s.zone; any = true; }
    if (s.courts && s.courts.length) { patch.played_courts = s.courts; any = true; }
    // Availability: the design's chip ids ("wd-am", "wd-pm", "we",
    // "flex") get expanded to the {Mon:["Morning"], …} shape that
    // the rest of the app expects. We deliberately avoid importing
    // the converter from OnboardingFlow to keep the layering clean
    // — instead we inline a minimal version below that matches what
    // availChipsToProfileShape produces. Empty avail → leave column
    // alone (no-op).
    if (s.avail && s.avail.length) {
      var weekdayMornings = s.avail.indexOf("wd-am") >= 0 || s.avail.indexOf("flex") >= 0;
      var weekdayEvenings = s.avail.indexOf("wd-pm") >= 0 || s.avail.indexOf("flex") >= 0;
      var weekendMornings = s.avail.indexOf("we")    >= 0 || s.avail.indexOf("flex") >= 0;
      var av = {};
      ["Mon","Tue","Wed","Thu","Fri"].forEach(function(d){
        var slots = [];
        if (weekdayMornings) slots.push("Morning");
        if (weekdayEvenings) slots.push("Evening");
        if (slots.length) av[d] = slots;
      });
      ["Sat","Sun"].forEach(function(d){
        var slots = [];
        if (weekendMornings) slots.push("Morning");
        if (slots.length) av[d] = slots;
      });
      if (Object.keys(av).length){ patch.availability = av; any = true; }
    }
    if (!any) {
      // Nothing meaningful to replay — clear the stash so we don't
      // re-check on every loadProfile (cheap but tidy).
      try { localStorage.removeItem("cs-onb"); } catch(_) {}
      return null;
    }
    try {
      await upsertProfile(patch);
    } catch(e) {
      console.warn("[useCurrentUser] replay leftover onboarding state failed:", e && e.message);
      return null;
    }
    // Clear the stash so this only ever runs once.
    try { localStorage.removeItem("cs-onb"); } catch(_) {}
    // Refetch so the in-memory profile + draft reflect the merged row.
    var fresh = await fetchProfile(userId);
    if (fresh.data) {
      setProfile(fresh.data);
      setProfileDraft(fresh.data);
      return fresh.data;
    }
    // Fall back to client-side merge if the refetch failed.
    var merged = Object.assign({}, baseProfile || {}, patch);
    setProfile(merged);
    setProfileDraft(merged);
    return merged;
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
