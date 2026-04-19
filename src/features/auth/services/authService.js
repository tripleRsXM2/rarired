// src/features/auth/services/authService.js
import { supabase } from "../../../lib/supabase.js";
import { initials } from "../../../lib/helpers.js";

export function getSession(){ return supabase.auth.getSession(); }

export function subscribeAuthChange(handler){
  var sub=supabase.auth.onAuthStateChange(handler);
  return function(){ sub.data.subscription.unsubscribe(); };
}

export function normalizeAuthUser(user){
  var init=initials(user.user_metadata.name||user.email);
  return {
    id:user.id,
    name:user.user_metadata.name||user.email.split("@")[0],
    email:user.email,
    avatar:init,
  };
}

export function signUp(email,password,name){
  return supabase.auth.signUp({email:email,password:password,options:{data:{name:name}}});
}
export function signIn(email,password){
  return supabase.auth.signInWithPassword({email:email,password:password});
}
export function sendPasswordReset(email,redirectTo){
  return supabase.auth.resetPasswordForEmail(email,{redirectTo:redirectTo});
}
export function updatePassword(newPassword){
  return supabase.auth.updateUser({password:newPassword});
}
export function signOut(){ return supabase.auth.signOut(); }
