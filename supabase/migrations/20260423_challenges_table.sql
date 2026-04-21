-- Module 4 — lightweight challenges / rematches.
--
-- One challenge = one user proposing a future match against another user.
-- Intentionally minimal:
--   - one challenger, one challenged_id (no broadcast/multi-target)
--   - optional proposed_at, venue, court, message (all freetext)
--   - simple state machine: pending -> accepted | declined | expired
--   - on conversion to a match, status flips to 'completed' and match_id is set
-- No timeslots, no calendar, no chat thread, no payments. Future extensions
-- (recurring, doubles, multi-target) explicitly out of scope.
--
-- Idempotent: create table if not exists, RLS policies are dropped + recreated.

create table if not exists public.challenges (
  id              uuid primary key default gen_random_uuid(),
  challenger_id   uuid not null references auth.users(id) on delete cascade,
  challenged_id   uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'pending'
                  check (status in ('pending','accepted','declined','expired','completed')),
  -- Proposed match details (all optional — a "play sometime" challenge is valid).
  proposed_at     timestamptz,        -- suggested match time
  venue           text,
  court           text,
  message         text check (char_length(message) <= 280),
  -- When converted into a real logged match. match_history.id is text in our
  -- current schema, so we mirror that and reference it. on delete set null
  -- leaves the challenge audit-able even if the match row gets deleted.
  match_id        text references public.match_history(id) on delete set null,
  -- Lifecycle timestamps.
  created_at      timestamptz not null default now(),
  responded_at    timestamptz,        -- accept/decline/expire timestamp
  completed_at    timestamptz,        -- when converted to a match
  -- Hygiene.
  constraint challenges_no_self
    check (challenger_id <> challenged_id)
);

create index if not exists idx_challenges_challenged_status
  on public.challenges (challenged_id, status, created_at desc);

create index if not exists idx_challenges_challenger_status
  on public.challenges (challenger_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.challenges enable row level security;

drop policy if exists challenges_select_party on public.challenges;
create policy challenges_select_party
  on public.challenges for select
  to authenticated
  using (challenger_id = auth.uid() or challenged_id = auth.uid());

drop policy if exists challenges_insert_self on public.challenges;
create policy challenges_insert_self
  on public.challenges for insert
  to authenticated
  with check (challenger_id = auth.uid());

-- Either party can mutate (challenger to cancel, challenged to accept/decline).
-- We don't write a SECURITY DEFINER RPC for this; the client does the update
-- directly under RLS. Status transitions are validated client-side and by the
-- check constraint on `status`.
drop policy if exists challenges_update_party on public.challenges;
create policy challenges_update_party
  on public.challenges for update
  to authenticated
  using (challenger_id = auth.uid() or challenged_id = auth.uid())
  with check (challenger_id = auth.uid() or challenged_id = auth.uid());

drop policy if exists challenges_delete_challenger on public.challenges;
create policy challenges_delete_challenger
  on public.challenges for delete
  to authenticated
  using (challenger_id = auth.uid());

grant select, insert, update, delete on public.challenges to authenticated;

-- ---------------------------------------------------------------------------
-- Auto-expire stale pending challenges (7 days). Wired into the existing
-- pg_cron job by adding a separate scheduled call. Keeps the function
-- composable.
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_challenges()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    update public.challenges
       set status       = 'expired',
           responded_at = now()
     where status = 'pending'
       and created_at < now() - interval '7 days'
    returning id, challenger_id, challenged_id
  loop
    -- Notify the challenger that their challenge expired.
    if not exists (
      select 1 from notifications
       where user_id = r.challenger_id
         and type    = 'challenge_expired'
         and entity_id = r.id
    ) then
      insert into notifications (user_id, type, from_user_id, entity_id)
      values (r.challenger_id, 'challenge_expired', r.challenged_id, r.id);
    end if;
  end loop;
end;
$$;

grant execute on function public.expire_stale_challenges() to authenticated, anon;

-- Schedule: run every 4 hours (challenges expire less urgently than matches).
-- Skip if pg_cron isn't available in this environment.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('expire-stale-challenges');
  end if;
exception when others then
  null;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'expire-stale-challenges',
      '0 */4 * * *',
      $cron$ select public.expire_stale_challenges(); $cron$
    );
  end if;
exception when others then
  null;
end $$;
