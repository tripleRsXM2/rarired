-- ============================================================================
-- 20260420_propose_match_correction.sql
--
-- Adds propose_match_correction(), a SECURITY DEFINER RPC that handles
-- both the initial dispute and all subsequent counter-proposals in one
-- atomic transaction.
--
-- Previously, dispute/counter writes went through a direct client-side
-- UPDATE on match_history via proposeCorrection() in matchService.js.
-- That direct write fails under RLS when the opponent (who doesn't own
-- the row) tries to dispute a match submitted by someone else.
--
-- This function takes ownership of:
--   - validating the caller is a party to the match
--   - enforcing state-machine transitions
--   - writing the match update
--   - inserting the match_revisions history row
-- …all in a single serializable transaction under SECURITY DEFINER so RLS
-- is bypassed correctly for both parties.
--
-- Type-safety note: match_history stores user_id / opponent_id /
-- pending_action_by as text. auth.uid() returns uuid. All comparisons
-- cast text columns to uuid via nullif(col::text, '')::uuid to avoid
-- "operator does not exist: text = uuid" at runtime.
--
-- State-machine note: branching is on the CURRENT row status, not on
-- p_next_status. This lets the opponent counter back from
-- pending_reconfirmation with p_next_status='disputed' (round 3+) without
-- the function incorrectly requiring status='pending_confirmation'.
--
-- Depends on: 20260419_dispute_system_v2.sql (status check constraint,
--             pending_reconfirmation status value)
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
  -- ── 1. Auth ───────────────────────────────────────────────────────────────
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  -- ── 2. Validate p_next_status early (cheap) ───────────────────────────────
  if p_next_status not in ('disputed', 'pending_reconfirmation') then
    raise exception 'invalid next status: %', p_next_status;
  end if;

  -- ── 3. Validate proposal shape ────────────────────────────────────────────
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

  -- ── 4. Lock the row ───────────────────────────────────────────────────────
  select *
    into v_match
    from match_history
   where id = p_match_id
     for update;

  if v_match.id is null then
    raise exception 'match not found';
  end if;

  -- ── 5. Cast text participant columns → uuid for all comparisons ───────────
  -- match_history stores these as text; auth.uid() is uuid.
  -- nullif(..., '') guards against empty-string values that would fail ::uuid.
  v_user_id           := nullif(v_match.user_id::text,           '')::uuid;
  v_opponent_id       := nullif(v_match.opponent_id::text,       '')::uuid;
  v_pending_action_by := nullif(v_match.pending_action_by::text, '')::uuid;

  -- ── 6. Caller must be one of the two parties ──────────────────────────────
  if v_actor not in (v_user_id, v_opponent_id) then
    raise exception 'only match participants may propose a correction';
  end if;

  -- ── 7. Reject casual / untagged matches ───────────────────────────────────
  if v_opponent_id is null then
    raise exception 'cannot dispute an untagged / casual match';
  end if;

  -- ── 8. State-machine: branch on CURRENT status ────────────────────────────
  --
  -- Branching on the CURRENT row status (not p_next_status) is intentional:
  -- the JS sends p_next_status='disputed' whenever isOpponentView=true,
  -- which covers both the initial dispute (from pending_confirmation) AND
  -- the opponent counter-proposing back (from pending_reconfirmation, round
  -- 3+). Branching on p_next_status instead would incorrectly block round 3+.

  if v_match.status = 'pending_confirmation' then
    -- Initial dispute: only the tagged opponent may act.
    if v_actor <> v_opponent_id then
      raise exception 'only the tagged opponent may open a dispute';
    end if;
    if p_next_status <> 'disputed' then
      raise exception 'opening a dispute must use next_status=disputed';
    end if;
    -- Submitter (user_id) now owes the response.
    v_expected_pending := v_user_id;
    v_action           := 'disputed';

  elsif v_match.status in ('disputed', 'pending_reconfirmation') then
    -- Counter-proposal: only the party currently owed a response may act.
    if v_pending_action_by is null then
      raise exception 'pending_action_by is missing on an active dispute';
    end if;
    if v_actor <> v_pending_action_by then
      raise exception 'only the party owed a response may counter-propose';
    end if;
    -- Flip pending_action_by to the other party.
    v_expected_pending := case
      when v_actor = v_user_id then v_opponent_id
      else v_user_id
    end;
    v_action := 'counter_proposed';

  else
    raise exception 'cannot propose a correction from status: %', v_match.status;
  end if;

  -- ── 9. Increment revision count ───────────────────────────────────────────
  v_revision_number := coalesce(v_match.revision_count, 0) + 1;

  -- ── 10. Write match_history ───────────────────────────────────────────────
  -- Cast uuid variables back to text for storage in text columns.
  update match_history set
    status                = p_next_status,
    dispute_raised_by     = v_actor::text,
    dispute_reason_code   = p_reason_code,
    dispute_reason_detail = nullif(p_reason_detail, ''),
    current_proposal      = p_proposal,
    proposal_by           = v_actor::text,
    pending_action_by     = v_expected_pending::text,
    revision_count        = v_revision_number,
    dispute_expires_at    = now() + interval '48 hours'
  where id = p_match_id;

  -- ── 11. Insert revision history (atomic with the update above) ─────────────
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
    p_match_id,
    v_revision_number,
    v_actor::text,
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
