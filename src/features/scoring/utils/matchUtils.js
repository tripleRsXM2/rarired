// src/features/scoring/utils/matchUtils.js

// Compute a deterministic match hash for duplicate detection.
// Symmetric — same hash regardless of which player submits first.
export function computeMatchHash(uid1, uid2, date, sets){
  var ids=[uid1,uid2].sort().join(':');
  var score=sets.map(function(s){return s.you+'-'+s.them;}).join(',');
  return ids+'|'+date+'|'+score;
}

// `isTagged` — viewer is the tagged opponent of this match. Result is
// flipped to viewer-frame (submitter's win = viewer's loss).
// `isThirdParty` — viewer is NEITHER party (a friend's match seen via
// fetch_friends_matches). Result stays in the submitter's frame; the
// scoreboard renders both participants as non-viewer identities.
export function normalizeMatch(m, isTagged, isThirdParty){
  var ownerResult=m.result||"loss";
  // Map legacy tag_status to new status if status column not yet populated
  var status=m.status||(m.tag_status==='accepted'?'confirmed':m.tag_status==='pending'?'pending_confirmation':'confirmed');
  // Normalize proposal — result is inverted for tagged view, sets stay in submitter frame
  var proposal=m.current_proposal?{
    result:isTagged?(m.current_proposal.result==='win'?'loss':'win'):m.current_proposal.result,
    sets:m.current_proposal.sets||[],
    match_date:m.current_proposal.match_date||'',
    venue:m.current_proposal.venue||'',
    court:m.current_proposal.court||'',
  }:null;
  return {
    id:m.id,
    oppName:m.opp_name||"Unknown",
    tournName:m.tourn_name||"",
    date:m.match_date?new Date(m.match_date).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"",
    rawDate:m.match_date?m.match_date.slice(0,10):"",
    sets:m.sets||[],
    // Result frame:
    //   own / third-party → submitter's POV (m.result as stored)
    //   tagged            → flipped to viewer's POV
    result:isTagged?(ownerResult==="win"?"loss":"win"):ownerResult,
    notes:m.notes||"",
    status:status,
    submitterId:m.user_id||null,
    opponent_id:m.opponent_id||m.tagged_user_id||null,
    tagged_user_id:m.tagged_user_id||null,
    tag_status:m.tag_status||null,
    isTagged:!!isTagged,
    isThirdParty:!!isThirdParty,
    expiresAt:m.expires_at||null,
    venue:m.venue||"",
    court:m.court||"",
    disputeReasonCode:m.dispute_reason_code||null,
    disputeReasonDetail:m.dispute_reason_detail||null,
    currentProposal:proposal,
    proposalBy:m.proposal_by||null,
    pendingActionBy:m.pending_action_by||null,
    revisionCount:m.revision_count||0,
    disputeExpiresAt:m.dispute_expires_at||null,
    voidedAt:m.voided_at||null,
    voidedReason:m.voided_reason||null,
    // Module 3: DB-backed "<24h expiry reminder sent" flag. null = never sent.
    // Lets the client gate match_reminder firing without relying on localStorage.
    reminderSentAt:m.reminder_sent_at||null,
    // Module 7 — league tag (nullable). The feed card renders a league pill
    // when present; name resolution happens upstream via a leagues map.
    league_id: m.league_id || null,
    // Core product rule (2026-04-25): match_type drives Elo/leaderboard
    // impact. Server backfilled every legacy row, but for any row that
    // somehow arrives without it (older serializer, edge case) we fall
    // back to the same heuristic the backfill used: linked-opponent OR
    // a non-casual tourn_name implies ranked.
    match_type: m.match_type || (
      m.opponent_id || (m.tourn_name && m.tourn_name !== 'Casual Match' && m.tourn_name !== 'Casual')
        ? 'ranked'
        : 'casual'
    ),
    // Confirmed-at timestamp — used by the friends-feed pagination cursor
    // and as a tiebreaker when sorting third-party rows alongside own/tagged.
    confirmedAt: m.confirmed_at || null,
  };
}
