-- 0007_friends: unique usernames and a friends board (contracts: FriendBoardEntry,
-- AddFriendResult, DataStore.isUsernameTaken / addFriend / listFriends / getFriendsBoard).
--
-- Adding a friend is one-way ("you see their scores"): nobody can put themselves on someone
-- else's board. Only names and scores are shared, as on the public leaderboard. Every friends
-- read and write goes through the security-definer functions below; the table itself has RLS on
-- and no grants. The leaderboard view is untouched (it stays a plain view: no security_invoker).

-- 1. Usernames are unique, ignoring case. Older duplicates (by created_at) get "-" and the first
--    6 characters of their id; 33 + 1 + 6 = 40 keeps the 1-40 length check.
with d as (
  select id, display_name,
         row_number() over (partition by lower(display_name) order by created_at, id) as n
  from public.profiles
)
update public.profiles p
set display_name = left(d.display_name, 33) || '-' || left(p.id::text, 6)
from d
where p.id = d.id and d.n > 1;

create unique index profiles_display_name_unique on public.profiles (lower(display_name));

-- 2. Who follows whom. No direct access: only the functions below read or write it.
create table public.friends (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
alter table public.friends enable row level security;
revoke all on public.friends from public, anon, authenticated;

-- 3. Is a username taken? (Names are public on the board already.)
create function public.username_taken(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where lower(display_name) = lower(btrim(p_name))
  );
$$;

-- 4. Add a friend by username. Returns 'ok', 'notFound', 'self', 'already' or 'limit', and the
--    friend's name as stored.
create function public.add_friend(p_name text)
returns table (status text, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  them uuid;
  their_name text;
begin
  if me is null then
    return query select 'notFound'::text, null::text;
    return;
  end if;
  select p.id, p.display_name into them, their_name
  from public.profiles p
  where lower(p.display_name) = lower(btrim(p_name));
  if them is null then
    return query select 'notFound'::text, null::text;
  elsif them = me then
    return query select 'self'::text, their_name;
  elsif exists (select 1 from public.friends f where f.user_id = me and f.friend_id = them) then
    return query select 'already'::text, their_name;
  elsif (select count(*) from public.friends f where f.user_id = me) >= 50 then
    return query select 'limit'::text, their_name;
  else
    insert into public.friends (user_id, friend_id) values (me, them);
    return query select 'ok'::text, their_name;
  end if;
end;
$$;

-- 5. The current player's friends, A to Z.
create function public.list_friends()
returns table (display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name
  from public.friends f
  join public.profiles p on p.id = f.friend_id
  where f.user_id = auth.uid()
  order by lower(p.display_name);
$$;

-- 6. Best round of the current player and each friend on one board, highest first.
create function public.friends_board(p_workout text, p_mode text, p_duration int, p_limit int)
returns table (display_name text, score int, created_at timestamptz, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select b.display_name, b.score, b.created_at, b.is_me
  from (
    select distinct on (s.user_id)
      p.display_name, s.score, s.created_at, s.user_id = auth.uid() as is_me
    from public.sessions s
    join public.profiles p on p.id = s.user_id
    where s.workout = p_workout
      and s.mode = p_mode
      and s.duration_sec = p_duration
      and (
        s.user_id = auth.uid()
        or s.user_id in (select f.friend_id from public.friends f where f.user_id = auth.uid())
      )
    order by s.user_id, s.score desc, s.created_at asc
  ) b
  order by b.score desc, b.created_at asc
  limit least(greatest(coalesce(p_limit, 51), 1), 51);
$$;

revoke all on function public.username_taken(text), public.add_friend(text),
  public.list_friends(), public.friends_board(text, text, int, int) from public, anon;
grant execute on function public.username_taken(text), public.add_friend(text),
  public.list_friends(), public.friends_board(text, text, int, int) to authenticated;
