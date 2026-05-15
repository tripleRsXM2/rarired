-- Inspect current pair_key column definition + create_group_conversation body.
SELECT column_name, is_generated, generation_expression
FROM information_schema.columns
WHERE table_schema='public' AND table_name='conversations' AND column_name='pair_key';

SELECT pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='create_group_conversation';
