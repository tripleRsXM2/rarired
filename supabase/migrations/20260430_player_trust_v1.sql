-- 20260430_player_trust_v1.sql
--
-- Module 10 (Slice 1) — Player Trust & Reliability foundation.
--
-- Two new tables, RLS, two SECURITY DEFINER RPCs, four AFTER triggers,
-- one public-readable view, one initial backfill. NO UI in this slice.
--
-- Design principles (locked, see docs/player-trust-and-reliability.md
-- for the full spec):
--
--   1. Trust ≠ Reliability ≠ Confidence.
--   2. New users are NEUTRAL (trust=50, reliability=50, confidence=low),
--      never suspicious.
--   3. ALL score movements are DERIVED from source-of-truth tables on
--      every recalc. There are no irreversible permanent mutations —
--      "one-time penalty" means the condition is applied in the
--      CURRENT recalculated profile, not subtracted forever. Recalc
--      is idempotent and self-healing.
--   4. Aggregate writes are server-only (SECURITY DEFINER). Clients
--      cannot edit trust_score / reliability_score / public_badge.
--   5. Public surfaces only show positive/neutral badges. Numerical
--      scores are never exposed to other users.
--   6. Anti-retaliation: feedback tied to a disputed match is
--      weighted 0.5x while the dispute is open; voided matches → 0x;
--      confirmed-after-dispute → 0.75x; clean confirmed → 1.0x.
--      No public negative label can ever fire from a single report.
--   7. Repeated-opponent / suspicious-match patterns reduce CONFIDENCE
--      only — they never directly subtract trust_score in V1, never
--      affect Elo, never surface publicly.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. post_match_feedback — the only NEW user-generated table
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.post_match_feedback (
  id                   uuid primary key default extensions.gen_random_uuid(),
  match_id             text not null references public.match_history(id) on delete cascade,
  reviewer_id          uuid not null references auth.users(id) on delete cascade,
  reviewed_user_id     uuid not null references auth.users(id) on delete cascade,
  -- Quick-tap signals (nullable so users can submit a partial answer)
  would_play_again     boolean,
  showed_up            boolean,
  score_felt_fair      boolean,
  -- Negative quick-tap signals (default false; tapping makes them true)
  sportsmanship_issue  boolean not null default false,
  no_show_report       boolean not null default false,
  -- Optional private note. Length-capped server-side; never exposed publicly.
  private_note         text check (private_note is null or char_length(private_note) <= 500),
  created_at           timestamptz not null default now(),

  -- One feedback per (match, reviewer) combo. Re-tapping should be an UPDATE
  -- via a future "edit feedback" RPC (out of V1 scope) — V1 simply blocks
  -- duplicates so the table stays clean.
  unique (match_id, reviewer_id),
  -- Self-review is meaningless. Belt-and-braces alongside the RPC's
  -- explicit eligibility check.
  check (reviewer_id <> reviewed_user_id)
);

create index if not exists idx_pmf_reviewed
  on public.post_match_feedback (reviewed_user_id, created_at desc);
create index if not exists idx_pmf_match
  on public.post_match_feedback (match_id);

alter table public.post_match_feedback enable row level security;

-- SELECT: reviewer can read their own rows (e.g. "you already reviewed this").
-- Nobody else can read raw feedback rows — including the reviewed user.
-- Service-role bypass handles admin / recalc paths.
drop policy if exists pmf_select_own on public.post_match_feedback;
create policy pmf_select_own on public.post_match_feedback
  for select using (auth.uid() = reviewer_id);

-- INSERT: BLOCKED for clients. Use submit_post_match_feedback RPC.
-- (No INSERT policy = no insert allowed for non-service-role.)

-- UPDATE / DELETE: BLOCKED. Service-role only via admin tools.

