-- 20260423_conversation_pins.sql
--
-- Per-user pinned conversations. A separate (user_id, conversation_id) row
-- is cleaner than two boolean columns on `conversations` because:
--   • RLS policy is trivial (user_id = auth.uid())
--   • Realtime subscription filter is just user_id, scales as members grow
--   • Pinning is a client-owned affordance — doesn't belong on the shared
--     conversation row
--
-- Idempotent.

begin;

create table if not exists public.conversation_pins (
  user_id         uuid        not null references auth.users(id)        on delete cascade,
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  pinned_at       timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index if not exists conversation_pins_user_idx
  on public.conversation_pins (user_id, pinned_at desc);

alter table public.conversation_pins enable row level security;

drop policy if exists "conversation_pins owner all" on public.conversation_pins;

create policy "conversation_pins owner all"
  on public.conversation_pins
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Add to the realtime publication so clients can subscribe.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_pins'
  ) then
    alter publication supabase_realtime add table public.conversation_pins;
  end if;
end $$;

-- REPLICA IDENTITY FULL so DELETE payloads carry the row we need to
-- unsubscribe in the UI (the primary key alone isn't enough — we want
-- the conversation_id back).
alter table public.conversation_pins replica identity full;

commit;
