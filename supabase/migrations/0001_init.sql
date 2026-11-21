-- 0001_init: profiles, sessions, leaderboard (docs/CONTRACTS.md, "Database").
-- Owner: backend (Greg). New changes go in a new numbered file; never edit an applied one.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default ('Guest-' || (floor(random() * 9000) + 1000)::int::text)
    check (char_length(display_name) between 1 and 40),
  goal text not null default 'getMoving'
    check (goal in ('getMoving', 'buildStrength', 'cardio')),
  level text not null default 'beginner'
    check (level in ('beginner', 'regular', 'athlete')),
  weight_kg numeric check (weight_kg is null or weight_kg between 20 and 300),
  weekly_goal_min int not null default 60 check (weekly_goal_min between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.sessions (
  -- The client generates the id, so a session queued offline keeps it and a retried insert is a no-op.
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workout text not null check (workout in ('legs', 'arms', 'shoulders', 'fullBody')),
  mode text not null check (mode in ('floor', 'treadmill')),
  duration_sec int not null check (duration_sec between 10 and 600),
  active_sec numeric not null check (active_sec between 0 and 3600),
  difficulty numeric check (difficulty between 0 and 1),
  seed int check (seed >= 0),
  score int not null check (score >= 0),
  best_streak int not null default 0 check (best_streak >= 0),
  cleared int not null default 0 check (cleared >= 0),
  hit int not null default 0 check (hit >= 0),
  accuracy numeric not null default 0 check (accuracy between 0 and 1),
  kcal numeric not null default 0 check (kcal >= 0),
  reps jsonb not null default '{}'::jsonb,
  missed jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index sessions_user_created_idx on public.sessions (user_id, created_at desc);
create index sessions_board_idx on public.sessions (workout, mode, score desc);

-- Row-level security: a user reads and writes only their own rows.
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;

create policy "profiles: select own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Sessions: insert and select only. No update, no delete.
create policy "sessions: select own" on public.sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "sessions: insert own" on public.sessions
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Explicit grants (newer Supabase projects do not expose new tables automatically).
revoke all on public.profiles, public.sessions from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.sessions to authenticated;

-- Leaderboard: each user's best score per workout and mode.
-- This is a PLAIN view on purpose: it runs with the owner's rights, so it can read every
-- user's best score even though sessions RLS hides other users' rows. NEVER add
-- security_invoker = true (then everyone sees only their own scores), even if the Supabase
-- Security Advisor flags "Security Definer View". It exposes no reps, calories or weight.
create view public.leaderboard as
select display_name, workout, mode, score, created_at
from (
  select distinct on (s.user_id, s.workout, s.mode)
    p.display_name, s.workout, s.mode, s.score, s.created_at
  from public.sessions s
  join public.profiles p on p.id = s.user_id
  order by s.user_id, s.workout, s.mode, s.score desc, s.created_at asc
) best;

revoke all on public.leaderboard from public, anon;
grant select on public.leaderboard to authenticated;
