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

// Upsert-style message notification: removes any existing unread message
// notification for this conversation → inserts a fresh one with latest preview.
// Keeps the panel clean (one notification per conversation, not one per message).
export async function upsertMessageNotification(payload){
  if(payload.entity_id){
    await supabase.from('notifications')
      .delete()
      .eq('user_id', payload.user_id)
      .eq('type', 'message')
      .eq('entity_id', payload.entity_id);
  }
  return supabase.from('notifications').insert(payload);
}
