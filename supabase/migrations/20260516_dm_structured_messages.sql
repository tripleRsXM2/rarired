-- 20260516_dm_structured_messages.sql
--
-- PR2 of the v2-messages-wiring series — add a structured-message channel to
-- direct_messages so v2 widgets (ScoreCard / InviteCard / ConfirmCard) can
-- render real match + challenge data instead of plain text.
--
-- Two nullable columns:
--   kind     text   — null for legacy text messages, 'score' | 'invite' for
--                     widget rows. Free-form text so future kinds can be
--                     added without another migration.
--   payload  jsonb  — kind-specific bag. Today:
--                       kind='score'  →  { matchId, status }
--                       kind='invite' →  { challengeId }
--                     null for plain text messages.
--
-- RLS unchanged — direct_messages.policy is already participant-gated and
-- doesn't care which columns are read.
--
-- Idempotent: `add column if not exists`, so re-running is a no-op.
--
-- Also updates dm_update_conv_preview() to write a kind-aware label into
-- conversations.last_message_preview so the inbox doesn't show the raw
-- (possibly empty) content of a widget message. New behaviour:
--   kind='score'  →  preview = "Sent score for confirmation"
--   kind='invite' →  preview = "Sent match invite"
--   otherwise     →  substring(content, 1, 80)  (unchanged)

begin;

alter table public.direct_messages
  add column if not exists kind    text,
  add column if not exists payload jsonb;

-- Replace the trigger function to use kind-aware preview text. The
-- trigger itself stays bound to the same name from 20260423.
create or replace function public.dm_update_conv_preview()
returns trigger
language plpgsql
security definer
as $$
declare
  v_preview text;
begin
  if new.kind = 'score' then
    v_preview := 'Sent score for confirmation';
  elsif new.kind = 'invite' then
    v_preview := 'Sent match invite';
  else
    v_preview := substring(coalesce(new.content, ''), 1, 80);
  end if;
  update public.conversations
  set
    last_message_at        = new.created_at,
    last_message_preview   = v_preview,
    last_message_sender_id = new.sender_id
  where id = new.conversation_id;
  return new;
end;
$$;

-- And teach the rollback-on-delete trigger the same trick — when the
-- newest message is unsent we re-pick the next visible row, which may
-- itself be a kind-tagged row that needs a synthetic preview.
create or replace function public.dm_rollback_conv_preview_on_delete()
returns trigger
language plpgsql
security definer
as $$
declare
  r record;
  v_preview text;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    select created_at, content, sender_id, kind into r
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
      if r.kind = 'score' then
        v_preview := 'Sent score for confirmation';
      elsif r.kind = 'invite' then
        v_preview := 'Sent match invite';
      else
        v_preview := substring(coalesce(r.content, ''), 1, 80);
      end if;
      update public.conversations
      set last_message_at = r.created_at,
          last_message_preview = v_preview,
          last_message_sender_id = r.sender_id
      where id = new.conversation_id;
    end if;
  end if;
  return new;
end;
$$;

commit;
