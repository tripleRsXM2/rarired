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
  return {
    id:m.id,
    oppName:m.opp_name||"Unknown",
    tournName:m.tourn_name||"",
    date:m.match_date?new Date(m.match_date).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"",
    sets:m.sets||[],
    result:isTagged?(ownerResult==="win"?"loss":"win"):ownerResult,
    notes:m.notes||"",
    status:status,
    submitterId:m.user_id||null,
    opponent_id:m.opponent_id||m.tagged_user_id||null,
    tagged_user_id:m.tagged_user_id||null,
    tag_status:m.tag_status||null,
    isTagged:isTagged,
  };
}
