-- Post-apply sanity checks for 20260430_group_conversations.sql
-- Each block is one named check. The CLI only reports the last query, so
-- we wrap each into a single "check_name | result" select via UNION ALL
-- at the end. Individual selects above are kept for clarity / manual runs.

-- 1. participants count = 2 × existing 1:1 conversations
select 'cp_total_count' as check_name, count(*)::text as value
  from public.conversation_participants;

-- 2. distinct conversation_id count = existing conversations count
select 'cp_distinct_conv' as check_name, count(distinct conversation_id)::text as value
  from public.conversation_participants;

-- 3. is_group default applied everywhere
select 'is_group_null_count' as check_name, count(*)::text as value
  from public.conversations
  where is_group is null;

-- 4. is_conversation_participant exists & is SECURITY DEFINER
select 'is_conv_participant_secdef' as check_name,
       case when prosecdef then 'SECURITY_DEFINER'
            else 'INVOKER' end as value
  from pg_proc
  where oid = 'public.is_conversation_participant(uuid, uuid)'::regprocedure;

-- 5. create_group_conversation exists
select 'create_group_conv_exists' as check_name,
       case when count(*) > 0 then 'yes' else 'no' end as value
  from pg_proc
  where oid = 'public.create_group_conversation(uuid[])'::regprocedure;

-- 6. fetch_my_conversations exists
select 'fetch_my_conv_exists' as check_name,
       case when count(*) > 0 then 'yes' else 'no' end as value
  from pg_proc
  where oid = 'public.fetch_my_conversations()'::regprocedure;

-- 7. guard_dm_insert_block uses participant fan-out
select 'guard_dm_uses_participants' as check_name,
       case when pg_get_functiondef(oid) ilike '%conversation_participants%'
            then 'yes' else 'no' end as value
  from pg_proc
  where proname = 'guard_dm_insert_block'
    and pronamespace = 'public'::regnamespace;

-- 8. upsert_message_notification uses is_conversation_participant
select 'upsert_msg_notif_uses_helper' as check_name,
       case when pg_get_functiondef(oid) ilike '%is_conversation_participant%'
            then 'yes' else 'no' end as value
  from pg_proc
  where proname = 'upsert_message_notification'
    and pronamespace = 'public'::regnamespace;

-- 9. Stale 2-party policies on the rewritten tables.
-- Allowlist:
--   - conversations_owner_delete (DELETE) deliberately keeps user1_id/user2_id
--     because group rows aren't deletable (gated on is_group=false first).
--   - conversations_no_self_dm CHECK constraint references user1_id/user2_id;
--     it's a CHECK, not a policy, so it won't appear here.
select 'leftover_2party_policies' as check_name, count(*)::text as value
  from pg_policies
  where tablename in ('conversations','direct_messages','conversation_participants','message_reads')
    and (qual ilike '%user1_id%' or qual ilike '%user2_id%'
         or with_check ilike '%user1_id%' or with_check ilike '%user2_id%')
    and policyname <> 'conversations_owner_delete';

-- Aggregate one-row-per-check summary (this is what the CLI returns last).
select check_name, value from (
  values
    ('cp_total_count',
       (select count(*)::text from public.conversation_participants)),
    ('cp_distinct_conv',
       (select count(distinct conversation_id)::text
          from public.conversation_participants)),
    ('is_group_null_count',
       (select count(*)::text from public.conversations where is_group is null)),
    ('is_conv_participant_secdef',
       (select case when prosecdef then 'SECURITY_DEFINER' else 'INVOKER' end
          from pg_proc
         where oid = 'public.is_conversation_participant(uuid, uuid)'::regprocedure)),
    ('create_group_conv_exists',
       (select case when count(*) > 0 then 'yes' else 'no' end
          from pg_proc
         where oid = 'public.create_group_conversation(uuid[])'::regprocedure)),
    ('fetch_my_conv_exists',
       (select case when count(*) > 0 then 'yes' else 'no' end
          from pg_proc
         where oid = 'public.fetch_my_conversations()'::regprocedure)),
    ('guard_dm_uses_participants',
       (select case when pg_get_functiondef(oid) ilike '%conversation_participants%'
                    then 'yes' else 'no' end
          from pg_proc
         where proname = 'guard_dm_insert_block' and pronamespace = 'public'::regnamespace)),
    ('upsert_msg_notif_uses_helper',
       (select case when pg_get_functiondef(oid) ilike '%is_conversation_participant%'
                    then 'yes' else 'no' end
          from pg_proc
         where proname = 'upsert_message_notification' and pronamespace = 'public'::regnamespace)),
    ('leftover_2party_policies',
       (select count(*)::text from pg_policies
          where tablename in ('conversations','direct_messages','conversation_participants','message_reads')
            and (qual ilike '%user1_id%' or qual ilike '%user2_id%'
                 or with_check ilike '%user1_id%' or with_check ilike '%user2_id%')
            and policyname <> 'conversations_owner_delete'))
) as t(check_name, value);
