-- 20260424_profiles_realtime.sql
--
-- Add public.profiles to the supabase_realtime publication so UPDATE
-- events (last_active heartbeat, show_online_status toggle,
-- show_last_seen toggle, avatar change) stream to subscribers.
--
-- useSocialGraph + useDMs now listen on profiles UPDATE and patch
-- cached partner rows in place, so dots / "Active now" / "Last seen"
-- flip without a page refresh.

begin;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

commit;
