-- 20260427_courtsync_rating_v1.sql
--
-- Module 7.7 — CourtSync Rating foundation.
--
-- Adds the columns + the locked-columns guard rules + the
-- initialize_rating RPC that bootstraps a new user's rating from
-- their self-assessed skill level. Backfills existing profiles so
-- nothing breaks for the 3 seed accounts.
--
-- Sister migration: 20260427_courtsync_rating_apply_outcome_v2.sql
-- rewrites apply_match_outcome to use the new K-table + auto-lock +
-- derive displayed skill from rating bands. That ships in slice 3.
--
-- Naming reminder: this is "CourtSync Rating", NOT UTR or any
-- official tennis federation ranking. See trust-and-ranking-rules.md.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- Schema: new columns on public.profiles
-- ─────────────────────────────────────────────────────────────────────

alter table public.profiles
  -- The skill level the user explicitly chose during onboarding.
  -- Stays put even after their rating moves and the displayed `skill`
  -- column gets updated by the rating engine.
  add column if not exists starting_skill_level text,

  -- Initial CourtSync Rating, derived from starting_skill_level via
  -- getInitialRatingForSkillLevel() at onboarding. Snapshot — never
  -- changes after initialise.
  add column if not exists initial_rating int,

  -- Whether the user can still manually edit `skill`. Auto-flips to
  -- true on first confirmed ranked match (slice 3 trigger). Once
  -- true, the BEFORE-UPDATE guard rejects client writes to `skill`.
  add column if not exists skill_level_locked boolean not null default false,

  add column if not exists skill_level_locked_at timestamptz,

  -- 'provisional' (< 5 confirmed ranked matches) | 'established' (≥ 5).
  -- Drives K-factor selection in apply_match_outcome.
  add column if not exists rating_status text not null default 'provisional'
    check (rating_status in ('provisional', 'established')),

  -- Total of confirmed ranked matches that fed the rating engine. Distinct
  -- from `matches_played` so we can change calibration rules without
  -- rewriting historical match counts.
  add column if not exists confirmed_ranked_match_count int not null default 0;

comment on column public.profiles.starting_skill_level is
  'Self-assessed skill level chosen during onboarding. Sets initial_rating. Locks after first confirmed ranked match.';
comment on column public.profiles.initial_rating is
  'Snapshot of CourtSync Rating at onboarding. Never updated after initialise_rating().';
comment on column public.profiles.skill_level_locked is
  'When true, the client cannot UPDATE profiles.skill. Auto-set on first confirmed ranked match by apply_match_outcome.';
comment on column public.profiles.rating_status is
  'provisional (< 5 confirmed ranked matches, fast K) | established (≥ 5, slower K).';
comment on column public.profiles.confirmed_ranked_match_count is
  'Counter of rating-eligible matches the player has played. Drives calibration K-factor in apply_match_outcome.';

-- ─────────────────────────────────────────────────────────────────────
-- Backfill existing profiles
-- ─────────────────────────────────────────────────────────────────────
--
-- For existing accounts:
--   - starting_skill_level := current `skill` (their self-rating)
--   - initial_rating       := current ranking_points (no recompute, just snapshot)
--   - skill_level_locked   := true if matches_played > 0 (auto-lock retro)
--   - confirmed_ranked_match_count := matches_played (today's column already
--     counts only confirmed ranked matches — apply_match_outcome short-
--     circuits casual rows so matches_played is already filtered)
--   - rating_status        := 'established' if confirmed_ranked_match_count >= 5
--
-- Cleared values for skill not in the 6-rung set (legacy single-word
-- 'Beginner', 'Competitive' etc. — most were already remapped by the
-- 20260425_skill_levels_v2 migration but defensive backstop here).

update public.profiles
   set starting_skill_level = case
       when skill in (
         'Beginner 1','Beginner 2',
         'Intermediate 1','Intermediate 2',
         'Advanced 1','Advanced 2'
       ) then skill
       else null
     end,
       initial_rating               = ranking_points,
       skill_level_locked           = (matches_played > 0),
       skill_level_locked_at        = case when matches_played > 0 then now() else null end,
       confirmed_ranked_match_count = matches_played,
       rating_status                = case
         when matches_played >= 5 then 'established'
         else 'provisional'
       end
 where starting_skill_level is null;

-- ─────────────────────────────────────────────────────────────────────
-- Locked-columns guard — extend with new columns + skill-when-locked rule
-- ─────────────────────────────────────────────────────────────────────
--
-- Replaces the existing trigger function. Bypass rules are unchanged
-- (postgres role / SECURITY DEFINER paths still pass through). New
-- behaviour:
--   - rejects client writes to: starting_skill_level, initial_rating,
--     skill_level_locked, skill_level_locked_at, rating_status,
--     confirmed_ranked_match_count
--   - rejects client writes to `skill` when skill_level_locked = true

