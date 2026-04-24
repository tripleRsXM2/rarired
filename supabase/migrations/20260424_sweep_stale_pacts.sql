-- 20260424_sweep_stale_pacts.sql
--
-- Stale-pact rule v1 (council decision):
--
--   proposed   → expire at expires_at (48h from creation, already done
--                in service layer) — also handled here for safety.
--
--   confirmed  → both agreed, nobody booked. If scheduled_at is >24h in
--                the past, auto-'expired'. They played off-app, flaked,
--                or negotiated out of band — either way, it's stale.
--
--   booked     → someone booked; match never got logged. Grace period of
--                7 days past scheduled_at before we auto-'expired'. Long
--                enough for a busy week, short enough that the History
--                tab doesn't fill with ghosts.
--
--   terminal   → cancelled / expired / played rows older than 30 days
--                hard-delete. match_history still holds the played
--                record separately; the pact is just the commitment
--                artifact and has no ongoing value after a month.
--
-- Exposed as an idempotent SECURITY DEFINER RPC `sweep_stale_pacts()`
-- the client calls on mount of TINDIS + every 60s while visible (same
-- cadence as usePacts' expiry interval). No server cron yet — low
-- volume, the client coverage is sufficient at current scale.

begin;

create or replace function public.sweep_stale_pacts()
returns void
language plpgsql security definer set search_path = public as $$
declare
  now_ts timestamptz := now();
begin
  -- proposed → expired (expires_at elapsed, nobody agreed bilaterally)
  update public.match_pacts
     set status = 'expired'
   where status = 'proposed'
     and expires_at is not null
     and expires_at < now_ts;

  -- confirmed → expired (nobody booked in the 24h after scheduled_at)
  update public.match_pacts
     set status = 'expired'
   where status = 'confirmed'
     and scheduled_at < now_ts - interval '24 hours';

  -- booked → expired (scheduled_at + 7d grace, no match logged)
  update public.match_pacts
     set status = 'expired'
   where status = 'booked'
     and scheduled_at < now_ts - interval '7 days'
     and match_id is null;

  -- hard-delete terminal rows older than 30 days so the History tab
  -- stays useful. match_history keeps the played record.
  delete from public.match_pacts
   where status in ('cancelled','expired','played')
     and updated_at < now_ts - interval '30 days';
end; $$;

revoke execute on function public.sweep_stale_pacts() from public;
grant  execute on function public.sweep_stale_pacts() to authenticated;

commit;
