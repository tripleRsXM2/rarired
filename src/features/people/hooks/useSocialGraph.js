// src/features/people/hooks/useSocialGraph.js
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase.js";
import * as S from "../services/socialService.js";
import { fetchProfilesByIds } from "../../../lib/db.js";
import { insertNotification } from "../../notifications/services/notificationService.js";
import { track } from "../../../lib/analytics.js";

export function useSocialGraph(opts){
  var authUser=(opts&&opts.authUser)||null;

  var [friends,setFriends]=useState([]);
  var [sentRequests,setSentRequests]=useState([]);
  var [receivedRequests,setReceivedRequests]=useState([]);
  var [blockedUsers,setBlockedUsers]=useState([]);
  var [peopleSearch,setPeopleSearch]=useState("");
  var [searchResults,setSearchResults]=useState([]);
  var [searchLoading,setSearchLoading]=useState(false);
  var [showSearchDrop,setShowSearchDrop]=useState(false);
  var [suggestedPlayers,setSuggestedPlayers]=useState([]);
  // Module 2 — Discover surface data.
  // playedOpponents: derived from the viewer's confirmed match history (real
  // people they've faced, excluding existing friends/blocked).
  // sameSkillPlayers: profiles with the same declared skill level.
  var [playedOpponents,setPlayedOpponents]=useState([]);
  var [sameSkillPlayers,setSameSkillPlayers]=useState([]);
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
      var pendingIds=[
        ...sentPend.map(function(r){return r.receiver_id;}),
        ...recvPend.map(function(r){return r.sender_id;}),
      ];
      var excludeIds=[userId,...friendIds,...pendingIds,...blockedIds];
      var sq=await S.fetchSuggestedPlayers(userId, (userProfile&&userProfile.suburb)||"Sydney", excludeIds);
      setSuggestedPlayers(sq.data||[]);

      // Same-skill discovery — excludes suggested suburb IDs as well so the
      // same person doesn't appear in two sections.
      if(userProfile&&userProfile.skill){
        var suburbIds=(sq.data||[]).map(function(u){return u.id;});
        var skillExclude=excludeIds.concat(suburbIds);
        var sk=await S.fetchSameSkillPlayers(userId, userProfile.skill, skillExclude, 6);
        setSameSkillPlayers(sk.data||[]);
      } else {
        setSameSkillPlayers([]);
      }
    }catch(e){console.error('loadSocial',e);}
  }

  // Module 2: derive discovery list from the viewer's confirmed match history.
  // Unique opponent_ids in recency order, excluding current relationships so a
  // player doesn't show up in Discover if you're already friends/pending/blocked.
  // The caller (App.jsx) re-runs this whenever history, friends, or blocked
  // change — cheap query (fetchProfilesByIds on ≤8 ids).
  async function loadPlayedOpponents(history){
    if(!authUser||!history||!history.length){setPlayedOpponents([]);return;}
    var friendIds=new Set(friends.map(function(f){return f.id;}));
    var pendingIds=new Set([
      ...sentRequests.map(function(r){return r.id;}),
      ...receivedRequests.map(function(r){return r.id;}),
    ]);
    var blockedIds=new Set(blockedUsers.map(function(b){return b.id;}));
    var seen=new Set();
    var orderedIds=[];
    for(var i=0;i<history.length;i++){
      var m=history[i];
      if(!m||m.status!=='confirmed') continue;
      var oid=m.opponent_id||(m.isTagged?m.submitterId:null);
      if(!oid||oid===authUser.id||seen.has(oid)) continue;
      if(friendIds.has(oid)||pendingIds.has(oid)||blockedIds.has(oid)) continue;
      seen.add(oid);
      orderedIds.push(oid);
      if(orderedIds.length>=8) break;
    }
    if(!orderedIds.length){setPlayedOpponents([]);return;}
    var pr=await fetchProfilesByIds(orderedIds,'id,name,avatar,skill,suburb,ranking_points,wins,losses,matches_played,last_active,show_online_status,show_last_seen');
    var pMap={};(pr.data||[]).forEach(function(p){pMap[p.id]=p;});
    // Preserve history order (most recent first)
    setPlayedOpponents(orderedIds.map(function(id){return pMap[id];}).filter(Boolean));
  }

  function resetSocial(){
    setFriends([]); setSentRequests([]); setReceivedRequests([]);
    setBlockedUsers([]); setSuggestedPlayers([]); setSearchResults([]);
    setPlayedOpponents([]); setSameSkillPlayers([]);
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
      var notifPayload={user_id:target.id,type:'friend_request',from_user_id:authUser.id,entity_id:r.data.id};
      console.debug('[sendFriendRequest] inserting notification:', notifPayload);
      var nr=await insertNotification(notifPayload);
      if(nr.error) console.error('[sendFriendRequest] notification insert FAILED:', nr.error);
      else console.debug('[sendFriendRequest] notification insert OK');
      track("friend_request_sent",{target_user_id:target.id});
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
    track("friend_request_accepted",{requester_user_id:req.id});
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
  // ── Realtime: incoming friend requests ──────────────────────────────────────
  // Fires when another user sends a request to the logged-in user.
  // Fixes: received requests never updating live without a page refresh.
  useEffect(function(){
    if(!authUser) return;
    var uid=authUser.id;
    console.debug('[useSocialGraph] subscribing friend_requests realtime for uid:', uid);

    var channel=supabase.channel('friend_requests:'+uid)
      .on('postgres_changes',{
        event:'INSERT',
        schema:'public',
        table:'friend_requests',
        filter:'receiver_id=eq.'+uid,
      }, async function(payload){
        var req=payload.new;
        console.debug('[useSocialGraph] realtime friend_request received:', req);
        var pr=await fetchProfilesByIds(
          [req.sender_id],
          'id,name,avatar,skill,suburb,ranking_points,wins,losses,matches_played,privacy,last_active,show_online_status,show_last_seen'
        );
        var sender=(pr.data&&pr.data[0])||{id:req.sender_id,name:'Player'};
        var enriched=Object.assign({requestId:req.id},sender);
        setReceivedRequests(function(rs){
          if(rs.some(function(r){return r.requestId===req.id;}))return rs;
          return rs.concat([enriched]);
        });
      })
      .subscribe(function(status){
        console.debug('[useSocialGraph] friend_requests channel status:', status);
      });

    return function(){ supabase.removeChannel(channel); };
  },[authUser&&authUser.id]);

  async function searchUsers(query){
    if(!query.trim()||!authUser){setSearchResults([]);setSearchLoading(false);setShowSearchDrop(false);return;}
    var r=await S.searchProfilesByName(authUser.id, query.trim());
    if(r.error){setSearchLoading(false);return;}
    var blockedIds=blockedUsers.map(function(b){return b.id;});
    var filtered=(r.data||[]).filter(function(u){return!blockedIds.includes(u.id);});
    setSearchResults(filtered);
    setShowSearchDrop(true);setSearchLoading(false);
    track("search_executed",{query_len:query.trim().length,result_count:filtered.length});
  }

  return {
    friends, setFriends, sentRequests, setSentRequests,
    receivedRequests, setReceivedRequests, blockedUsers, setBlockedUsers,
    peopleSearch, setPeopleSearch,
    searchResults, setSearchResults, searchLoading, setSearchLoading,
    showSearchDrop, setShowSearchDrop, suggestedPlayers, setSuggestedPlayers,
    playedOpponents, setPlayedOpponents,
    sameSkillPlayers, setSameSkillPlayers,
    socialLoading, searchTimer,
    loadSocial, loadPlayedOpponents, resetSocial,
    isFriend, sentReq, recvReq, isBlocked, friendRelationLabel,
    sendFriendRequest, acceptRequest, declineRequest, cancelRequest,
    unfriend, blockUser, unblockUser, searchUsers,
  };
}
