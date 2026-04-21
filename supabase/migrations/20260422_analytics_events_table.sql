-- Module 3.5 — analytics foundation.
--
-- Single events table. Every user-visible action writes one row. Writes are
-- fire-and-forget from the client; nothing in this table is ever read from
-- the client (RLS hides reads from anon/authenticated). Reads happen via
-- service_role queries (Supabase SQL editor, BI tools, future pipeline).
--
-- Schema is deliberately narrow:
--   event  text — the event name (e.g. 'match_logged', 'profile_viewed').
--   props  jsonb — typed payload, schema varies per event.
--   user_id — who fired it (nullable so we can add pre-auth landing events later).
--   session_id — client-generated UUID per tab session (stringified, not uuid type
--                because we don't enforce the format server-side).
--   created_at — the only time field; clock is Postgres, not client.
--
-- Indexes cover the two main query patterns: "all X events ordered by time"
-- and "everything user Y did, newest first".

create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  event      text not null,
  props      jsonb not null default '{}'::jsonb,
  session_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_event_created
  on public.events (event, created_at desc);

create index if not exists idx_events_user_created
  on public.events (user_id, created_at desc);

-- RLS — writes open to any authenticated user (they can only attribute
-- events to themselves via user_id; we enforce that in the policy).
-- Reads explicitly blocked for normal clients — service_role bypasses RLS
-- and is the only path that can query the table.

alter table public.events enable row level security;

drop policy if exists events_insert_self on public.events;
create policy events_insert_self
  on public.events for insert
  to authenticated
  with check (user_id = auth.uid() or user_id is null);

-- No select policy = nothing is readable by anon/authenticated.
-- (If we later want users to see their own activity, add one.)

grant insert on public.events to authenticated, anon;
