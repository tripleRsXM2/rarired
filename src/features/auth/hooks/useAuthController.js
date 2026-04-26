// src/features/auth/hooks/useAuthController.js
import { useState, useEffect, useRef } from "react";
import { getSession, subscribeAuthChange, normalizeAuthUser } from "../services/authService.js";
import { track } from "../../../lib/analytics.js";
import { supabase } from "../../../lib/supabase.js";
import { disablePush, refreshSubscription } from "../../../lib/pushClient.js";

// Module 9.2 — privacy-safe sign-out + push reconciliation.
//
// Two adjacent concerns kept here so every code path that ends a
// session goes through the same plumbing:
//
// 1. signOutAndCleanup() — invalidates the device's push subscription
//    BEFORE calling supabase.auth.signOut(). Without this, a sign-out
//    leaves the browser endpoint subscribed AND the DB row enabled,
//    so when the next user signs in on the same device they end up
//    sharing a single push endpoint with the previous user — pushes
//    intended for one land on the device of the other. See
//    docs/privacy-and-storage.md "Push notifications" for the full
//    threat model.
//
//    Failure mode: if disablePush() fails (offline, RLS hiccup, no
//    subscription) we still proceed with sign-out. The browser-level
//    unsubscribe inside disablePush is wrapped in try/catch and runs
//    first, so even when the DB write fails the device stops
//    receiving pushes immediately.
//
// 2. The useEffect on authUser.id calls refreshSubscription() once
//    per session start, so a rotated browser endpoint reconciles
//    against the signed-in user's row — preserves "this device is
//    enabled" across silent endpoint rotations (key rotation, GCM →
//    FCM migration, crash recovery).

async function signOutAndCleanup() {
  try { await disablePush(); } catch (_) { /* best-effort */ }
  return supabase.auth.signOut();
}

export function useAuthController(callbacks){
  var [authUser,setAuthUser]=useState(null);
  var [authInitialized,setAuthInitialized]=useState(false);

  // Auth modal state
  var [showAuth,setShowAuth]=useState(false);
  var [authMode,setAuthMode]=useState("login");
  var [authStep,setAuthStep]=useState("choose");
  var [authEmail,setAuthEmail]=useState("");
  var [authPassword,setAuthPassword]=useState("");
  var [authName,setAuthName]=useState("");
  var [authLoading,setAuthLoading]=useState(false);
  var [authNewPassword,setAuthNewPassword]=useState("");
  var [authNewPassword2,setAuthNewPassword2]=useState("");
  var [authError,setAuthError]=useState("");
  var [authFieldErrors,setAuthFieldErrors]=useState({});

  // Keep callbacks fresh without re-subscribing
  var cbRef=useRef(callbacks||{});
  cbRef.current=callbacks||{};

  useEffect(function(){
    // Module 3.5: fire once per tab-session on mount. app_open counts sessions
    // even before auth resolves — user_id is filled in by the analytics helper
    // at flush time, so an already-signed-in user gets their id attached, and
    // an anonymous visitor writes a null-user row.
    track("app_open", {});

    getSession().then(function(r){
      if(r.data.session){
        setAuthUser(normalizeAuthUser(r.data.session.user));
        if(cbRef.current.onSessionRestored)cbRef.current.onSessionRestored(r.data.session.user);
      } else {
        setAuthInitialized(true);
      }
    });
    var unsub=subscribeAuthChange(function(ev,session){
      if(ev==="PASSWORD_RECOVERY"){
        setAuthNewPassword("");setAuthNewPassword2("");
        setAuthStep("set-password");setShowAuth(true);
        if(cbRef.current.onPasswordRecovery)cbRef.current.onPasswordRecovery();
        return;
      }
      if(session){
        setAuthUser(normalizeAuthUser(session.user));
        if(ev==="SIGNED_IN"&&cbRef.current.onFreshSignIn){
          cbRef.current.onFreshSignIn(session.user);
        } else if(cbRef.current.onSessionRestored){
          cbRef.current.onSessionRestored(session.user);
        }
      } else {
        setAuthUser(null);
        setAuthInitialized(true);
        if(cbRef.current.onSignOut)cbRef.current.onSignOut();
      }
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Module 9.2 — push-subscription reconciliation. Runs once per
  // signed-in session. refreshSubscription is idempotent: if the
  // browser has no subscription it no-ops, if the endpoint already
  // matches the DB row it's a cheap upsert.
  useEffect(function () {
    if (!authUser || !authUser.id) return;
    refreshSubscription(authUser.id).catch(function () { /* swallow */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser && authUser.id]);

  function requireAuth(cb){
    if(authUser)cb();else{setShowAuth(true);setAuthMode("login");setAuthStep("choose");}
  }
  function openLogin(){setShowAuth(true);setAuthMode("login");setAuthStep("choose");}
  function openSignup(){setShowAuth(true);setAuthMode("signup");setAuthStep("choose");}

  return {
    authUser, setAuthUser, authInitialized, setAuthInitialized,
    showAuth, setShowAuth, authMode, setAuthMode, authStep, setAuthStep,
    authEmail, setAuthEmail, authPassword, setAuthPassword, authName, setAuthName,
    authLoading, setAuthLoading,
    authNewPassword, setAuthNewPassword, authNewPassword2, setAuthNewPassword2,
    authError, setAuthError, authFieldErrors, setAuthFieldErrors,
    requireAuth, openLogin, openSignup,
    // Module 9.2 — exposed so SettingsScreen (and any future sign-out
    // call site) can route through one funnel that handles push
    // cleanup. Direct supabase.auth.signOut() is no longer the
    // sanctioned path.
    signOutAndCleanup,
  };
}
