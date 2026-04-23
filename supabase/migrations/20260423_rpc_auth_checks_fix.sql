-- 20260423_rpc_auth_checks_fix.sql
--
-- Patch: bump_stats_for_match compares uuid param against text id column.
-- Add an explicit cast so the auth check fires cleanly instead of
-- raising a type-coercion error.

begin;

create or replace function public.bump_stats_for_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  is_party boolean;
begin
  if session_user <> 'postgres' then
    if uid is null then raise exception 'not authenticated'; end if;
    select exists(
      select 1 from public.match_history m
      where m.id = p_match_id::text
        and (m.user_id = uid or m.opponent_id = uid or m.tagged_user_id = uid)
    ) into is_party;
    if not is_party then raise exception 'not a party to this match'; end if;
  end if;
  perform public.apply_match_outcome(p_match_id::text);
end; $$;

commit;
