-- notification_upsert_rpc.sql
--
-- Two problems fixed here:
--
-- 1. upsertMessageNotification was doing DELETE on another user's row, which
--    RLS blocked silently — so every new message stacked a new notification
--    instead of replacing the old one. Fix: a security definer RPC that owns
--    the delete+insert atomically, bypassing the cross-user write restriction.
--    A partial unique index guarantees one notification per (user, conversation).
--
-- 2. message_reads had no INSERT/UPDATE policies, so upsertRead silently
--    failed and there was never a row for fetchPartnerRead to find, killing
--    the "Seen" feature. Fix: add the missing policies.
--
-- Idempotent — safe to re-run.

begin;

-- ── 1. Unique index: one message-notification per conversation per user ────────

create unique index if not exists notifications_message_conv_uniq
  on public.notifications (user_id, entity_id)
  where entity_id is not null and type = 'message';

-- ── 2. Clean up legacy stacked notifications (null entity_id duplicates) ──────

delete from public.notifications
where type = 'message'
  and entity_id is null;

-- ── 3. Security-definer RPC for message notification upsert ──────────────────
--
-- Called by the sender to create/replace a notification on the receiver's
-- behalf. security definer runs with the function owner's rights, bypassing
-- the "can only write own rows" RLS restriction.

create or replace function public.upsert_message_notification(
  p_user_id     uuid,
  p_from_user_id uuid,
  p_entity_id   uuid,
  p_metadata    jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications
    (user_id, type, from_user_id, entity_id, metadata, read, created_at)
  values
    (p_user_id, 'message', p_from_user_id, p_entity_id, p_metadata, false, now())
  on conflict (user_id, entity_id)
    where entity_id is not null and type = 'message'
  do update set
    from_user_id = excluded.from_user_id,
    metadata     = excluded.metadata,
    read         = false,
    created_at   = excluded.created_at;
end;
$$;

grant execute on function public.upsert_message_notification(uuid, uuid, uuid, jsonb) to authenticated;

-- ── 4. message_reads — INSERT and UPDATE policies for "Seen" receipts ─────────
--
-- upsertRead (called on openConversation) fails silently when these are
-- missing, so fetchPartnerRead never finds a row and "Seen" never renders.

alter table public.message_reads enable row level security;

drop policy if exists "Users can upsert own read record" on public.message_reads;

create policy "Users can upsert own read record"
on public.message_reads
for all
using  (user_id = auth.uid())
with check (user_id = auth.uid());

commit;
