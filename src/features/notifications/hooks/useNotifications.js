// src/features/notifications/hooks/useNotifications.js
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase.js";
import * as N from "../services/notificationService.js";
import { fetchProfilesByIds } from "../../../lib/db.js";

export function useNotifications(opts){
  var authUser=(opts&&opts.authUser)||null;
  var onMatchTagAccepted=opts&&opts.onMatchTagAccepted;
  var updateMatchTagStatus=(opts&&opts.updateMatchTagStatus)||null;

  var [notifications,setNotifications]=useState([]);
  var [showNotifications,setShowNotifications]=useState(false);

  // ── Initial load ────────────────────────────────────────────────────────────

  async function loadNotifications(userId){
    console.debug('[useNotifications] loadNotifications called for userId:', userId);
    var nr=await N.fetchRecentNotifications(userId);
    console.debug('[useNotifications] fetched notifications:', nr.data?.length ?? 0, nr.error||'');
    if(nr.data&&nr.data.length){
      var fromIds=[...new Set(nr.data.map(function(n){return n.from_user_id;}).filter(Boolean))];
      var fpr=fromIds.length?await fetchProfilesByIds(fromIds,'id,name,avatar'):{data:[]};
      var fpMap={};(fpr.data||[]).forEach(function(p){fpMap[p.id]=p;});
      setNotifications(nr.data.map(function(n){
        var fp=fpMap[n.from_user_id]||{};
        return Object.assign({},n,{fromName:fp.name||"Someone",fromAvatar:fp.avatar||"?"});
      }));
    } else {
      setNotifications([]);
    }
  }

  // ── Realtime subscription ───────────────────────────────────────────────────
  // Listens for INSERT on notifications where user_id = logged-in user.
  // This is the fix for the missing real-time delivery bug.

  useEffect(function(){
    if(!authUser)return;
    var uid=authUser.id;
    console.debug('[useNotifications] subscribing realtime for uid:', uid);

    async function handleNotifChange(payload){
      var n=payload.new;
      if(!n||n.user_id!==uid)return;
      var senderProfile={name:'Someone',avatar:'?'};
      if(n.from_user_id){
        var pr=await fetchProfilesByIds([n.from_user_id],'id,name,avatar');
        var p=(pr.data&&pr.data[0])||{};
        senderProfile={name:p.name||'Someone',avatar:p.avatar||'?'};
      }
      var enriched=Object.assign({},n,{fromName:senderProfile.name,fromAvatar:senderProfile.avatar});
      setNotifications(function(ns){
        // UPDATE: replace existing row in-place (same id)
        if(ns.some(function(x){return x.id===enriched.id;})){
          return ns.map(function(x){return x.id===enriched.id?enriched:x;});
        }
        // INSERT: prepend
        return [enriched].concat(ns);
      });
    }

    var channel=supabase.channel('notifications:'+uid)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'user_id=eq.'+uid},handleNotifChange)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'notifications',filter:'user_id=eq.'+uid},handleNotifChange)
      .subscribe(function(status){
        console.debug('[useNotifications] channel status:', status);
      });

    return function(){
      console.debug('[useNotifications] removing channel for uid:', uid);
      supabase.removeChannel(channel);
    };
  },[authUser&&authUser.id]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  function resetNotifications(){
    setNotifications([]); setShowNotifications(false);
  }

  function unreadCount(){return notifications.filter(function(n){return!n.read;}).length;}

  async function markNotificationsRead(){
    var unread=notifications.filter(function(n){return!n.read;});
    if(!unread.length||!authUser)return;
    await N.markAllNotificationsRead(authUser.id);
    setNotifications(function(ns){return ns.map(function(n){return Object.assign({},n,{read:true});});});
  }

  async function acceptMatchTag(n){
    if(!updateMatchTagStatus){console.error('[acceptMatchTag] updateMatchTagStatus callback not provided');return;}
    var mr=await updateMatchTagStatus(n.match_id,'accepted',true);
    await N.deleteNotification(n.id);
    setNotifications(function(ns){return ns.filter(function(x){return x.id!==n.id;});});
    setShowNotifications(false);
    if(mr.error){console.error('[accept] failed:',mr.error);return;}
    if(mr.data&&onMatchTagAccepted) onMatchTagAccepted(mr.data);
  }

  async function declineMatchTag(n){
    if(!updateMatchTagStatus){console.error('[declineMatchTag] updateMatchTagStatus callback not provided');return;}
    await updateMatchTagStatus(n.match_id,'declined',false);
    await N.deleteNotification(n.id);
    setNotifications(function(ns){return ns.filter(function(x){return x.id!==n.id;});});
  }

  return {
    notifications, setNotifications,
    showNotifications, setShowNotifications,
    loadNotifications, resetNotifications,
    unreadCount, markNotificationsRead,
    acceptMatchTag, declineMatchTag,
  };
}
