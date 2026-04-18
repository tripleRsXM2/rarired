// src/features/scoring/utils/matchUtils.js
export function normalizeMatch(m, isTagged){
  var ownerResult=m.result||"loss";
  return {
    id:m.id,
    oppName:m.opp_name||"Unknown",
    tournName:m.tourn_name||"",
    date:m.match_date?new Date(m.match_date).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"",
    sets:m.sets||[],
    result:isTagged?(ownerResult==="win"?"loss":"win"):ownerResult,
    notes:m.notes||"",
    tagged_user_id:m.tagged_user_id||null,
    tag_status:m.tag_status||null,
    isTagged:isTagged,
  };
}
