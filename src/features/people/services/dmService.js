// src/features/people/services/dmService.js
import { supabase } from "../../../supabase.js";

// ── Conversations ──────────────────────────────────────────────────────────────

export function fetchConversations(userId){
  return supabase.from('conversations')
    .select('*')
    .or('user1_id.eq.'+userId+',user2_id.eq.'+userId)
    .neq('status','declined')
    .order('last_message_at',{ascending:false});
}

export function fetchConversationBetween(userId,otherId){
  return supabase.from('conversations')
    .select('*')
    .or('and(user1_id.eq.'+userId+',user2_id.eq.'+otherId+'),and(user1_id.eq.'+otherId+',user2_id.eq.'+userId+')')
    .maybeSingle();
}

export function createConversation(userId,otherId){
  return supabase.from('conversations')
    .insert({user1_id:userId,user2_id:otherId,status:'pending'})
    .select('*').single();
}

export function updateConversationStatus(convId,status){
  var update={status};
  if(status==='declined')update.declined_at=new Date().toISOString();
  return supabase.from('conversations').update(update).eq('id',convId).select('*').single();
}

export function declineConversation(convId,cooldownUntil){
  return supabase.from('conversations').update({
    status:'declined',
    declined_at:new Date().toISOString(),
    request_cooldown_until:cooldownUntil,
  }).eq('id',convId);
}

export function updateConversationLastMessage(convId,preview,senderId){
  return supabase.from('conversations').update({
    last_message_at:new Date().toISOString(),
    last_message_preview:preview,
    last_message_sender_id:senderId,
  }).eq('id',convId);
}

export function deleteConversation(convId){
  return supabase.from('conversations').delete().eq('id',convId);
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function fetchThread(convId){
  return supabase.from('direct_messages')
    .select('*')
    .eq('conversation_id',convId)
    .order('created_at',{ascending:true});
}

export function sendMessage(convId,senderId,content,replyToId){
  var payload={conversation_id:convId,sender_id:senderId,content};
  if(replyToId)payload.reply_to_id=replyToId;
  return supabase.from('direct_messages').insert(payload).select('*').single();
}

export function editMessage(messageId,content){
  return supabase.from('direct_messages')
    .update({content,edited_at:new Date().toISOString()})
    .eq('id',messageId).select('*').single();
}

export function softDeleteMessage(messageId){
  return supabase.from('direct_messages')
    .update({deleted_at:new Date().toISOString()})
    .eq('id',messageId);
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function upsertRead(userId,convId){
  return supabase.from('message_reads')
    .upsert({user_id:userId,conversation_id:convId,last_read_at:new Date().toISOString()},
      {onConflict:'user_id,conversation_id'});
}

export function fetchReads(userId,convIds){
  return supabase.from('message_reads')
    .select('*').eq('user_id',userId).in('conversation_id',convIds);
}

// ── Reactions ─────────────────────────────────────────────────────────────────

export function fetchReactions(messageIds){
  return supabase.from('message_reactions').select('*').in('message_id',messageIds);
}

export function addReaction(messageId,userId,emoji){
  return supabase.from('message_reactions')
    .insert({message_id:messageId,user_id:userId,emoji}).select('*').single();
}

export function removeReaction(messageId,userId,emoji){
  return supabase.from('message_reactions')
    .delete().eq('message_id',messageId).eq('user_id',userId).eq('emoji',emoji);
}

// ── Presence ──────────────────────────────────────────────────────────────────

export function updatePresence(userId){
  return supabase.from('profiles')
    .update({last_active:new Date().toISOString()}).eq('id',userId);
}
