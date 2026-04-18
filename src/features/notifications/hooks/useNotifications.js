// src/features/notifications/hooks/useNotifications.js
import { useState } from "react";
import * as N from "../services/notificationService.js";
import { fetchProfilesByIds } from "../../../lib/db.js";

export function useNotifications(opts){
  var authUser=(opts&&opts.authUser)||null;
  var onMatchTagAccepted=opts&&opts.onMatchTagAccepted;
  // Callback to update tag status on the match row — supplied by App.jsx to avoid cross-feature import
  var updateMatchTagStatus=(opts&&opts.updateMatchTagStatus)||null;

  var [notifications,setNotifications]=useState([]);
  var [showNotifications,setShowNotifications]=useState(false);

  async function loadNotifications(userId){
    var nr=await N.fetchRecentNotifications(userId);
    if(nr.data&&nr.data.length){
      var fromIds=[...new Set(nr.data.map(function(n){return n.from_user_id;}).filter(Boolean))];
      var fpr=fromIds.length?await fetchProfilesByIds(fromIds,'id,name,avatar'):{data:[]};
      var fpMap={};(fpr.data||[]).forEach(function(p){fpMap[p.id]=p;});
      setNotifications(nr.data.map(function(n){var fp=fpMap[n.from_user_id]||{};return Object.assign({},n,{fromName:fp.name||"Someone",fromAvatar:fp.avatar||"?"});}));
    } else {
      setNotifications([]);
    }
  }

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
