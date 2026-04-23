-- 20260424_conversation_mutes.sql
--
-- Per-user conversation mutes. Same shape as conversation_pins: compound
-- PK on (user_id, conversation_id), RLS scoped to the owner, added to
-- realtime publication with REPLICA IDENTITY FULL so DELETE events carry
-- conversation_id back to the client for multi-device sync.
--
-- Muting is self-only — the OTHER participant never sees any indication,
-- and the conversation otherwise behaves normally. What muting DOES do:
--   • Skips muted convs from the People-tab unread-count badge
--   • (Future) suppresses push notifications for those convs

begin;

create table if not exists public.conversation_mutes (
  user_id         uuid        not null references auth.users(id)     on delete cascade,
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  muted_at        timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index if not exists conversation_mutes_user_id_idx
  on public.conversation_mutes(user_id);

alter table public.conversation_mutes enable row level security;

drop policy if exists "conversation_mutes owner all" on public.conversation_mutes;
create policy "conversation_mutes owner all"
  on public.conversation_mutes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Realtime — so muting on tab A propagates to tab B instantly.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_mutes'
  ) then
    alter publication supabase_realtime add table public.conversation_mutes;
  end if;
end $$;

-- DELETE payloads must carry conversation_id so the client can remove
-- the right row when unmuting from another tab.
alter table public.conversation_mutes replica identity full;

commit;
