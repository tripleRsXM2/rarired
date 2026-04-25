-- 20260425_dm_block_guard.sql
--
-- Asymmetric-block plumbing — server side. The client filters blocked
-- partners out of the conversations list, but a blocked user could
-- still INSERT into direct_messages because the existing
-- dm_insert_participant policy only checks "you're a party to this
-- conversation". A blocker who once accepted a conversation can have
-- it permanently silenced by adding a blocks row, but until now the
-- INSERT itself wasn't refused at the DB.
--
-- Adds an INSERT trigger that throws if the SENDER is on the
-- RECIPIENT's blocks list. Trigger over policy because Supabase JS
-- only surfaces RLS denials as a generic permission error, whereas a
-- raise notice gives both the client and the audit log a clear message.
--
-- Recipient is the OTHER participant of the conversation (user1_id /
-- user2_id), derived inside the trigger so we don't have to threading
-- it through the INSERT payload.

begin;

create or replace function public.guard_dm_insert_block()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_recipient uuid;
begin
  -- Recipient = the conversation participant who isn't the sender.
  select case when c.user1_id = new.sender_id then c.user2_id else c.user1_id end
    into v_recipient
    from public.conversations c
   where c.id = new.conversation_id;

  if v_recipient is null then
    -- Conversation doesn't exist or is malformed — let the existing
    -- FK / RLS path raise the canonical error.
    return new;
  end if;

  if exists (
    select 1 from public.blocks
     where blocker_id = v_recipient
       and blocked_id = new.sender_id
  ) then
    raise exception 'recipient_has_blocked_sender' using errcode = '42501';
  end if;

  return new;
end; $$;

drop trigger if exists trg_guard_dm_insert_block on public.direct_messages;
create trigger trg_guard_dm_insert_block
  before insert on public.direct_messages
  for each row execute function public.guard_dm_insert_block();

commit;