-- ─────────────────────────────────────────────────────────────────────
-- 2. player_trust_profiles — server-owned aggregate cache
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.player_trust_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Match counters (derived from match_history)
  confirmed_matches_count          int     not null default 0,
  ranked_confirmed_matches_count   int     not null default 0,
  disputed_matches_count           int     not null default 0,
  voided_matches_count             int     not null default 0,
  expired_matches_count            int     not null default 0,

  -- Match rates (numeric, NULL if sample size below threshold)
  dispute_rate                     numeric(4,3),
  void_rate                        numeric(4,3),
  expired_rate                     numeric(4,3),

  -- Challenge / invite reliability (derived from challenges + match_invites)
  challenges_received_count        int     not null default 0,
  challenges_responded_count       int     not null default 0,
  challenges_completed_count       int     not null default 0,
  challenge_response_rate          numeric(4,3),
  challenge_avg_response_minutes   numeric(8,2),
  challenge_completion_rate        numeric(4,3),
  challenge_expired_rate           numeric(4,3),
  invites_claimed_count            int     not null default 0,
  invites_declined_count           int     not null default 0,

  -- Feedback aggregates (with anti-retaliation weighting)
  feedback_received_count          int     not null default 0,
  effective_feedback_weight        numeric(8,3) not null default 0,
  would_play_again_rate            numeric(4,3),
  fair_score_rate                  numeric(4,3),
  -- Distinct-reporter counts (for the "≥2 distinct reporters" threshold rules)
  distinct_no_show_reporters       int     not null default 0,
  distinct_sportsmanship_reporters int     not null default 0,

  -- Internal flags (not surfaced publicly, not affecting Elo in V1)
  repeated_opponent_flag_count     int     not null default 0,
  suspicious_match_flag_count      int     not null default 0,

  -- Computed scores (0–100, default 50 = neutral)
  trust_score        int  not null default 50  check (trust_score       between 0 and 100),
  reliability_score  int  not null default 50  check (reliability_score between 0 and 100),

  -- Internal levels (used for admin queries / future surfaces)
  trust_level        text not null default 'new'
                          check (trust_level       in ('new','building','reliable','highly_reliable','flagged')),
  reliability_level  text not null default 'new'
                          check (reliability_level in ('new','building','responsive','reliable','highly_reliable','flagged')),
  confidence_level   text not null default 'low'
                          check (confidence_level  in ('low','medium','high')),

  -- Public-facing badge — single canonical value computed from clean-history
  -- criteria. Clients read this via the player_trust_public view (see below).
  -- Values: 'new' | 'building' | 'responsive' | 'reliable' | 'confirmed'.
  public_badge       text not null default 'new'
                          check (public_badge in ('new','building','responsive','reliable','confirmed')),

  last_calculated_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_ptp_reliability on public.player_trust_profiles (reliability_score desc);
create index if not exists idx_ptp_public_badge on public.player_trust_profiles (public_badge);

alter table public.player_trust_profiles enable row level security;

-- SELECT: a user can read their OWN full profile (numerical scores
-- included). Other users see ONLY the public columns via the
-- player_trust_public view below — direct table SELECT is gated to self.
drop policy if exists ptp_select_self on public.player_trust_profiles;
create policy ptp_select_self on public.player_trust_profiles
  for select using (auth.uid() = user_id);

-- INSERT / UPDATE / DELETE: BLOCKED for all clients. Aggregate writes
-- only via recalculate_player_trust_profile (SECURITY DEFINER).

-- Public-readable view: only the columns we want others to see.
-- Numerical scores deliberately excluded.
drop view if exists public.player_trust_public;
create view public.player_trust_public as
  select
    user_id,
    public_badge,
    confidence_level,
    -- Counts that are already public via match_history rendering anyway
    confirmed_matches_count,
    ranked_confirmed_matches_count,
    last_calculated_at
  from public.player_trust_profiles;

grant select on public.player_trust_public to authenticated, anon;

comment on view public.player_trust_public is
  'Public-readable trust summary. Returns ONLY badge + confidence + counts. '
  'Numerical trust_score / reliability_score / private flags are deliberately '
  'excluded — never surface scores to other users.';


-- ─────────────────────────────────────────────────────────────────────
-- 3. recalculate_player_trust_profile(uuid) — server-owned recalc
-- ─────────────────────────────────────────────────────────────────────
--
-- Idempotent. Reads source-of-truth tables, derives EVERY field from
-- scratch, upserts the row. No incremental mutations — running this 10
-- times on the same data produces the same result.
--
-- Anti-retaliation weighting is applied here, computed from the
-- match's CURRENT status:
--
--   match.status = 'voided'                            → weight 0.0
--   match.status in ('disputed', 'pending_reconfirmation')  → weight 0.5
--   match.status = 'confirmed' AND dispute_reason_code is set → weight 0.75
--   match.status = 'confirmed' clean / 'expired'           → weight 1.0
--
-- Distinct-reporter counts are NOT weighted — the "≥2 distinct reporters"
-- threshold uses raw counts so a single retaliatory reporter can never
-- alone cross a threshold.

