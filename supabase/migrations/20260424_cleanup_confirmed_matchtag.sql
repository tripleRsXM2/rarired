-- 20260424_cleanup_confirmed_matchtag.sql
--
-- Bug: match_tag notifications linger in the tray for already-confirmed
-- matches.
--
-- Root cause: the `cleanup_match_notifications` trigger (added in
-- 20260424_notification_cascade_cleanup.sql) only fires on terminal
-- statuses (voided / expired / deleted). When a match transitions
-- pending_confirmation → confirmed we emit a match_confirmed notif to
-- the submitter, but the original match_tag (+ any reminder) stays on
-- the opponent's tray. Client-side, the Review-drawer path to confirm
-- *does* dismiss the notif, but any alternative confirm path (e.g.
-- opening the drawer from RightPanel with notifId:null, confirming on
-- a second device, confirming before the tray was even loaded) leaves
-- the action row behind.
--
-- Fix: widen the trigger to also act on transitions into 'confirmed',
-- dropping the PRE-resolution types (match_tag, match_reminder,
-- match_correction_requested). Leave match_confirmed itself alone —
-- that's the receipt we want the submitter to see.
--
-- Also: one-shot backfill wipes the stale match_tag + match_reminder
-- rows that are already sitting on notifications whose parent match is
-- now confirmed.

begin;

create or replace function public.cleanup_match_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_id text;
  drop_all boolean := false;
begin
  if tg_op = 'DELETE' then
    target_id := old.id;
    drop_all  := true;
  else
    if new.status is distinct from old.status then
      if new.status in ('voided', 'expired', 'deleted') then
        target_id := new.id;
        drop_all  := true;
      elsif new.status = 'confirmed' then
        target_id := new.id;
        drop_all  := false;   -- keep match_confirmed; drop the rest below
      else
        return new;
      end if;
    else
      return new;
    end if;
  end if;

  if drop_all then
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
  else
    -- Confirmed branch — only drop the PRE-resolution action items that
    -- are no longer actionable. match_confirmed itself is the positive
    -- receipt and stays.
    delete from public.notifications
    where match_id::text = target_id
      and type in (
        'match_tag',
        'match_reminder',
        'match_correction_requested'
      );
  end if;

  return coalesce(new, old);
end; $$;

-- Trigger is already attached from the prior migration; CREATE OR REPLACE
-- on the function is enough. Re-attach defensively in case of drift.
drop trigger if exists cleanup_match_notifs_trg on public.match_history;
create trigger cleanup_match_notifs_trg
  after update or delete on public.match_history
  for each row execute function public.cleanup_match_notifications();

-- ─────────────────────────────────────────────────────────────────────
-- One-shot backfill for already-stale rows.
-- ─────────────────────────────────────────────────────────────────────
delete from public.notifications n
 where n.type in ('match_tag','match_reminder','match_correction_requested')
   and n.match_id is not null
   and exists (
     select 1 from public.match_history m
      where m.id = n.match_id::text
        and m.status = 'confirmed'
   );

commit;
