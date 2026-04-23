-- 20260424_notification_cascade_cleanup.sql
--
-- Remove stale notifications when the thing they point at goes away.
-- Without this, the tray kept showing "X wants to message you" after
-- the recipient (or sender) deleted the conversation, "match tag" /
-- "match confirmed" after the match was voided, "challenge received"
-- after the challenge expired or was cancelled, and "league invite"
-- after the user left or was removed.
--
-- The cleanup is done in a trigger (not a foreign-key CASCADE) so we
-- can scope it to the right TYPES per parent table — e.g. we don't
-- want to blow away `kudos` notifications when a match gets voided,
-- only the match-status notifications.
--
-- Also flips notifications to REPLICA IDENTITY FULL so the client's
-- DELETE realtime subscription (added in useNotifications) knows
-- which user to drop the row for — default identity only carries the
-- primary key, not user_id.

begin;

-- =========================================================================
-- REPLICA IDENTITY FULL on notifications (for realtime DELETE filtering)
-- =========================================================================

alter table public.notifications replica identity full;

-- =========================================================================
-- 1. Conversations — on DELETE, drop all message-related notifications
--    (message_request, message_request_accepted, message). Legacy `message`
--    rows shouldn't exist anymore but keep for safety.
-- =========================================================================

create or replace function public.cleanup_conv_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications
  where entity_id = old.id
    and type in (
      'message_request',
      'message_request_accepted',
      'message'
    );
  return old;
end; $$;

drop trigger if exists cleanup_conv_notifs_trg on public.conversations;
create trigger cleanup_conv_notifs_trg
  after delete on public.conversations
  for each row execute function public.cleanup_conv_notifications();

-- =========================================================================
-- 2. Match history — on DELETE or status transition into voided / expired
--    / deleted, drop all match notifications for this match_id. The row
--    itself may stay (voided audit), but its action-requesting notif
--    shouldn't keep prompting the user.
-- =========================================================================

create or replace function public.cleanup_match_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_id text;
begin
  if tg_op = 'DELETE' then
    target_id := old.id;
  else
    -- Only act when the match JUST transitioned into a terminal state.
    if new.status is distinct from old.status
       and new.status in ('voided', 'expired', 'deleted') then
      target_id := new.id;
    else
      return new;
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
      'match_reminder'
    );

  return coalesce(new, old);
end; $$;

drop trigger if exists cleanup_match_notifs_trg on public.match_history;
create trigger cleanup_match_notifs_trg
  after update or delete on public.match_history
  for each row execute function public.cleanup_match_notifications();

-- =========================================================================
-- 3. Challenges — on DELETE or status transition into declined / expired /
--    cancelled / converted, drop the challenge notifications. The conv-
--    tray doesn't need to show "Accepted — log result" once the match
--    has been logged (converted) or the challenge was cancelled.
-- =========================================================================

create or replace function public.cleanup_challenge_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_id uuid;
begin
  if tg_op = 'DELETE' then
    target_id := old.id;
  else
    if new.status is distinct from old.status
       and new.status in ('declined', 'expired', 'cancelled', 'converted') then
      target_id := new.id;
    else
      return new;
    end if;
  end if;

  delete from public.notifications
  where entity_id = target_id
    and type in (
      'challenge_received',
      'challenge_accepted',
      'challenge_declined',
      'challenge_expired'
    );

  return coalesce(new, old);
end; $$;

drop trigger if exists cleanup_challenge_notifs_trg on public.challenges;
create trigger cleanup_challenge_notifs_trg
  after update or delete on public.challenges
  for each row execute function public.cleanup_challenge_notifications();

-- =========================================================================
-- 4. League members — on DELETE or status transition into removed /
--    declined / left, drop the invite notification. Note: cleanup is
--    scoped to (league_id + user_id) since a league has many members
--    and we only want to drop THIS user's stale invite.
-- =========================================================================

create or replace function public.cleanup_league_invite_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_league uuid;
  target_user uuid;
begin
  if tg_op = 'DELETE' then
    target_league := old.league_id;
    target_user   := old.user_id;
  else
    if new.status is distinct from old.status
       and new.status in ('removed', 'declined', 'left') then
      target_league := new.league_id;
      target_user   := new.user_id;
    else
      return new;
    end if;
  end if;

  delete from public.notifications
  where user_id   = target_user
    and entity_id = target_league
    and type in ('league_invite');

  return coalesce(new, old);
end; $$;

drop trigger if exists cleanup_league_invite_notifs_trg on public.league_members;
create trigger cleanup_league_invite_notifs_trg
  after update or delete on public.league_members
  for each row execute function public.cleanup_league_invite_notifications();

-- =========================================================================
-- One-time backfill: sweep notifications whose parent is already gone.
-- =========================================================================

-- message_* notifs whose conversation has been deleted.
delete from public.notifications n
where n.type in ('message_request', 'message_request_accepted', 'message')
  and n.entity_id is not null
  and not exists (select 1 from public.conversations c where c.id = n.entity_id);

-- match_* notifs whose match has been voided/expired/deleted.
delete from public.notifications n
where n.type in (
    'match_tag','match_confirmed','match_disputed','match_corrected',
    'match_correction_requested','match_counter_proposed',
    'match_voided','match_expired','match_deleted','match_reminder')
  and n.match_id is not null
  and exists (
    select 1 from public.match_history m
    where m.id = n.match_id::text
      and m.status in ('voided','expired','deleted')
  );

-- challenge_* notifs whose challenge is terminal or gone.
delete from public.notifications n
where n.type in (
    'challenge_received','challenge_accepted','challenge_declined','challenge_expired')
  and n.entity_id is not null
  and (
    not exists (select 1 from public.challenges c where c.id = n.entity_id)
    or exists (
      select 1 from public.challenges c
      where c.id = n.entity_id
        and c.status in ('declined','expired','cancelled','converted')
    )
  );

-- league_invite notifs whose invite has been resolved.
delete from public.notifications n
where n.type = 'league_invite'
  and n.entity_id is not null
  and exists (
    select 1 from public.league_members m
    where m.league_id = n.entity_id
      and m.user_id   = n.user_id
      and m.status in ('removed','declined','left','active')
  );

commit;
