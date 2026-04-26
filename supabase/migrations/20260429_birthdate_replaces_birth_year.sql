-- 20260429_birthdate_replaces_birth_year.sql
--
-- Replace profiles.birth_year (integer, year only) with
-- profiles.birthdate (date) per user feedback that the birth-year
-- input felt clinical and the live "29 years old" preview was odd.
-- A full date input lets the user type their birthday naturally
-- via the native date picker on mobile and a calendar on desktop.
--
-- Age is still computed on the fly (player cards in the map
-- picker) — we just store the day/month/year now instead of just
-- the year. Privacy footprint is the same kind of PII (birthday is
-- the canonical age verifier on every social product); CHECK
-- constraint pins it to a sane range.
--
-- birth_year was added in 20260429_drop_payment_handle_add_birth_year.sql
-- earlier today and is unlikely to be populated in the wild yet,
-- so we drop it without backfilling.

ALTER TABLE public.profiles DROP COLUMN IF EXISTS birth_year;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birthdate date
    CHECK (birthdate IS NULL OR (birthdate >= '1900-01-01' AND birthdate <= CURRENT_DATE));
