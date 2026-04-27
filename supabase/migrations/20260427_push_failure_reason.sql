-- 20260427_push_failure_reason.sql
--
-- Add a diagnostic `last_failure_reason` column to push_subscriptions
-- so the send-push Edge Function can persist whatever the upstream
-- push service (Apple APNs / FCM / Mozilla / WNS) returned when a
-- delivery attempt failed.
--
-- Today the function captures errors but only returns them to the
-- caller — they never get logged anywhere durable. When a push
-- silently fails on iOS we have no way to know whether APNs
-- rejected with 401 (VAPID), 413 (payload size), 5xx (server
-- error), or something else. Persisting the reason makes
-- diagnostics possible without cracking open Supabase function
-- logs.
--
-- Idempotent + additive — always safe to re-run.

begin;

alter table public.push_subscriptions
  add column if not exists last_failure_reason text;

commit;
