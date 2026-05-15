-- 20260516_group_avatars.sql
--
-- Group conversation avatars. Three pieces, one migration:
--
--   1. Adds `avatar_url text` column to `public.conversations`. Nullable;
--      only meaningful for groups (1:1 convs ignore it — render uses the
--      partner profile avatar instead).
--
--   2. Adds the `set_conversation_avatar(p_conv_id, p_avatar_url)` RPC.
--      SECURITY DEFINER, gated by participant membership + is_group.
--      The RPC validates that the URL points at the `group-avatars`
--      bucket (or is NULL to clear), so a malicious client can't paste
--      a URL pointing at any random host into conversations.avatar_url.
--
--   3. Creates the `group-avatars` storage bucket + RLS policies on
--      `storage.objects`. Object path convention is
--      `<conversation_id>/<random>.<ext>`. Insert/Update/Delete policies
--      check that the caller is a participant of the conversation whose
--      id matches the first folder segment. Public read so <img src=…>
--      works without signed URLs.
--
-- File-size cap (2 MB) + allowed mime types (jpeg/png/webp/gif) are
-- enforced both by the bucket config AND by the client uploader so a
-- ~10 MB upload is rejected at the browser before it hits the wire.
--
-- Idempotent.

begin;

-- ── 1. conversations.avatar_url column ────────────────────────────────────────

alter table public.conversations
  add column if not exists avatar_url text;

comment on column public.conversations.avatar_url is
  'Group avatar — public URL into the group-avatars bucket. NULL for 1:1 (render uses the partner profile avatar instead) and for groups without a custom avatar.';

-- ── 2. set_conversation_avatar RPC ────────────────────────────────────────────

create or replace function public.set_conversation_avatar(p_conv_id uuid, p_avatar_url text)
returns public.conversations
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me     uuid := auth.uid();
  v_row  public.conversations;
  v_url  text;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  -- Read + lock the conv. Verify exists + is a group + caller is a
  -- participant.
  select * into v_row from public.conversations where id = p_conv_id for update;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0001';
  end if;
  if v_row.is_group is not true then
    raise exception 'Cannot set avatar on a 1:1 conversation' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.conversation_participants cp
     where cp.conversation_id = p_conv_id and cp.user_id = me
  ) then
    raise exception 'Not a participant of this conversation' using errcode = 'P0001';
  end if;

  -- Normalise: trim, empty → NULL (clears the avatar).
  v_url := nullif(btrim(coalesce(p_avatar_url, '')), '');

  -- URL whitelist: must be NULL OR point at the group-avatars storage
  -- bucket on this project. This is a defence-in-depth check on top
  -- of the bucket-level RLS — even if a client somehow uploaded to a
  -- different bucket, we won't reference it from a conversation row.
  if v_url is not null
     and position('/storage/v1/object/public/group-avatars/' in v_url) = 0
  then
    raise exception 'avatar_url must point at the group-avatars bucket' using errcode = 'P0001';
  end if;

  update public.conversations
     set avatar_url = v_url
   where id = p_conv_id
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.set_conversation_avatar(uuid, text) to authenticated;

-- ── 3. group-avatars storage bucket ───────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'group-avatars', 'group-avatars', true, 2097152,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "group-avatars public read"     on storage.objects;
drop policy if exists "group-avatars member write"    on storage.objects;
drop policy if exists "group-avatars member update"   on storage.objects;
drop policy if exists "group-avatars member delete"   on storage.objects;

-- Public read so a plain <img src=…> works for everyone (including
-- signed-out viewers, future deep-link previews, etc.). Defence in
-- depth: even though anyone can SELECT the binary, only conv
-- participants can write — and the URL is only surfaced from a
-- conversation row, which RLS already gates.
create policy "group-avatars public read"
  on storage.objects for select
  using (bucket_id = 'group-avatars');

-- Write/Update/Delete: caller must be a participant of the
-- conversation whose id appears as the first folder segment of the
-- object path (e.g. `<conv_id>/<random>.jpg` → folder[1] = conv_id).
create policy "group-avatars member write"
  on storage.objects for insert
  with check (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.conversation_participants cp
       where cp.user_id = auth.uid()
         and cp.conversation_id::text = (storage.foldername(name))[1]
    )
  );

create policy "group-avatars member update"
  on storage.objects for update
  using (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.conversation_participants cp
       where cp.user_id = auth.uid()
         and cp.conversation_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.conversation_participants cp
       where cp.user_id = auth.uid()
         and cp.conversation_id::text = (storage.foldername(name))[1]
    )
  );

create policy "group-avatars member delete"
  on storage.objects for delete
  using (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.conversation_participants cp
       where cp.user_id = auth.uid()
         and cp.conversation_id::text = (storage.foldername(name))[1]
    )
  );

-- ── 4. fetch_my_conversations: surface avatar_url ─────────────────────────────
-- Drop + recreate (return type signature changes).

drop function if exists public.fetch_my_conversations();

create or replace function public.fetch_my_conversations()
returns table (
  id                     uuid,
  user1_id               uuid,
  user2_id               uuid,
  status                 text,
  is_group               boolean,
  name                   text,
  avatar_url             text,
  created_at             timestamptz,
  last_message_at        timestamptz,
  last_message_preview   text,
  last_message_sender_id uuid,
  declined_at            timestamptz,
  request_cooldown_until timestamptz,
  requester_id           uuid,
  pair_key               text,
  participant_ids        uuid[]
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with mine as (
    select cp.conversation_id
      from public.conversation_participants cp
     where cp.user_id = auth.uid()
  )
  select
    c.id, c.user1_id, c.user2_id, c.status, c.is_group, c.name, c.avatar_url, c.created_at,
    c.last_message_at, c.last_message_preview, c.last_message_sender_id,
    c.declined_at, c.request_cooldown_until, c.requester_id, c.pair_key,
    coalesce(
      (select array_agg(cp2.user_id order by cp2.joined_at)
         from public.conversation_participants cp2
        where cp2.conversation_id = c.id),
      array[]::uuid[]
    ) as participant_ids
  from public.conversations c
  where c.id in (select conversation_id from mine)
    and c.status <> 'declined'
  order by c.last_message_at desc nulls last;
$$;

revoke all on function public.fetch_my_conversations() from public;
grant execute on function public.fetch_my_conversations() to authenticated;

commit;
