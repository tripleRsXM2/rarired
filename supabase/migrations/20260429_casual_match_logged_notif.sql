-- 20260429_casual_match_logged_notif.sql
--
-- Closes the trust gap on casual matches with a linked opponent.
--
-- Today: a freetext-name casual match logs as `confirmed` immediately
-- and the opponent (if linked) is never told. They might scroll past
-- it in the feed days later — too late, and surprising. The match has
-- zero rating impact, but the opponent should still know it was logged
-- against them so they can object if it didn't actually happen.
--
-- This migration is the SQL half of "option 1: notify-only" — it adds
-- a new notification type `casual_match_logged` that the client fires
-- alongside the casual insert (analogous to how match_tag fires for
-- ranked-flow inserts). The notification is INFORMATIONAL — no action
-- required — and lives in the Activity bucket. Tapping it deep-links
-- the recipient to the match in the feed.
--
-- Three things change in this migration:
--
--   1. emit_notification accepts `casual_match_logged` and validates
--      standing the same way it does for match_tag (caller is the
--      submitter, recipient is opponent_id of the match row).
--
--   2. cleanup_match_notifications() — the AFTER UPDATE/DELETE trigger
--      on match_history — adds the new type to its sweep list, so a
--      voided / deleted match drops the notification too.
--
--   3. Backfill DELETE — same orphan sweep as the existing widen
--      migration, extended to include the new type. Belt + braces;
--      probably zero-row on first run since the type is brand new.
--
-- Standing rule:
--   - Caller must be the submitter (m.user_id = auth.uid()) AND
--   - recipient must be the opponent (m.opponent_id = p_user_id).
--   - We deliberately tighten this vs match_tag (which also accepts
--     tagged_user_id flows) — casual matches don't use the legacy
--     tag flow. opp_id is the only valid recipient.
--
-- Forward-compat: if a future client tries to fire casual_match_logged
-- for a freetext casual (no opponent_id), the standing check fails
-- and the RPC raises. Correct behaviour — there's no recipient to
-- notify if the opp is just a string.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. emit_notification — accept casual_match_logged
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.emit_notification(
  p_user_id   uuid,
  p_type      text,
  p_entity_id uuid default null,
  p_metadata  jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
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
      -- Tighter standing than match_tag: the recipient MUST be the
      -- opponent_id (not the legacy tagged_user_id). Casual matches
      -- never use the tag flow.
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

    when 'pact_proposed', 'pact_confirmed', 'pact_booked',
         'pact_cancelled', 'pact_claimed' then
      if not exists (
        select 1 from public.match_pacts mp
        where mp.id = p_entity_id
          and (
            (mp.proposer_id = uid and mp.partner_id = p_user_id) or
            (mp.partner_id = uid and mp.proposer_id = p_user_id)
          )
      ) then raise exception 'not a party to this pact'; end if;

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
$$;

revoke execute on function public.emit_notification(uuid, text, uuid, jsonb) from public;
grant  execute on function public.emit_notification(uuid, text, uuid, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 2. cleanup_match_notifications() — extend sweep list
-- ─────────────────────────────────────────────────────────────────────
--
-- Mirrors the AFTER UPDATE/DELETE trigger from
-- 20260424_notification_cascade_cleanup.sql. We only need to widen
-- the IN list — the rest of the function is reproduced verbatim so
-- the trigger keeps working unchanged. NEW.id / OLD.id pickup logic
-- is identical to the original.

create or replace function public.cleanup_match_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id text;
  is_terminal boolean;
begin
  if (tg_op = 'DELETE') then
    target_id := old.id;
    is_terminal := true;
  else
    target_id := new.id;
    is_terminal := new.status in ('voided','expired','deleted');
    if not is_terminal then
      return coalesce(new, old);
    end if;
  end if;

  delete from public.notifications
  where match_id::text = target_id
    and type in (
      'match_tag',
      'match_confirmed',
      'match_disputed',
      'match_corrected',
      'match_correction_requested',
      'match_counter_proposed',
      'match_voided',
      'match_expired',
      'match_deleted',
      'match_reminder',
      'casual_match_logged'  -- new in this migration
    );

  return coalesce(new, old);
end; $$;


-- ─────────────────────────────────────────────────────────────────────
-- 3. Orphan sweep — same as the widen migration, with the new type.
-- ─────────────────────────────────────────────────────────────────────
-- Probably zero-row on first run; included so re-running the helper
-- after this migration doesn't leave casual_match_logged rows
-- orphaned by a since-voided / since-deleted parent.

delete from public.notifications n
where n.type = 'casual_match_logged'
  and n.match_id is not null
  and not exists (
    select 1 from public.match_history m where m.id = n.match_id::text
  );

delete from public.notifications n
where n.type = 'casual_match_logged'
  and n.match_id is not null
  and exists (
    select 1 from public.match_history m
    where m.id = n.match_id::text
      and m.status in ('voided','expired','deleted')
  );

commit;
