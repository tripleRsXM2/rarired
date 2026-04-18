// src/features/notifications/services/notificationService.js
import { supabase } from "../../../supabase.js";

export function fetchRecentNotifications(userId, limit){
  return supabase.from('notifications').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(limit||20);
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
