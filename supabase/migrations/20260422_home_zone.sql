-- 20260422_home_zone.sql
--
-- Adds `home_zone` to profiles — the CourtSync matchmaking zone a user has
-- self-declared as their home court area. Drives:
--   1. Home-pin on the Map tab over the declared zone
--   2. "Players in this zone" discovery list inside each zone's side panel
--   3. Zone-based relevance later (rematches / challenges near home)
--
-- Values are the six zone IDs used on the client:
--   'cbd' | 'east' | 'inner-west' | 'lower-north' | 'northern-beaches' | 'south'
-- Null = no home declared. Nullable by design — users opt in.
--
-- Idempotent.

begin;

alter table public.profiles
  add column if not exists home_zone text;

-- Optional constraint to keep the column honest. Dropped-and-recreated so
-- re-runs don't error if we later change the zone set.
alter table public.profiles
  drop constraint if exists profiles_home_zone_check;

alter table public.profiles
  add constraint profiles_home_zone_check
  check (home_zone is null or home_zone in (
    'cbd','east','inner-west','lower-north','northern-beaches','south'
  ));

-- Index because the Map tab reads counts grouped by home_zone.
create index if not exists profiles_home_zone_idx
  on public.profiles (home_zone)
  where home_zone is not null;

commit;
