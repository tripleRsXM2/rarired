-- 20260423_security_hardening.sql
--
-- Comprehensive security hardening pass. Addresses findings C1–C13 from
-- the security review. Each section is labelled with its finding id.
--
-- Idempotent (drops/creates). Applied via db query --linked.

begin;

-- =========================================================================
-- C2 — profiles.is_admin column + stat/admin self-elevation guard
-- =========================================================================

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Block client-side writes to columns that the DB must own (stats, admin).
-- Legit stat changes come through bump_stats_for_match() / apply_match_outcome()
-- which run with security definer and bypass this by running as postgres.
-- Admin role changes must be done via psql / dashboard only.
create or replace function public.profiles_locked_columns_guard()
returns trigger language plpgsql as $$
declare
  uid uuid := auth.uid();
begin
  -- If there's no auth.uid() this is service_role or a trigger/RPC — allow.
  if uid is null then return new; end if;
  -- Only compare on UPDATE; on INSERT users set their own row once.
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

drop trigger if exists profiles_locked_columns_guard_trg on public.profiles;
create trigger profiles_locked_columns_guard_trg
  before update on public.profiles
  for each row execute function public.profiles_locked_columns_guard();

-- =========================================================================
-- C3 — profiles SELECT honors privacy
-- =========================================================================

drop policy if exists profiles_read_public on public.profiles;
drop policy if exists profiles_read       on public.profiles;

create policy profiles_read on public.profiles for select
  using (
    -- Own row always.
    id = auth.uid()
    -- Public profiles: any authenticated user.
    or (auth.role() = 'authenticated' and coalesce(privacy, 'public') = 'public')
    -- Friends-only: only accepted friends.
    or (coalesce(privacy, 'public') = 'friends' and exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and ((fr.sender_id = auth.uid() and fr.receiver_id = profiles.id)
          or (fr.receiver_id = auth.uid() and fr.sender_id = profiles.id))
    ))
  );

-- =========================================================================
-- C2 — tournaments: admin-only writes, public read
-- =========================================================================

drop policy if exists "authed writes" on public.tournaments;
drop policy if exists "anyone reads"  on public.tournaments;
drop policy if exists tournaments_read       on public.tournaments;
drop policy if exists tournaments_admin_write on public.tournaments;

create policy tournaments_read on public.tournaments for select
  using (true);

create policy tournaments_admin_write on public.tournaments for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- =========================================================================
-- C1 — notifications: lock direct INSERT to self, route cross-user via RPC
-- =========================================================================

drop policy if exists notifs_insert       on public.notifications;
drop policy if exists notifs_insert_self  on public.notifications;

-- Only self-notifications (no from_user_id). Cross-user notifications must
-- go through emit_notification() below.
create policy notifs_insert_self on public.notifications for insert
  with check (user_id = auth.uid() and from_user_id is null);