create or replace function public.recalculate_player_trust_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  -- Match counters
  v_confirmed         int := 0;
  v_ranked_confirmed  int := 0;
  v_disputed          int := 0;
  v_voided            int := 0;
  v_expired_as_opp    int := 0;
  -- Rates
  v_dispute_rate      numeric;
  v_void_rate         numeric;
  v_expired_rate      numeric;
  -- Challenges
  v_chal_received     int := 0;
  v_chal_responded    int := 0;
  v_chal_completed    int := 0;
  v_chal_expired      int := 0;
  v_chal_resp_rate    numeric;
  v_chal_compl_rate   numeric;
  v_chal_exp_rate     numeric;
  v_chal_avg_min      numeric;
  -- Invites (in-app responsiveness only — never penalize for non-user no-claims)
  v_inv_claimed       int := 0;
  v_inv_declined      int := 0;
  -- Feedback
  v_fb_count          int := 0;
  v_fb_weight         numeric := 0;
  v_wpa_rate          numeric;
  v_fair_rate         numeric;
  v_distinct_no_show  int := 0;
  v_distinct_sport    int := 0;
  -- Internal flags
  v_repeated_flag     int := 0;
  v_suspicious_flag   int := 0;
  -- Scores + levels
  v_trust_score       int := 50;
  v_reliab_score      int := 50;
  v_trust_level       text;
  v_reliab_level      text;
  v_confidence        text;
  v_badge             text;
  -- Confirmed-match contribution helper
  v_confirmed_bonus   int;
