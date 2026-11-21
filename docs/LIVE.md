# Live site, backend and visitors' devices (Jiscar 2, branch `j2-live`)

Findings log. Every hole has its reproduction (tokens shown as placeholders) and its fix or status.
Re-run the checks with `supabase/tests/rls-harness.mjs` (local Postgres, no network) and
`supabase/tests/live-probes.mjs` (the live project, creates `QA-` guests).

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

## Live site end to end (Saturday 6:15 PM, headless Chrome 1280×800, keyboard)

Players: `QA-j2-e2e6`, `QA-j2-off1`, `QA-j2-fast3g`, `QA-j2-slow3g`, plus probe guests
`QA-j2-e2e2` to `e2e5` (no rounds). **One guest kept its default name** (`Guest-NNNN`, user id
starting `17c6592d`, no rounds): include it in the cleanup.

| Check | Result |
| --- | --- |
| First visit, guest sign-in, profile | OK: signup 200, profile insert 201, name patch 200 |
| A 45 s round saved | OK: one `POST sessions` 201, results show rank (#3), personal best, coach card |
| Coach | `/api/coach` 503 "coach not configured" in about 0.4 s; the rules card shows at once |
| Dashboard | OK: round, reps, minutes, coach's pick |
| Leaderboard per round length | OK: 45 s board with both test players and "YOU"; 90 s and 180 s switch |
| Returning player (reload) | OK: "Continue as QA-J2-OFF1", landing shows today's top 3 |
| `?kiosk=1` | OK: board, "Beat 1,800 to take the crown"; the game tab still offers its own player |
| Two browsers, two players | OK: both on the same 45 s board |
| Network cut mid-round, back after results | OK: offline banner; queue 1; on reconnect one `POST` 201, queue 0, no duplicate |
| **F1: Leaderboard before sign-in** | **Empty: "Be the first on the board" over a full board, and no top 3 on the landing.** The store only read the board when signed in. Every QR visitor sees this. Fix: PR j2-board (migration 0005 + store). |

**Slow network** (Chrome presets, cold, then reload):

| | First load | Reload | Guest sign-in | Profile save | Start to tutorial |
| --- | --- | --- | --- | --- | --- |
| Fast 3G | 2.7 s, 253 KB | 1.2 s | 2.4 s | 1.6 s | 1.0 s (game chunk prefetched on select) |
| Slow 3G | 9.3 s | 4.2 s | 6.4 s | 4.4 s | 0.5 s |

**Caching** (`curl -D -`): everything, hashed `/assets/*` included, is served with
`Cache-Control: public, max-age=0, must-revalidate`. A second visit revalidates each file (304, one
round trip each). The camera path downloads the model (5.0 MB compressed) and the WASM (4.0 MB),
and revalidates them on every visit. Recommended `vercel.json` headers (Greg's Claude):
`/assets/(.*)` → `public, max-age=31536000, immutable` (file names are content hashes);
`/models/(.*)` and `/mediapipe/(.*)` → `public, max-age=86400, stale-while-revalidate=604800`
(fixed names, so not immutable).

## Self-grade

- **Saturday 6:30 PM.** A visitor could have put 999,999 on any board from DevTools in two
  requests: real and judge-visible. Migration 0004 closes it, but it isn't applied yet.
  Theoretical: the 300 KB rows and TRUNCATE (not reachable through REST). Next: the live site
  end to end, then devices.
