-- 20260427_audit_profile_deletes.sql
--
-- Tripwire: catch any future DELETE on public.profiles. Mdawg's
-- profile row went missing on 2026-04-27 with no audit trail —
-- no entry in audit_log, no app code that calls .delete() against
-- profiles, no migration that touched rows, no FK cascading from
-- auth.users (no FK exists). Most plausible cause was a manual
-- dashboard SQL editor delete or a client-side debug action that
-- isn't in the current codebase.
--
-- Without a DELETE-aware trigger, we can't tell what happened.
-- This adds one. Every DELETE on public.profiles now lands a row
-- in audit_log with the actor's auth.uid(), the row's snapshot,
-- and the role/session_user (postgres = manual SQL or migration;
-- authenticated = client RLS path; service_role = admin API).

CREATE OR REPLACE FUNCTION public.audit_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(),
    'profile_deleted',
    'profile',
    OLD.id,
    jsonb_build_object(
      'role',         current_user,
      'session_user', session_user,
      'name',         OLD.name,
      'avatar_url',   OLD.avatar_url,
      'home_zone',    OLD.home_zone,
      'skill',        OLD.skill
    )
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS profiles_audit_delete ON public.profiles;
CREATE TRIGGER profiles_audit_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_profile_delete();

REVOKE ALL ON FUNCTION public.audit_profile_delete() FROM PUBLIC, anon, authenticated;
