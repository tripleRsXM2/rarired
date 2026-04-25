-- 20260427_push_notifications.sql
--
-- Module 8 — Mobile push notifications (PWA Web Push).
--
-- Adds:
--   1. push_subscriptions       — per-device endpoint+keys, RLS owner-only
--   2. notification_preferences — per-user push category toggles
--   3. notification_push_log    — idempotency for push fan-out per
--                                 in-app notification row
--
-- The actual push *sending* runs in a Supabase Edge Function
-- (supabase/functions/send-push, slice 6). This migration just lays
-- the storage + RLS so the client can subscribe and the Edge
-- Function can read securely via service role.
--
-- Naming: push_subscriptions plural matches the rest of the app
-- (notifications, league_members, etc).

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. push_subscriptions
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.push_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  endpoint          text not null,
  p256dh            text not null,
  auth              text not null,
  user_agent        text,
  device_type       text,            -- 'ios' | 'android' | 'desktop' | 'unknown'
  browser           text,            -- 'chrome' | 'safari' | 'firefox' | 'samsung' | 'edge' | 'unknown'
  is_standalone_pwa boolean,
  enabled           boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_success_at   timestamptz,
  last_failure_at   timestamptz,
  failure_count     int not null default 0,
  unique (user_id, endpoint)
);

comment on table public.push_subscriptions is
  'Per-device Web Push subscription endpoints. RLS: user can only see/manage their own; service role can read all + prune stale.';

create index if not exists push_subscriptions_user_enabled_idx
  on public.push_subscriptions (user_id) where enabled = true;
create index if not exists push_subscriptions_endpoint_idx
  on public.push_subscriptions (endpoint);

-- updated_at trigger (matches the rest of the codebase's pattern of
-- a single shared touch_updated_at() function — define it idempotently).
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_subscriptions_touch_updated_at on public.push_subscriptions;
create trigger push_subscriptions_touch_updated_at
  before update on public.push_subscriptions
  for each row execute function public.touch_updated_at();

alter table public.push_subscriptions enable row level security;

-- Owner-only SELECT. NEVER expose another user's endpoint/keys via
-- a client query — those are the secret material that lets a sender
-- target their phone.
drop policy if exists push_subs_select_own on public.push_subscriptions;
create policy push_subs_select_own on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists push_subs_insert_own on public.push_subscriptions;
create policy push_subs_insert_own on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists push_subs_update_own on public.push_subscriptions;
create policy push_subs_update_own on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists push_subs_delete_own on public.push_subscriptions;
create policy push_subs_delete_own on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- service_role bypasses RLS by default — no extra policy needed.

-- ─────────────────────────────────────────────────────────────────────
-- 2. notification_preferences
-- ─────────────────────────────────────────────────────────────────────
--
-- Per-user push toggles by category. Defaults to ALL ON so a user
-- who's never opened settings still gets push for the events they
-- care about. They opt-out, not opt-in.
--
-- Schema is forward-compatible with quiet hours (start/end + tz)
-- without committing to ship that UI now.

create table if not exists public.notification_preferences (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  match_invites        boolean not null default true,
  match_updates        boolean not null default true,
  result_reviews       boolean not null default true,
  league_updates       boolean not null default true,
  tournament_updates   boolean not null default true,
  ranking_changes      boolean not null default true,
  court_bookings       boolean not null default true,
  system_updates       boolean not null default true,
  quiet_hours_start    time,
  quiet_hours_end      time,
  quiet_hours_tz       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists notification_preferences_touch_updated_at on public.notification_preferences;
create trigger notification_preferences_touch_updated_at
  before update on public.notification_preferences
  for each row execute function public.touch_updated_at();

alter table public.notification_preferences enable row level security;

drop policy if exists notif_prefs_select_own on public.notification_preferences;
create policy notif_prefs_select_own on public.notification_preferences
  for select using (auth.uid() = user_id);

drop policy if exists notif_prefs_upsert_own on public.notification_preferences;
create policy notif_prefs_upsert_own on public.notification_preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists notif_prefs_update_own on public.notification_preferences;
create policy notif_prefs_update_own on public.notification_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Helper: default-on read for a user. Returns the row if it exists,
-- or a synthetic all-true row for users who haven't saved prefs yet.
-- Used by the Edge Function (service role) and by the client UI.
create or replace function public.get_notification_prefs(p_user_id uuid)
returns public.notification_preferences
language sql
stable
as $$
  select coalesce(
    (select np from public.notification_preferences np where np.user_id = p_user_id),
    row(p_user_id, true, true, true, true, true, true, true, true,
        null::time, null::time, null::text, now(), now())::public.notification_preferences
  );
$$;

revoke all on function public.get_notification_prefs(uuid) from public, anon;
grant execute on function public.get_notification_prefs(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 3. notification_push_log (idempotency)
-- ─────────────────────────────────────────────────────────────────────
--
-- One row per in-app notification that we've fanned out as push.
-- Re-firing a push for the same notification_id is a no-op. Lets us
-- safely run the Edge Function from both an insertNotification client
-- callback AND (later) a Postgres trigger without double-pushing.

create table if not exists public.notification_push_log (
  notification_id  uuid primary key references public.notifications(id) on delete cascade,
  sent_at          timestamptz not null default now(),
  device_count     int not null default 0,
  last_error       text
);

comment on table public.notification_push_log is
  'Idempotency ledger: one row per notification.id that has been pushed. Prevents duplicate push when the same event is re-emitted.';

alter table public.notification_push_log enable row level security;

-- Clients have no business reading or writing this. service_role
-- handles all access; no policies for authenticated.

commit;
