-- 20260428_match_invites.sql
--
-- Module 9 — opponent-invite flow.
--
-- Lets a logger create a secure share link for a match against a non-
-- user opponent. Recipient signs in / signs up, claims the invite,
-- then enters the standard pending_confirmation → confirm/dispute
-- pipeline. No fake users, no parallel match truth system.
--
-- New:
--   1. match_invites table + RLS (owner-readable only)
--   2. match_history.status widens to allow 'pending_opponent_claim'
--   3. SECURITY DEFINER RPCs:
--        create_match_invite      — generate token + hash, persist hash only
--        preview_match_invite     — public-callable safe preview
--        claim_match_invite       — claimer attaches to match
--        decline_match_invite     — "this wasn't me"
--        revoke_match_invite      — logger pulls back an unclaimed invite
--
-- Tokens are 32-byte cryptographic random encoded as base64url, hashed
-- with SHA-256 before storage. The raw token is only returned once
-- (from create_match_invite) — never readable from the table again,
-- so an RLS leak couldn't expose it.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- pgcrypto provides gen_random_bytes + digest. Already enabled in
-- this project, but be defensive.
-- ─────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────
-- 1. match_history.status — widen
-- ─────────────────────────────────────────────────────────────────────

alter table public.match_history drop constraint if exists valid_status;
alter table public.match_history add  constraint valid_status check (
  status in (
    'pending_opponent_claim',  -- new (Module 9)
    'pending_confirmation',
    'disputed',
    'pending_reconfirmation',
    'confirmed',
    'voided',
    'expired'
  )
);

