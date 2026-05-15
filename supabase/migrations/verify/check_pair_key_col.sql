SELECT column_name, is_generated, generation_expression
FROM information_schema.columns
WHERE table_schema='public' AND table_name='conversations' AND column_name='pair_key';
