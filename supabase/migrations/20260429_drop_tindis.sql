-- 20260429_drop_tindis.sql
--
-- Retire the Tindis match-pact feature. Pre-launch decision — the
-- pact-confirmation surface (propose → agree → book → split → mark
-- paid) was carrying too much weight for an unproven primitive.
-- Dropped here so the schema reflects the live product.
--
-- What goes:
--   • match_pacts table (and the trigger that bumps updated_at)
--   • claim_open_pact RPC
--   • sweep_stale_pacts RPC
--   • match_pacts_bump_updated_at function (table-attached trigger)
--   • pact_* notification cases inside emit_notification
--   • Any audit_log rows referencing 'pact' targets stay (history).
--
-- Existing notification rows of type pact_* are NOT deleted — they
-- become inert (the client no longer renders CTAs for them and
-- emit_notification will reject any new ones via the 'unknown type'
-- fallback). If the operator wants them gone they can DELETE on
-- demand from the dashboard.

-- 1. Drop the dedicated cron sweep + claim RPCs.
DROP FUNCTION IF EXISTS public.claim_open_pact(uuid);
DROP FUNCTION IF EXISTS public.claim_open_pact(text);
DROP FUNCTION IF EXISTS public.sweep_stale_pacts();

-- 2. Rewrite emit_notification: strip the pact_* case so any caller
--    that still sends one falls through to the 'unknown type'
--    exception. Same body as the previous version with that case
--    removed.
CREATE OR REPLACE FUNCTION public.emit_notification(p_user_id uuid, p_type text, p_entity_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

    when 'casual_match_logged' then
      if not exists (
        select 1 from public.match_history m
        where m.id = entity_text
          and m.user_id = uid
          and m.opponent_id = p_user_id
          and m.match_type = 'casual'
      ) then raise exception 'not a casual match between the caller (submitter) and recipient (opponent)'; end if;
      fill_match_id := p_entity_id;

    when 'match_deleted' then
      fill_match_id := p_entity_id;

    when 'match_invite_claimed', 'match_invite_declined' then
      if not exists (
        select 1 from public.match_invites mi
        where mi.id = p_entity_id
          and mi.invited_by = p_user_id
          and (mi.claimed_by = uid or mi.declined_by = uid)
      ) then raise exception 'not a party to this invite'; end if;

    -- (pact_* cases retired with the Tindis feature.)

    when 'league_invite', 'league_joined' then
      null;

    else
      raise exception 'unknown notification type: %', p_type;
  end case;

  insert into notifications (user_id, type, from_user_id, match_id, entity_id, metadata)
  values (p_user_id, p_type, uid, fill_match_id::text, p_entity_id, p_metadata)
  returning id into new_id;
  return new_id;
end;
$function$;

-- 3. Drop the table-attached trigger function and the table itself.
--    The trigger is dropped automatically by the table drop, but we
--    null the function explicitly so it doesn't linger as orphaned
--    code. CASCADE on the table covers any FK references that other
--    tables may have (notifications.entity_id is a uuid, not an FK,
--    so the table drop is safe).
DROP TABLE IF EXISTS public.match_pacts CASCADE;
DROP FUNCTION IF EXISTS public.match_pacts_bump_updated_at();
