-- 20260423_dm_sender_update.sql
--
-- Fix: unsend / edit of direct_messages silently failed. The only UPDATE
-- policy on direct_messages was "Users can mark read" with qual
--   (auth.uid() = receiver_id)
-- but direct_messages has no `receiver_id` column (schema was migrated
-- to conversation-centric long ago). That made every UPDATE match 0
-- rows with no error surfaced to the client — users' unsends "worked"
-- optimistically, then came back on refresh.
--
-- Replace with a proper policy: the sender can update their own
-- message (content, edited_at, deleted_at). Participants can still read.
--
-- Idempotent.

begin;

drop policy if exists "Users can mark read" on public.direct_messages;
drop policy if exists "Sender can update own message" on public.direct_messages;

create policy "Sender can update own message"
  on public.direct_messages for update
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

commit;