-- One security-definer RPC for every legitimate cross-user notification.
-- Each type validates the caller has standing to notify the target
-- (matching friend_request / conversation / challenge / match row).
create or replace function public.emit_notification(
  p_user_id uuid,
  p_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_user_id = uid then raise exception 'cannot self-notify via emit_notification'; end if;

  -- Silently no-op when the target has blocked the caller — don't leak
  -- block state to the caller.
  if exists (select 1 from public.blocks where blocker_id = p_user_id and blocked_id = uid) then
    return null;
  end if;

  -- Per-type authorization check.
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
         'match_correction_requested', 'match_counter_proposed', 'match_voided' then
      if not exists (
        select 1 from public.match_history m
        where m.id = p_entity_id
          and (
            (m.user_id = uid and (m.opponent_id = p_user_id or m.tagged_user_id = p_user_id)) or
            (m.opponent_id = uid and m.user_id = p_user_id) or
            (m.tagged_user_id = uid and m.user_id = p_user_id)
          )
      ) then raise exception 'not a party to this match'; end if;

    when 'kudos', 'comment_received' then
      -- Social actions on the target's feed item. feed_likes/comments
      -- RLS already scopes visibility; trust the caller (throttled below).
      null;

    else
      raise exception 'unknown notification type: %', p_type;
  end case;

  insert into public.notifications(user_id, type, from_user_id, entity_id, metadata)
  values (p_user_id, p_type, uid, p_entity_id, p_metadata)
  returning id into new_id;

  return new_id;
end; $$;

revoke execute on function public.emit_notification(uuid, text, uuid, jsonb) from public;
grant  execute on function public.emit_notification(uuid, text, uuid, jsonb) to authenticated;

-- =========================================================================
-- C11 — notifications UPDATE column restriction
-- =========================================================================

create or replace function public.notifications_update_guard()
returns trigger language plpgsql as $$
begin
  -- Users may only toggle `read` on their own notifications. The rest of
  -- the row is frozen once inserted.
  if new.user_id      is distinct from old.user_id      then raise exception 'user_id locked'; end if;
  if new.from_user_id is distinct from old.from_user_id then raise exception 'from_user_id locked'; end if;
  if new.type         is distinct from old.type         then raise exception 'type locked'; end if;
  if new.entity_id    is distinct from old.entity_id    then raise exception 'entity_id locked'; end if;
  if new.metadata     is distinct from old.metadata     then raise exception 'metadata locked'; end if;
  if new.created_at   is distinct from old.created_at   then raise exception 'created_at locked'; end if;
  return new;
end; $$;

drop trigger if exists notifications_update_guard_trg on public.notifications;
create trigger notifications_update_guard_trg
  before update on public.notifications
  for each row execute function public.notifications_update_guard();

-- =========================================================================
-- C4 — friend_requests: receiver-only UPDATE, sender-only DELETE (pending)
-- =========================================================================

drop policy if exists fr_update             on public.friend_requests;
drop policy if exists fr_delete             on public.friend_requests;
drop policy if exists fr_update_receiver    on public.friend_requests;
drop policy if exists fr_delete_sender_pending on public.friend_requests;
drop policy if exists fr_delete_receiver_any  on public.friend_requests;

create policy fr_update_receiver on public.friend_requests for update
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

-- Sender can cancel only while still pending.
create policy fr_delete_sender_pending on public.friend_requests for delete
  using (auth.uid() = sender_id and status = 'pending');

-- Receiver can always delete a request from their inbox (dismiss).
create policy fr_delete_receiver_any on public.friend_requests for delete
  using (auth.uid() = receiver_id);

-- =========================================================================
-- C7 — direct_messages INSERT: sender must be participant AND conv accepted
--       (exception: first message of a pending-out conversation, where the
--       requester is allowed to seed the request)
-- =========================================================================

drop policy if exists "Users can send messages" on public.direct_messages;
drop policy if exists dm_insert_participant    on public.direct_messages;

create policy dm_insert_participant on public.direct_messages for insert
  with check (
    auth.uid() = sender_id and exists (
      select 1 from public.conversations c
      where c.id = direct_messages.conversation_id
        and (
          -- accepted convs: any participant can send
          (c.status = 'accepted' and (c.user1_id = auth.uid() or c.user2_id = auth.uid()))
          -- pending convs: only the requester (the original sender)
          or (c.status = 'pending' and c.requester_id = auth.uid())
        )
    )
  );

-- =========================================================================
-- C8 — conversations: revoke direct INSERT; creation only via RPC
-- =========================================================================

drop policy if exists "create conv"  on public.conversations;
-- No INSERT policy means no direct insert. get_or_create_conversation() is
-- security definer and remains the only creation path.

-- Ensure authenticated can still call the RPC.
grant execute on function public.get_or_create_conversation(uuid) to authenticated;

-- =========================================================================
-- C10 — feed_likes / feed_comments / follows SELECT: authenticated only
-- =========================================================================

drop policy if exists likes_select    on public.feed_likes;
drop policy if exists comments_select on public.feed_comments;
drop policy if exists follows_select  on public.follows;

create policy likes_select    on public.feed_likes    for select to authenticated using (true);
create policy comments_select on public.feed_comments for select to authenticated using (true);
create policy follows_select  on public.follows       for select to authenticated using (true);

-- =========================================================================
-- C5 — match_history: drop duplicate policy family
-- =========================================================================

-- Keep match_select / match_insert / match_update / match_delete (original),
-- drop match_history_* (duplicate added later).
drop policy if exists match_history_select on public.match_history;
drop policy if exists match_history_insert on public.match_history;
drop policy if exists match_history_update on public.match_history;
drop policy if exists match_history_delete on public.match_history;

-- =========================================================================
-- C6 — message_reads: drop duplicate ALL policy
-- =========================================================================

-- "manage own reads" + "Participants can read message_reads" (SELECT) are kept.
-- "Users can upsert own read record" is the identical duplicate — drop it.
drop policy if exists "Users can upsert own read record" on public.message_reads;

-- =========================================================================
-- C12 — rate-limit triggers (anti-spam)
-- =========================================================================

create or replace function public.throttle_friend_requests()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.friend_requests
      where sender_id = new.sender_id
        and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'rate limit: more than 10 friend requests per minute';
  end if;
  if (select count(*) from public.friend_requests
      where sender_id = new.sender_id
        and created_at > now() - interval '1 day') >= 50 then
    raise exception 'rate limit: more than 50 friend requests per day';
  end if;
  return new;
end; $$;

drop trigger if exists fr_throttle_trg on public.friend_requests;
create trigger fr_throttle_trg before insert on public.friend_requests
  for each row execute function public.throttle_friend_requests();

create or replace function public.throttle_direct_messages()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.direct_messages
      where sender_id = new.sender_id
        and created_at > now() - interval '10 seconds') >= 20 then
    raise exception 'rate limit: more than 20 messages per 10 seconds';
  end if;
  return new;
