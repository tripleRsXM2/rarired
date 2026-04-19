-- Presence visibility migration
-- Adds two boolean toggles to profiles so users can hide their online status
-- and last-seen timestamp from other users (WhatsApp-style).
--
-- Backwards compatible: defaults to TRUE (visible) for existing rows.
-- last_active already exists in the schema; nothing to backfill there.

alter table public.profiles
  add column if not exists show_online_status boolean not null default true;

alter table public.profiles
  add column if not exists show_last_seen boolean not null default true;

-- Optional: index to speed up "active in last 5 minutes" queries if ever needed.
create index if not exists idx_profiles_last_active
  on public.profiles (last_active desc);
