-- 20260429_profiles_gender.sql
--
-- Add an optional `gender` field to profiles for the player picker
-- filter ("show me men" / "show me women") and any future surfaces
-- that key off gender (mixed-doubles invites, gendered league
-- membership, etc.).
--
-- Storage: text column with a small CHECK constraint so we don't end
-- up with five different spellings of "male" in the wild. Values:
--   'male'                — self-identified man
--   'female'              — self-identified woman
--   'nonbinary'           — outside the m/f binary
--   'prefer_not_to_say'   — set explicitly to opt out of the filter
--   NULL (default)        — not set yet
--
-- NULL is its own state, distinct from 'prefer_not_to_say'. A user who
-- hasn't filled the field in yet (NULL) still appears in the unfiltered
-- player list. Filter UI documents that applying a gender filter will
-- exclude users with NULL gender so the user knows what they're doing.
--
-- The locked-columns trigger does NOT need to lock this — gender is
-- user-editable. New onboarding flow will prompt for it; existing
-- users edit through Settings.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text
    CHECK (gender IS NULL OR gender IN ('male','female','nonbinary','prefer_not_to_say'));

-- Index that supports the filtered roster query — "players in zone X
-- who are women," etc. home_zone is already the high-cardinality
-- prefix in the existing roster query so we lead with it.
CREATE INDEX IF NOT EXISTS profiles_home_zone_gender_idx
  ON public.profiles (home_zone, gender)
  WHERE home_zone IS NOT NULL;
