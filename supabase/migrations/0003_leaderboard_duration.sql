-- 0003_leaderboard_duration: one board per round length as well (docs/CONTRACTS.md, "Database").
-- A 180 s round scores about 6x a 45 s one (src/workout/README.md, "Leaderboard fairness"), so a
-- judge's 45 s round could never top a board holding one long round.
-- `create or replace view` can only add columns at the end and this changes `distinct on`, so drop
-- and recreate. It stays a plain view: never add security_invoker (see CONTRACTS.md).

drop view public.leaderboard;

create view public.leaderboard as
select display_name, workout, mode, score, created_at, duration_sec
from (
  select distinct on (s.user_id, s.workout, s.mode, s.duration_sec)
    p.display_name, s.workout, s.mode, s.score, s.created_at, s.duration_sec
  from public.sessions s
  join public.profiles p on p.id = s.user_id
  order by s.user_id, s.workout, s.mode, s.duration_sec, s.score desc, s.created_at asc
) best;

-- authenticated too: Supabase's default privileges grant it every privilege on a new view.
revoke all on public.leaderboard from public, anon, authenticated;
grant select on public.leaderboard to authenticated;
