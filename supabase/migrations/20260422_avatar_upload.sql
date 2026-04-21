-- 20260422_avatar_upload.sql
--
-- Adds profile picture upload support:
--   1. profiles.avatar_url — public URL of the uploaded image, or null
--   2. Storage bucket `avatars` (public, so <img src=...> works anywhere)
--   3. RLS on storage.objects so users can only write into their own folder
--
-- Idempotent.

begin;

-- ── 1. Column ────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists avatar_url text;

-- ── 2. Storage bucket ────────────────────────────────────────────────────────
-- Public read so we can render without signed URLs in the feed / everywhere.
-- 5 MB limit, restricted to common image mime types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ── 3. Storage RLS ───────────────────────────────────────────────────────────
-- Anyone can read (public bucket); only the file's owner can write.
-- Objects are stored at path "<user_id>/<filename>" — first path segment is
-- the owning user's id. RLS enforces that.

drop policy if exists "avatars public read"            on storage.objects;
drop policy if exists "avatars owner write"            on storage.objects;
drop policy if exists "avatars owner update"           on storage.objects;
drop policy if exists "avatars owner delete"           on storage.objects;

create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars owner write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars owner update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
