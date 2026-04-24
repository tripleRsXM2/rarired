-- 20260425_skill_levels_v2.sql
--
-- Skill ladder: 4 levels → 6 levels (three tiers × two sub-levels).
--
-- Rationale lives in src/lib/constants/domain.js. Short version: the old
-- 4 buckets buried too much range; new 6-rung ladder keeps self-assess
-- noise manageable while giving matchmaking a ±1-candidate window.
--
-- Legacy values are remapped in-place. `Beginner` / `Intermediate` /
-- `Advanced` land at sub-level 1 (early in tier — humble mapping, easy
-- to bump up later). `Competitive` was the old top slot, lands at
-- Advanced 2 (late in the Advanced tier).
--
-- Data volume at apply time: 3 profile rows in prod. Migration is a
-- trivial UPDATE; no enum type to ALTER because `skill` is a free text
-- column today (design intent is that the authoritative enum lives in
-- the client constants file).

begin;

update public.profiles
   set skill = case skill
     when 'Beginner'     then 'Beginner 1'
     when 'Intermediate' then 'Intermediate 1'
     when 'Advanced'     then 'Advanced 1'
     when 'Competitive'  then 'Advanced 2'
     else skill
   end
 where skill in ('Beginner','Intermediate','Advanced','Competitive');

commit;
