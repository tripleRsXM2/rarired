-- 20260423_security_hardening_fix1.sql
--
-- Patch: the profiles_locked_columns_guard trigger blocks client writes
-- to stat columns but ALSO fires during security-definer RPCs like
-- bump_stats_for_match() because auth.uid() stays the caller inside a
-- security-definer context. Detect the definer path via session_user
-- (which IS 'postgres' for every SECURITY DEFINER function owned by
-- postgres) and skip the guard.

begin;

create or replace function public.profiles_locked_columns_guard()
returns trigger language plpgsql as $$
declare
  uid uuid := auth.uid();
begin
  -- Allow when running inside a security-definer function owned by
  -- postgres (session_user is the original login, not the auth user).
  if session_user = 'postgres' then return new; end if;
  if uid is null then return new; end if;
  if tg_op <> 'UPDATE' then return new; end if;
  if new.is_admin is distinct from old.is_admin then
    raise exception 'profiles.is_admin is not user-writable';
  end if;
  if new.ranking_points is distinct from old.ranking_points then
    raise exception 'profiles.ranking_points is not user-writable';
  end if;
  if new.wins is distinct from old.wins then
    raise exception 'profiles.wins is not user-writable';
  end if;
  if new.losses is distinct from old.losses then
    raise exception 'profiles.losses is not user-writable';
  end if;
  if new.matches_played is distinct from old.matches_played then
    raise exception 'profiles.matches_played is not user-writable';
  end if;
  if new.streak_count is distinct from old.streak_count then
    raise exception 'profiles.streak_count is not user-writable';
  end if;
  if new.streak_type is distinct from old.streak_type then
    raise exception 'profiles.streak_type is not user-writable';
  end if;
  return new;
end; $$;

commit;