begin
  if p_user_id is null then
    return;
  end if;

  -- ── Match counters (this user as either party) ─────────────────────
  select
    count(*) filter (where status = 'confirmed'),
    count(*) filter (where status = 'confirmed' and match_type = 'ranked'),
    count(*) filter (where status in ('disputed','pending_reconfirmation')
                       or (status = 'confirmed' and dispute_reason_code is not null)),
    count(*) filter (where status = 'voided'),
    count(*) filter (where status = 'expired' and opponent_id = p_user_id)
  into v_confirmed, v_ranked_confirmed, v_disputed, v_voided, v_expired_as_opp
  from public.match_history
  where user_id = p_user_id or opponent_id = p_user_id;

  -- Rates: NULL until sample size meets the minimum to avoid noise.
  if (v_confirmed + v_disputed) >= 5 then
    v_dispute_rate := round(v_disputed::numeric / (v_confirmed + v_disputed), 3);
  end if;
  if (v_confirmed + v_voided) >= 5 then
    v_void_rate := round(v_voided::numeric / (v_confirmed + v_voided), 3);
  end if;
  if (v_confirmed + v_expired_as_opp) >= 5 then
    v_expired_rate := round(v_expired_as_opp::numeric / (v_confirmed + v_expired_as_opp), 3);
  end if;

  -- ── Challenges (only those addressed TO this user) ──────────────────
  -- Decline IS a response (per product rules) and counts as positive.
  -- Cancelled challenges are NOT counted as "ignored".
  select
    count(*) filter (where status <> 'cancelled'),
    count(*) filter (where status in ('accepted','declined','completed')),
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'expired')
  into v_chal_received, v_chal_responded, v_chal_completed, v_chal_expired
  from public.challenges
  where challenged_id = p_user_id;

  if v_chal_received >= 3 then
    v_chal_resp_rate := round(v_chal_responded::numeric / v_chal_received, 3);
  end if;
  if v_chal_received >= 3 then
    v_chal_compl_rate := round(v_chal_completed::numeric / v_chal_received, 3);
  end if;
  if v_chal_received >= 5 then
    v_chal_exp_rate := round(v_chal_expired::numeric / v_chal_received, 3);
  end if;

  -- Average response time in minutes for challenges that DID get a response.
  select round(avg(extract(epoch from (responded_at - created_at)) / 60.0)::numeric, 2)
  into v_chal_avg_min
  from public.challenges
  where challenged_id = p_user_id
    and responded_at is not null;

  -- ── Invites (in-app responsiveness only) ────────────────────────────
  -- Per product rule: do NOT penalize the inviter (or anyone else) for
  -- unclaimed invites — the recipient may not be a CourtSync user.
  -- Positive signal only: count claimed/declined where this user IS the
  -- claimer/decliner (i.e., they were definitely an in-app user who saw
  -- the invite).
  select
    count(*) filter (where claimed_by  = p_user_id),
    count(*) filter (where declined_by = p_user_id)
  into v_inv_claimed, v_inv_declined
  from public.match_invites
  where claimed_by = p_user_id or declined_by = p_user_id;

  -- ── Feedback aggregates (with anti-retaliation weighting) ───────────
  -- Each feedback row's effective weight depends on the related match's
  -- CURRENT status. This re-derives the weight every recalc, so dispute
  -- resolutions naturally update the trust math.
  with weighted_fb as (
    select
      pmf.would_play_again,
      pmf.showed_up,
      pmf.score_felt_fair,
      pmf.no_show_report,
      pmf.sportsmanship_issue,
      pmf.reviewer_id,
      case
        when mh.status = 'voided'                                    then 0.0::numeric
        when mh.status in ('disputed','pending_reconfirmation')      then 0.5::numeric
        when mh.status = 'confirmed' and mh.dispute_reason_code is not null then 0.75::numeric
        when mh.status in ('confirmed','expired')                    then 1.0::numeric
        else                                                              0.0::numeric
      end as weight
    from public.post_match_feedback pmf
    join public.match_history mh on mh.id = pmf.match_id
    where pmf.reviewed_user_id = p_user_id
  )
  select
    count(*),
    coalesce(sum(weight), 0),
    -- would_play_again_rate: weighted positive / total weight, NULL if effective weight < 5
    case when sum(weight) >= 5 then
      round(sum(case when would_play_again then weight else 0 end) / sum(weight), 3)
    end,
    case when sum(weight) >= 5 then
      round(sum(case when score_felt_fair then weight else 0 end) / sum(weight), 3)
    end
  into v_fb_count, v_fb_weight, v_wpa_rate, v_fair_rate
  from weighted_fb;

  -- Distinct-reporter counts (UNWEIGHTED — threshold rule uses raw count).
  -- Excludes feedback tied to voided matches (weight=0 → reporter doesn't
  -- exist for trust purposes), but keeps disputed-match reporters with
  -- raw distinct status. The 0.5x weight on disputed feedback already
  -- handles the retaliation case for rate computations; the threshold
  -- rule additionally requires ≥2 distinct reporters so a single
  -- retaliatory report can't alone trigger a public penalty.
  select
    count(distinct pmf.reviewer_id) filter (where pmf.no_show_report and mh.status <> 'voided'),
    count(distinct pmf.reviewer_id) filter (where pmf.sportsmanship_issue and mh.status <> 'voided')
  into v_distinct_no_show, v_distinct_sport
  from public.post_match_feedback pmf
  join public.match_history mh on mh.id = pmf.match_id
  where pmf.reviewed_user_id = p_user_id;

  -- ── Repeated-opponent flag (internal, confidence-only) ──────────────
  -- Flag if any single opponent accounts for >50% of the user's confirmed
  -- ranked matches over a sample of ≥10 ranked matches.
  if v_ranked_confirmed >= 10 then
    select count(*)
    into v_repeated_flag
    from (
      select
        case when user_id = p_user_id then opponent_id else user_id end as opp,
        count(*) as cnt
      from public.match_history
      where (user_id = p_user_id or opponent_id = p_user_id)
        and status = 'confirmed'
        and match_type = 'ranked'
        and opponent_id is not null
      group by 1
    ) per_opp
    where cnt::numeric / v_ranked_confirmed > 0.50;
  end if;

  -- ── Suspicious-match flag (internal, V1 simplified) ─────────────────
  -- Composite of: fast confirmation + repeat pair burst within 7 days.
  -- Documented as V1; the full "early ranked share" signal is future work.
  with my_fast_ranked as (
    select
      mh.id,
      mh.confirmed_at,
      case when mh.user_id = p_user_id then mh.opponent_id else mh.user_id end as opp
    from public.match_history mh
    where (mh.user_id = p_user_id or mh.opponent_id = p_user_id)
      and mh.status = 'confirmed'
      and mh.match_type = 'ranked'
      and mh.opponent_id is not null
      and mh.confirmed_at is not null
      and mh.submitted_at is not null
      and extract(epoch from (mh.confirmed_at - mh.submitted_at)) < 600  -- < 10 min
  ),
  bursts as (
    select distinct a.id
    from my_fast_ranked a
    join my_fast_ranked b
      on a.opp = b.opp and a.id <> b.id
     and abs(extract(epoch from (a.confirmed_at - b.confirmed_at))) < 7 * 86400
  )
  select count(*) into v_suspicious_flag from bursts;

  -- ── Trust score derivation (fully derived) ──────────────────────────
  v_trust_score := 50;

  -- Confirmed-match contribution (capped +30):
  --   +2 each for first 10 ranked confirmed
  --   +1 each after that
  --   capped at +30 total
  v_confirmed_bonus := case
    when v_ranked_confirmed <= 10 then v_ranked_confirmed * 2
    else 20 + least(10, v_ranked_confirmed - 10)
  end;
  v_trust_score := v_trust_score + least(30, v_confirmed_bonus);

  -- Negative match-rate signals (gated by sample size via the rate NULL guards)
  if v_dispute_rate is not null and v_dispute_rate > 0.20 then
    v_trust_score := v_trust_score - 10;
  end if;
  if v_void_rate is not null and v_void_rate > 0.20 then
    v_trust_score := v_trust_score - 10;
  end if;
  if v_expired_rate is not null and v_expired_rate > 0.30 then
    v_trust_score := v_trust_score - 5;
  end if;

  -- Positive feedback signal — score-felt-fair
  if v_fair_rate is not null and v_fair_rate > 0.85 and v_fb_weight >= 5 then
    v_trust_score := v_trust_score + 5;
  end if;

  -- Repeated-opponent flag does NOT directly subtract trust (per V1 rule).
  -- It only reduces confidence_level by one tier (handled below).

  v_trust_score := greatest(0, least(100, v_trust_score));

  -- ── Reliability score derivation ────────────────────────────────────
  v_reliab_score := 50;

  -- Challenge response contribution (cap +30 from raw responses)
  v_reliab_score := v_reliab_score + least(30, v_chal_responded);
  -- Completion bonus (cap +20)
  v_reliab_score := v_reliab_score + least(20, v_chal_completed * 2);

  -- Invite claim positive (cap +10) — in-app users who claim invites
  v_reliab_score := v_reliab_score + least(10, v_inv_claimed * 2);

  -- Repeated no-show (≥2 distinct reporters)
  if v_distinct_no_show >= 2 then
    v_reliab_score := v_reliab_score - 15;
  end if;

  -- Repeated sportsmanship flag (≥2 distinct reporters)
  if v_distinct_sport >= 2 then
    v_reliab_score := v_reliab_score - 15;
  end if;

  -- Would-play-again positive
  if v_wpa_rate is not null and v_wpa_rate > 0.85 and v_fb_weight >= 5 then
    v_reliab_score := v_reliab_score + 5;
  end if;

  -- Challenge-expired-against-you (only after ≥5 received in-app)
  if v_chal_exp_rate is not null and v_chal_exp_rate > 0.40 then
    v_reliab_score := v_reliab_score - 10;
  end if;

  v_reliab_score := greatest(0, least(100, v_reliab_score));

  -- ── Confidence level (sample size, with repeated-opponent demotion) ─
  v_confidence := case
    when v_confirmed >= 10 and v_chal_received >= 5 and v_fb_count >= 3 then 'high'
    when v_confirmed >=  3 or  v_chal_received >= 5                    then 'medium'
    else 'low'
  end;
  if v_repeated_flag > 0 then
    v_confidence := case v_confidence
      when 'high'   then 'medium'
      when 'medium' then 'low'
      else 'low'
    end;
  end if;

  -- ── Trust + reliability levels (internal) ───────────────────────────
  v_trust_level := case
    when v_confirmed = 0 and v_chal_received = 0          then 'new'
    when v_trust_score >= 80                              then 'highly_reliable'
    when v_trust_score >= 65                              then 'reliable'
    when v_trust_score >= 35                              then 'building'
    else                                                       'flagged'
  end;

  v_reliab_level := case
    when v_confirmed = 0 and v_chal_received = 0          then 'new'
    when v_reliab_score >= 80                             then 'highly_reliable'
    when v_reliab_score >= 65                             then 'reliable'
    when v_reliab_score >= 55                             then 'responsive'
    when v_reliab_score >= 35                             then 'building'
    else                                                       'flagged'
  end;

  -- ── Public badge (positive/neutral only) ────────────────────────────
  -- Highest qualifying tier wins. "Confirmed" is gated on clean history,
  -- not on a numerical trust_score threshold (per product rule).
  -- "Building" catches everyone with ANY confirmed history or challenge
  -- response who doesn't qualify higher — the upper-bound from the
  -- original spec was overly narrow and left a gap (3+ confirmed + no
  -- challenges + sub-60 reliability fell to 'new', which read wrong).
  v_badge := case
    when v_ranked_confirmed >= 10
         and (v_dispute_rate is null or v_dispute_rate <= 0.20)
         and (v_void_rate    is null or v_void_rate    <= 0.20)
         and v_distinct_no_show < 2
         and v_distinct_sport   < 2
      then 'confirmed'
    when v_reliab_score >= 60 and v_confidence in ('medium','high')
      then 'reliable'
    when v_chal_responded >= 3 and v_chal_resp_rate is not null and v_chal_resp_rate >= 0.70
      then 'responsive'
    when v_confirmed >= 1 or v_chal_responded >= 1
      then 'building'
    else 'new'
  end;

  -- ── Upsert ──────────────────────────────────────────────────────────
  insert into public.player_trust_profiles (
    user_id,
    confirmed_matches_count, ranked_confirmed_matches_count,
    disputed_matches_count, voided_matches_count, expired_matches_count,
    dispute_rate, void_rate, expired_rate,
    challenges_received_count, challenges_responded_count, challenges_completed_count,
    challenge_response_rate, challenge_avg_response_minutes,
    challenge_completion_rate, challenge_expired_rate,
    invites_claimed_count, invites_declined_count,
    feedback_received_count, effective_feedback_weight,
    would_play_again_rate, fair_score_rate,
    distinct_no_show_reporters, distinct_sportsmanship_reporters,
    repeated_opponent_flag_count, suspicious_match_flag_count,
    trust_score, reliability_score,
    trust_level, reliability_level, confidence_level, public_badge,
    last_calculated_at, updated_at
  ) values (
    p_user_id,
    v_confirmed, v_ranked_confirmed,
    v_disputed, v_voided, v_expired_as_opp,
    v_dispute_rate, v_void_rate, v_expired_rate,
    v_chal_received, v_chal_responded, v_chal_completed,
    v_chal_resp_rate, v_chal_avg_min,
    v_chal_compl_rate, v_chal_exp_rate,
    v_inv_claimed, v_inv_declined,
    v_fb_count, v_fb_weight,
    v_wpa_rate, v_fair_rate,
    v_distinct_no_show, v_distinct_sport,
    v_repeated_flag, v_suspicious_flag,
    v_trust_score, v_reliab_score,
    v_trust_level, v_reliab_level, v_confidence, v_badge,
    now(), now()
  )
  on conflict (user_id) do update set
    confirmed_matches_count           = excluded.confirmed_matches_count,
    ranked_confirmed_matches_count    = excluded.ranked_confirmed_matches_count,
    disputed_matches_count            = excluded.disputed_matches_count,
    voided_matches_count              = excluded.voided_matches_count,
    expired_matches_count             = excluded.expired_matches_count,
    dispute_rate                      = excluded.dispute_rate,
    void_rate                         = excluded.void_rate,
    expired_rate                      = excluded.expired_rate,
    challenges_received_count         = excluded.challenges_received_count,
    challenges_responded_count        = excluded.challenges_responded_count,
    challenges_completed_count        = excluded.challenges_completed_count,
    challenge_response_rate           = excluded.challenge_response_rate,
    challenge_avg_response_minutes    = excluded.challenge_avg_response_minutes,
    challenge_completion_rate         = excluded.challenge_completion_rate,
    challenge_expired_rate            = excluded.challenge_expired_rate,
    invites_claimed_count             = excluded.invites_claimed_count,
    invites_declined_count            = excluded.invites_declined_count,
    feedback_received_count           = excluded.feedback_received_count,
    effective_feedback_weight         = excluded.effective_feedback_weight,
    would_play_again_rate             = excluded.would_play_again_rate,
    fair_score_rate                   = excluded.fair_score_rate,
    distinct_no_show_reporters        = excluded.distinct_no_show_reporters,
    distinct_sportsmanship_reporters  = excluded.distinct_sportsmanship_reporters,
    repeated_opponent_flag_count      = excluded.repeated_opponent_flag_count,
    suspicious_match_flag_count       = excluded.suspicious_match_flag_count,
    trust_score                       = excluded.trust_score,
    reliability_score                 = excluded.reliability_score,
    trust_level                       = excluded.trust_level,
    reliability_level                 = excluded.reliability_level,
    confidence_level                  = excluded.confidence_level,
    public_badge                      = excluded.public_badge,
    last_calculated_at                = excluded.last_calculated_at,
    updated_at                        = excluded.updated_at;
