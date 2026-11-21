# Live site, backend and visitors' devices (Jiscar 2, branch `j2-live`)

Findings log. Every hole has its reproduction (tokens shown as placeholders) and its fix or status.
Re-run the checks with `supabase/tests/rls-harness.mjs` (local Postgres, no network) and
`supabase/tests/live-probes.mjs` (the live project, creates `QA-` guests).

## Sunday cleanup: test players (Greg's Claude runs it after Greg checks the list)

Test players are every profile named `QA-…` (any case: `ilike`) plus one stray guest of mine that
kept its default name (`Guest-NNNN`, id starting `17c6592d`). Run in the Supabase SQL editor.

**1. List** (read only). Show Greg this list before step 2:

```sql
select p.id, p.display_name, p.created_at,
       count(s.id) as sessions, coalesce(max(s.score), 0) as best_score
from public.profiles p
left join public.sessions s on s.user_id = p.id
where p.display_name ilike 'QA-%'
   or (p.id::text like '17c6592d%' and p.display_name like 'Guest-%')
group by p.id, p.display_name, p.created_at
order by p.created_at;
```

**2. Delete.** Same `where`, so it deletes exactly the rows listed; sessions go with their profile
(`on delete cascade`). The SQL editor runs the whole block at once: run it first ending in
`rollback;` and check that "DELETE n" matches the list and both counts are 0, then run it again
ending in `commit;`.

```sql
begin;
delete from public.profiles p
where p.display_name ilike 'QA-%'
   or (p.id::text like '17c6592d%' and p.display_name like 'Guest-%');
select count(*) as qa_left from public.profiles
  where display_name ilike 'QA-%' or (id::text like '17c6592d%' and display_name like 'Guest-%');
select count(*) as qa_on_board from public.leaderboard where display_name ilike 'QA-%';
rollback;  -- then commit;
```

Tested on a local Postgres (PGlite) with all migrations and a mix of players: it removes the
`QA-` players (any case) and the stray guest with their rounds, and keeps a real player whose id
also starts `17c6592d`, a real `Guest-` visitor and the kiosk's `Leaderboard` users. The board
afterwards shows only the real players.

Left on purpose: the anonymous `auth.users` rows behind those profiles (no name, no rounds, not on
any board) and the kiosk's `Leaderboard` profiles (no rounds; count them with
`select count(*) from public.profiles where display_name = 'Leaderboard';`).

## Leaderboard cheating (Saturday 6 PM)

**Setup a visitor has:** the anon key (public, in the bundle) and a guest token from
`POST https://<ref>.supabase.co/auth/v1/signup` with body `{}` and header `apikey: <ANON_KEY>`.
Every REST call below sends `apikey: <ANON_KEY>` and `Authorization: Bearer <GUEST_TOKEN>`.

Probed on the live project (guests `QA-j2a-A`, `QA-j2a-B`), before any fix:

| # | Request | Live result | Status |
| --- | --- | --- | --- |
| L1 | `POST /rest/v1/sessions` with `score: 999999` (600 s round) | 201, and the 999,999 shows on the leaderboard view | **Fixed by 0004** (cap `300 × duration_sec`) |
| L1 | same, `score: 99999`, `duration_sec: 11` | 201 | **Fixed by 0004** |
| L2 | same, `reps` = a 300 KB object | 201 (database bloat, no size limit) | **Fixed by 0004** (1 KB, must be an object) |
| L3 | same, `created_at: "2099-01-01T00:00:00Z"` | 201; the board shows the date | **Fixed by 0004** (future dates clamped to now) |
| L4 | `PATCH`/`DELETE /rest/v1/sessions`, `DELETE /rest/v1/profiles` | 200 `[]`: the grant exists, only the missing RLS policy blocks it | **Hardened by 0004** (grants revoked; profile updates limited to the 5 editable columns) |
| L5 | `PATCH /rest/v1/profiles?id=eq.<own id>` `{"display_name": "<another player's name>"}` | 200: names are not unique, so a visitor can pose as another player | **Open, accepted for now** (see below) |
| ok | read another player's sessions or profile; insert a session or profile as another user | `[]` / 403 RLS | fine |
| ok | anon key alone: read the leaderboard or sessions; call `claim_coach_slot`; read `coach_calls` | 401 / 403 | fine |
| ok | `PATCH /rest/v1/leaderboard` | refused (view not updatable) | fine |

The 999,999 test row was written to the 600 s board, which the app never shows; no visible board
was touched. Both QA guests are in the Sunday cleanup (`QA-` prefix).

**The cap.** Perfect play of every generated level (every workout, mode, difficulty 0 to 1 in
0.1 steps, low impact on and off, 10 to 600 s, about 9,000 levels per length) peaks at 8,250 in
45 s, 19,500 in 90 s, 40,400 in 180 s: at most about 229 points a second. The cap is 300 a second
(13,500 / 27,000 / 54,000), at least 30 % above any honest round. `src/app/scoreCap.test.ts`
replays the levels and fails if a generator or scoring change comes within 20 % of it.
A cheater can still post any score under the cap (say 9,000 in 45 s, above the 4,750 demo
perfect): stopping that needs the server to replay the seed. Not worth it in the time left.

**Offline queue.** One row the database refuses failed the whole batch upsert, so it would have
blocked every later round in the queue for good. `sendQueue` now retries one row at a time when the
batch is refused for a bad row (Postgres 23514, 23502, 22xxx), drops only the refused rows, and
never reports them as synced. A network or server error still keeps the whole queue.

**L5, duplicate names.** A unique name would lock out players: `Guest-NNNN` has 9,000 values, so
with 100 guests a collision is likely, and today a failed profile insert drops the player to the
local store with no explanation. Fixing it needs a client retry with a suffix. Proposed for later
if time allows; judges see names only on the board.

## Self-grade

- **Saturday 6:30 PM.** A visitor could have put 999,999 on any board from DevTools in two
  requests: real and judge-visible. Migration 0004 closes it, but it isn't applied yet.
  Theoretical: the 300 KB rows and TRUNCATE (not reachable through REST). Next: the live site
  end to end, then devices.
