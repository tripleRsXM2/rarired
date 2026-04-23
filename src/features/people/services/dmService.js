// src/features/people/services/dmService.js
import { supabase } from "../../../lib/supabase.js";

// ── Conversations ──────────────────────────────────────────────────────────────

export function fetchConversations(userId){
  return supabase.from('conversations')
    .select('*')
    .or('user1_id.eq.'+userId+',user2_id.eq.'+userId)
    .neq('status','declined')
    .order('last_message_at',{ascending:false});
}

// Atomic, race-safe get-or-create for the canonical conversation between
// auth.uid() and otherId. Backed by an RPC that uses the unique index on
// `pair_key`; guaranteed to return exactly one canonical row regardless of
// who calls first or how many clients race. See migration
// dm_canonical_conversation.sql.
export function getOrCreateConversation(otherId){
  return supabase.rpc('get_or_create_conversation',{other_id:otherId}).single();
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

export async function upsertRead(userId,convId){
  var r=await supabase.rpc('mark_conversation_read',{p_conversation_id:convId});
  if(r.error)console.error('[upsertRead] failed:',r.error);
  else console.debug('[upsertRead] ok for conv:',convId);
  return r;
}

export function fetchReads(userId,convIds){
  return supabase.from('message_reads')
    .select('*').eq('user_id',userId).in('conversation_id',convIds);
}

// Fetch a single partner's last_read_at for a conversation — used to render
// the "Seen" receipt on messages I've sent.
export function fetchPartnerRead(partnerId,convId){
  return supabase.from('message_reads')
    .select('last_read_at')
    .eq('user_id',partnerId)
    .eq('conversation_id',convId)
    .maybeSingle();
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

// ── Pinned conversations ──────────────────────────────────────────────────────

// Rows in public.conversation_pins — one per (user, conversation) the
// user has pinned. Sorted newest-pin-first.
export function fetchPinnedConversationIds(userId){
  return supabase.from("conversation_pins")
    .select("conversation_id,pinned_at")
    .eq("user_id", userId)
    .order("pinned_at", { ascending: false });
}

export function pinConversationRow(userId, convId){
  return supabase.from("conversation_pins")
    .insert({ user_id: userId, conversation_id: convId })
    .select("*").single();
}

export function unpinConversationRow(userId, convId){
  return supabase.from("conversation_pins")
    .delete()
    .eq("user_id", userId)
    .eq("conversation_id", convId);
}

// ── Presence ──────────────────────────────────────────────────────────────────

export function updatePresence(userId){
  return supabase.from('profiles')
    .update({last_active:new Date().toISOString()}).eq('id',userId);
}
