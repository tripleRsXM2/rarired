-- 20260424_match_pacts.sql
--
-- TINDIS: the "booking receipt" tab. A match_pact is the metadata
-- around a planned-but-not-yet-played match: who's involved, where, when,
-- who's booking, and (optionally) how the cost is split.
--
-- The app deliberately does NOT handle money. The split + paid flags
-- are a ledger for the two players; actual transfer happens via their
-- own wallet (PayID in AU, Venmo/PayPal/etc elsewhere).
--
-- A pact may be:
--   • direct   → partner_id set at creation; proposer_agreed = true,
--                partner_agreed = false until accepted.
--   • open     → partner_id null, status = 'proposed'; anyone in the
--                same zone (+ skill filter if set) can "claim" it,
--                which assigns themselves as partner_id.
--
-- Lifecycle:
--   proposed   → both must agree before the Book CTA unlocks
--   confirmed  → both agreed, ready for someone to book
--   booked     → booked_by filled in, booking_ref + cost optional
--   played     → match_id set (pact has been promoted to a match_history row)
--   cancelled  → either party cancelled
--   expired    → proposed pact passed expires_at without both agreeing
--
-- Expiry: 48h from creation on a 'proposed' pact. Client sweep + a
-- scheduled server sweep flip status to 'expired' and optionally
-- clean up (not in this migration — v1 is client-driven).

begin;

create table if not exists public.match_pacts (
  id uuid primary key default gen_random_uuid(),

  proposer_id uuid not null references public.profiles(id) on delete cascade,
  partner_id  uuid          references public.profiles(id) on delete cascade,

  zone_id     text,                 -- denormalised from venue → zone for open-court search
  venue       text not null,
  court       text,
  scheduled_at timestamptz not null,
  skill       text,                 -- for open-court filter; mirrors profiles.skill
  message     text,                 -- freeform note, 280 char soft cap on client

  proposer_agreed boolean not null default true,
  partner_agreed  boolean not null default false,

  status text not null default 'proposed'
    check (status in ('proposed','confirmed','booked','played','cancelled','expired')),

  booked_by   uuid references public.profiles(id) on delete set null,
  booking_ref text,
  total_cost_cents int,

  split_mode text not null default '50_50'
    check (split_mode in ('50_50','proposer_pays','partner_pays','custom')),
  proposer_share_cents int,
  partner_share_cents  int,

  proposer_paid boolean not null default false,
  partner_paid  boolean not null default false,

  match_id text references public.match_history(id) on delete set null,

  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists match_pacts_proposer_idx    on public.match_pacts(proposer_id);
create index if not exists match_pacts_partner_idx     on public.match_pacts(partner_id);
create index if not exists match_pacts_open_idx        on public.match_pacts(status, zone_id) where partner_id is null and status = 'proposed';
create index if not exists match_pacts_scheduled_idx   on public.match_pacts(scheduled_at);
create index if not exists match_pacts_expires_idx     on public.match_pacts(expires_at) where status = 'proposed';

-- updated_at auto-bump on any UPDATE.
create or replace function public.match_pacts_bump_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_match_pacts_updated_at on public.match_pacts;
create trigger trg_match_pacts_updated_at
  before update on public.match_pacts
  for each row execute function public.match_pacts_bump_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────
-- SELECT: proposer, partner, OR anyone if it's an open court still in
-- the 'proposed' state. Claimed pacts become private.
-- INSERT: proposer = auth.uid()
-- UPDATE: proposer or partner (server-side partner gating for open
-- courts happens at the claim RPC).
-- DELETE: proposer only (hard delete; normally users cancel instead).
--
alter table public.match_pacts enable row level security;

drop policy if exists match_pacts_select on public.match_pacts;
create policy match_pacts_select on public.match_pacts
  for select using (
    auth.uid() = proposer_id
    or auth.uid() = partner_id
    or (partner_id is null and status = 'proposed')
  );

drop policy if exists match_pacts_insert on public.match_pacts;
create policy match_pacts_insert on public.match_pacts
  for insert with check (auth.uid() = proposer_id);

drop policy if exists match_pacts_update on public.match_pacts;
create policy match_pacts_update on public.match_pacts
  for update using (
    auth.uid() = proposer_id or auth.uid() = partner_id
  );

drop policy if exists match_pacts_delete on public.match_pacts;
create policy match_pacts_delete on public.match_pacts
  for delete using (auth.uid() = proposer_id);

-- ── RPC: claim_open_pact ───────────────────────────────────────────────
-- Atomic claim for an open court. Blocks a race between two users
-- tapping Claim at the same time. Sets partner_id = caller, flips the
-- pact to 'proposed' with partner_agreed = true (the claim implies
-- agreement to the proposer's terms), and returns the row. The
-- proposer still needs to re-affirm (re-tap Agree) to reach
-- 'confirmed' — this mirrors the direct-pact bilateral gate.
create or replace function public.claim_open_pact(p_pact_id uuid)
returns public.match_pacts
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  row public.match_pacts%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  update public.match_pacts
     set partner_id = uid,
         partner_agreed = true,
         -- Re-reset proposer_agreed so they must re-affirm now that
         -- there's a real partner. Prevents a drive-by claim turning a
         -- stale open posting into an irrevocable commitment.
         proposer_agreed = false,
         expires_at = now() + interval '48 hours'
   where id = p_pact_id
     and partner_id is null
     and status = 'proposed'
     and proposer_id <> uid
   returning * into row;

  if not found then
    raise exception 'open_pact_unavailable';
  end if;

  return row;
end; $$;

revoke execute on function public.claim_open_pact(uuid) from public;
grant  execute on function public.claim_open_pact(uuid) to authenticated;

-- ── Realtime ───────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_pacts'
  ) then
    alter publication supabase_realtime add table public.match_pacts;
  end if;
end $$;

-- REPLICA IDENTITY FULL so DELETE payloads carry user ids for client
-- filtering (same pattern we use on notifications + direct_messages).
alter table public.match_pacts replica identity full;

commit;
