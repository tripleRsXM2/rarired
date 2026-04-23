// src/features/notifications/services/notificationService.js
import { supabase } from "../../../lib/supabase.js";

export function fetchRecentNotifications(userId, limit){
  return supabase.from('notifications').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(limit||30);
}
export function markAllNotificationsRead(userId){
  return supabase.from('notifications').update({read:true}).eq('user_id',userId).eq('read',false);
}

// Cross-user notifications MUST go through the emit_notification RPC. The
// RPC is security-definer and validates that the caller (auth.uid()) has
// standing to notify the target (matching friend_request / conversation /
// challenge / match row). Direct inserts to notifications are blocked by
// RLS for cross-user payloads — this is a deliberate security boundary.
//
// Shape: { user_id, type, from_user_id?, entity_id?, metadata? }
// from_user_id is ignored — the RPC forces from_user_id = auth.uid().
export function insertNotification(payload){
  // Self-notifications (no from_user_id) go via the direct INSERT path,
  // which RLS allows when user_id = auth.uid() and from_user_id is null.
  if (!payload.from_user_id || payload.user_id === payload.from_user_id) {
    return supabase.from('notifications').insert(Object.assign({}, payload, {
      from_user_id: null,
    }));
  }
  return supabase.rpc('emit_notification', {
    p_user_id:   payload.user_id,
    p_type:      payload.type,
    p_entity_id: payload.entity_id || null,
    p_metadata:  payload.metadata  || null,
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
