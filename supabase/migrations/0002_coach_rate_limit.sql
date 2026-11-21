-- 0002_coach_rate_limit: at most one /api/coach call per user per interval (PLAN: 1 per 10 s).
-- Serverless functions keep no state between calls, so the last call time lives here.

create table public.coach_calls (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_call_at timestamptz not null default now()
);

-- RLS on, and deliberately NO policies: nobody reads or writes this table directly. Only
-- claim_coach_slot() below (security definer) touches it, and only for the caller's own row.
alter table public.coach_calls enable row level security;
revoke all on public.coach_calls from public, anon, authenticated;

-- Atomically claims a coach call for the signed-in user. Returns true if the last call was at
-- least p_min_interval_seconds ago (or there was none) and records this call; false otherwise.
-- The endpoint passes the interval; it is clamped so a caller can never shorten it below 1 s.
create function public.claim_coach_slot(p_min_interval_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
  gap interval := make_interval(secs => greatest(1, least(coalesce(p_min_interval_seconds, 10), 3600)));
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into public.coach_calls as c (user_id, last_call_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_call_at = now()
    where c.last_call_at <= now() - gap
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_coach_slot(int) from public, anon;
grant execute on function public.claim_coach_slot(int) to authenticated;
