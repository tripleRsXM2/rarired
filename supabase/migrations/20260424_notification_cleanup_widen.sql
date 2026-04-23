-- 20260424_notification_cleanup_widen.sql
--
-- Follow-up to 20260424_notification_cascade_cleanup.sql. Two gaps:
--
-- 1. The challenge-status trigger list was missing 'completed' — a
--    challenge that's been accepted + the resulting match has been
--    logged + confirmed transitions to 'completed', and at that point
--    its notifications (challenge_received, challenge_accepted) become
--    stale. Add it.
--
-- 2. After a clean cascade run, we still had notifications whose
--    match_id / entity_id no longer resolves to any row (the parent
--    was fully DELETEd before the trigger existed, or status moved
--    through a state we didn't watch before). The earlier backfill
--    only touched notifs whose parent was still present in a terminal
--    state; orphans were left behind. Widen the backfill to also
--    delete notifs whose parent row is gone entirely.
--
-- Applied to prod. Resulting tray is purely active items.

begin;

-- =========================================================================
-- Re-emit the challenge cleanup function with 'completed' added.
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
       and new.status in ('declined', 'expired', 'cancelled', 'converted', 'completed') then
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

-- =========================================================================
-- Backfill: sweep every notification whose parent is gone or terminal.
-- =========================================================================

-- match_* notifs: drop if match_id doesn't resolve to any row.
delete from public.notifications n
where n.type in (
    'match_tag','match_confirmed','match_disputed','match_corrected',
    'match_correction_requested','match_counter_proposed',
    'match_voided','match_expired','match_deleted','match_reminder')
  and n.match_id is not null
  and not exists (
    select 1 from public.match_history m where m.id = n.match_id::text
  );

-- match_* notifs: also drop if the match exists in a terminal state
-- (we did this in the first migration, rerun in case new rows landed).
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

-- challenge_* notifs: drop if challenge is gone entirely.
delete from public.notifications n
where n.type in (
    'challenge_received','challenge_accepted','challenge_declined','challenge_expired')
  and n.entity_id is not null
  and not exists (select 1 from public.challenges c where c.id = n.entity_id);

-- challenge_* notifs: drop if the challenge is in any resolved state
-- (now including 'completed').
delete from public.notifications n
where n.type in (
    'challenge_received','challenge_accepted','challenge_declined','challenge_expired')
  and n.entity_id is not null
  and exists (
    select 1 from public.challenges c
    where c.id = n.entity_id
      and c.status in ('declined','expired','cancelled','converted','completed')
  );

-- message_* notifs: conversation gone (we already do this on DELETE
-- trigger — rerun in case of historical strays).
delete from public.notifications n
where n.type in ('message_request','message_request_accepted','message')
  and n.entity_id is not null
  and not exists (select 1 from public.conversations c where c.id = n.entity_id);

commit;
