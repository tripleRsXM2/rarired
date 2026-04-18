// src/features/auth/hooks/useAuthController.js
import { useState, useEffect, useRef } from "react";
import { getSession, subscribeAuthChange, normalizeAuthUser } from "../services/authService.js";

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
  };
}