end;
$$;

-- Recalc must NEVER be directly callable by users — it's a privileged
-- aggregate computation. Triggers + RPC wrappers call it as
-- SECURITY DEFINER under the postgres role.
revoke all on function public.recalculate_player_trust_profile(uuid) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 4. submit_post_match_feedback — user-callable RPC
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.submit_post_match_feedback(
  p_match_id            text,
  p_reviewed_user_id    uuid,
  p_would_play_again    boolean default null,
  p_showed_up           boolean default null,
  p_score_felt_fair     boolean default null,
  p_sportsmanship_issue boolean default false,
  p_no_show_report      boolean default false,
  p_private_note        text    default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller   uuid := auth.uid();
  v_match    public.match_history;
  v_new_id   uuid;
begin
  -- Auth gate
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Self-review block (also enforced by table CHECK; raise here for
  -- a clean error message instead of a constraint violation).
  if v_caller = p_reviewed_user_id then
    raise exception 'cannot review yourself';
  end if;

  -- Match must exist and be in an eligible state.
  select * into v_match from public.match_history where id = p_match_id;
  if not found then
    raise exception 'match not found';
  end if;

  -- Eligibility:
  --   - Caller must be a party to the match.
  --   - Reviewed user must be the OTHER party (not self, not freetext).
  --   - Status must be confirmed (post-confirm window) or
  --     pending_reconfirmation (open dispute is OK; weight = 0.5x in recalc).
  --   - Reject pending_confirmation, pending_opponent_claim, voided, expired.
  if v_match.status not in ('confirmed','pending_reconfirmation') then
    raise exception 'feedback only allowed on confirmed or in-flight ranked matches (status: %)', v_match.status;
  end if;

  if v_match.opponent_id is null then
    raise exception 'feedback requires a linked opponent (no freetext matches)';
  end if;

  -- Caller must be one of the parties
  if v_caller not in (v_match.user_id, v_match.opponent_id) then
    raise exception 'you were not a party to this match';
  end if;

  -- Reviewed user must be the OTHER party
  if p_reviewed_user_id not in (v_match.user_id, v_match.opponent_id) then
    raise exception 'reviewed user must be the opponent of the match';
  end if;
  if p_reviewed_user_id = v_caller then
    raise exception 'cannot review yourself';
  end if;

  -- Insert (UNIQUE constraint on (match_id, reviewer_id) blocks duplicates)
  insert into public.post_match_feedback (
    match_id, reviewer_id, reviewed_user_id,
    would_play_again, showed_up, score_felt_fair,
    sportsmanship_issue, no_show_report, private_note
  ) values (
    p_match_id, v_caller, p_reviewed_user_id,
    p_would_play_again, p_showed_up, p_score_felt_fair,
    coalesce(p_sportsmanship_issue, false), coalesce(p_no_show_report, false),
    p_private_note
  )
  returning id into v_new_id;

  -- Refresh the reviewed user's trust profile so the new feedback
  -- reflects in their aggregates immediately.
  perform public.recalculate_player_trust_profile(p_reviewed_user_id);

  return v_new_id;
end;
$$;

revoke all on function public.submit_post_match_feedback(text, uuid, boolean, boolean, boolean, boolean, boolean, text) from public;
grant execute on function public.submit_post_match_feedback(text, uuid, boolean, boolean, boolean, boolean, boolean, text) to authenticated;

comment on function public.submit_post_match_feedback(text, uuid, boolean, boolean, boolean, boolean, boolean, text) is
  'V1: insert one private post-match feedback row + recalc the reviewed user''s trust profile. Validates that caller was a party to the confirmed/in-flight match, that the reviewed user was the opponent, and that no duplicate feedback exists.';


-- ─────────────────────────────────────────────────────────────────────
-- 5. Triggers — fan recalc out from source-of-truth state changes
-- ─────────────────────────────────────────────────────────────────────
--
-- Each trigger wrapper catches any exception so trust math can NEVER
-- block the underlying write. The work is best-effort; if it fails,
-- a future status change or scheduled recalc will heal the row.

create or replace function public.trigger_recalc_match_trust()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Only fire on actual status transitions (avoids redundant work on
  -- every UPDATE — match_history is touched a lot for things like
  -- confirmed_at / current_proposal that don't change trust math).
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and (
        old.status is distinct from new.status
        or old.dispute_reason_code is distinct from new.dispute_reason_code
        or old.opponent_id is distinct from new.opponent_id
     )) then
    begin
      if new.user_id     is not null then perform public.recalculate_player_trust_profile(new.user_id);     end if;
      if new.opponent_id is not null then perform public.recalculate_player_trust_profile(new.opponent_id); end if;
      -- If opponent_id changed (e.g., invite claim attaches a new opp),
      -- recalc the OLD opponent too so their counters drop the link.
      if tg_op = 'UPDATE' and old.opponent_id is not null
         and old.opponent_id is distinct from new.opponent_id then
        perform public.recalculate_player_trust_profile(old.opponent_id);
      end if;
    exception when others then
      raise warning 'trust recalc on match_history failed: %', sqlerrm;
    end;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trust_recalc_match on public.match_history;
create trigger trust_recalc_match
  after insert or update on public.match_history
  for each row execute function public.trigger_recalc_match_trust();


create or replace function public.trigger_recalc_challenge_trust()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and (
        old.status is distinct from new.status
        or old.responded_at is distinct from new.responded_at
        or old.completed_at is distinct from new.completed_at
     )) then
    begin
      if new.challenged_id is not null then perform public.recalculate_player_trust_profile(new.challenged_id); end if;
      if new.challenger_id is not null then perform public.recalculate_player_trust_profile(new.challenger_id); end if;
    exception when others then
      raise warning 'trust recalc on challenges failed: %', sqlerrm;
    end;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trust_recalc_challenge on public.challenges;
