// src/features/people/services/dmService.js
// Requires a `direct_messages` table:
//   id uuid default gen_random_uuid() primary key,
//   sender_id uuid references profiles(id) on delete cascade,
//   receiver_id uuid references profiles(id) on delete cascade,
//   content text not null,
//   read_at timestamptz,
//   created_at timestamptz default now()
import { supabase } from "../../../supabase.js";

export function fetchAllMessages(userId){
  return supabase.from('direct_messages')
    .select('*')
    .or('sender_id.eq.'+userId+',receiver_id.eq.'+userId)
    .order('created_at',{ascending:false});
}

export function fetchThread(userId, otherId){
  return supabase.from('direct_messages')
    .select('*')
    .or('and(sender_id.eq.'+userId+',receiver_id.eq.'+otherId+'),and(sender_id.eq.'+otherId+',receiver_id.eq.'+userId+')')
    .order('created_at',{ascending:true});
}

export function sendMessage(senderId, receiverId, content){
  return supabase.from('direct_messages')
    .insert({sender_id:senderId,receiver_id:receiverId,content})
    .select('*').single();
}

export function markThreadRead(receiverId, senderId){
  return supabase.from('direct_messages')
    .update({read_at:new Date().toISOString()})
    .eq('receiver_id',receiverId).eq('sender_id',senderId).is('read_at',null);
}
