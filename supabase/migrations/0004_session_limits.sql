-- 0004_session_limits: stop a visitor from writing an impossible session with the public anon key
-- and their own guest token (docs/LIVE.md, L1 to L4). Reproduced on the live project before this
-- migration: a guest could insert score 999999, 99999 in an 11 s round, a 300 KB reps blob and a
-- created_at in 2099, and the 999999 showed on the leaderboard.
--
-- Constraints are NOT VALID: they check every new row, but the migration does not fail on rows
-- already stored (test players are cleaned up separately; nothing is deleted here).
--
-- A queued offline session that breaks one of these is dropped by the client instead of blocking
-- the queue (src/data/supabase.ts, sendQueue), so a too-tight limit can never lock a player out.

-- L1. Score ceiling: 300 points per second of round. Perfect play of every generated level
-- (every workout, mode, difficulty 0 to 1, low impact, 10 to 600 s) peaks at about 229 per
-- second (8,250 in 45 s, 19,500 in 90 s, 40,400 in 180 s). src/app/scoreCap.test.ts reads 300
-- from this file and fails if a generator or scoring change gets within 20 % of it.
alter table public.sessions
  add constraint sessions_score_ceiling check (score <= 300 * duration_sec) not valid;

-- L2. reps and missed are small objects of six counters (about 150 bytes).
alter table public.sessions
  add constraint sessions_reps_small
    check (jsonb_typeof(reps) = 'object' and pg_column_size(reps) <= 1024) not valid,
  add constraint sessions_missed_small
    check (jsonb_typeof(missed) = 'object' and pg_column_size(missed) <= 1024) not valid;

-- L3. created_at comes from the client (a queued session keeps the time it was played). A time in
-- the future is clamped to now() instead of rejected, so a device with a fast clock still saves.
create function public.sessions_clamp_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_at is null or new.created_at > now() then
    new.created_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.sessions_clamp_created_at() from public, anon, authenticated;

create trigger sessions_clamp_created_at
  before insert on public.sessions
  for each row execute function public.sessions_clamp_created_at();

-- L4. Grants: only what the app uses. Supabase's default privileges had also given
-- `authenticated` UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER on both tables (RLS blocked
-- the update and delete, but nothing should rely on a missing policy alone). The sessions upsert
-- is ON CONFLICT DO NOTHING, which needs INSERT only. Profile updates are limited to the columns
-- the app edits, so id and created_at can never change.
revoke all on public.sessions, public.profiles from anon, authenticated;
grant select, insert on public.sessions to authenticated;
grant select, insert on public.profiles to authenticated;
grant update (display_name, goal, level, weight_kg, weekly_goal_min) on public.profiles
  to authenticated;
