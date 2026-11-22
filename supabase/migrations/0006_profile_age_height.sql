-- 0006_profile_age_height: optional age and height on the profile (Profile.age and
-- Profile.heightCm in src/contracts, #109), entered on the landing sign-up. For the coach only:
-- the leaderboard view names its columns (0003), and api/coach.ts selects named columns, so
-- neither shares them. Both nullable, ranges as in the contract (src/data/tuning.ts).
alter table public.profiles
  add column age smallint check (age is null or age between 10 and 100),
  add column height_cm numeric(4, 1) check (height_cm is null or height_cm between 100 and 250);

-- 0004 limits profile updates to the columns the app edits: add the two new ones. INSERT and
-- SELECT are table-wide grants already, and the row-level security policies cover new columns.
grant update (age, height_cm) on public.profiles to authenticated;
