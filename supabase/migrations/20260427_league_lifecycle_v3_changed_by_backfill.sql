-- 20260427_league_lifecycle_v3_changed_by_backfill.sql
--
-- Module 12 (Slice 2 follow-up) — defensive backfill of
-- leagues.status_changed_by + locked-in code contract.
--
-- Slice 1's migration already backfilled the only legacy non-active
-- rows we knew about (status='archived' from the legacy
-- archive_league code path) by setting status_changed_by = created_by.
-- This migration adds a defensive sweep across **every** non-active
-- status, plus a leaner contract going forward:
--
--   CONTRACT (enforced in code, not yet by CHECK):
--     Every lifecycle RPC (complete_league / archive_league /
--     cancel_league / void_league) MUST set status_changed_by =
--     auth.uid(). The four RPCs already do this; this migration
--     pre-empts any future RPC, admin script, or manual SQL that
--     transitions a league but forgets to stamp the actor.
--
-- Cases covered by the backfill:
--   1. status_changed_by IS NULL AND created_by IS NOT NULL
--      → set status_changed_by = created_by (best available actor —
--        the league owner is the only person allowed to transition
--        in V1, so this is the correct attribution).
--   2. status_changed_by IS NULL AND created_by IS NULL
--      → leave NULL. Documented as "legacy/system": no actor we can
--        reasonably attribute. This case is essentially impossible
--        today (created_by is NOT NULL on the leagues table) but
--        called out in case the column is ever made nullable.
--
-- A future migration may add `CHECK (status = 'active' OR
-- status_changed_by IS NOT NULL OR created_by IS NULL)` to make this
-- a hard guarantee. Deferred from V1 because a CHECK during a busy
-- migration window would risk blocking a legitimate edge case we
-- haven't enumerated yet.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Defensive backfill — case 1
-- ─────────────────────────────────────────────────────────────────────

with backfilled as (
  update public.leagues
  set status_changed_by = created_by
  where status_changed_by is null
    and created_by      is not null
    and status         <> 'active'
  returning id, status, created_by
)
select 'changed_by_backfill' as op,
       count(*)              as rows_filled,
       count(distinct status) as statuses_touched
from backfilled;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Audit query for documentation purposes
-- ─────────────────────────────────────────────────────────────────────
--
-- Stamps the current shape of the table into a one-shot SELECT so the
-- migration log captures "after-state" alongside the change. No DDL.

select
  status,
  count(*)                                                                       as total,
  count(*) filter (where status_changed_by is null and created_by is not null)   as still_missing_fixable,
  count(*) filter (where status_changed_by is null and created_by is null)       as legacy_no_actor,
  count(*) filter (where status_changed_by is not null)                          as actor_set
from public.leagues
group by status
order by status;

commit;
