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
  var [scoreDraft,setScoreDraft]=useState({sets:[{you:"",them:""}],result:"win",notes:"",date:"",venue:"",court:""});
  var [disputeModal,setDisputeModal]=useState(null);
  var [disputeDraft,setDisputeDraft]=useState({reasonCode:"",reasonDetail:"",sets:[{you:"",them:""}],result:"win",date:"",venue:"",court:""});

  async function loadHistory(userId){
    // Prefer the server-side RPC (single authoritative call, SECURITY DEFINER,
    // also scheduled via pg_cron). Fall back to client-side sweeps if the RPC
    // isn't deployed yet — they're idempotent so running both is harmless.
    var sr=await M.expireStaleMatches();
    if(sr&&sr.error){
      await M.expireStalePendingMatches(userId);
      await M.expireDisputedMatches(userId);
    }
    var hr=await M.fetchOwnMatches(userId);
    var or=await M.fetchOpponentMatches(userId);
    var ownNorm=(hr.data||[]).map(function(m){return normalizeMatch(m,false);});
    var oppNorm=(or.data||[]).map(function(m){return normalizeMatch(m,true);});
    var normalized=ownNorm.concat(oppNorm).sort(function(a,b){return b.date<a.date?-1:1;});

    // ── Enrich tagged matches with submitter names ──────────────────────────
    // For isTagged=true rows, m.opp_name is the current user's own name
    // (it's what the submitter typed for their opponent). The real "opponent"
    // from the tagged user's view is the submitter (m.submitterId / m.user_id).
    var taggedIds=[...new Set(normalized
      .filter(function(m){return m.isTagged&&m.submitterId;})
      .map(function(m){return m.submitterId;})
    )];
    if(taggedIds.length){
      var spr=await fetchProfilesByIds(taggedIds,'id,name,avatar');
      var submitterMap={};
      (spr.data||[]).forEach(function(p){submitterMap[p.id]=p;});
      normalized=normalized.map(function(m){
        if(!m.isTagged||!m.submitterId)return m;
        var sp=submitterMap[m.submitterId];
        if(!sp)return m;
        return Object.assign({},m,{oppName:sp.name||m.oppName,friendName:sp.name||m.oppName});
      });
    }

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

  // Fetch a fresh single row from DB, normalize it, patch it into local history,
  // and return the fresh normalized match. Used by openReviewDrawer in App.jsx
  // to fix stale local state when a notification arrives before the history is
  // reloaded (e.g. counter-proposal notification fires but currentProposal is
  // still null in the cached match).
  async function refreshSingleMatch(matchId, isTagged){
    var r=await M.fetchMatchById(matchId);
    if(!r.data) return null;
    var fresh=normalizeMatch(r.data, !!isTagged);
    // Re-enrich submitter name for tagged matches
    if(isTagged && fresh.submitterId){
      var spr=await fetchProfilesByIds([fresh.submitterId],'id,name,avatar');
      var sp=(spr.data&&spr.data[0])||{};
      if(sp.name) fresh=Object.assign({},fresh,{oppName:sp.name,friendName:sp.name});
    }
    setHistory(function(prev){
      return prev.map(function(m){ return String(m.id)===String(matchId)?fresh:m; });
    });
    return fresh;
  }

  // Submit a new match result.
  // Verified → pending_confirmation. Casual → confirmed, no ELO impact.
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
    if(isVerified) hash=computeMatchHash(authUser.id, opponentId, matchDate, clean);

    var localId='local-'+Date.now();
    var nm={
      id:localId, oppName, tournName,
      date:new Date(matchDate).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}),
      sets:clean, result:scoreDraft.result, notes:'',
      venue:scoreDraft.venue||'', court:scoreDraft.court||'',
      status, opponent_id:opponentId, submitterId:authUser.id, isTagged:false,
    };
    setHistory(function(h){return [nm].concat(h);});

    var payload={
      user_id:authUser.id, opp_name:oppName, tourn_name:tournName,
      sets:clean, result:scoreDraft.result, notes:'', match_date:matchDate,
      status:status, submitted_at:new Date().toISOString(),
      venue:scoreDraft.venue||null, court:scoreDraft.court||null,
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

  // Opponent confirms — DB function handles both players atomically.
  async function confirmOpponentMatch(match){
    if(!authUser) return;
    var mr=await M.confirmMatchAndUpdateStats(match.id);
    if(mr.error){console.error('[confirmOpponentMatch]',mr.error);return;}
    setHistory(function(h){return h.map(function(m){return m.id===match.id?Object.assign({},m,{status:'confirmed'}):m;});});
    if(refreshProfile) await refreshProfile(authUser.id);
    if(sendNotification&&match.submitterId){
      await sendNotification({user_id:match.submitterId,type:'match_confirmed',from_user_id:authUser.id,match_id:match.id});
    }
  }

  // Internal: submit a correction proposal (dispute or counter-propose).
  // isOpponentView=true:  current user is the opponent acting against the submitter's
  //                       version → status becomes 'disputed', submitter owes a response.
  //                       (Result must be inverted for storage in submitter frame.)
  // isOpponentView=false: current user is the submitter counter-proposing against
  //                       the opponent's correction → status becomes 'pending_reconfirmation',
  //                       opponent owes a response. (Result already in submitter frame.)
  //
  // The actual DB write goes through propose_match_correction() (SECURITY DEFINER),
  // which validates the state machine, writes match_history, and inserts a
  // match_revisions row atomically — bypassing RLS correctly for both parties.
  async function _submitProposal(match, reasonCode, reasonDetail, formProposal, isOpponentView){
    if(!authUser) return {error:'not_authenticated'};
    var newRevisionCount=(match.revisionCount||0)+1;
    var pendingActionBy=isOpponentView?match.submitterId:match.opponent_id;
    var nextStatus=isOpponentView?'disputed':'pending_reconfirmation';
    // Store result in submitter's frame for DB storage
    var storedResult=isOpponentView
      ?(formProposal.result==='win'?'loss':'win')
      :formProposal.result;
    var cleanSets=(formProposal.sets||[]).filter(function(s){return s.you!==''||s.them!=='';});
    var proposal={
      result:storedResult,
      sets:cleanSets,
      match_date:formProposal.date||match.rawDate,
      venue:formProposal.venue||'',
      court:formProposal.court||'',
    };
    // Single RPC call: validates parties, enforces state machine, writes
    // match_history + match_revisions in one transaction (no separate insertRevision needed).
    var r=await M.proposeCorrection(match.id,proposal,reasonCode,reasonDetail,nextStatus);
    if(r.error){
      console.error('[_submitProposal]',r.error);
      return {error:r.error.message||'Failed to submit proposal — please try again.'};
    }
    // Optimistic local state update — proposal result kept in the current
    // user's frame (not the stored submitter frame).
    setHistory(function(h){
      return h.map(function(m){
        if(m.id!==match.id) return m;
        return Object.assign({},m,{
          status:nextStatus,
          disputeReasonCode:reasonCode,
          disputeReasonDetail:reasonDetail||null,
          currentProposal:{result:formProposal.result,sets:cleanSets,match_date:proposal.match_date,venue:proposal.venue,court:proposal.court},
          proposalBy:authUser.id,
          pendingActionBy:pendingActionBy,
          revisionCount:newRevisionCount,
        });
      });
    });
    var notifyId=isOpponentView?match.submitterId:match.opponent_id;
    if(sendNotification && notifyId){
      await sendNotification({user_id:notifyId,type:isOpponentView?'match_disputed':'match_counter_proposed',from_user_id:authUser.id,match_id:match.id});
    }
    return {error:null};
  }

  async function disputeWithProposal(match, reasonCode, reasonDetail, formProposal){
    return _submitProposal(match, reasonCode, reasonDetail, formProposal, true);
  }

  async function counterPropose(match, reasonCode, reasonDetail, formProposal){
    // isOpponentView must reflect whose frame we're in:
    // - submitter counter-proposes: match.isTagged=false → no inversion needed
    // - opponent counter-proposes (round 3+): match.isTagged=true → result must be inverted to submitter frame
    return _submitProposal(match, reasonCode, reasonDetail, formProposal, match.isTagged);
  }

  // Accept the other party's proposed correction — DB updates both players atomically.
  async function acceptCorrection(match){
    if(!authUser) return;
    var r=await M.acceptCorrectionRpc(match.id);
    if(r.error){console.error('[acceptCorrection]',r.error);return;}
    var acceptedResult=match.currentProposal?match.currentProposal.result:match.result;
    var acceptedSets=match.currentProposal?match.currentProposal.sets:match.sets;
    setHistory(function(h){
      return h.map(function(m){
        if(m.id!==match.id) return m;
        return Object.assign({},m,{status:'confirmed',result:acceptedResult,sets:acceptedSets,currentProposal:null,proposalBy:null,pendingActionBy:null});
      });
    });
    if(refreshProfile) await refreshProfile(authUser.id);
    var otherId=match.isTagged?match.submitterId:match.opponent_id;
    if(sendNotification&&otherId){
      await sendNotification({user_id:otherId,type:'match_confirmed',from_user_id:authUser.id,match_id:match.id});
    }
  }

  // Void a disputed match — both parties can do this.
  async function voidMatchAction(match, reason){
    if(!authUser) return {error:'not_authenticated'};
    var r=await M.voidMatchRpc(match.id, reason||'voided');
    if(r.error){console.error('[voidMatchAction]',r.error);return {error:r.error.message};}
    setHistory(function(h){
      return h.map(function(m){
        if(m.id!==match.id) return m;
        return Object.assign({},m,{status:'voided',currentProposal:null,proposalBy:null,pendingActionBy:null});
      });
    });
    var otherId=match.isTagged?match.submitterId:match.opponent_id;
    if(sendNotification&&otherId){
      await sendNotification({user_id:otherId,type:'match_voided',from_user_id:authUser.id,match_id:match.id});
    }
    return {error:null};
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
      venue:scoreDraft.venue||null, court:scoreDraft.court||null,
      expires_at:newExpiresAt,
      status:'pending_confirmation',
    };
    if(match.opponent_id) payload.match_hash=computeMatchHash(authUser.id, match.opponent_id, matchDate, clean);
    var r=await M.updateMatch(match.id, payload);
    if(r.error){console.error('[resubmitMatch]',r.error);return {error:r.error.message};}
    setHistory(function(h){
      return h.map(function(m){
        if(m.id!==match.id) return m;
        return Object.assign({},m,{
          sets:clean, result:scoreDraft.result,
          date:new Date(matchDate).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}),
          venue:scoreDraft.venue||'', court:scoreDraft.court||'',
          expiresAt:newExpiresAt, status:'pending_confirmation',
        });
      });
    });
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
      id:m.id, oppName:m.opp_name||"Unknown", tournName:m.tourn_name||"",
      date:m.match_date?new Date(m.match_date).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"",
      sets:m.sets||[], result:friendResult, notes:m.notes||"",
      status:'confirmed', submitterId:m.user_id||null, isTagged:true,
      opponent_id:m.opponent_id||m.tagged_user_id, tagged_user_id:m.tagged_user_id, tag_status:'accepted',
      venue:m.venue||"", court:m.court||"",
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
    disputeModal, setDisputeModal, disputeDraft, setDisputeDraft,
    loadHistory, resetHistory, refreshSingleMatch,
    submitMatch, deleteMatch, resubmitMatch, removeTaggedMatch, applyAcceptedTagMatch,
    confirmOpponentMatch, disputeWithProposal, counterPropose, acceptCorrection, voidMatchAction,
  };
}
