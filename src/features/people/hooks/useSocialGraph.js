// src/features/people/hooks/useSocialGraph.js
import { useState, useRef } from "react";
import * as S from "../services/socialService.js";
import { insertNotification } from "../../notifications/services/notificationService.js";

export function useSocialGraph(opts){
  var authUser=(opts&&opts.authUser)||null;

  var [friends,setFriends]=useState([]);
  var [sentRequests,setSentRequests]=useState([]);
  var [receivedRequests,setReceivedRequests]=useState([]);
  var [blockedUsers,setBlockedUsers]=useState([]);
  var [peopleTab,setPeopleTab]=useState("friends");
  var [peopleSearch,setPeopleSearch]=useState("");
  var [searchResults,setSearchResults]=useState([]);
  var [searchLoading,setSearchLoading]=useState(false);
  var [showSearchDrop,setShowSearchDrop]=useState(false);
  var [suggestedPlayers,setSuggestedPlayers]=useState([]);
  var [socialLoading,setSocialLoading]=useState({});
  var searchTimer=useRef(null);

  async function loadSocial(userId, userProfile){
    try{
      var fr=await S.fetchFriendRequests(userId);
      var allReqs=fr.data||[];
      var accepted=allReqs.filter(function(r){return r.status==='accepted';});
      var sentPend=allReqs.filter(function(r){return r.status==='pending'&&r.sender_id===userId;});
      var recvPend=allReqs.filter(function(r){return r.status==='pending'&&r.receiver_id===userId;});
      var otherIds=[...new Set([
        ...accepted.map(function(r){return r.sender_id===userId?r.receiver_id:r.sender_id;}),
        ...sentPend.map(function(r){return r.receiver_id;}),
        ...recvPend.map(function(r){return r.sender_id;}),
      ])].filter(function(id){return id&&id!==userId;});
      var pMap={};
      if(otherIds.length){
        var pr=await S.fetchProfilesByIds(otherIds,'id,name,avatar,skill,suburb,ranking_points,wins,losses,matches_played,privacy,last_active,show_online_status,show_last_seen');
        (pr.data||[]).forEach(function(p){pMap[p.id]=p;});
      }
      setFriends(accepted.map(function(r){var oid=r.sender_id===userId?r.receiver_id:r.sender_id;return Object.assign({requestId:r.id},pMap[oid]||{id:oid,name:"Player"});}));
      setSentRequests(sentPend.map(function(r){return Object.assign({requestId:r.id},pMap[r.receiver_id]||{id:r.receiver_id,name:"Player"});}));
      setReceivedRequests(recvPend.map(function(r){return Object.assign({requestId:r.id},pMap[r.sender_id]||{id:r.sender_id,name:"Player"});}));

      var bl=await S.fetchBlocks(userId);
      var blockedIds=(bl.data||[]).map(function(b){return b.blocked_id;});
      if(blockedIds.length){
        var bpr=await S.fetchProfilesByIds(blockedIds,'id,name,avatar,suburb');
        setBlockedUsers(bpr.data||[]);
      } else {
        setBlockedUsers([]);
      }

      var friendIds=accepted.map(function(r){return r.sender_id===userId?r.receiver_id:r.sender_id;});
      var excludeIds=[userId,...friendIds,...blockedIds];
      var sq=await S.fetchSuggestedPlayers(userId, (userProfile&&userProfile.suburb)||"Sydney", excludeIds);
      setSuggestedPlayers(sq.data||[]);
    }catch(e){console.error('loadSocial',e);}
  }

  function resetSocial(){
    setFriends([]); setSentRequests([]); setReceivedRequests([]);
    setBlockedUsers([]); setSuggestedPlayers([]); setSearchResults([]);
  }

  function isFriend(uid){return friends.some(function(f){return f.id===uid;});}
  function sentReq(uid){return sentRequests.find(function(r){return r.id===uid;});}
  function recvReq(uid){return receivedRequests.find(function(r){return r.id===uid;});}
  function isBlocked(uid){return blockedUsers.some(function(b){return b.id===uid;});}
  function friendRelationLabel(uid){
    if(isFriend(uid))return"friends";if(sentReq(uid))return"sent";
    if(recvReq(uid))return"received";if(isBlocked(uid))return"blocked";return"none";
  }

  async function sendFriendRequest(target){
    if(!authUser||isFriend(target.id)||sentReq(target.id)||isBlocked(target.id))return;
    console.debug('[sendFriendRequest] sender:', authUser.id, '→ recipient:', target.id);
    setSocialLoading(function(l){return Object.assign({},l,{[target.id]:true});});
    var r=await S.insertFriendRequest(authUser.id, target.id);
    console.debug('[sendFriendRequest] insertFriendRequest result:', r.data, r.error||'no error');
    if(!r.error){
      setSentRequests(function(s){return s.concat([Object.assign({requestId:r.data.id},target)]);});
      var notifPayload={user_id:target.id,type:'friend_request',from_user_id:authUser.id};
      console.debug('[sendFriendRequest] inserting notification:', notifPayload);
      var nr=await insertNotification(notifPayload);
      if(nr.error) console.error('[sendFriendRequest] notification insert FAILED:', nr.error);
      else console.debug('[sendFriendRequest] notification insert OK');
    } else {
      console.error('[sendFriendRequest] friend request insert failed:', r.error);
    }
    setSocialLoading(function(l){return Object.assign({},l,{[target.id]:false});});
  }
  async function acceptRequest(req){
    if(!authUser)return;
    setSocialLoading(function(l){return Object.assign({},l,{[req.id]:true});});
    await S.updateFriendRequestStatus(req.requestId,'accepted');
    setReceivedRequests(function(r){return r.filter(function(x){return x.requestId!==req.requestId;});});
    setFriends(function(f){return f.concat([req]);});
    await insertNotification({user_id:req.id,type:'request_accepted',from_user_id:authUser.id});
    setSocialLoading(function(l){return Object.assign({},l,{[req.id]:false});});
  }
  async function declineRequest(req){
    setSocialLoading(function(l){return Object.assign({},l,{[req.id]:true});});
    await S.updateFriendRequestStatus(req.requestId,'declined');
    setReceivedRequests(function(r){return r.filter(function(x){return x.requestId!==req.requestId;});});
    setSocialLoading(function(l){return Object.assign({},l,{[req.id]:false});});
  }
  async function cancelRequest(req){
    setSocialLoading(function(l){return Object.assign({},l,{[req.id]:true});});
    await S.deleteFriendRequest(req.requestId);
    setSentRequests(function(s){return s.filter(function(x){return x.requestId!==req.requestId;});});
    setSocialLoading(function(l){return Object.assign({},l,{[req.id]:false});});
  }
  async function unfriend(target){
    if(!authUser)return;
    setSocialLoading(function(l){return Object.assign({},l,{[target.id]:true});});
    await S.deleteFriendRequestBetween(authUser.id, target.id);
    setFriends(function(f){return f.filter(function(x){return x.id!==target.id;});});
    setSocialLoading(function(l){return Object.assign({},l,{[target.id]:false});});
  }
  async function blockUser(target){
    if(!authUser)return;
    setSocialLoading(function(l){return Object.assign({},l,{[target.id]:true});});
    if(isFriend(target.id)){await unfriend(target);}
    var sr=sentReq(target.id);if(sr)await cancelRequest(sr);
    var rr=recvReq(target.id);if(rr)await declineRequest(rr);
    await S.insertBlock(authUser.id, target.id);
    setBlockedUsers(function(b){return b.concat([target]);});
    setSearchResults(function(r){return r.filter(function(x){return x.id!==target.id;});});
    setSuggestedPlayers(function(s){return s.filter(function(x){return x.id!==target.id;});});
    setSocialLoading(function(l){return Object.assign({},l,{[target.id]:false});});
  }
  async function unblockUser(target){
    if(!authUser)return;
    await S.deleteBlock(authUser.id, target.id);
    setBlockedUsers(function(b){return b.filter(function(x){return x.id!==target.id;});});
  }
  async function searchUsers(query){
    if(!query.trim()||!authUser){setSearchResults([]);setSearchLoading(false);setShowSearchDrop(false);return;}
    var r=await S.searchProfilesByName(authUser.id, query.trim());
    if(r.error){setSearchLoading(false);return;}
    var blockedIds=blockedUsers.map(function(b){return b.id;});
    setSearchResults((r.data||[]).filter(function(u){return!blockedIds.includes(u.id);}));
    setShowSearchDrop(true);setSearchLoading(false);
  }

  return {
    friends, setFriends, sentRequests, setSentRequests,
    receivedRequests, setReceivedRequests, blockedUsers, setBlockedUsers,
    peopleTab, setPeopleTab, peopleSearch, setPeopleSearch,
    searchResults, setSearchResults, searchLoading, setSearchLoading,
    showSearchDrop, setShowSearchDrop, suggestedPlayers, setSuggestedPlayers,
    socialLoading, searchTimer,
    loadSocial, resetSocial,
    isFriend, sentReq, recvReq, isBlocked, friendRelationLabel,
    sendFriendRequest, acceptRequest, declineRequest, cancelRequest,
    unfriend, blockUser, unblockUser, searchUsers,
  };
}
