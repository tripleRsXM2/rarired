-- 20260424_payment_handle_and_pact_notifs.sql
--
-- Two concerns, one file:
--
-- 1. Add `payment_handle` + `payment_method` to profiles. Users opt in
--    to P2P payment deep-links by filling these; we never transmit money.
--    method ∈ {'payid','venmo','paypal','beem','zelle','other'}.
--
-- 2. Widen emit_notification to accept the pact_* notification types
--    fired by usePacts (pact_proposed, pact_confirmed, pact_booked,
--    pact_cancelled, pact_claimed). Standing: caller must be a party
--    to the pact (proposer or partner). Uses entity_id = pact.id.

begin;

-- ── Profiles: payment handle ──────────────────────────────────────────
alter table public.profiles
  add column if not exists payment_handle text,
  add column if not exists payment_method text check (payment_method in
    ('payid','venmo','paypal','beem','zelle','other'));

-- locked-columns guard lives in a separate trigger. payment_handle is
-- user-writable by design, so nothing to add there.

-- ── emit_notification: accept pact_* types ────────────────────────────
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
      fill_match_id := p_entity_id;

    when 'pact_proposed', 'pact_confirmed', 'pact_booked',
         'pact_cancelled', 'pact_claimed' then
      -- Caller must be a party to the pact. For pact_claimed the partner
      -- was just filled in by the claim RPC; for pact_proposed we may be
      -- emitting on the same tick as an INSERT so the row exists.
      if not exists (
        select 1 from public.match_pacts p
        where p.id = p_entity_id
          and (p.proposer_id = uid or p.partner_id = uid)
          and (p.proposer_id = p_user_id or p.partner_id = p_user_id)
      ) then raise exception 'not a party to this pact'; end if;

    when 'like', 'comment_received' then
      if p_type = 'like' then
        if not exists (
          select 1 from public.feed_likes fl
          where fl.match_id = p_entity_id and fl.user_id = uid
        ) then raise exception 'no feed_like row backing this notification'; end if;
      end if;
      fill_match_id := p_entity_id;

    when 'kudos' then null;

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
