-- 20260429_drop_payment_handle_add_birth_year.sql
--
-- Two product changes in one migration so the column moves are
-- visible in a single commit in case we ever audit profile shape.
--
-- 1. Drop the Tindis payment-handle columns. The Tindis pact split
--    feature is staying, but the "set your PayID/Venmo/PayPal handle
--    so partners can deep-link a payment" affordance is being
--    retired — the data was barely set in the wild and the deep
--    links were brittle (different OS pickers, version-locked URI
--    schemes). Pacts now stay at the "mark yourself paid" toggle.
--
-- 2. Add birth_year (integer, optional). Used for the player picker
--    cards and any future age-bracket filtering. We deliberately
--    store year-only — full DOB is more PII than we need and harder
--    to justify to users on signup.

-- Drop columns. RAISE NOTICE skipped — IF EXISTS is enough.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS payment_handle;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS payment_method;

-- birth_year (year only — privacy-preserving).
-- CHECK: 1900 ≤ year ≤ current year. Hard cap so a user can't fat-
-- finger 1850 or 9999. Children under 13 are out of scope (terms);
-- we don't enforce a floor here, just on the client copy.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_year integer
    CHECK (birth_year IS NULL OR (birth_year >= 1900 AND birth_year <= EXTRACT(YEAR FROM now())::int));
