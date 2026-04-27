-- 20260427_lock_profile_delete.sql
--
-- Lock down DELETE on public.profiles. The existing 'own profile'
-- policy is FOR ALL — meaning users can SELECT, INSERT, UPDATE,
-- AND DELETE their own row via PostgREST. There is zero app code
-- that does .delete() against profiles, so the DELETE permission
-- is a 'never used, always loaded gun' — exactly the configuration
-- that caused Mdawg's profile to disappear yesterday with no
-- recoverable evidence of who did it.
--
-- This migration splits the FOR ALL policy into the three commands
-- the app actually needs (INSERT, SELECT, UPDATE) and removes the
-- DELETE permission entirely from authenticated users. Account
-- deletion (the legitimate "delete me" path) goes through Supabase
-- Auth's user-delete admin API, not a row-level client DELETE.
--
-- The audit_profile_delete trigger we added Apr-27 stays — it now
-- only fires for postgres-role / migration deletes, which is
-- exactly the high-signal case we want logged.

-- 1. Drop the old wide-open policy.
DROP POLICY IF EXISTS "own profile" ON public.profiles;

-- 2. Recreate as three explicit policies with no DELETE branch.
--    SELECT visibility is owned by the existing 'profiles_read'
--    policy (privacy-aware), so we don't need a duplicate here —
--    the user's own profile is already covered by the id=auth.uid()
--    branch of profiles_read.

CREATE POLICY "own profile insert"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "own profile update"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Note: no DELETE policy. Without one, RLS denies DELETE for the
-- authenticated role by default. service_role + postgres still
-- bypass RLS so admin paths and cron jobs (none today) keep working.