-- ─────────────────────────────────────────────────────────────────────
-- 2. match_invites table
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.match_invites (
  id              uuid primary key default gen_random_uuid(),
  match_id        text not null references public.match_history(id) on delete cascade,
  invited_by      uuid not null references auth.users(id) on delete cascade,
  invited_name    text not null,
  invited_contact text,
  token_hash      text not null,
  status          text not null default 'pending'
                    check (status in ('pending','claimed','declined','expired','revoked')),
  claimed_by      uuid references auth.users(id) on delete set null,
  claimed_at      timestamptz,
  declined_by     uuid references auth.users(id) on delete set null,
  declined_at     timestamptz,
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.match_invites is
  'Module 9. One row per opponent invite token. token_hash is the only
   form of the secret stored — raw token is returned by create_match_invite
   exactly once.';

-- Token-hash lookup (claim path) needs to be fast.
create index if not exists idx_match_invites_token_hash
  on public.match_invites (token_hash);
-- "Most recent / latest pending invite for a match" queries.
create index if not exists idx_match_invites_match_pending
  on public.match_invites (match_id) where status = 'pending';
create index if not exists idx_match_invites_invited_by
  on public.match_invites (invited_by);

-- updated_at trigger reuses touch_updated_at() helper from the push
-- module (20260427) — defined idempotently there.
drop trigger if exists match_invites_touch_updated_at on public.match_invites;
create trigger match_invites_touch_updated_at
  before update on public.match_invites
  for each row execute function public.touch_updated_at();

alter table public.match_invites enable row level security;

-- Owner-only SELECT. Claimer / decliner can also see their own claimed/
-- declined rows so the InviteMatchPage can render post-action state.
-- Token hashes are NEVER exposed to the client because no client query
-- ever needs to read them — claim/decline goes through the RPC and the
-- RPC returns just safe-preview fields.
drop policy if exists match_invites_select_party on public.match_invites;
create policy match_invites_select_party on public.match_invites
  for select using (
    auth.uid() = invited_by
    or auth.uid() = claimed_by
    or auth.uid() = declined_by
  );

-- No INSERT / UPDATE / DELETE policies for clients. Every state
-- transition flows through SECURITY DEFINER RPCs below.

-- ─────────────────────────────────────────────────────────────────────
-- 3. Helper: token hash (sha256 hex)
-- ─────────────────────────────────────────────────────────────────────

create or replace function public._hash_invite_token(p_token text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

revoke all on function public._hash_invite_token(text)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 4. create_match_invite
-- ─────────────────────────────────────────────────────────────────────
--
-- Caller must be match.user_id, the match must currently sit in
-- pending_opponent_claim with no opponent_id, and at most one active
-- pending invite is allowed per match — re-issuing first revokes any
-- prior pending invite.
--
-- Returns the raw token (only chance the caller ever sees it) plus the
-- new invite id and expires_at.

create or replace function public.create_match_invite(
  p_match_id        text,
  p_invited_name    text,
  p_invited_contact text default null,
  p_expires_in_hours int default 720       -- 30 days default
) returns table (
  invite_id  uuid,
  token      text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := auth.uid();
  v_match     match_history%rowtype;
  v_token     text;
  v_hash      text;
  v_id        uuid;
  v_expires   timestamptz;
begin
  if v_uid is null then
    raise exception 'create_match_invite: not authenticated';
  end if;
  if p_invited_name is null or trim(p_invited_name) = '' then
    raise exception 'create_match_invite: invited_name required';
  end if;
  if p_expires_in_hours <= 0 or p_expires_in_hours > 24 * 365 then
    raise exception 'create_match_invite: expires_in_hours out of range';
  end if;

  select * into v_match from match_history where id = p_match_id for update;
  if v_match.id is null then
    raise exception 'create_match_invite: match not found';
  end if;
  if v_match.user_id <> v_uid then
    raise exception 'create_match_invite: only the match logger may invite';
  end if;
  if v_match.opponent_id is not null then
    raise exception 'create_match_invite: match already has a linked opponent';
  end if;
  if v_match.status <> 'pending_opponent_claim' then
    raise exception 'create_match_invite: match status must be pending_opponent_claim (got %)', v_match.status;
  end if;

  -- Revoke any existing pending invite for this match — keeps "at most
  -- one active pending invite" without forcing a unique constraint
  -- (which would fight the soft-revoke history we want to keep).
  update match_invites
     set status = 'revoked', revoked_at = now()
   where match_id = p_match_id and status = 'pending';

  -- Generate fresh 32-byte token; encode base64url (no '+', no '/',
  -- no padding) so it survives URL paths and copy-paste cleanly.
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_');
  v_token := rtrim(v_token, '=');
  v_hash  := public._hash_invite_token(v_token);
  v_expires := now() + (p_expires_in_hours::text || ' hours')::interval;

  insert into match_invites (match_id, invited_by, invited_name, invited_contact,
                             token_hash, status, expires_at)
  values (p_match_id, v_uid, trim(p_invited_name), nullif(trim(coalesce(p_invited_contact, '')), ''),
          v_hash, 'pending', v_expires)
  returning id into v_id;

  invite_id  := v_id;
  token      := v_token;
  expires_at := v_expires;
  return next;
end;
$$;

revoke all on function public.create_match_invite(text, text, text, int)
  from public, anon;
grant  execute on function public.create_match_invite(text, text, text, int)
  to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 5. preview_match_invite
-- ─────────────────────────────────────────────────────────────────────
--
-- Public-callable so a logged-out user can view a safe preview before
-- being prompted to sign in. Returns ONLY the fields the spec calls
-- safe: logger name, invited name, score summary, match date. Never
-- returns the token, the hash, contact info, or any private metadata.
--
-- Returns a status of 'not_found' (rather than throwing) so the
-- landing page can render a graceful "invite not active" view.

create or replace function public.preview_match_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash    text;
  v_inv     match_invites%rowtype;
  v_match   match_history%rowtype;
  v_logger  text;
  v_status  text;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('status', 'not_found');
  end if;
  v_hash := public._hash_invite_token(p_token);

  select * into v_inv from match_invites where token_hash = v_hash;
  if v_inv.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Auto-flag expired pending rows (the cron sweep would do this but
  -- we don't want to wait on it for a request that's looking right now).
  v_status := v_inv.status;
  if v_status = 'pending' and v_inv.expires_at <= now() then
    v_status := 'expired';
  end if;

  if v_status <> 'pending' and v_status <> 'claimed' then
    return jsonb_build_object('status', v_status);
  end if;

  select * into v_match from match_history where id = v_inv.match_id;
  if v_match.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  select coalesce(name, 'A CourtSync player') into v_logger
    from profiles where id = v_inv.invited_by;

  return jsonb_build_object(
    'status',         v_status,
    'invite_id',      v_inv.id,
    'match_id',       v_match.id,
    'logger_name',    v_logger,
    'invited_name',   v_inv.invited_name,
    'match_date',     v_match.match_date,
    'sets',           v_match.sets,
    'result',         v_match.result,        -- in submitter's frame; UI flips
    'venue',          v_match.venue,
    'court',          v_match.court,
    'expires_at',     v_inv.expires_at,
    -- For UX: tell the caller whether they're the logger so the page
    -- can render "you logged this — share it" instead of "claim it".
    'caller_is_logger', case when auth.uid() = v_inv.invited_by then true else false end,
    'caller_is_claimer', case when auth.uid() is not null and auth.uid() = v_inv.claimed_by then true else false end
  );
end;
$$;

revoke all on function public.preview_match_invite(text) from public;
grant  execute on function public.preview_match_invite(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 6. claim_match_invite
-- ─────────────────────────────────────────────────────────────────────
--
-- Authenticated. Validates token, checks not-expired / not-revoked /
-- not-already-claimed, ensures the claimer isn't the logger. Sets:
--   match_invites.status      = 'claimed'
--   match_invites.claimed_by  = auth.uid()
--   match_invites.claimed_at  = now()
--   match_history.opponent_id = auth.uid()
--   match_history.status      = 'pending_confirmation'
--   match_history.submitted_at = now()       -- restart the 72h clock
--   match_history.expires_at   = now() + 72h
--
-- Returns the same shape as preview_match_invite so the page can
-- continue to the confirm/dispute step without a second roundtrip.
--
-- Does NOT auto-confirm. The claimer must explicitly tap Confirm /
-- Dispute / Not my match in the existing ActionReviewDrawer, which
-- this transition has already wired up.

create or replace function public.claim_match_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid     uuid := auth.uid();
  v_hash    text;
  v_inv     match_invites%rowtype;
  v_match   match_history%rowtype;
begin
  if v_uid is null then
    raise exception 'claim_match_invite: not authenticated';
  end if;
  v_hash := public._hash_invite_token(p_token);

  select * into v_inv from match_invites where token_hash = v_hash for update;
  if v_inv.id is null then
    raise exception 'claim_match_invite: invite not found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'claim_match_invite: invite is %', v_inv.status;
  end if;
  if v_inv.expires_at <= now() then
    -- Sweep to expired so subsequent reads see the right state.
    update match_invites set status = 'expired' where id = v_inv.id;
    raise exception 'claim_match_invite: invite expired';
  end if;
  if v_uid = v_inv.invited_by then
    raise exception 'claim_match_invite: cannot claim your own invite';
  end if;

  select * into v_match from match_history where id = v_inv.match_id for update;
  if v_match.id is null then
    raise exception 'claim_match_invite: underlying match not found';
  end if;
  if v_match.opponent_id is not null then
    -- Defensive — should be unreachable if invite hasn't been claimed.
    raise exception 'claim_match_invite: match already has an opponent';
  end if;
  if v_match.status <> 'pending_opponent_claim' then
    raise exception 'claim_match_invite: match status is %, not pending_opponent_claim', v_match.status;
  end if;

  -- Mark invite claimed
  update match_invites set
    status     = 'claimed',
    claimed_by = v_uid,
    claimed_at = now()
  where id = v_inv.id;

  -- Promote the match to pending_confirmation. The claimer is now the
  -- opponent. Fresh 72h confirmation window.
  update match_history set
    opponent_id   = v_uid,
    status        = 'pending_confirmation',
    submitted_at  = now(),
    expires_at    = now() + interval '72 hours'
  where id = v_match.id;

  -- Notify the logger via the existing notification pipeline. Reuses
  -- 'match_invite_claimed' (added in this migration's emit_notification
  -- update below).
  begin
    insert into notifications (user_id, type, from_user_id, match_id, entity_id)
    values (v_inv.invited_by, 'match_invite_claimed', v_uid, v_match.id, v_inv.id);
  exception when others then
    -- Notification failure must not block the claim itself.
    null;
  end;

  -- Return the same payload preview returns + a hint that we're now
  -- in pending_confirmation so the page knows to show Confirm / Dispute.
  return jsonb_build_object(
    'status',         'claimed',
    'invite_id',      v_inv.id,
    'match_id',       v_match.id,
    'logger_name',    (select name from profiles where id = v_inv.invited_by),
    'invited_name',   v_inv.invited_name,
    'match_date',     v_match.match_date,
    'sets',           v_match.sets,
    'result',         v_match.result,
    'venue',          v_match.venue,
    'court',          v_match.court,
    'next_status',    'pending_confirmation'
  );
end;
$$;

revoke all on function public.claim_match_invite(text) from public, anon;
grant  execute on function public.claim_match_invite(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 7. decline_match_invite ("This wasn't me")
-- ─────────────────────────────────────────────────────────────────────
--
-- Authenticated. Marks the invite declined; does NOT touch
-- match_history (the logger may still re-issue or void). Notifies the
-- logger so they can act.

create or replace function public.decline_match_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid     uuid := auth.uid();
  v_hash    text;
  v_inv     match_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'decline_match_invite: not authenticated';
  end if;
  v_hash := public._hash_invite_token(p_token);

  select * into v_inv from match_invites where token_hash = v_hash for update;
  if v_inv.id is null then
    raise exception 'decline_match_invite: invite not found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'decline_match_invite: invite is %', v_inv.status;
  end if;

  update match_invites set
    status      = 'declined',
    declined_by = v_uid,
    declined_at = now()
  where id = v_inv.id;

  begin
    insert into notifications (user_id, type, from_user_id, match_id, entity_id)
    values (v_inv.invited_by, 'match_invite_declined', v_uid, v_inv.match_id, v_inv.id);
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.decline_match_invite(text) from public, anon;
grant  execute on function public.decline_match_invite(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 8. revoke_match_invite (logger pulls back an unclaimed link)
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.revoke_match_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_inv match_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'revoke_match_invite: not authenticated';
  end if;

  select * into v_inv from match_invites where id = p_invite_id for update;
  if v_inv.id is null then
    raise exception 'revoke_match_invite: invite not found';
  end if;
  if v_inv.invited_by <> v_uid then
    raise exception 'revoke_match_invite: only the inviter can revoke';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'revoke_match_invite: invite is %', v_inv.status;
  end if;

  update match_invites set
    status     = 'revoked',
    revoked_at = now()
  where id = v_inv.id;
end;
$$;

revoke all on function public.revoke_match_invite(uuid) from public, anon;
grant  execute on function public.revoke_match_invite(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 9. emit_notification — accept the new types
-- ─────────────────────────────────────────────────────────────────────
--
-- Add 'match_invite_claimed' / 'match_invite_declined' as legitimate
-- types. Standing check: caller must be the claimer/decliner of an
-- invite whose invited_by = p_user_id (i.e. notifying the logger).
--
-- NOTE: claim_match_invite + decline_match_invite already insert these
-- rows directly under SECURITY DEFINER, so this update is for any
-- future RPC that wants to re-emit (e.g. retry path).

create or replace function public.emit_notification(
  p_user_id   uuid,
  p_type      text,
  p_entity_id uuid default null,
  p_metadata  jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  fill_match_id uuid;
  entity_text text := p_entity_id::text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_user_id = uid then raise exception 'cannot self-notify via emit_notification'; end if;

  if exists (select 1 from public.blocks where blocker_id = p_user_id and blocked_id = uid) then
    return null;
  end if;

  case p_type
    when 'friend_request' then
      if not exists (
        select 1 from public.friend_requests fr
        where fr.sender_id = uid and fr.receiver_id = p_user_id and fr.status = 'pending'
      ) then raise exception 'no pending friend_request for this pair'; end if;

    when 'friend_request_accepted', 'request_accepted' then
      if not exists (
        select 1 from public.friend_requests fr
        where fr.receiver_id = uid and fr.sender_id = p_user_id and fr.status = 'accepted'
      ) then raise exception 'no accepted friend_request'; end if;

    when 'message_request' then
      if not exists (
        select 1 from public.conversations c
        where c.id = p_entity_id
          and c.requester_id = uid
          and ((c.user1_id = p_user_id) or (c.user2_id = p_user_id))
      ) then raise exception 'not a valid message_request'; end if;

    when 'message_request_accepted' then
      if not exists (
        select 1 from public.conversations c
        where c.id = p_entity_id
          and c.status = 'accepted'
          and (
            (c.user1_id = uid and c.user2_id = p_user_id) or
            (c.user2_id = uid and c.user1_id = p_user_id)
          )
      ) then raise exception 'not a valid message_request_accepted'; end if;

    when 'challenge_received', 'challenge_accepted', 'challenge_declined', 'challenge_expired' then
      if not exists (
        select 1 from public.challenges ch
        where ch.id = p_entity_id
          and (
            (ch.challenger_id = uid and ch.challenged_id = p_user_id) or
            (ch.challenged_id = uid and ch.challenger_id = p_user_id)
          )
      ) then raise exception 'not a party to this challenge'; end if;

    when 'match_tag', 'match_confirmed', 'match_disputed', 'match_corrected',
         'match_correction_requested', 'match_counter_proposed', 'match_voided',
         'match_expired', 'match_reminder' then
      if not exists (
        select 1 from public.match_history m
        where m.id = entity_text
          and (
            (m.user_id = uid and (m.opponent_id = p_user_id or m.tagged_user_id = p_user_id)) or
            (m.opponent_id = uid and m.user_id = p_user_id) or
            (m.tagged_user_id = uid and m.user_id = p_user_id)
          )
      ) then raise exception 'not a party to this match'; end if;
      fill_match_id := p_entity_id;

    when 'match_deleted' then
      fill_match_id := p_entity_id;

    when 'match_invite_claimed', 'match_invite_declined' then
      -- Standing: caller is the claimer/decliner of an invite whose
      -- inviter is the recipient.
      if not exists (
        select 1 from public.match_invites mi
        where mi.id = p_entity_id
          and mi.invited_by = p_user_id
          and (mi.claimed_by = uid or mi.declined_by = uid)
      ) then raise exception 'not a party to this invite'; end if;

    when 'pact_proposed', 'pact_confirmed', 'pact_booked',
         'pact_cancelled', 'pact_claimed' then
      if not exists (
        select 1 from public.match_pacts mp
        where mp.id = p_entity_id
          and (
            (mp.proposer_id = uid and mp.partner_id = p_user_id) or
            (mp.partner_id = uid and mp.proposer_id = p_user_id)
          )
      ) then raise exception 'not a party to this pact'; end if;

    when 'league_invite', 'league_joined' then
      -- Existing types — pass through (broader checks live in league code).
      null;

    else
      raise exception 'unknown notification type: %', p_type;
  end case;

  insert into notifications (user_id, type, from_user_id, match_id, entity_id, metadata)
  values (p_user_id, p_type, uid, fill_match_id::text, p_entity_id, p_metadata)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.emit_notification(uuid, text, uuid, jsonb) from public;
grant  execute on function public.emit_notification(uuid, text, uuid, jsonb) to authenticated;

commit;
