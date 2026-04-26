-- 20260429_age_bracket_replaces_birthdate.sql
--
-- Replace profiles.birthdate (date) with profiles.age_bracket (text)
-- per user redesign of the Settings age input. Brackets match the
-- six tennis age categories (Junior / Open / 35+ / Masters / Seniors)
-- and surface as a card grid instead of a calendar — friction down,
-- PII footprint down. We never needed the day or month for matchmaking.
--
-- birthdate was added earlier today and is unlikely to be populated
-- in the wild yet, so we drop it without backfilling.

ALTER TABLE public.profiles DROP COLUMN IF EXISTS birthdate;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age_bracket text
    CHECK (age_bracket IS NULL OR age_bracket IN (
      'u18',     -- Under 18    (Junior)
      '18_24',   -- 18–24        (Open)
      '25_34',   -- 25–34        (Open)
      '35_44',   -- 35–44        (35+)
      '45_54',   -- 45–54        (Masters)
      '55_plus'  -- 55+          (Seniors)
    ));
