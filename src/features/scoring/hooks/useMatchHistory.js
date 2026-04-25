// src/features/scoring/hooks/useMatchHistory.js
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase.js";
import * as M from "../services/matchService.js";
import { fetchProfilesByIds } from "../../../lib/db.js";
import { normalizeMatch, computeMatchHash } from "../utils/matchUtils.js";
import { track } from "../../../lib/analytics.js";

// Translate a Supabase/Postgres error into a user-facing string. We prefer
// the server's message (it's usually a human-readable NOTICE/RAISE from our
// RPCs) and fall back to a generic per-action message so users never see
// "Failed. Try again." without any context about *why*.
function formatRpcError(err, fallback){
  if(!err) return fallback||'Something went wrong. Please try again.';
  // Known Postgres codes worth translating
  if(err.code==='23505') return 'This match is already logged.';
  if(err.code==='42501') return 'You don\'t have permission to do that.';
  if(err.code==='P0001' && err.message) return err.message; // RAISE EXCEPTION from our RPC
  if(err.message) return err.message;
  return fallback||'Something went wrong. Please try again.';
}

export function useMatchHistory(opts){
  var authUser=(opts&&opts.authUser)||null;
  var sendNotification=(opts&&opts.sendNotification)||null;
  var bumpStats=(opts&&opts.bumpStats)||null;
  var refreshProfile=(opts&&opts.refreshProfile)||null;
  // Module 4: optional callback fired after a successful match insert when
  // the match was logged via the "Log result" path on an accepted challenge.
  // Receives (challengeId, matchId). Used by App.jsx to flip the challenge
  // row to 'completed' and emit rematch_converted_to_match.
  var onMatchLoggedFromChallenge=(opts&&opts.onMatchLoggedFromChallenge)||null;

  var [history,setHistory]=useState([]);
  // Module 6.5: Strava-style "new match — tap to refresh" banner counter.
  // Incremented by the realtime subscription below whenever a match the
  // viewer is a party to lands in the DB and isn't already in local state.
  // The banner (rendered in HomeTab) calls refreshFeed() to reload + reset.
  var [pendingFreshCount,setPendingFreshCount]=useState(0);
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
    // Expiry sweep. The authoritative global cleanup runs on pg_cron every
    // 15 min (see 20260419_dispute_system_v2.sql and 20260425_restrict_
    // expire_stale_matches.sql). Clients can NOT call that RPC — EXECUTE
    // has been REVOKEd from anon + authenticated to prevent any page load
    // from triggering a system-wide mutation.
    //
    // The two helpers below are user-scoped: RLS + explicit (user_id |
    // opponent_id = me) filter cap them to the viewer's own rows. They
    // run opportunistically on history load so the viewer sees accurate
    // statuses without waiting up to 15 min for the next cron tick; they
    // are not a security boundary.
    await M.expireStalePendingMatches(userId);
    await M.expireDisputedMatches(userId);
    var hr=await M.fetchOwnMatches(userId);
    var or=await M.fetchOpponentMatches(userId);
    // Friends-of-the-viewer matches the viewer is NOT a party to.
    // Server-side RPC (fetch_friends_matches) bypasses match_history RLS
    // safely — it only returns confirmed rows where at least one party is
    // an accepted friend of the caller. Failure is non-fatal: if the RPC
    // is unavailable for any reason (older DB, transient error) the feed
    // simply falls back to the viewer's own + tagged matches.
    var fr={ data: [], error: null };
    try { fr = await M.fetchFriendsMatches(userId, 50); } catch (e) {
      console.warn('[loadHistory] fetchFriendsMatches failed:', e);
    }
    if (fr && fr.error) {
      console.warn('[loadHistory] fetchFriendsMatches error:', fr.error);
    }
    var ownNorm=(hr.data||[]).map(function(m){return normalizeMatch(m,false,false);});
    var oppNorm=(or.data||[]).map(function(m){return normalizeMatch(m,true,false);});
    var thirdNorm=((fr && fr.data)||[]).map(function(m){return normalizeMatch(m,false,true);});
    var normalized=ownNorm.concat(oppNorm).concat(thirdNorm).sort(function(a,b){return b.date<a.date?-1:1;});

    // ── Enrich matches with participant profile data (name + avatar) ───────
    // For isTagged=true rows, m.opp_name is the current user's own name
    // (it's what the submitter typed for their opponent). The real
    // "opponent" from the tagged user's view is the submitter.
    // For isTagged=false (own) rows the opponent is m.opponent_id.
    // For isThirdParty=true rows, BOTH sides are non-viewer participants
    // — we fetch both to render avatars + display names in the scoreboard.
    //
    // We fetch every referenced participant once and attach BOTH the
    // poster's avatar (posterAvatarUrl, already used by the feed card
    // header) AND the opponent's avatar (oppAvatarUrl, consumed by the
    // scoreboard rows to render an inline avatar beside the name).
    var participantIds = new Set();
    normalized.forEach(function (m) {
      if (m.isTagged && m.submitterId) participantIds.add(m.submitterId);
      if (!m.isTagged && m.opponent_id) participantIds.add(m.opponent_id);
      if (m.isThirdParty && m.submitterId) participantIds.add(m.submitterId);
    });
    participantIds.delete(userId); // own profile is loaded separately
    if (participantIds.size > 0) {
      var pr = await fetchProfilesByIds(
        Array.from(participantIds),
        'id,name,avatar,avatar_url'
      );
      var pMap = {};
      (pr.data || []).forEach(function (p) { pMap[p.id] = p; });
      normalized = normalized.map(function (m) {
        var patch = {};
        if (m.isTagged && m.submitterId) {
          var sp = pMap[m.submitterId];
          if (sp) {
            // friendName — submitter's real name, overrides what's stored
            // in opp_name (which is the current user's own name as typed by
            // the submitter). Don't overwrite oppName — scoreboard opponent
            // row uses it as the tagged user's own label.
            patch.friendName      = sp.name || m.friendName;
            patch.posterAvatarUrl = sp.avatar_url || null;
          }
        }
        if (!m.isTagged && m.opponent_id) {
          var op = pMap[m.opponent_id];
          if (op) {
            patch.oppAvatarUrl = op.avatar_url || null;
            // Third-party: prefer the linked opponent's actual display
            // name over the freetext opp_name typed by the submitter.
            // (For own matches we leave oppName alone — the user typed
            // it themselves and may have used a nickname.)
            if (m.isThirdParty && sp /* unused */, op && op.name) patch.oppName = op.name;
          }
        }
        if (m.isThirdParty && m.submitterId) {
          var tp = pMap[m.submitterId];
          if (tp) {
            // For third-party rows we surface the submitter as the
            // "poster" identity. Reuse the friendName + posterAvatarUrl
            // fields the FeedCard already consumes for tagged rows.
            patch.friendName      = tp.name || m.friendName;
            patch.posterAvatarUrl = tp.avatar_url || null;
          }
        }
        return Object.keys(patch).length ? Object.assign({}, m, patch) : m;
      });
    }

    var matchIds=normalized.map(function(m){return m.id;});
    setHistory(normalized);
    // Client-side reminder: notify opponent when <24h left on a pending match
    // the viewer submitted. DB-backed: match_history.reminder_sent_at flag is
    // set via updateMatch after firing so the same match never re-reminds
    // across devices or browser resets. Fire-and-forget; failure just means
    // we may re-send the reminder next load (still harmless — match_reminder
    // is non-action and cheap).
    normalized.forEach(function(m){
      if(m.status!=='pending_confirmation'||!m.expiresAt||!m.opponent_id||m.isTagged) return;
      if(m.reminderSentAt) return;
      var msLeft=new Date(m.expiresAt)-Date.now();
      if(msLeft<=0||msLeft>=24*60*60*1000) return;
      if(sendNotification){
        sendNotification({user_id:m.opponent_id,type:'match_reminder',from_user_id:userId,match_id:m.id});
      }
      // Mark sent in DB (best-effort). Also patch local state so a second
      // loadHistory in the same session doesn't re-send.
      var nowIso=new Date().toISOString();
      M.updateMatch(m.id,{reminder_sent_at:nowIso});
      setHistory(function(h){
        return h.map(function(x){return x.id===m.id?Object.assign({},x,{reminderSentAt:nowIso}):x;});
      });
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

  // Module 6.5 — realtime "new match" heads-up for the feed.
  // Subscribes to INSERTs on match_history where either user_id or opponent_id
  // is the viewer. Two channels because PostgREST-style filters don't support
  // OR. When a row arrives that isn't in local state yet, bump the pending
  // counter. The UI shows a non-intrusive banner — tap to reload.
  // We deliberately do NOT eagerly splice the new match in; that would cause
  // list-jumps while the user is reading (the Strava pattern).
  useEffect(function(){
    if(!authUser) return;
    var uid=authUser.id;
    function onInsert(payload){
      var row=payload.new;
      if(!row) return;
      setHistory(function(cur){
        if(cur.some(function(m){return String(m.id)===String(row.id);})) return cur;
        setPendingFreshCount(function(n){return n+1;});
        return cur;
      });
    }
    var chanA=supabase.channel('match_history_submitter:'+uid)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'match_history',filter:'user_id=eq.'+uid}, onInsert)
      .subscribe();
    var chanB=supabase.channel('match_history_opponent:'+uid)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'match_history',filter:'opponent_id=eq.'+uid}, onInsert)
      .subscribe();
    return function(){ supabase.removeChannel(chanA); supabase.removeChannel(chanB); };
  },[authUser&&authUser.id]);

  async function refreshFeed(){
    if(!authUser) return;
    setPendingFreshCount(0);
    await loadHistory(authUser.id);
  }

  function resetHistory(){
    setHistory([]); setFeedLikes({}); setFeedLikeCounts({}); setFeedComments({});
    setPendingFreshCount(0);
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
      if(sp.name) fresh=Object.assign({},fresh,{friendName:sp.name});
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
    // Core product rule (2026-04-25): match_type drives Elo + lifecycle.
    // Default derives from opponent linkage (linked → 'ranked', freetext
    // → 'casual'); ScoreModal lets the user explicitly override to
    // 'casual' even when the opponent is linked. Defensive clamp:
    // 'ranked' with no opponent can't actually affect Elo, so demote.
    var matchType = scoreDraft.matchType || (isVerified ? 'ranked' : 'casual');
    if (matchType === 'ranked' && !opponentId) matchType = 'casual';
    // Confirmation is only needed for ranked matches (something to verify
    // / dispute). Casual matches go straight to confirmed regardless of
    // opponent linkage — there's no Elo to argue about.
    var needsConfirmation = isVerified && matchType === 'ranked';
    var status = needsConfirmation ? 'pending_confirmation' : 'confirmed';
    // Tournament flow: tournament name takes precedence. Casual flow:
    // tourn_name is the human display label and tracks match_type.
    var tournName = scoreModal.casual
      ? (matchType === 'ranked' ? 'Ranked' : 'Casual Match')
      : (scoreModal.tournName || 'Casual Match');

    var hash = null;
    // Match-hash dedupe is a ranked-flow feature (prevents both sides
    // logging the same match twice). Casual matches don't need it.
    if (needsConfirmation) hash = computeMatchHash(authUser.id, opponentId, matchDate, clean);

    var localId='local-'+Date.now();
    var nm={
      id:localId, oppName, tournName,
      date:new Date(matchDate).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}),
      sets:clean, result:scoreDraft.result, notes:'',
      venue:scoreDraft.venue||'', court:scoreDraft.court||'',
      status, opponent_id:opponentId, submitterId:authUser.id, isTagged:false,
      // Module 7 — preserve the league tag on the local row so the feed
      // card shows the correct league pill immediately (before the next
      // loadHistory sweep picks up the DB row). oppAvatarUrl stays null
      // locally; it populates after loadHistory enriches participants.
      league_id: scoreDraft.leagueId || null,
      // Core product rule — match_type on the optimistic local row so the
      // feed-card "isRanked" check fires correctly the moment the match
      // appears (before loadHistory rehydrates from DB).
      match_type: matchType,
    };
    setHistory(function(h){return [nm].concat(h);});

    var payload={
      user_id:authUser.id, opp_name:oppName, tourn_name:tournName,
      sets:clean, result:scoreDraft.result, notes:'', match_date:matchDate,
      status:status, submitted_at:new Date().toISOString(),
      venue:scoreDraft.venue||null, court:scoreDraft.court||null,
      match_type: matchType,
    };
    if(opponentId) payload.opponent_id=opponentId;
    if(hash) payload.match_hash=hash;
    // 72h expiry only on rows that need confirmation — confirmed-immediately
    // casual matches have nothing to expire.
    if(needsConfirmation) payload.expires_at=new Date(Date.now()+72*60*60*1000).toISOString();
    // Module 7 — optional league tag. Server trigger (validate_match_league)
    // enforces the hard rules (both players active members, league active,
    // max_matches_per_opponent not exceeded, match_type='ranked' required).
    // Client just forwards.
    if(needsConfirmation && scoreDraft.leagueId) payload.league_id=scoreDraft.leagueId;

    var ins=await M.insertMatch(payload);
    if(ins.error){
      setHistory(function(h){return h.filter(function(m){return m.id!==localId;});});
      if(ins.error.code==='23505') return {error:'duplicate',message:'This match is already logged.'};
      return {error:formatRpcError(ins.error,'Could not save match — please try again.')};
    }

    var matchId=ins.data.id;
    setHistory(function(h){return h.map(function(m){return m.id===localId?Object.assign({},m,{id:matchId}):m;});});
    // Only ranked matches need confirmation, so only ranked matches fire
    // match_tag (the "X logged a match with you — confirm or dispute" nag).
    // Casual matches with linked opponents are auto-confirmed; the opponent
    // can still see them in the feed but doesn't need to act.
    if(needsConfirmation&&sendNotification){
      await sendNotification({user_id:opponentId,type:'match_tag',from_user_id:authUser.id,match_id:matchId});
    }
    track("match_logged",{match_id:matchId,is_ranked:matchType==='ranked',match_type:matchType,has_opponent_linked:!!opponentId,sets:clean.length,result:scoreDraft.result});
    // Module 4: convert accepted challenge → completed when this match was
    // logged via the "Log result" CTA on an accepted challenge.
    if(scoreModal.sourceChallengeId && onMatchLoggedFromChallenge){
      onMatchLoggedFromChallenge(scoreModal.sourceChallengeId, matchId);
    }
    return {error:null, matchId, status};
  }

  // Opponent confirms — DB function handles both players atomically.
  // Returns {error:null} on success, {error:<message>} on failure — callers
  // rely on this to surface server errors (RLS denials, already-confirmed,
  // stale state) instead of silently leaving the UI in a lie-state.
  async function confirmOpponentMatch(match){
    if(!authUser) return {error:'not_authenticated'};
    var mr=await M.confirmMatchAndUpdateStats(match.id);
    if(mr.error){
      console.error('[confirmOpponentMatch]',mr.error);
      return {error:formatRpcError(mr.error,'Could not confirm match — please try again.')};
    }
    setHistory(function(h){return h.map(function(m){return m.id===match.id?Object.assign({},m,{status:'confirmed'}):m;});});
    if(refreshProfile) await refreshProfile(authUser.id);
    if(sendNotification&&match.submitterId){
      await sendNotification({user_id:match.submitterId,type:'match_confirmed',from_user_id:authUser.id,match_id:match.id});
    }
    track("match_confirmed",{match_id:match.id,role:"opponent"});
    return {error:null};
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
      return {error:formatRpcError(r.error,'Could not submit proposal — please try again.')};
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
    var notifType=isOpponentView?'match_disputed':'match_counter_proposed';
    if(sendNotification && notifyId){
      // Surface any notification-emit error to the console. Historically
      // this call swallowed RPC errors silently, so when the recipient
      // didn't see a match_disputed / match_counter_proposed notification
      // we had no signal why. Now we at least log it — the proposal itself
      // already succeeded at this point, so we don't want to fail the
      // whole action, but the dev console will show the failure mode.
      var notifRes = await sendNotification({
        user_id: notifyId,
        type: notifType,
        from_user_id: authUser.id,
        match_id: match.id,
      });
      if (notifRes && notifRes.error) {
        console.error('[_submitProposal] notification emit failed:', notifType, notifRes.error);
      }
    }
    track(notifType,{match_id:match.id,reason:reasonCode,round:newRevisionCount});
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
  // Returns {error:null | <message>} so ActionReviewDrawer / FeedCard can surface
  // failures instead of closing on a silent RPC error.
  async function acceptCorrection(match){
    if(!authUser) return {error:'not_authenticated'};
    var r=await M.acceptCorrectionRpc(match.id);
    if(r.error){
      console.error('[acceptCorrection]',r.error);
      return {error:formatRpcError(r.error,'Could not accept correction — please try again.')};
    }
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
    track("match_correction_accepted",{match_id:match.id,round:match.revisionCount||0});
    return {error:null};
  }

  // Void a disputed match — both parties can do this.
  async function voidMatchAction(match, reason){
    if(!authUser) return {error:'not_authenticated'};
    var r=await M.voidMatchRpc(match.id, reason||'voided');
    if(r.error){
      console.error('[voidMatchAction]',r.error);
      return {error:formatRpcError(r.error,'Could not void match — please try again.')};
    }
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
    track("match_voided",{match_id:match.id,reason:reason||"voided"});
    return {error:null};
  }

  // Delete a match. Optimistically removes the row, then reverts if the DB
  // delete fails (RLS denial, network, etc). Returns {error:null|<message>}.
  async function deleteMatch(m){
    if(!authUser) return {error:'not_authenticated'};
    // Snapshot for rollback
    var snapshot=null;
    setHistory(function(h){
      snapshot=h;
      return h.filter(function(x){return x.id!==m.id;});
    });
    var r=await M.deleteMatchRow(m.id, authUser.id);
    if(r.error){
      console.error('[deleteMatch]',r.error);
      if(snapshot) setHistory(snapshot); // rollback
      return {error:formatRpcError(r.error,'Could not delete match — please try again.')};
    }
    // Notify opponent on deletion of any non-casual match (confirmed, pending,
    // or disputed) so they don't see a ghost match disappear without context.
    var oppId=m.opponent_id||m.tagged_user_id;
    if(oppId&&m.status!=='voided'&&m.status!=='expired'&&sendNotification){
      await sendNotification({user_id:oppId,type:'match_deleted',from_user_id:authUser.id,match_id:m.id});
    }
    return {error:null};
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
    if(r.error){
      console.error('[resubmitMatch]',r.error);
      return {error:formatRpcError(r.error,'Could not resubmit — please try again.')};
    }
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
    // Optimistic remove, rollback on RLS/network failure.
    var snapshot=null;
    setHistory(function(h){
      snapshot=h;
      return h.filter(function(x){return x.id!==m.id;});
    });
    var r=await M.markMatchTagStatus(m.id,'declined',false);
    if(r&&r.error){
      console.error('[removeTaggedMatch]',r.error);
      if(snapshot) setHistory(snapshot);
      return {error:formatRpcError(r.error,'Could not remove match — please try again.')};
    }
    return {error:null};
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
    pendingFreshCount, refreshFeed,
    submitMatch, deleteMatch, resubmitMatch, removeTaggedMatch, applyAcceptedTagMatch,
    confirmOpponentMatch, disputeWithProposal, counterPropose, acceptCorrection, voidMatchAction,
  };
}
