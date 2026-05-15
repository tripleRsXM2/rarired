SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='direct_messages'
  AND column_name IN ('kind','payload','entity_id')
ORDER BY column_name;
