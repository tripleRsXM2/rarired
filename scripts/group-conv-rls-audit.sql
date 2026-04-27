-- group-conv-rls-audit.sql
-- Read-only diagnostic dump of everything relevant to the group-conversations migration.
-- Safe to run repeatedly. No DDL, no DML.
-- Each section starts with a SELECT of a section header so you can scan the output.

SELECT '== 1. Policies on conversations / direct_messages / participants / reads / reactions / pins / mutes ==' AS section;
SELECT schemaname, tablename, policyname, cmd, roles::text AS roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'conversations',
    'direct_messages',
    'conversation_participants',
    'message_reads',
    'message_reactions',
    'conversation_pins',
    'conversation_mutes'
  )
ORDER BY tablename, policyname;

SELECT '== 2. Storage policies referencing dm-attachments ==' AS section;
SELECT schemaname, tablename, policyname, cmd, roles::text AS roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND (
    qual LIKE '%dm-attachments%'
    OR with_check LIKE '%dm-attachments%'
    OR policyname ILIKE '%dm%'
    OR policyname ILIKE '%attachment%'
  )
ORDER BY tablename, policyname;

SELECT '== 3. Constraints on conversations ==' AS section;
SELECT tc.constraint_name, tc.constraint_type, cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
 AND tc.constraint_schema = cc.constraint_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'conversations'
ORDER BY tc.constraint_type, tc.constraint_name;

SELECT '== 4. Columns on conversations ==' AS section;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'conversations'
ORDER BY ordinal_position;

SELECT '== 5. Columns on direct_messages ==' AS section;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'direct_messages'
ORDER BY ordinal_position;

SELECT '== 6. Triggers on direct_messages ==' AS section;
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table = 'direct_messages'
ORDER BY trigger_name;

SELECT '== 7. Source: guard_dm_insert_block ==' AS section;
SELECT pg_get_functiondef(p.oid) AS source
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'guard_dm_insert_block';

SELECT '== 8. Source: get_or_create_conversation (all overloads) ==' AS section;
SELECT pg_get_function_identity_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS source
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_or_create_conversation';

SELECT '== 9. Source: upsert_message_notification (all overloads) ==' AS section;
SELECT pg_get_function_identity_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS source
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'upsert_message_notification';

SELECT '== 10. Any function in public matching %message%notification% or %conv% ==' AS section;
SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname ILIKE '%message%notification%' OR p.proname ILIKE '%conv%')
ORDER BY p.proname;