create trigger trust_recalc_challenge
  after insert or update on public.challenges
  for each row execute function public.trigger_recalc_challenge_trust();


create or replace function public.trigger_recalc_invite_trust()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and (
        old.status is distinct from new.status
        or old.claimed_by is distinct from new.claimed_by
        or old.declined_by is distinct from new.declined_by
     )) then
    begin
      if new.claimed_by  is not null then perform public.recalculate_player_trust_profile(new.claimed_by);  end if;
      if new.declined_by is not null then perform public.recalculate_player_trust_profile(new.declined_by); end if;
    exception when others then
      raise warning 'trust recalc on match_invites failed: %', sqlerrm;
    end;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trust_recalc_invite on public.match_invites;
create trigger trust_recalc_invite
  after insert or update on public.match_invites
  for each row execute function public.trigger_recalc_invite_trust();


create or replace function public.trigger_recalc_feedback_trust()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- INSERT path is already handled inside submit_post_match_feedback,
  -- but cover any future direct service-role insert for safety.
  begin
    if new.reviewed_user_id is not null then
      perform public.recalculate_player_trust_profile(new.reviewed_user_id);
    end if;
  exception when others then
    raise warning 'trust recalc on post_match_feedback failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trust_recalc_feedback on public.post_match_feedback;
create trigger trust_recalc_feedback
  after insert on public.post_match_feedback
  for each row execute function public.trigger_recalc_feedback_trust();

-- Lock the trigger functions so they can't be called directly by users
-- (Postgres still runs them as the table owner via the trigger machinery).
revoke all on function public.trigger_recalc_match_trust()    from public, anon, authenticated;
revoke all on function public.trigger_recalc_challenge_trust() from public, anon, authenticated;
revoke all on function public.trigger_recalc_invite_trust()    from public, anon, authenticated;
revoke all on function public.trigger_recalc_feedback_trust()  from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 6. Backfill — seed every existing user's trust profile
-- ─────────────────────────────────────────────────────────────────────
--
-- Runs once on apply. Each call is idempotent (recalc derives from
-- source-of-truth tables), so re-running this migration is safe.

do $$
declare
  v_uid uuid;
begin
  for v_uid in select id from auth.users loop
    begin
      perform public.recalculate_player_trust_profile(v_uid);
    exception when others then
      raise warning 'backfill recalc failed for %: %', v_uid, sqlerrm;
    end;
  end loop;
end $$;

commit;
