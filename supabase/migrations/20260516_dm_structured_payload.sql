-- 20260516_dm_structured_payload.sql
--
-- Adds three columns to `direct_messages` so DM rows can carry
-- structured-widget payloads (score cards, match invites, confirm-or-
-- dispute prompts) inside the same conversation timeline as plain text.
-- All columns are nullable — existing rows continue to render as text,
-- new rows opt in by populating `kind`.
--
-- `kind` mirrors the v2 MessagesScreen.Bubble dispatcher keys ('score',
-- 'invite', 'confirm') and the v2 widget UI in src/v2/features/messages.
-- We stay in snake_case for consistency with notification `type` strings
-- in docs/notification-taxonomy.md.
--
-- `payload` is jsonb so the per-kind shape can evolve without further
-- migrations. v2 message adapter parses it into score{}/invite{}/
-- confirm{} bubble props.
--
-- `entity_id` carries the uuid of the underlying authoritative entity
-- so widget buttons can look up live state (e.g. match_history.status
-- for confirm/dispute, challenges.status for accept/decline) instead of
-- baking action state into the DM row itself.
--
-- RLS: existing direct_messages policies gate by conversation
-- membership and don't reference these columns, so no policy changes
-- are needed. New columns are visible to anyone who can read the row.

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS kind      text,
  ADD COLUMN IF NOT EXISTS payload   jsonb,
  ADD COLUMN IF NOT EXISTS entity_id uuid;

-- Comment for clarity in the dashboard.
COMMENT ON COLUMN public.direct_messages.kind      IS 'Structured-widget kind: ''score'' | ''invite'' | ''confirm''. NULL = plain text.';
COMMENT ON COLUMN public.direct_messages.payload   IS 'Per-kind structured payload (jsonb). Shape depends on `kind`.';
COMMENT ON COLUMN public.direct_messages.entity_id IS 'Linked authoritative entity (match_history.id or challenges.id) — used by widget actions to read live state.';

-- Helper index for entity-id lookups (e.g. "find the confirm-card DM
-- for match X"). Partial index so it only covers structured rows.
CREATE INDEX IF NOT EXISTS direct_messages_entity_id_idx
  ON public.direct_messages (entity_id)
  WHERE entity_id IS NOT NULL;
