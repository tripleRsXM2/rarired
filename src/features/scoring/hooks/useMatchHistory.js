// src/features/scoring/hooks/useMatchHistory.js
import { useState } from "react";
import * as M from "../services/matchService.js";
import { fetchProfilesByIds } from "../../people/services/socialService.js";
import { insertNotification } from "../../notifications/services/notificationService.js";
import { normalizeMatch } from "../utils/matchUtils.js";

export function useMatchHistory(opts){
  var authUser=(opts&&opts.authUser)||null;

  var [history,setHistory]=useState([]);
  var [feedLikes,setFeedLikes]=useState({});
  var [feedLikeCounts,setFeedLikeCounts]=useState({});
  var [feedComments,setFeedComments]=useState({});
  var [commentModal,setCommentModal]=useState(null);
  var [commentDraft,setCommentDraft]=useState("");
  var [casualOppName,setCasualOppName]=useState("");
  var [showOppDrop,setShowOppDrop]=useState(false);
  var [scoreModal,setScoreModal]=useState(null);
  var [scoreDraft,setScoreDraft]=useState({sets:[{you:"",them:""}],result:"win",notes:"",date:""});

  async function loadHistory(userId){
    var hr=await M.fetchOwnMatches(userId);
    var tr=await M.fetchTaggedMatches(userId);
    var ownNorm=(hr.data||[]).map(function(m){return normalizeMatch(m,false);});
    var taggedNorm=(tr.data||[]).map(function(m){return normalizeMatch(m,true);});
    var normalized=ownNorm.concat(taggedNorm).sort(function(a,b){return b.date<a.date?-1:1;});
    var matchIds=normalized.map(function(m){return m.id;});
    setHistory(normalized);
    if(!matchIds.length) return;
    var lr=await M.fetchFeedLikes(userId, matchIds);
    if(lr.data){var likedMap={};lr.data.forEach(function(l){likedMap[l.match_id]=true;});setFeedLikes(likedMap);}
    var lcr=await M.fetchFeedLikeCounts(matchIds);
    if(lcr.data){var countMap={};lcr.data.forEach(function(l){countMap[l.match_id]=(countMap[l.match_id]||0)+1;});setFeedLikeCounts(countMap);}
    var cr=await M.fetchFeedComments(matchIds);
    if(cr.data&&cr.data.length){
      var uids=[...new Set(cr.data.map(function(c){return c.user_id;}))];
      var pr=await fetchProfilesByIds(uids,'id,name,avatar');
      var nameMap={};(pr.data||[]).forEach(function(p){nameMap[p.id]={name:p.name,avatar:p.avatar};});
      var grouped={};
      cr.data.forEach(function(c){
        var author=nameMap[c.user_id]||{name:"Player",avatar:"?"};
        if(!grouped[c.match_id])grouped[c.match_id]=[];
        grouped[c.match_id].push({id:c.id,author:author.name,avatar:author.avatar,text:c.body,ts:new Date(c.created_at).getTime()});
      });
      setFeedComments(grouped);
    }
  }

  function resetHistory(){
    setHistory([]); setFeedLikes({}); setFeedLikeCounts({}); setFeedComments({});
  }

  async function deleteMatch(m){
    if(!authUser)return;
    if(m.tagged_user_id&&m.tag_status==='accepted'){
      await insertNotification({user_id:m.tagged_user_id,type:'match_deleted',from_user_id:authUser.id,match_id:m.id});
    }
    await M.deleteMatchRow(m.id, authUser.id);
    setHistory(function(h){return h.filter(function(x){return x.id!==m.id;});});
  }
  async function removeTaggedMatch(m){
    await M.markMatchTagStatus(m.id,'declined',false);
    setHistory(function(h){return h.filter(function(x){return x.id!==m.id;});});
  }

  // Apply an accepted tagged match (returned from notifications flow) to local history.
  // Returns the "friend-perspective" result so profile stats can be bumped.
  function applyAcceptedTagMatch(matchRow){
    var m=matchRow;
    var ownerResult=m.result||"loss";
    var friendResult=ownerResult==="win"?"loss":"win";
    var nm={
      id:m.id,
      oppName:m.opp_name||"Unknown",
      tournName:m.tourn_name||"",
      date:m.match_date?new Date(m.match_date).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"",
      sets:m.sets||[],
      result:friendResult,
      notes:m.notes||"",
      isTagged:true,
      tagged_user_id:m.tagged_user_id,
      tag_status:'accepted',
    };
    setHistory(function(h){return h.some(function(x){return x.id===m.id;})?h:[nm].concat(h);});
    return friendResult;
  }

  return {
    history, setHistory,
    feedLikes, setFeedLikes, feedLikeCounts, setFeedLikeCounts,
    feedComments, setFeedComments,
    commentModal, setCommentModal, commentDraft, setCommentDraft,
    casualOppName, setCasualOppName, showOppDrop, setShowOppDrop,
    scoreModal, setScoreModal, scoreDraft, setScoreDraft,
    loadHistory, resetHistory,
    deleteMatch, removeTaggedMatch, applyAcceptedTagMatch,
  };
}
