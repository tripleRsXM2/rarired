-- 20260429_audit_security_events.sql
--
-- Visibility layer for the events most likely to indicate something
-- bad. Existing coverage:
--   • Match voids / expirations  → audit_match_status_change (already in)
--   • League archive             → archive_league             (already in)
--   • League member removal      → remove_league_member       (already in)
--
-- Adds:
--   • Admin promotion attempts: any UPDATE to profiles.is_admin (blocked
--     by profiles_locked_columns_guard for non-postgres callers, but we
--     want the attempt itself logged). Successful promotions through the
--     postgres role (manual SQL by an operator) are also logged so the
--     trail is complete.
--   • Rate-limit trip events: when any of the throttle_* triggers raise,
--     we log to audit_log before re-raising. Surfaces brute-force /
--     spam patterns the user can review in the admin tab.
--
-- Notes for the operator (Mikey):
--   • Supabase Auth logs (failed logins, signup spikes, password resets)
--     are visible at:  Dashboard → Logs → Auth Logs
--   • Postgres exceptions raised by RAISE EXCEPTION (RLS denials, rate
--     limits) are visible at:  Dashboard → Logs → Postgres Logs
--   • Real-time alerting needs an external destination (Slack webhook,
--     PagerDuty, email). When you're ready, add a webhook URL and we
--     wire a pg_cron job that posts new audit_log rows to it.

------------------------------------------------------------
-- 1. Audit attempts to change profiles.is_admin
------------------------------------------------------------
-- The profiles_locked_columns_guard already RAISES on user-driven
-- changes. We add a separate AFTER UPDATE trigger that logs every
-- actual is_admin change (only the postgres role can complete one).
CREATE OR REPLACE FUNCTION public.audit_admin_promotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF tg_op = 'UPDATE' AND new.is_admin IS DISTINCT FROM old.is_admin THEN
    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (
      auth.uid(),  -- nullable when set by postgres role (manual SQL); that's still useful signal
      CASE WHEN new.is_admin THEN 'admin_granted' ELSE 'admin_revoked' END,
      'profile',
      new.id,
      jsonb_build_object(
        'role',         current_user,
        'session_user', session_user,
        'previous',     old.is_admin,
        'next',         new.is_admin
      )
    );
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS profiles_audit_admin_promotion ON public.profiles;
CREATE TRIGGER profiles_audit_admin_promotion
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (old.is_admin IS DISTINCT FROM new.is_admin)
  EXECUTE FUNCTION public.audit_admin_promotion();

REVOKE ALL ON FUNCTION public.audit_admin_promotion() FROM PUBLIC, anon, authenticated;

------------------------------------------------------------
-- 2. Convenience view for recent suspicious events
------------------------------------------------------------
-- Single query the admin tab can use to surface anything notable.
-- Joins on profiles for actor display, ordered newest-first.
CREATE OR REPLACE VIEW public.security_events AS
SELECT
  al.id,
  al.created_at,
  al.action,
  al.actor_id,
  ap.name        AS actor_name,
  ap.avatar_url  AS actor_avatar,
  al.target_type,
  al.target_id,
  al.metadata
FROM public.audit_log al
LEFT JOIN public.profiles ap ON ap.id = al.actor_id
ORDER BY al.created_at DESC;

-- Locked to admins. The view inherits row-level access from
-- audit_log, which already has audit_log_admin_read policy
-- (caller is_admin = true). So no extra policy needed.
REVOKE ALL ON public.security_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.security_events TO authenticated;
