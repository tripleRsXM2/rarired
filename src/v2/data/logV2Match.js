// src/v2/data/logV2Match.js
//
// Insert a quick-logged match from the v2 QuickLogScreen into
// match_history. v2 quick-log is a casual final-score log — no live
// scoring, no ranked confirmation flow. Casual matches auto-confirm
// (status='confirmed') so the row is final the moment it's saved.
//
// No v1 feature imports — supabase client only. Mirrors the DB shapes
// the v1 useMatchHistory.submitMatch path writes so v1 + v2 rows are
// interchangeable.

import { supabase } from "../../lib/supabase.js";

// Serialize the v2 QuickLog set shape into the DB set shape.
//   v2 in : { score: [you, them], tb: [you, them] | null }
//   DB out: { you, them, tieBreak?: { you, them } }
// Empty / non-numeric sets are dropped; a tiebreak is only persisted
// when both halves are real numbers — matches v1 serializeSetForDb.
function serializeSets(v2Sets) {
  if (!Array.isArray(v2Sets)) return [];
  return v2Sets
    .map(function (s) {
      if (!s || !Array.isArray(s.score)) return null;
      var you  = Number(s.score[0]);
      var them = Number(s.score[1]);
      if (Number.isNaN(you) || Number.isNaN(them)) return null;
      // A 0-0 set is an unfilled row — skip it so we never persist a
      // blank set the user added but didn't score.
      if (you === 0 && them === 0) return null;
      var out = { you: you, them: them };
      if (Array.isArray(s.tb)) {
        var tby = Number(s.tb[0]);
        var tbt = Number(s.tb[1]);
        if (!Number.isNaN(tby) && !Number.isNaN(tbt)) {
          out.tieBreak = { you: tby, them: tbt };
        }
      }
      return out;
    })
    .filter(Boolean);
}

// Decide the viewer's result from the serialized sets — whoever won
// more sets. A set is won by the side with the higher game count
// (tiebreak only breaks a 6-6/7-6 set, already reflected in `you`/
// `them`). Ties default to 'loss' so we never over-credit a win.
function deriveResult(dbSets) {
  var youSets = 0, themSets = 0;
  dbSets.forEach(function (s) {
    if (s.you > s.them) youSets++;
    else if (s.them > s.you) themSets++;
  });
  return youSets > themSets ? "win" : "loss";
}

// logV2Match — insert one casual match.
//   authUserId : viewer's id (match owner / submitter)
//   opponent   : { id?: uuid, name: string }  — id optional (free-text
//                opponent allowed; linked id makes it show on both
//                players' Activity feeds)
//   v2Sets     : QuickLogScreen sets state
//   opts       : { matchDate?: 'YYYY-MM-DD' }  — defaults to today
//
// Returns { data, error } — `data` carries { matchId, result }.
export async function logV2Match(authUserId, opponent, v2Sets, opts) {
  if (!authUserId) {
    return { data: null, error: { message: "Not signed in." } };
  }
  var dbSets = serializeSets(v2Sets);
  if (dbSets.length === 0) {
    return { data: null, error: { message: "Add at least one set score." } };
  }
  var result = deriveResult(dbSets);
  var matchDate = (opts && opts.matchDate) || new Date().toISOString().slice(0, 10);

  var payload = {
    user_id:      authUserId,
    opp_name:     (opponent && opponent.name) || "Opponent",
    tourn_name:   "Casual Match",
    match_type:   "casual",
    sets:         dbSets,
    result:       result,
    notes:        "",
    match_date:   matchDate,
    status:       "confirmed",          // casual auto-confirms
    submitted_at: new Date().toISOString(),
  };
  // Link the opponent only when we have a real player id — a free-text
  // name logs as an unlinked casual match (won't surface on the other
  // player's feed, which is correct: there's no other player).
  if (opponent && opponent.id) payload.opponent_id = opponent.id;

  var ins = await supabase
    .from("match_history")
    .insert(payload)
    .select("id")
    .single();

  if (ins.error) {
    return { data: null, error: ins.error };
  }

  var matchId = ins.data && ins.data.id;

  // Linked-opponent heads-up — fire the casual_match_logged
  // notification so the opponent knows the match was logged against
  // them (same trust-gap close v1 does). Non-fatal: the match row
  // already exists; a failed notification just means no heads-up.
  if (matchId && opponent && opponent.id) {
    try {
      await supabase.rpc("emit_notification", {
        p_user_id:   opponent.id,
        p_type:      "casual_match_logged",
        p_entity_id: matchId,
        p_metadata:  null,
      });
    } catch (_) { /* non-fatal */ }
  }

  return { data: { matchId: matchId, result: result }, error: null };
}
