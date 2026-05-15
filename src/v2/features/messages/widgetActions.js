// src/v2/features/messages/widgetActions.js
//
// Action handlers for the v2 structured-DM bubbles
// (ConfirmCardBubble, InviteCardBubble). Slice C of the widget wiring.
//
// Each handler returns a Promise<{ ok: boolean, error?: any }> so the
// caller (the bubble) can swap the buttons for a status badge on
// success or restore them on failure.
//
// We intentionally call the underlying services directly instead of
// going through the v1 hooks (useMatchHistory, useChallenges). The v1
// hooks live in App.jsx and aren't mounted in v2's render tree; we
// fire the matching notification side-effects inline here so the
// other side still hears about the action.

import { markMatchTagStatus } from "../../../features/scoring/services/matchService.js";
import { updateChallengeStatus } from "../../../features/challenges/services/challengeService.js";
import { insertNotification } from "../../../features/notifications/services/notificationService.js";
import { track } from "../../../lib/analytics.js";

// Confirm a match-tag DM widget. Routes through the
// `respond_to_match_tag(matchId, true)` RPC — same one v1's
// ActionReviewDrawer uses. On success fires `match_confirmed` to the
// submitter so they see the confirmation on their side.
//
// args: { matchId, submitterId, viewerId }
export async function confirmMatchTagAction(args) {
  if (!args || !args.matchId) return { ok: false, error: "missing matchId" };
  var r = await markMatchTagStatus(args.matchId, "accepted", true);
  if (r && r.error) return { ok: false, error: r.error };
  // Notify the submitter that the match was confirmed.
  if (args.submitterId && args.viewerId) {
    try {
      await insertNotification({
        user_id: args.submitterId,
        type: "match_confirmed",
        from_user_id: args.viewerId,
        entity_id: args.matchId,
      });
    } catch (e) { console.warn("[match_confirmed notification failed]", e); }
  }
  track("v2_widget_confirm_match", { match_id: args.matchId });
  return { ok: true, data: r && r.data };
}

// Dispute (reject) a match-tag DM widget. Currently maps to
// `respond_to_match_tag(matchId, false)` — the "not my match" path,
// which voids the row. The full scoreline-correction flow (counter-
// proposal) stays in v1's dispute drawer for now; from the v2 widget
// the user can still flag "this didn't happen", which is the most
// destructive case we want to support inline.
//
// args: { matchId, submitterId, viewerId }
export async function disputeMatchTagAction(args) {
  if (!args || !args.matchId) return { ok: false, error: "missing matchId" };
  var r = await markMatchTagStatus(args.matchId, "rejected", true);
  if (r && r.error) return { ok: false, error: r.error };
  if (args.submitterId && args.viewerId) {
    try {
      await insertNotification({
        user_id: args.submitterId,
        type: "match_voided",
        from_user_id: args.viewerId,
        entity_id: args.matchId,
      });
    } catch (e) { console.warn("[match_voided notification failed]", e); }
  }
  track("v2_widget_dispute_match", { match_id: args.matchId });
  return { ok: true, data: r && r.data };
}

// Accept a challenge from the invite-card DM. Calls the same
// challenges-table UPDATE the v1 ChallengesPanel uses, plus the
// `challenge_accepted` notification so the challenger sees the green
// light. On success the bubble flips to an "Accepted" badge.
//
// args: { challengeId, challengerId, viewerId }
export async function acceptChallengeAction(args) {
  if (!args || !args.challengeId) return { ok: false, error: "missing challengeId" };
  var r = await updateChallengeStatus(args.challengeId, "accepted");
  if (r && r.error) return { ok: false, error: r.error };
  if (args.challengerId && args.viewerId) {
    try {
      await insertNotification({
        user_id: args.challengerId,
        type: "challenge_accepted",
        from_user_id: args.viewerId,
        entity_id: args.challengeId,
      });
    } catch (e) { console.warn("[challenge_accepted notification failed]", e); }
  }
  track("v2_widget_accept_challenge", { challenge_id: args.challengeId });
  return { ok: true, data: r && r.data };
}

// Reschedule = send a templated plain-text DM into the same
// conversation. No state change on the challenge itself — the
// challenger replies with a new time and they re-propose. Keeps the
// inline conversation flowing instead of dead-ending the widget.
//
// args: { dms } from BaselineApp (the v1 useDMs hook).
export async function rescheduleInviteAction(args) {
  if (!args || !args.dms || !args.dms.sendMessage) {
    return { ok: false, error: "no dms.sendMessage" };
  }
  var r = await args.dms.sendMessage("Want to reschedule? What time works for you?");
  if (r && r.error) return { ok: false, error: r.error };
  track("v2_widget_reschedule_invite", { challenge_id: (args.challengeId || null) });
  return { ok: true };
}
