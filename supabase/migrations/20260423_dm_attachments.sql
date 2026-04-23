-- 20260423_dm_attachments.sql
--
-- DM photo attachments. Adds a `dm-attachments` storage bucket with the
-- same per-user-folder RLS pattern as `avatars`. Image messages are sent
-- by storing the public URL in direct_messages.content using a sentinel:
--
--     [img]https://<project>.supabase.co/storage/v1/object/public/dm-attachments/<uid>/<ts>-name.jpg
--
-- Keeps the schema unchanged — `content` stays a plain text column. The
-- client renders the bubble as an image when it sees the sentinel.
--
-- Bucket is public read (so <img src=...> works without signed URLs).
-- 5 MB file-size limit. image/* mimes only (incl. gif for animated).
--
-- Idempotent.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dm-attachments', 'dm-attachments', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dm-attachments public read"    on storage.objects;
drop policy if exists "dm-attachments owner write"    on storage.objects;
drop policy if exists "dm-attachments owner update"   on storage.objects;
drop policy if exists "dm-attachments owner delete"   on storage.objects;

create policy "dm-attachments public read"
  on storage.objects for select
  using (bucket_id = 'dm-attachments');

create policy "dm-attachments owner write"
  on storage.objects for insert
  with check (
    bucket_id = 'dm-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "dm-attachments owner update"
  on storage.objects for update
  using (
    bucket_id = 'dm-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'dm-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "dm-attachments owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'dm-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
