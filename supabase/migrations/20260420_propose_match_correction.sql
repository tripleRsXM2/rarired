-- ============================================================================
-- 20260420_propose_match_correction.sql
--
-- propose_match_correction(): SECURITY DEFINER RPC for the no-admin
-- dispute resolution flow. Handles both the initial dispute and all
-- subsequent counter-proposals in one atomic transaction, bypassing RLS
-- so either party can write to a row they don't own.
--
-- Schema notes (confirmed via information_schema):
--   match_history.id              → text  (PK stored as text)
--   match_history.user_id         → uuid
--   match_history.opponent_id     → uuid
--   match_history.pending_action_by → uuid
--   match_history.dispute_raised_by → uuid
--   match_history.proposal_by      → uuid
--
-- The only casting quirk: WHERE id = p_match_id must cast the uuid param
-- to text because the PK column is text, not uuid.
-- All participant comparisons are uuid = uuid — no text cast needed there.
--
-- State-machine branching is on the CURRENT row status so that round 3+
-- counter-proposals work correctly (the JS always sends
-- p_next_status='disputed' when isOpponentView=true, regardless of whether
-- the current status is pending_confirmation or pending_reconfirmation).
--
-- Safe to re-run (CREATE OR REPLACE).
-- ============================================================================

create or replace function propose_match_correction(
  p_match_id      uuid,
  p_reason_code   text,
  p_reason_detail text,
  p_proposal      jsonb,
  p_next_status   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match             match_history%rowtype;
  v_actor             uuid := auth.uid();
  v_user_id           uuid;
  v_opponent_id       uuid;
  v_pending_action_by uuid;
  v_expected_pending  uuid;
  v_revision_number   integer;
  v_action            text;
begin
  -- 1. Auth
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  -- 2. Validate p_next_status
  if p_next_status not in ('disputed', 'pending_reconfirmation') then
    raise exception 'invalid next status: %', p_next_status;
  end if;

  -- 3. Validate proposal shape
  if p_proposal is null then
    raise exception 'proposal is required';
  end if;
  if (p_proposal->>'result') is null then
    raise exception 'proposal.result is required';
  end if;
  if (p_proposal->'sets') is null then
    raise exception 'proposal.sets is required';
  end if;
  if (p_proposal->>'match_date') is null then
    raise exception 'proposal.match_date is required';
  end if;

  -- 4. Lock the row
  -- match_history.id is text; cast the uuid param to text for the WHERE.
  select *
    into v_match
    from match_history
   where id = p_match_id::text
     for update;

  if v_match.id is null then
    raise exception 'match not found';
  end if;

  -- 5. Participant columns are uuid — assign directly (no cast needed)
  v_user_id           := v_match.user_id;
  v_opponent_id       := v_match.opponent_id;
  v_pending_action_by := v_match.pending_action_by;

  -- 6. Caller must be one of the two parties
  if v_actor not in (v_user_id, v_opponent_id) then
    raise exception 'only match participants may propose a correction';
  end if;

  -- 7. Reject casual / untagged matches
  if v_opponent_id is null then
    raise exception 'cannot dispute an untagged / casual match';
  end if;

  -- 8. State-machine: branch on CURRENT status (not p_next_status)
  if v_match.status = 'pending_confirmation' then
    -- Initial dispute: only the tagged opponent may act
    if v_actor <> v_opponent_id then
      raise exception 'only the tagged opponent may open a dispute';
    end if;
    if p_next_status <> 'disputed' then
      raise exception 'opening a dispute must use next_status=disputed';
    end if;
    v_expected_pending := v_user_id;
    v_action           := 'disputed';

  elsif v_match.status in ('disputed', 'pending_reconfirmation') then
    -- Counter-proposal: only the party owed a response may act
    if v_pending_action_by is null then
      raise exception 'pending_action_by is missing on an active dispute';
    end if;
    if v_actor <> v_pending_action_by then
      raise exception 'only the party owed a response may counter-propose';
    end if;
    -- Flip pending_action_by to the other party
    v_expected_pending := case
      when v_actor = v_user_id then v_opponent_id
      else v_user_id
    end;
    v_action := 'counter_proposed';

  else
    raise exception 'cannot propose a correction from status: %', v_match.status;
  end if;

  -- 9. Increment revision count
  v_revision_number := coalesce(v_match.revision_count, 0) + 1;

  -- 10. Write match_history
  -- id is text: cast p_match_id to text in the WHERE clause.
  -- Participant uuid columns accept uuid values directly.
  update match_history set
    status                = p_next_status,
    dispute_raised_by     = v_actor,
    dispute_reason_code   = p_reason_code,
    dispute_reason_detail = nullif(p_reason_detail, ''),
    current_proposal      = p_proposal,
    proposal_by           = v_actor,
    pending_action_by     = v_expected_pending,
    revision_count        = v_revision_number,
    dispute_expires_at    = now() + interval '48 hours'
  where id = p_match_id::text;

  -- 11. Insert revision history (atomic with the update above)
  insert into match_revisions (
    match_id,
    revision_number,
    changed_by,
    action,
    snapshot_before,
    snapshot_after,
    reason_code,
    reason_detail
  ) values (
    p_match_id::text,
    v_revision_number,
    v_actor,
    v_action,
    jsonb_build_object(
      'result',     v_match.result,
      'sets',       v_match.sets,
      'match_date', v_match.match_date,
      'venue',      v_match.venue,
      'court',      v_match.court
    ),
    p_proposal,
    p_reason_code,
    nullif(p_reason_detail, '')
  );
end;
$$;

grant execute on function propose_match_correction(uuid, text, text, jsonb, text)
  to authenticated;
