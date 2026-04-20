-- message_reads_participant_select.sql
--
-- Allow BOTH participants of a conversation to SELECT each other's rows in
-- message_reads. This is what drives the "Seen" read-receipt indicator:
-- the client needs to fetch the partner's last_read_at for the active
-- conversation and subscribe to realtime updates on it.
--
-- Previously, any SELECT policy was most likely scoped to `user_id = auth.uid()`,
-- meaning you could only read your own read timestamps. That makes receipts
-- impossible since the partner's row is invisible to you.
--
-- Idempotent — drops any older "participants can read" policy before recreating.

begin;

alter table public.message_reads enable row level security;

-- Drop any prior version of this policy so this migration is re-runnable.
drop policy if exists "Participants can read message_reads" on public.message_reads;

create policy "Participants can read message_reads"
on public.message_reads
for select
using (
  exists (
    select 1
    from public.conversations c
    where c.id = message_reads.conversation_id
      and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
  )
);

commit;
