// src/features/people/services/dmService.js
import { supabase } from "../../../lib/supabase.js";

// ── Conversations ──────────────────────────────────────────────────────────────

// fetchConversations: backed by the fetch_my_conversations() RPC so it
// returns N-party conversations as well. Each row carries
// `participant_ids: uuid[]` in addition to the legacy user1/user2 columns.
// Maintains the previous shape ({ data: ConversationRow[], error }) so
// existing callers (useDMs, etc.) don't need to change in this phase.
// The userId arg is unused — the RPC scopes to auth.uid() — but we keep
// the parameter to avoid touching call sites in Phase 1.
// eslint-disable-next-line no-unused-vars
export async function fetchConversations(userId){
  var r = await supabase.rpc('fetch_my_conversations');
  if(r.error) return { data: null, error: r.error };
  return { data: Array.isArray(r.data) ? r.data : [], error: null };
}

// Atomic, race-safe get-or-create for the canonical conversation between
// auth.uid() and otherId. Backed by an RPC that uses the unique index on
// `pair_key`; guaranteed to return exactly one canonical row regardless of
// who calls first or how many clients race. See migration
// dm_canonical_conversation.sql.
export function getOrCreateConversation(otherId){
  return supabase.rpc('get_or_create_conversation',{other_id:otherId}).single();
}

// Create an N-party group conversation. otherIds excludes the caller; the
// SECURITY DEFINER RPC adds auth.uid() as a participant. On block conflict
// (any pairwise block among members) the RPC raises with SQLSTATE P0001 and
// message 'block_conflict' — we surface that as a stable error.code so
// callers can show the right toast without string-matching.
export async function createGroupConversation(otherIds){
  var r = await supabase.rpc('create_group_conversation', { other_ids: otherIds });
  if(r.error){
    var msg = String(r.error.message || "");
    if(msg.indexOf('block_conflict') !== -1){
      return { data: null, error: { code: 'block_conflict', message: msg } };
    }
    return { data: null, error: r.error };
  }
  return { data: r.data, error: null };
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

// PR2 (v2-messages-widgets): emit a structured DM to `partnerId` without
// disturbing whatever conversation is currently open in the UI. Used by
// auto-emit code paths (useMatchHistory.submitMatch, useChallenges.sendChallenge)
// where the user logged a match / sent a challenge from a screen that
// isn't /messages, and we want to drop a widget row into the 1:1 thread.
//
// Behaviour:
//   1. get_or_create_conversation(partnerId) — atomic, idempotent
//   2. insert direct_messages row with { kind, payload, content (fallback) }
//   3. trigger updates last_message_preview to the kind-aware label
//
// Returns { data: messageRow, error } — same shape as the rest of dmService.
// Best-effort: callers ignore errors so the originating action (match
// insert / challenge insert) is never blocked by a chat-side hiccup.
// Notable swallowed cases:
//   - block_conflict     → no widget, fine — user can't message them
//   - cooldown / decline → no widget, also fine
//   - any RLS / network  → log + return error, caller swallows
export async function autoEmitStructured(partnerId, kind, payload, fallbackText){
  if(!partnerId) return { data: null, error: new Error("no_partner") };
  var gc = await supabase.rpc('get_or_create_conversation', { other_id: partnerId }).single();
  if(gc.error || !gc.data){
    return { data: null, error: gc.error || new Error("no_conv") };
  }
  var row = gc.data;
  // We deliberately don't promote a pending conv to accepted here — the
  // first text DM still drives that transition. A widget arriving while
  // the conv is in pending is fine; it shows up in the thread once the
  // recipient accepts the request. Mirrors how a normal text DM behaves.
  var auth = await supabase.auth.getUser();
  var senderId = auth && auth.data && auth.data.user && auth.data.user.id;
  if(!senderId) return { data: null, error: new Error("no_session") };
  var ins = await supabase.from('direct_messages').insert({
    conversation_id: row.id,
    sender_id: senderId,
    content: fallbackText || "",
    kind: kind || null,
    payload: payload || null,
  }).select('*').single();
  return ins;
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function fetchThread(convId){
  return supabase.from('direct_messages')
    .select('*')
    .eq('conversation_id',convId)
    .order('created_at',{ascending:true});
}

// PR2 (v2-messages-widgets): optional `extras = { kind, payload }` lets
// callers tag a message as a structured widget (score / invite / etc).
// kind is a free-form text column on direct_messages; payload is a jsonb
// bag whose shape depends on kind. Both nullable — when extras is absent
// the row goes in as a plain text DM exactly as before. The
// `dm_update_conv_preview` trigger turns kind-tagged rows into
// kind-aware preview strings ("Sent score for confirmation" etc) so the
// inbox row doesn't show an awkward empty/fallback content body.
export function sendMessage(convId,senderId,content,replyToId,extras){
  var payload={conversation_id:convId,sender_id:senderId,content};
  if(replyToId)payload.reply_to_id=replyToId;
  if(extras&&typeof extras==='object'){
    if(extras.kind)    payload.kind=extras.kind;
    if(extras.payload) payload.payload=extras.payload;
  }
  return supabase.from('direct_messages').insert(payload).select('*').single();
}

export async function editMessage(messageId,content){
  var r = await supabase.from('direct_messages')
    .update({content,edited_at:new Date().toISOString()})
    .eq('id',messageId).select('*').maybeSingle();
  if(!r.error && !r.data){
    return { data:null, error:new Error("edit affected 0 rows (RLS?)") };
  }
  return r;
}

// Soft-delete own message. Chains .select() so PostgREST returns the
// updated row — lets us detect the RLS "updated 0 rows, no error" case
// that previously caused unsends to silently revert on refresh.
export async function softDeleteMessage(messageId){
  var r = await supabase.from('direct_messages')
    .update({deleted_at:new Date().toISOString()})
    .eq('id',messageId)
    .select('id,deleted_at')
    .maybeSingle();
  if(!r.error && !r.data){
    return { data:null, error:new Error("soft-delete affected 0 rows (RLS?)") };
  }
  return r;
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

// Bulk version: fetch every message_reads row for my conversation ids where
// the reader ISN'T me. Used to render the per-row "✓ Seen" indicator in the
// conversation list so the user can tell at a glance whether their last
// message has been read, WhatsApp-style. One query for the whole inbox.
export function fetchPartnerReadsForConvs(myUserId,convIds){
  if(!convIds||!convIds.length) return Promise.resolve({ data: [], error: null });
  return supabase.from('message_reads')
    .select('conversation_id,user_id,last_read_at')
    .in('conversation_id',convIds)
    .neq('user_id',myUserId);
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

// ── Mutes (self-only; suppresses unread-badge contribution) ─────────────────

export function fetchMutedConversationIds(userId){
  return supabase.from("conversation_mutes")
    .select("conversation_id,muted_at")
    .eq("user_id", userId);
}

export function muteConversationRow(userId, convId){
  return supabase.from("conversation_mutes")
    .insert({ user_id: userId, conversation_id: convId })
    .select("*").single();
}

export function unmuteConversationRow(userId, convId){
  return supabase.from("conversation_mutes")
    .delete()
    .eq("user_id", userId)
    .eq("conversation_id", convId);
}

// ── Presence ──────────────────────────────────────────────────────────────────

export function updatePresence(userId){
  return supabase.from('profiles')
    .update({last_active:new Date().toISOString()}).eq('id',userId);
}
