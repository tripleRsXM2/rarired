-- 20260423_dm_preview_trigger.sql
--
-- Ensure conversations.last_message_{preview,at,sender_id} are ALWAYS in
-- sync with direct_messages — driven by a trigger instead of a
-- fire-and-forget client update that can silently fail (RLS, network
-- drop, pending-await) and leave the inbox-row preview empty.
--
-- Also backfills any existing conversations that have no preview yet.

begin;

-- Backfill (re-runnable — only touches rows where the preview is null).
update public.conversations c
set
  last_message_preview = latest.preview,
  last_message_at      = coalesce(c.last_message_at, latest.created_at),
  last_message_sender_id = latest.sender_id
from (
  select distinct on (conversation_id)
    conversation_id,
    substring(content, 1, 80) as preview,
    sender_id,
    created_at
  from public.direct_messages
  where deleted_at is null
  order by conversation_id, created_at desc
) latest
where c.id = latest.conversation_id
  and c.last_message_preview is null;

-- Trigger: on new message insert, keep conversation row's last_* fields fresh.
create or replace function public.dm_update_conv_preview()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.conversations
  set
    last_message_at        = new.created_at,
    last_message_preview   = substring(coalesce(new.content, ''), 1, 80),
    last_message_sender_id = new.sender_id
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists dm_update_conv_preview_trg on public.direct_messages;

create trigger dm_update_conv_preview_trg
  after insert on public.direct_messages
  for each row
  execute function public.dm_update_conv_preview();

-- Also handle soft-delete (Unsend): when the newest message is unsent,
-- roll the preview back to the next most recent non-deleted message so
-- the inbox row doesn't linger on a message that no longer renders.
create or replace function public.dm_rollback_conv_preview_on_delete()
returns trigger
language plpgsql
security definer
as $$
declare
  r record;
begin
  -- Only when deleted_at just transitioned from null to non-null.
  if old.deleted_at is null and new.deleted_at is not null then
    select created_at, content, sender_id into r
    from public.direct_messages
    where conversation_id = new.conversation_id
      and deleted_at is null
      and id <> new.id
    order by created_at desc
    limit 1;

    if r is null then
      update public.conversations
      set last_message_preview = null,
          last_message_sender_id = null
      where id = new.conversation_id;
    else
      update public.conversations
      set last_message_at = r.created_at,
          last_message_preview = substring(coalesce(r.content, ''), 1, 80),
          last_message_sender_id = r.sender_id
      where id = new.conversation_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists dm_rollback_conv_preview_trg on public.direct_messages;

create trigger dm_rollback_conv_preview_trg
  after update of deleted_at on public.direct_messages
  for each row
  execute function public.dm_rollback_conv_preview_on_delete();

commit;
