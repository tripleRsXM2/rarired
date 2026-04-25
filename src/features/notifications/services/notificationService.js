// src/features/notifications/services/notificationService.js
import { supabase } from "../../../lib/supabase.js";

export function fetchRecentNotifications(userId, limit){
  return supabase.from('notifications').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(limit||30);
}
export function markAllNotificationsRead(userId){
  return supabase.from('notifications').update({read:true}).eq('user_id',userId).eq('read',false);
}

// Module 8: types that should fan out as a Web Push to the recipient's
// enabled devices. Mirrors PUSH_TYPE_TO_CATEGORY in the send-push Edge
// Function — keep in sync. Anything absent is in-app only.
var PUSH_WORTHY_TYPES = {
  match_tag:                  1, match_disputed:           1,
  match_correction_requested: 1, match_counter_proposed:   1,
  match_reminder:             1, match_confirmed:          1,
  match_voided:               1, match_expired:            1,
  challenge_received:         1, challenge_accepted:       1,
  challenge_declined:         1, challenge_expired:        1,
  friend_request:             1, request_accepted:         1,
  league_invite:              1, league_joined:            1,
  pact_proposed:              1, pact_claimed:             1,
  pact_confirmed:             1, pact_booked:              1,
  pact_cancelled:             1,
  message_request:            1, message_request_accepted: 1,
};

// Fire-and-forget push fan-out. The Edge Function handles category
// preferences, device list, idempotency (via notification_push_log),
// and stale-subscription pruning. We catch any error so a failed push
// can't break the original app action — which is the requirement
// from /docs/push-notifications.md → "Failure isolation".
function dispatchPush(notificationId, type) {
  if (!notificationId || !type) return;
  if (!PUSH_WORTHY_TYPES[type]) return;
  // Don't await; let the caller's flow continue.
  try {
    supabase.functions.invoke("send-push", { body: { notification_id: notificationId } })
      .then(function (r) {
        if (r && r.error) {
          // Visible enough for debug, doesn't surface to the user.
          console.warn("[push] send-push error:", r.error.message || r.error);
        }
      })
      .catch(function (err) {
        console.warn("[push] send-push throw:", err && err.message);
      });
  } catch (e) {
    console.warn("[push] dispatch failed:", e && e.message);
  }
}

// Cross-user notifications MUST go through the emit_notification RPC. The
// RPC is security-definer and validates that the caller (auth.uid()) has
// standing to notify the target (matching friend_request / conversation /
// challenge / match row). Direct inserts to notifications are blocked by
// RLS for cross-user payloads — this is a deliberate security boundary.
//
// Shape: { user_id, type, from_user_id?, entity_id?, metadata? }
// from_user_id is ignored — the RPC forces from_user_id = auth.uid().
//
// Module 8: after the in-app row is created we fire-and-forget a push
// dispatch via the Edge Function. The function is idempotent (keyed by
// notification_id) so re-emits or retries don't duplicate.
export function insertNotification(payload){
  // Self-notifications (no from_user_id) go via the direct INSERT path,
  // which RLS allows when user_id = auth.uid() and from_user_id is null.
  if (!payload.from_user_id || payload.user_id === payload.from_user_id) {
    return supabase
      .from('notifications')
      .insert(Object.assign({}, payload, { from_user_id: null }))
      .select('id, type')
      .single()
      .then(function (r) {
        if (!r.error && r.data && r.data.id) dispatchPush(r.data.id, r.data.type);
        return r;
      });
  }
  // emit_notification takes entity_id (the id of the underlying row: match,
  // challenge, conversation, etc.). A lot of match-flow call sites pass it
  // as `match_id` because that's the legacy column on the notifications
  // table — fall back to match_id so the RPC still validates standing and
  // the notification actually lands.
  var entityId = payload.entity_id || payload.match_id || null;
  return supabase.rpc('emit_notification', {
    p_user_id:   payload.user_id,
    p_type:      payload.type,
    p_entity_id: entityId,
    p_metadata:  payload.metadata  || null,
  }).then(function (r) {
    // emit_notification returns the new row's id (uuid). Versions of the
    // RPC vary in return shape — accept either a scalar or { id }.
    if (!r.error) {
      var notifId = (r.data && r.data.id) || (typeof r.data === "string" ? r.data : null);
      if (notifId) dispatchPush(notifId, payload.type);
    }
    return r;
  });
}
export function deleteNotification(id){
  return supabase.from('notifications').delete().eq('id',id);
}
export function markNotificationRead(id){
  return supabase.from('notifications').update({read:true}).eq('id',id);
}
export function markNotificationsReadByIds(ids){
  if(!ids||!ids.length)return Promise.resolve({data:null,error:null});
  return supabase.from('notifications').update({read:true}).in('id',ids);
}

// Upsert-style message notification: one per conversation per recipient.
// Insert only — relies on the upsert_message_notification security-definer
// RPC if available; falls back to a plain insert otherwise.
export async function upsertMessageNotification(payload){
  return supabase.rpc('upsert_message_notification',{
    p_user_id:      payload.user_id,
    p_from_user_id: payload.from_user_id,
    p_entity_id:    payload.entity_id||null,
    p_metadata:     payload.metadata||null,
  }).then(function(r){
    // If RPC doesn't exist yet, fall back to a plain insert so the
    // notification still fires (may duplicate, but won't silently fail).
    if(r.error&&r.error.code==='PGRST202'){
      return supabase.from('notifications').insert(payload);
    }
    return r;
  });
}
