-- 20260425_profile_played_courts.sql
--
-- Phase 1a of the map-pivot: add `played_courts` to profiles so users
-- can self-tag the venues they actually play at. Feeds the sorted
-- player list on CourtInfoCard (Phase 2) + the ranking that comes
-- under it — your skill + availability overlap + "this is one of their
-- home courts" produces a genuine three-factor match signal.
--
-- Shape: `text[]` of curated court names drawn from
-- src/features/map/data/courts.js. Bounded on the client to 8 entries
-- to keep self-reports meaningful; nothing in the DB enforces that cap
-- because (a) SQL arrays aren't a natural place to enforce length
-- without a CHECK constraint, and (b) future work will *also* auto-
-- derive courts from match_history.venue so the hard cap would bite.
--
-- RLS: the existing profiles policies already cover this. Users can
-- update their own profile row; this new column rides along.

begin;

alter table public.profiles
  add column if not exists played_courts text[] default array[]::text[];

commit;
