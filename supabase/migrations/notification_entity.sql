-- Adds entity_id and metadata to notifications.
-- entity_id = the friend_request id OR conversation_id being referenced.
-- metadata  = optional JSON payload (e.g. message preview text).
--
-- Run in Supabase SQL editor.

alter table public.notifications
  add column if not exists entity_id  uuid;

alter table public.notifications
  add column if not exists metadata   jsonb;

-- Optional: speeds up "clear all message notifications for this convo" queries.
create index if not exists idx_notifications_entity
  on public.notifications (user_id, type, entity_id);
