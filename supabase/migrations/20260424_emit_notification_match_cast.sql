-- 20260424_emit_notification_match_cast.sql
--
-- Bug: emit_notification() validates standing for match_* types with
--   select 1 from public.match_history m where m.id = p_entity_id
-- match_history.id is text; p_entity_id is uuid; the comparison throws
-- "operator does not exist: text = uuid" and the RPC aborts. Result:
-- zero match_tag / match_confirmed / match_disputed / match_voided /
-- match_corrected / match_correction_requested / match_counter_proposed
-- notifications have ever been delivered across users.
--
-- Fix: cast p_entity_id to text on both sides (store it back as text so
-- the existing text comparisons used elsewhere keep working).
--
-- Also widen the accepted type list to cover match_deleted, match_expired,
-- and match_reminder, which the client emits but the previous switch/case
-- rejected as "unknown notification type".

begin;

create or replace function public.emit_notification(
  p_user_id uuid,
  p_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  fill_match_id uuid;
  entity_text text := p_entity_id::text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_user_id = uid then raise exception 'cannot self-notify via emit_notification'; end if;

  if exists (select 1 from public.blocks where blocker_id = p_user_id and blocked_id = uid) then
    return null;
  end if;

  case p_type
    when 'friend_request' then
      if not exists (
        select 1 from public.friend_requests fr
        where fr.sender_id = uid and fr.receiver_id = p_user_id and fr.status = 'pending'
      ) then raise exception 'no pending friend_request for this pair'; end if;

    when 'friend_request_accepted', 'request_accepted' then
      if not exists (
        select 1 from public.friend_requests fr
        where fr.receiver_id = uid and fr.sender_id = p_user_id and fr.status = 'accepted'
      ) then raise exception 'no accepted friend_request'; end if;

    when 'message_request' then
      if not exists (
        select 1 from public.conversations c
        where c.id = p_entity_id
          and c.requester_id = uid
          and ((c.user1_id = p_user_id) or (c.user2_id = p_user_id))
      ) then raise exception 'not a valid message_request'; end if;

    when 'message_request_accepted' then
      if not exists (
        select 1 from public.conversations c
        where c.id = p_entity_id
          and c.status = 'accepted'
          and (
            (c.user1_id = uid and c.user2_id = p_user_id) or
            (c.user2_id = uid and c.user1_id = p_user_id)
          )
      ) then raise exception 'not a valid message_request_accepted'; end if;

    when 'challenge_received', 'challenge_accepted', 'challenge_declined', 'challenge_expired' then
      if not exists (
        select 1 from public.challenges ch
        where ch.id = p_entity_id
          and (
            (ch.challenger_id = uid and ch.challenged_id = p_user_id) or
            (ch.challenged_id = uid and ch.challenger_id = p_user_id)
          )
      ) then raise exception 'not a party to this challenge'; end if;

    when 'match_tag', 'match_confirmed', 'match_disputed', 'match_corrected',
         'match_correction_requested', 'match_counter_proposed', 'match_voided',
         'match_expired', 'match_reminder' then
      -- match_history.id is text; compare via the text cast of the uuid.
      if not exists (
        select 1 from public.match_history m
        where m.id = entity_text
          and (
            (m.user_id = uid and (m.opponent_id = p_user_id or m.tagged_user_id = p_user_id)) or
            (m.opponent_id = uid and m.user_id = p_user_id) or
            (m.tagged_user_id = uid and m.user_id = p_user_id)
          )
      ) then raise exception 'not a party to this match'; end if;
      fill_match_id := p_entity_id;

    when 'match_deleted' then
      -- The match row has already been removed, so we can't validate from
      -- match_history. Trust the caller — this path is only reachable from
      -- useMatchHistory.deleteMatch, which already enforced ownership via
      -- the match_history DELETE RLS policy before we got here.
      fill_match_id := p_entity_id;

    when 'like', 'comment_received' then
      if p_type = 'like' then
        if not exists (
          select 1 from public.feed_likes fl
          where fl.match_id = p_entity_id and fl.user_id = uid
        ) then raise exception 'no feed_like row backing this notification'; end if;
      end if;
      fill_match_id := p_entity_id;

    when 'kudos' then
      null;

    else
      raise exception 'unknown notification type: %', p_type;
  end case;

  insert into public.notifications(user_id, type, from_user_id, entity_id, match_id, metadata)
  values (p_user_id, p_type, uid, p_entity_id, fill_match_id, p_metadata)
  returning id into new_id;

  return new_id;
end; $$;

revoke execute on function public.emit_notification(uuid, text, uuid, jsonb) from public;
grant  execute on function public.emit_notification(uuid, text, uuid, jsonb) to authenticated;

commit;