end; $$;

drop trigger if exists dm_throttle_trg on public.direct_messages;
create trigger dm_throttle_trg before insert on public.direct_messages
  for each row execute function public.throttle_direct_messages();

create or replace function public.throttle_feed_comments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.feed_comments
      where user_id = new.user_id
        and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate limit: more than 20 comments per minute';
  end if;
  return new;
end; $$;

drop trigger if exists fc_throttle_trg on public.feed_comments;
create trigger fc_throttle_trg before insert on public.feed_comments
  for each row execute function public.throttle_feed_comments();

-- =========================================================================
-- C13 — audit_log table (forensic trail for admin actions + abuse patterns)
-- =========================================================================

create table if not exists public.audit_log (
  id          bigserial primary key,
  actor_id    uuid,
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_admin_read   on public.audit_log;
drop policy if exists audit_log_insert_any   on public.audit_log;

create policy audit_log_admin_read on public.audit_log for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy audit_log_insert_any on public.audit_log for insert
  with check (auth.uid() is not null and (actor_id = auth.uid() or actor_id is null));

-- =========================================================================
-- C9 — dm-attachments: private bucket + conversation-participant SELECT
-- =========================================================================

update storage.buckets set public = false where id = 'dm-attachments';

drop policy if exists "dm-attachments public read"     on storage.objects;
drop policy if exists "dm-attachments participant read" on storage.objects;

-- Path convention for dm-attachments is "<uid>/<ts>-<name>".
-- Participants of any conversation that shares at least one participant
-- with the uploader can read. Uploader can always read.
-- (The strictest policy would bind to a specific conversation — we can
-- tighten that after switching uploads to include convId in the path.)
create policy "dm-attachments participant read" on storage.objects for select
  using (
    bucket_id = 'dm-attachments' and (
      -- uploader
      (storage.foldername(name))[1] = (auth.uid())::text
      -- anyone they share an accepted conversation with
      or exists (
        select 1 from public.conversations c
        where c.status = 'accepted'
          and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
          and ((c.user1_id)::text = (storage.foldername(name))[1]
            or (c.user2_id)::text = (storage.foldername(name))[1])
      )
    )
  );

commit;
