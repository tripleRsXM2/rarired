// src/features/scoring/utils/matchUtils.js

// Compute a deterministic match hash for duplicate detection.
// Symmetric — same hash regardless of which player submits first.
export function computeMatchHash(uid1, uid2, date, sets){
  var ids=[uid1,uid2].sort().join(':');
  var score=sets.map(function(s){return s.you+'-'+s.them;}).join(',');
  return ids+'|'+date+'|'+score;
}

export function normalizeMatch(m, isTagged){
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
    result:isTagged?(ownerResult==="win"?"loss":"win"):ownerResult,
    notes:m.notes||"",
    status:status,
    submitterId:m.user_id||null,
    opponent_id:m.opponent_id||m.tagged_user_id||null,
    tagged_user_id:m.tagged_user_id||null,
    tag_status:m.tag_status||null,
    isTagged:isTagged,
    expiresAt:m.expires_at||null,
    revisionRequestedBy:m.revision_requested_by||null,
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
  };
}
