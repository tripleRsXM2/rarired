// src/v2/data/logV2Match.js
//
// Insert a quick-logged match from the v2 QuickLogScreen into
// match_history.
//
// Lifecycle:
//   * Free-text opponent (no linked id) → status='confirmed' on
//     write. There's no opponent account to notify or to dispute,
//     so the row is final immediately. Mirrors v1's casual auto-
//     confirm path.
//   * Linked opponent (real player id) → status='pending_confirmation'
//     with a 72h expires_at. Fires `match_tag` notification + an
//     auto-emit `confirm` structured DM into the conversation
//     between the two players (Slice B widget — Confirm / Dispute
//     buttons render on the recipient's bubble). User feedback:
//     "when i log a quick log with a player and save it. can it
//     auto send a message? like how we had before in the messages?
//     then the other player can dispute it in the message."
//
//     match_type stays 'casual' (no rating impact). The pending
//     status is purely about giving the opponent a chance to
//     acknowledge / dispute the score the same way v1 ranked
//     matches do — see docs/trust-and-ranking-rules.md.
//
// Mirrors the DB shapes the v1 useMatchHistory.submitMatch path
// writes so v1 + v2 rows stay interchangeable.

import { supabase } from "../../lib/supabase.js";
import { emitMatchConfirmDM } from "../../features/people/services/dmWidgets.js";

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
//                players' Activity feeds and turns on the
//                pending_confirmation + DM confirm-card path)
//   v2Sets     : QuickLogScreen sets state
//   opts       : {
//                  matchDate?: 'YYYY-MM-DD',  — defaults to today
//                  submitterName?: string,    — viewer's display name
//                                               for the confirm-card
//                                               DM "p1" slot
//                }
//
// Returns { data, error } — `data` carries { matchId, result, status }.
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
  var hasLinkedOpponent = !!(opponent && opponent.id);
  // Linked opponents open the pending_confirmation lifecycle so the
  // recipient can confirm or dispute via the structured DM widget.
  // Free-text opponents skip it — there's no account to notify.
  var status = hasLinkedOpponent ? "pending_confirmation" : "confirmed";

  var payload = {
    user_id:      authUserId,
    opp_name:     (opponent && opponent.name) || "Opponent",
    tourn_name:   "Casual Match",
    match_type:   "casual",
    sets:         dbSets,
    result:       result,
    notes:        "",
    match_date:   matchDate,
    status:       status,
    submitted_at: new Date().toISOString(),
  };
  if (hasLinkedOpponent) {
    payload.opponent_id = opponent.id;
    // `tagged_user_id` ALSO points at the opponent — the
    // respond_to_match_tag RPC's auth gate is `caller =
    // tagged_user_id`, so without this the Confirm / Dispute
    // widgets in v2 Messages fail silently with "not the tagged
    // user". Same value as opponent_id for v2 quick-log because
    // the "tag" IS the opponent. User feedback: "when I try to
    // confirm a score, it does nothing."
    payload.tagged_user_id = opponent.id;
    // 72h confirmation window — mirrors v1 ranked submitMatch. After
    // expiry pg_cron flips pending_confirmation → expired.
    payload.expires_at = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  }

  var ins = await supabase
    .from("match_history")
    .insert(payload)
    .select("id")
    .single();

  if (ins.error) {
    return { data: null, error: ins.error };
  }

  var matchId = ins.data && ins.data.id;

  if (matchId && hasLinkedOpponent) {
    // match_tag notification — same type v1 ranked submitMatch fires.
    // The recipient's tray shows the "X logged a match with you —
    // confirm or dispute" row.
    try {
      await supabase.rpc("emit_notification", {
        p_user_id:   opponent.id,
        p_type:      "match_tag",
        p_entity_id: matchId,
        p_metadata:  null,
      });
    } catch (_) { /* non-fatal */ }

    // Auto-emit the structured confirm-card DM into the conversation.
    // The recipient sees a Confirm / Dispute card inline; tapping
    // Confirm calls respond_to_match_tag(true) (match → confirmed),
    // tapping Dispute calls respond_to_match_tag(false) (match →
    // rejected). Non-fatal: the match_tag notification above stays
    // authoritative if the DM emit fails.
    try {
      var widgetSets = dbSets.map(function (s) { return [s.you, s.them]; });
      var submitterName = (opts && opts.submitterName) || "You";
      var dmRes = await emitMatchConfirmDM(authUserId, opponent.id, {
        matchId: matchId,
        sets: widgetSets,
        submitterName: submitterName,
        opponentName: opponent.name,
        leagueName: "Casual",
        isRanked: false,
      });
      if (dmRes && dmRes.error) {
        console.warn("[quicklog confirm-card DM failed]", dmRes.error.message || dmRes.error);
      }
    } catch (e) { console.warn("[quicklog confirm-card DM threw]", e); }
  }

  return { data: { matchId: matchId, result: result, status: status }, error: null };
}
