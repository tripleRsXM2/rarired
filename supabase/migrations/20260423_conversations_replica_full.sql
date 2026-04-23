-- 20260423_conversations_replica_full.sql
--
-- Flip `conversations` to REPLICA IDENTITY FULL so DELETE realtime
-- payloads include user1_id / user2_id — needed for the DM list on each
-- participant's client to live-remove a conversation the moment the
-- OTHER side deletes it. Without FULL, DELETE payloads only carry the
-- primary key, which is enough to match by id but not enough to verify
-- membership client-side.

begin;

alter table public.conversations replica identity full;

commit;
