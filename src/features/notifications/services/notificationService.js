// src/features/notifications/services/notificationService.js
import { supabase } from "../../../lib/supabase.js";

export function fetchRecentNotifications(userId, limit){
  return supabase.from('notifications').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(limit||30);
}
export function markAllNotificationsRead(userId){
  return supabase.from('notifications').update({read:true}).eq('user_id',userId).eq('read',false);
}
export function insertNotification(payload){
  return supabase.from('notifications').insert(payload);
}
export function deleteNotification(id){
  return supabase.from('notifications').delete().eq('id',id);
}

// Upsert-style message notification via security-definer RPC.
// The RPC owns the delete+re-insert atomically so the sender can replace
// the recipient's existing notification without hitting cross-user RLS.
export function upsertMessageNotification(payload){
  return supabase.rpc('upsert_message_notification',{
    p_user_id:      payload.user_id,
    p_from_user_id: payload.from_user_id,
    p_entity_id:    payload.entity_id,
    p_metadata:     payload.metadata||null,
  });
}
