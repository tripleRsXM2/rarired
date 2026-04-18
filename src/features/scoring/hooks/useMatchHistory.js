// src/features/scoring/hooks/useMatchHistory.js
import { useState } from "react";
import * as M from "../services/matchService.js";
import { fetchProfilesByIds } from "../../../lib/db.js";
import { normalizeMatch, computeMatchHash } from "../utils/matchUtils.js";

export function useMatchHistory(opts){
  var authUser=(opts&&opts.authUser)||null;
  var sendNotification=(opts&&opts.sendNotification)||null;
  var bumpStats=(opts&&opts.bumpStats)||null;
  var refreshProfile=(opts&&opts.refreshProfile)||null;

  var [history,setHistory]=useState([]);
  var [feedLikes,setFeedLikes]=useState({});
  var [feedLikeCounts,setFeedLikeCounts]=useState({});
  var [feedComments,setFeedComments]=useState({});
  var [commentModal,setCommentModal]=useState(null);
  var [commentDraft,setCommentDraft]=useState("");
  var [casualOppName,setCasualOppName]=useState("");
  var [casualOppId,setCasualOppId]=useState(null);
  var [showOppDrop,setShowOppDrop]=useState(false);
  var [scoreModal,setScoreModal]=useState(null);
  var [scoreDraft,setScoreDraft]=useState({sets:[{you:"",them:""}],result:"win",notes:"",date:""});

  async function loadHistory(userId){
    // Expire any stale pending matches on the client side (no pg_cron available)
    await M.expireStalePendingMatches(userId);
    var hr=await M.fetchOwnMatches(userId);
    var tr=await M.fetchTaggedMatches(userId);
    var pr=await M.fetchPendingOpponentMatches(userId);
    var ownNorm=(hr.data||[]).map(function(m){return normalizeMatch(m,false);});
    var taggedNorm=(tr.data||[]).map(function(m){return normalizeMatch(m,true);});
    var pendingNorm=(pr.data||[]).map(function(m){return normalizeMatch(m,true);});
    // Merge tagged and pending, dedup by id in case a match confirms between queries
    var allOpponent=taggedNorm.concat(pendingNorm).filter(function(m,i,arr){
      return arr.findIndex(function(x){return x.id===m.id;})===i;
    });
    var normalized=ownNorm.concat(allOpponent).sort(function(a,b){return b.date<a.date?-1:1;});
    var matchIds=normalized.map(function(m){return m.id;});
    setHistory(normalized);
    // Client-side reminder: notify opponent when <24h left on pending match
    normalized.forEach(function(m){
      if(m.status!=='pending_confirmation'||!m.expiresAt||!m.opponent_id||m.isTagged) return;
      var msLeft=new Date(m.expiresAt)-Date.now();
      if(msLeft>0&&msLeft<24*60*60*1000){
        var key='reminded_'+m.id;
        if(!localStorage.getItem(key)){
          localStorage.setItem(key,'1');
          if(sendNotification) sendNotification({user_id:m.opponent_id,type:'match_reminder',from_user_id:userId,match_id:m.id});
        }
      }
    });
    if(!matchIds.length) return;
    var lr=await M.fetchFeedLikes(userId, matchIds);
    if(lr.data){var likedMap={};lr.data.forEach(function(l){likedMap[l.match_id]=true;});setFeedLikes(likedMap);}
    var lcr=await M.fetchFeedLikeCounts(matchIds);
    if(lcr.data){var countMap={};lcr.data.forEach(function(l){countMap[l.match_id]=(countMap[l.match_id]||0)+1;});setFeedLikeCounts(countMap);}
    var cr=await M.fetchFeedComments(matchIds);
    if(cr.data&&cr.data.length){
      var uids=[...new Set(cr.data.map(function(c){return c.user_id;}))];
      var fpr=await fetchProfilesByIds(uids,'id,name,avatar');
      var nameMap={};(fpr.data||[]).forEach(function(p){nameMap[p.id]={name:p.name,avatar:p.avatar};});
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

  // Submit a new match result.
  // Verified (opponent is a registered friend) → pending_confirmation, no stats yet.
  // Casual (free-text opponent) → confirmed, no stats (no verified opponent).
  async function submitMatch(params){
    var scoreModal=params.scoreModal;
    var scoreDraft=params.scoreDraft;
    var oppName=params.oppName;
    var opponentId=params.opponentId||null;

    if(!authUser) return {error:'not_authenticated'};

    var clean=scoreDraft.sets.filter(function(s){return s.you!==""||s.them!=="";});
    var matchDate=scoreDraft.date||new Date().toISOString().slice(0,10);
    var isVerified=!!opponentId;
    var status=isVerified?'pending_confirmation':'confirmed';
    var tournName=scoreModal.casual?'Casual Match':(scoreModal.tournName||'Casual Match');

    var hash=null;
    if(isVerified){
      hash=computeMatchHash(authUser.id, opponentId, matchDate, clean);
    }

    var localId='local-'+Date.now();
    var nm={
      id:localId, oppName, tournName,
      date:new Date(matchDate).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}),
      sets:clean, result:scoreDraft.result, notes:'',
      status, opponent_id:opponentId, submitterId:authUser.id, isTagged:false,
    };
    setHistory(function(h){return [nm].concat(h);});

    var payload={
      user_id:authUser.id,
      opp_name:oppName,
      tourn_name:tournName,
      sets:clean,
      result:scoreDraft.result,
      notes:'',
      match_date:matchDate,
      status:status,
      submitted_at:new Date().toISOString(),
    };
    if(opponentId) payload.opponent_id=opponentId;
    if(hash) payload.match_hash=hash;
    if(isVerified) payload.expires_at=new Date(Date.now()+72*60*60*1000).toISOString();

    var ins=await M.insertMatch(payload);
    if(ins.error){
      setHistory(function(h){return h.filter(function(m){return m.id!==localId;});});
      if(ins.error.code==='23505') return {error:'duplicate',message:'This match has already been logged.'};
      return {error:ins.error.message};
    }

    var matchId=ins.data.id;
    setHistory(function(h){return h.map(function(m){return m.id===localId?Object.assign({},m,{id:matchId}):m;});});

    if(isVerified&&sendNotification){
      await sendNotification({user_id:opponentId,type:'match_tag',from_user_id:authUser.id,match_id:matchId});
    }

    return {error:null, matchId, status};
  }

  // Opponent confirms the match — DB function updates both players atomically.
  async function confirmOpponentMatch(match){
    if(!authUser) return;
    var mr=await M.confirmMatchAndUpdateStats(match.id);
    if(mr.error){console.error('[confirmOpponentMatch]',mr.error);return;}
    setHistory(function(h){return h.map(function(m){return m.id===match.id?Object.assign({},m,{status:'confirmed'}):m;});});
    // Refresh current user's profile UI from DB (stats already written by the function)
    if(refreshProfile) await refreshProfile(authUser.id);
    if(sendNotification&&match.submitterId){
      await sendNotification({user_id:match.submitterId,type:'match_confirmed',from_user_id:authUser.id,match_id:match.id});
    }
  }

  // Opponent disputes — flags for admin review, no stats.
  async function disputeOpponentMatch(match, reason){
    if(!authUser) return;
    await M.disputeMatch(match.id, authUser.id, reason||null);
    setHistory(function(h){return h.map(function(m){return m.id===match.id?Object.assign({},m,{status:'disputed'}):m;});});
    if(sendNotification&&match.submitterId){
      await sendNotification({user_id:match.submitterId,type:'match_disputed',from_user_id:authUser.id,match_id:match.id});
    }
  }

  // Opponent requests a correction — notifies submitter to re-edit.
  async function requestMatchCorrection(match, reason){
    if(!authUser) return;
    var snapshot={result:match.result,sets:match.sets};
    await M.requestMatchRevision(match.id, authUser.id, reason||null, snapshot);
    if(sendNotification&&match.submitterId){
      await sendNotification({user_id:match.submitterId,type:'match_correction_requested',from_user_id:authUser.id,match_id:match.id});
    }
  }

  async function deleteMatch(m){
    if(!authUser)return;
    if((m.opponent_id||m.tagged_user_id)&&m.status==='confirmed'&&sendNotification){
      await sendNotification({user_id:m.opponent_id||m.tagged_user_id,type:'match_deleted',from_user_id:authUser.id,match_id:m.id});
    }
    await M.deleteMatchRow(m.id, authUser.id);
    setHistory(function(h){return h.filter(function(x){return x.id!==m.id;});});
  }

  // Submitter edits and resubmits after opponent requested a correction.
  async function resubmitMatch(match, scoreDraft){
    if(!authUser) return;
    var clean=scoreDraft.sets.filter(function(s){return s.you!==""||s.them!=="";});
    if(!clean.length) return {error:'no_sets'};
    var matchDate=scoreDraft.date||new Date().toISOString().slice(0,10);
    var newExpiresAt=new Date(Date.now()+72*60*60*1000).toISOString();
    var payload={
      sets:clean, result:scoreDraft.result, match_date:matchDate,
      expires_at:newExpiresAt,
      revision_requested_by:null, revision_reason:null,
      status:'pending_confirmation',
    };
    if(match.opponent_id){
      payload.match_hash=computeMatchHash(authUser.id, match.opponent_id, matchDate, clean);
    }
    var r=await M.updateMatch(match.id, payload);
    if(r.error){console.error('[resubmitMatch]',r.error);return {error:r.error.message};}
    setHistory(function(h){
      return h.map(function(m){
        if(m.id!==match.id) return m;
        return Object.assign({},m,{
          sets:clean, result:scoreDraft.result,
          date:new Date(matchDate).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}),
          expiresAt:newExpiresAt, revisionRequestedBy:null, status:'pending_confirmation',
        });
      });
    });
    // Re-notify opponent so they see the updated match
    if(sendNotification&&match.opponent_id){
      await sendNotification({user_id:match.opponent_id,type:'match_tag',from_user_id:authUser.id,match_id:match.id});
    }
    return {error:null};
  }

  async function removeTaggedMatch(m){
    await M.markMatchTagStatus(m.id,'declined',false);
    setHistory(function(h){return h.filter(function(x){return x.id!==m.id;});});
  }

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
      status:'confirmed',
      submitterId:m.user_id||null,
      isTagged:true,
      opponent_id:m.opponent_id||m.tagged_user_id,
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
    casualOppName, setCasualOppName, casualOppId, setCasualOppId,
    showOppDrop, setShowOppDrop,
    scoreModal, setScoreModal, scoreDraft, setScoreDraft,
    loadHistory, resetHistory,
    submitMatch, deleteMatch, resubmitMatch, removeTaggedMatch, applyAcceptedTagMatch,
    confirmOpponentMatch, disputeOpponentMatch, requestMatchCorrection,
  };
}