create or replace function public.profiles_locked_columns_guard()
returns trigger
language plpgsql
as $function$
declare
  uid uuid := auth.uid();
begin
  -- Bypass for postgres role (SECURITY DEFINER paths, pg_cron, direct
  -- postgres access). Auth-less context (no JWT) also passes — covers
  -- Realtime / system writes.
  if current_user = 'postgres' then return new; end if;
  if uid is null then return new; end if;
  if tg_op <> 'UPDATE' then return new; end if;

  -- ── Existing locks ────────────────────────────────────────────────
  if new.is_admin is distinct from old.is_admin then
    raise exception 'profiles.is_admin is not user-writable';
  end if;
  if new.ranking_points is distinct from old.ranking_points then
    raise exception 'profiles.ranking_points is not user-writable';
  end if;
  if new.wins is distinct from old.wins then
    raise exception 'profiles.wins is not user-writable';
  end if;
  if new.losses is distinct from old.losses then
    raise exception 'profiles.losses is not user-writable';
  end if;
  if new.matches_played is distinct from old.matches_played then
    raise exception 'profiles.matches_played is not user-writable';
  end if;
  if new.streak_count is distinct from old.streak_count then
    raise exception 'profiles.streak_count is not user-writable';
  end if;
  if new.streak_type is distinct from old.streak_type then
    raise exception 'profiles.streak_type is not user-writable';
  end if;

  -- ── New CourtSync Rating locks (Module 7.7) ──────────────────────
  if new.starting_skill_level is distinct from old.starting_skill_level then
    raise exception 'profiles.starting_skill_level is set once via initialize_rating()';
  end if;
  if new.initial_rating is distinct from old.initial_rating then
    raise exception 'profiles.initial_rating is set once via initialize_rating()';
  end if;
  if new.skill_level_locked is distinct from old.skill_level_locked then
    raise exception 'profiles.skill_level_locked is server-managed';
  end if;
  if new.skill_level_locked_at is distinct from old.skill_level_locked_at then
    raise exception 'profiles.skill_level_locked_at is server-managed';
  end if;
  if new.rating_status is distinct from old.rating_status then
    raise exception 'profiles.rating_status is server-managed';
  end if;
  if new.confirmed_ranked_match_count is distinct from old.confirmed_ranked_match_count then
    raise exception 'profiles.confirmed_ranked_match_count is server-managed';
  end if;

  -- Skill is user-editable only while skill_level_locked = false.
  if old.skill_level_locked = true and new.skill is distinct from old.skill then
    raise exception 'profiles.skill is locked once a confirmed ranked match has been recorded';
  end if;

  return new;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- initialize_rating(p_skill text)
-- ─────────────────────────────────────────────────────────────────────
--
-- One-shot bootstrap from onboarding. Validates the supplied skill is
-- one of the canonical 6 levels, looks up the starting rating, writes
-- starting_skill_level + initial_rating + ranking_points + skill (so
-- the displayed skill matches at t=0). Idempotent in the sense that
-- it errors loudly if the user is already initialized — no silent
-- overwrite of someone's accumulated rating.

create or replace function public.initialize_rating(p_skill text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_initial       int;
  v_existing_init int;
begin
  if v_uid is null then
    raise exception 'initialize_rating requires an authenticated user';
  end if;

  -- Map skill → initial rating. Mirrors the JS RATING_BANDS in
  -- src/features/rating/constants.js. If the new ladder ever changes,
  -- both sides change together.
  v_initial := case p_skill
    when 'Beginner 1'     then 800
    when 'Beginner 2'     then 1000
    when 'Intermediate 1' then 1200
    when 'Intermediate 2' then 1400
    when 'Advanced 1'     then 1600
    when 'Advanced 2'     then 1800
    else null
  end;

  if v_initial is null then
    raise exception 'initialize_rating: unknown skill level "%"', p_skill;
  end if;

  -- Refuse to clobber an already-initialized rating. The starting
  -- level is meant to be set once.
  select initial_rating into v_existing_init from profiles where id = v_uid;
  if v_existing_init is not null then
    raise exception 'initialize_rating: rating already initialized for this user';
  end if;

  update profiles
     set starting_skill_level = p_skill,
         initial_rating       = v_initial,
         ranking_points       = v_initial,
         skill                = p_skill,
         rating_status        = 'provisional',
         confirmed_ranked_match_count = 0
   where id = v_uid;
end;
$$;

revoke all on function public.initialize_rating(text) from public, anon;
grant execute on function public.initialize_rating(text) to authenticated;

comment on function public.initialize_rating(text) is
  'Module 7.7. One-shot rating bootstrap. Looks up p_skill in the rating-band table, writes initial_rating + starting_skill_level + ranking_points + skill in one go. Errors if already initialized.';

commit;
