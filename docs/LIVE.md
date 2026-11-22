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

## Rollback plan for 0004 (and 0005): only if it blocks legitimate saves

Not run. Each block undoes one part of `0004_session_limits.sql`, so only what is actually
blocking goes. All were tested on a local Postgres (PGlite) with 0001 to 0004: the refused request
works afterwards, a normal round still saves, profile updates still work, and the leaderboard is
still readable and still a plain view (no `security_invoker`).

**How to tell.** A real round that doesn't reach the board. In the player's browser console:
`The server refused a session; it is dropped.` with the constraint name; or `smoke.mjs` failing on
"save a 45 s round"; or, in the SQL editor, no new rows while people play:
`select count(*) from public.sessions where created_at > now() - interval '15 minutes';`

| Symptom (Postgres error) | Cause | Undo |
| --- | --- | --- |
| `23514 … sessions_score_ceiling` on an honest round | the cap (300 × duration) is too low after a scoring change | **A** |
| `23514 … sessions_reps_small` or `sessions_missed_small` | `reps`/`missed` changed shape (not an object, or over 1 KB) | **B** |
| `42501 permission denied for table profiles` on a profile save | the app updates a column outside the 5 granted ones | **C** |
| a round's date looks wrong | the clamp trigger (it never refuses a save) | **D** |

```sql
-- A: the score ceiling
alter table public.sessions drop constraint if exists sessions_score_ceiling;

-- B: the size limits on reps and missed
alter table public.sessions drop constraint if exists sessions_reps_small,
  drop constraint if exists sessions_missed_small;

-- C: profile updates on every column again (as in 0001)
grant update on public.profiles to authenticated;

-- D: the created_at clamp
drop trigger if exists sessions_clamp_created_at on public.sessions;
drop function if exists public.sessions_clamp_created_at();
```

All of 0004 at once (the revoked UPDATE and DELETE on sessions are not restored: no RLS policy
allowed them anyway, so nothing legitimate used them):

```sql
begin;
alter table public.sessions drop constraint if exists sessions_score_ceiling,
  drop constraint if exists sessions_reps_small,
  drop constraint if exists sessions_missed_small;
drop trigger if exists sessions_clamp_created_at on public.sessions;
drop function if exists public.sessions_clamp_created_at();
grant update on public.profiles to authenticated;
commit;
```

**0005** (only if it gets applied): it can't block a save; it only lets visitors who aren't signed
in read the board. To close the board to them again: `revoke select on public.leaderboard from anon;`

## Privacy: what we store and who sees it (for the judges)

Checked against `supabase/migrations/0001` to `0004`, `api/coach.ts` and the code (`src/pose` makes
no network call at all; only `src/data` talks to the network).

- **The video never leaves the laptop.** Pose tracking (MediaPipe) runs in the browser; the model is
  downloaded from our own site. No frame and no body landmark is sent anywhere.
- **What we store per player** (Supabase, Postgres): an anonymous account (no email, no password,
  no phone), and a profile with the **name they type**, goal, fitness level, weekly goal, and
  **weight only if they choose to enter it**. Per round: workout, mode, length, score, accuracy,
  streak, moves counted, misses per move, estimated calories, date. For the coach's rate limit, the
  time of the last coach call.
- **Who can read it.** Row-level security on every table: a player can read and write only their
  own profile and rounds, and can't change or delete a round once saved. The **leaderboard** is the
  only shared view: name, workout, mode, round length, score and date, each player's best only:
  no weight, no calories, no moves.
- **On the laptop**: the same profile and rounds are cached in the browser's local storage, so it
  works offline.
- **The AI coach** (off tonight: no key is set): when on, the server sends the profile's name, goal,
  level and weekly goal plus the last 10 rounds to Claude for a recap. Never the weight, never video.
- **Being forgotten.** "New guest" signs the player out on this laptop and erases their local copy.
  The rows on the server stay, anonymous (no contact details), until we delete them: test players
  are deleted Sunday, and any player can ask us to delete theirs (deleting the profile deletes its
  rounds). There is no self-service delete button.
- Supabase keeps its own auth logs (request IPs) for 24 hours on our plan.

## Expo evening readiness (Saturday 8 PM)

### Is the live build current?

Yes, as of `main` cd780f0. The live main script holds the device notice (#61) and the "leaderboard
server is busy" notice (#64), and a phone user agent (Pixel 7) on https://codejam-jet.vercel.app
gets "Play on a laptop in Chrome". (An earlier "#64 is not live" was my mistake: PowerShell split
the downloaded script into lines, so a text search missed it.)

Re-run on that build: `live-probes.mjs` (guests `QA-j2sat8-*`) gives the same results as after
0004: every cheat refused, `created_at` 2099 stored as 2026, only L5 (duplicate names, left open)
flagged. One real keyboard round (`QA-j2-sat8round`): profile 201, session 201, board 200, rank
shown (#7), coach card from the rules after the 503.

**Test players on the visible board.** That #7 means the 45 s Full body board, which the landing
page and the kiosk show to everyone, is now mostly `QA-` players (mine and the team's). If the expo
is tonight, consider running the cleanup (above) before it rather than Sunday. My further test
rounds go to Shoulders treadmill, the least-watched board.

### Kiosk (`?kiosk=1`) for 10 minutes

| | Result |
| --- | --- |
| Board refreshes | 40 in 10 min (every 15 s), all 200 |
| Console errors, page errors | 0, 0 |
| Anonymous users created | 1 per page load (plus a `Leaderboard` profile), none while it stays open |
| Supabase traffic | 39 KB in 10 min (about 0.25 MB an hour) |

Not yet covered: the access token expires after an hour, and a kiosk open all evening relies on
supabase-js refreshing it. A 70-minute run is going (result in the next update). With #58's 0005,
the kiosk would not need a guest at all.

### Supabase free plan: limits for an expo evening

From supabase.com/pricing and the Auth rate-limit docs (checked Saturday night):

| Limit | Free plan | Our use tonight | Risk |
| --- | --- | --- | --- |
| **Anonymous sign-ins** | **30 per hour per IP by default** (configurable in Authentication → Rate Limits) | Every visitor on the venue wifi shares one public IP. Each new guest, each kiosk page load and each test run counts | **High if still at the default.** Guest 31 in an hour falls back to the local store (#64 now says "server busy"), so their rounds never reach the board. The brief assumes 1000/h. **Greg's Claude: confirm the configured value in the dashboard**; I can't read it from outside (no rate-limit headers). All of today's sign-ups from this campus network succeeded, about 20 within one hour. Also stop scripted tests from the venue wifi during the expo. |
| Token refresh | 150 per 5 min per IP | One per player per hour | Low |
| Monthly active users | 50,000 | Hundreds at most | None |
| Database size | 500 MB | A session row is under 1 KB; 10,000 rounds is under 10 MB | None |
| Egress | 5 GB (+5 GB cached) | About 50 KB per player (sign-in, profile, 50-row history, boards); kiosk 0.25 MB/h | None: 5 GB is about 100,000 players |
| API requests | Unlimited | | None |
| Pausing | After 1 week without activity | | None this weekend |

The 9 MB pose model and WASM come from Vercel, not Supabase. Vercel's Hobby plan includes 100 GB
of transfer a month: about 10,000 camera visitors.

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
