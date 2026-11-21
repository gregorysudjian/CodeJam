# Progress (Greg: D + C)

## Status

_Updated after every PR._

**Live:** https://codejam-jet.vercel.app, deployed from `main`. The real UI, the Supabase backend and the rules coach are live. The game is the 2D placeholder, played with the keyboard, until Patrick's and Abdo's PRs land.

**Merged and live**
- #2 UI (Neon Arena screens) · #3 backend (schema, store with offline queue, coach endpoint) · #4 wiring (all 8 screens on real data)
- #5 `signOut`: "New guest" now starts a new player
- #6 demo preset: **reverted in #7**. `src/workout` is Patrick's, and his `p1-workout` already has the real generator and `?demo=1` (seed 594)
- #8 `signOut` never hangs on bad wifi: the queue wait is capped at 2 s, and sign-out no longer makes a network call
- #9 Results wait 1.5 s after the game finishes, so Patrick's finish arch and fanfare play (his request #5)
- #10 Error states: camera blocked, missing, busy or other (full-screen, with Use keyboard and Try again), player lost (keyboard offer after 3 s), offline banner
- #11 Kiosk leaderboard `?kiosk=1`: the board with the QR code, refreshing every 15 s, with its own in-memory guest so it never touches the game tab's player. Also fixes a sign-in race (two concurrent `signInGuest` calls)
- #12 Audit (`docs/AUDIT.md`)
- #13 The HUD reads `level.config`, so with `?demo=1` the countdown matches the 45 s demo (audit #5)
- #15 K mid-round switches input without restarting the round (audit #4)
- #16 Per-user rate limit on `/api/coach`: 1 call per 10 s (audit #6)

**Testing rule (from Greg):** unit tests first. One scripted round per change, using `?demo=1&store=local` once Patrick's demo is on `main`. Browser testing is time-boxed to 5 minutes.

**How it was tested:** `npm run check` on every PR. Click-throughs by keyboard in Chrome against live Supabase, plus `?store=local`. Security rules tested with two anonymous users. Offline save tested with the network cut. `/api/coach` tested on a Vercel preview.

**Not tested yet:** the camera and real body input (`src/pose` is still the stub). A real Claude coach answer (no key, by instruction). Patrick's 3D game on the demo laptop.

**Open problems, ranked by demo risk**
1. Body control isn't on `main` (Abdo's `createPoseInput`), and the 3D game isn't on `main` (Patrick's `p0-game`). No PRs open yet.
2. K pressed mid-round switches input by remounting the play screen, which **restarts the round** (found while building 3c; to fix in 3e, panic keys).
3. An offline save waits up to about 10 s before falling back. The results screen already shows meanwhile, so only the coach card and rank arrive late.

**Requests:** none open (see below).

**Next 3:** lazy-load the game and pose (audit #8) → low-graphics toggle → the "try each move" tutorial.

**Audit:** see `docs/AUDIT.md` (top 10 problems with owners).

## Log

### #5 signOut: "New guest" creates a new player
- **Contract (approved):** `DataStore.signOut(): Promise<void>` forgets the current guest. In `src/contracts/index.ts` and `docs/CONTRACTS.md`, which are still identical.
- **Supabase store:** sends queued sessions first, then `auth.signOut({ scope: 'local' })` (works offline), then clears the cached profile, sessions and queue. **Local store:** clears the saved player and sessions. **`createStore`** signs out of both and retries Supabase for the next guest.
- **App:** "New guest" (and "Play as guest" when a player is saved) signs out and resets per-player state before the profile step. "Continue as …" keeps the player.
- **Tested:** the new unit test passes (42 total). In Chrome against live Supabase: Alpha → reload → "Continue as Alpha" → New guest → fresh guest name → Beta → reload → "Continue as Beta". The database holds exactly two players. The same flow works with `?store=local`. A fresh player gets the empty leaderboard state ("Be the first on the board") with no console errors.

### #7 Revert of #6 (demo preset) and doc fixes
- #6 put a demo preset into `src/workout`, which is Patrick's folder. It conflicted with his `p1-workout` (`index.ts`, add/add on `tuning.ts`). Reverted. After the revert, `p1-workout` merges cleanly with `main` (checked with `git merge-tree`). His branch provides `?demo=1` without app changes.
- AGENTS.md: Patrick owns `src/game`, `src/input` and `src/workout`; Greg owns `docs/`. CONTRACTS.md: crates follow the hold rule too ("both arms up for the whole `holdSec` if set, with 0.3 s of grace").

### #8 signOut on bad wifi (3a)
- The wait for sending queued sessions is capped at `SIGNOUT_FLUSH_TIMEOUT_MS` (2 s, in `src/data/tuning.ts`). Sessions that miss the cap are dropped with the guest, because they can't move to the next player.
- **Found while testing:** `supabase.auth.signOut({ scope: 'local' })` still calls the server's logout endpoint with no timeout and holds the auth lock meanwhile, so on bad wifi "New guest", and the next guest's sign-in waiting on that lock, could hang for minutes. Sign-out now removes the stored session directly (key `sb-<ref>-auth-token`, set explicitly in the client). That needs no network, and anonymous guests lose nothing by skipping the server-side logout.
- **Tested:** `src/data/supabase.test.ts` uses a stand-in fetch that never answers: `signOut` returns in about 2 s and clears the session, profile, cache and queue. With a fetch that answers, it sends the queued round first and doesn't wait for the cap. In Chrome against live Supabase: New guest → profile in about 1 s, and the database held exactly two players. With the network cut: New guest → profile in 0.2 s (local store).

### #9 Finish delay (3b)
- `PlayScreen` takes the summary the moment the game emits `finished` and calls `onFinish` `FINISH_DELAY_MS` later (1.5 s, in the new `src/app/tuning.ts`, which also holds `HUD_POLL_MS`). Delivery happens exactly once, whichever comes first: the timer, or an unmount (for example K swapping the input). Game events after `finished` are ignored, and the HUD's pause and resume do nothing during the fanfare.
- Also removed the deprecated `baseUrl` from both tsconfigs. It was the one error in VS Code's Problems panel; `paths` doesn't need it.
- **Tested:** `npm run check` passes (44 tests) and the Problems panel is empty. One scripted round with `?store=local`: results appeared 2.5 s after the HUD hit 0:00 (the last second plus 1.5 s), Esc during the fanfare showed no pause overlay, and exactly one session was saved. **Not tested in the browser:** K during the fanfare (the unmount delivery path).

### #10 Error states (3c)
- `src/app/errors.ts`: `classifyCameraError` maps getUserMedia errors to blocked, missing, busy or other, each with a message that mentions the keyboard. Unit-tested (5 tests).
- `src/app/ErrorStates.tsx`, built from the kit (`GlassPanel`, `EmptyState`, `GameButton`); `src/ui` is untouched. **Camera overlay:** shown when the camera fails to start. The app has already switched to the keyboard; "Use keyboard" dismisses the overlay (and moves on from calibration), and "Try again" retries the camera. **Offline banner:** `useOnline` follows the browser's online and offline events. **Player lost:** once tracking has been lost for `TRACKING_LOST_HINT_MS` (3 s), a "Use the keyboard" button appears under the HUD's "Step back into the frame".
- **Tested:** `npm run check` passes (49 tests). One scripted pass with `?store=local`: K → the camera overlay appears (the pose stub fails), "Try again" shows it again, "Use keyboard" dismisses it, and the landing screen still works. The offline banner appears and disappears with the network. No errors.
- **Not tested:** the player-lost hint (keyboard input never loses tracking, so this needs Abdo's pose input). The blocked, missing and busy messages are unit-tested only.

### #11 Kiosk leaderboard (3d)
- `?kiosk=1` renders `KioskBoard`: `LeaderboardScreen` in kiosk mode with the QR code, refreshed every `KIOSK_REFRESH_MS` (15 s). The filter chips still work. Back or Play leave kiosk mode for the normal app.
- The leaderboard needs a signed-in user, so in kiosk mode `createStore()` signs in a throwaway guest kept in memory, under its own session key and cross-tab channel (`sessionName: 'kiosk'`). The game tab's saved player is never touched. Each kiosk page load creates one anonymous "Leaderboard" user with no sessions.
- **Found while testing:** two concurrent `signInGuest` calls (React StrictMode running the effect twice, or a double click) each signed up a user. The loser's profile insert failed row-level security, and the store fell back to local for the rest of the visit. Concurrent calls now share one sign-in. Unit test added.
- **Tested:** `npm run check` passes (50 tests). In Chrome against live Supabase: `?kiosk=1` made 3 leaderboard requests in 33 s and showed the QR code, the database held exactly one kiosk user, and a player saved in another tab ("Alpha") was still offered after the kiosk had run. No errors.

### #13 HUD reads level.config (audit #5)
- `PlayScreen` generates the level in a `useMemo` and gives the HUD `level.config.durationSec` and `mode`, not the app's choice. Patrick's `?demo=1` swaps in the 45 s demo inside `generateLevel`.
- **Tested:** `npm run check` passes (50 tests). In a throwaway local merge with `p1-workout` (never pushed, deleted), `?demo=1&store=local`: the select screen said 90 s and the HUD started at 0:43, so it follows the real 45 s level.

### #15 K mid-round without a restart (audit #4)
- The game gets one stable `createSwitchableInput()` (`src/app/switchableInput.ts`) that forwards to the active source. K swaps the source instead of remounting `PlayScreen`, so the round goes on, and pose to keyboard resumes a round paused for tracking loss.
- **Tested:** 3 unit tests. One round: K at 0:34 → camera overlay → the timer went on (0:33, then 0:32) → one 45 s session saved.

### #16 Coach rate limit (audit #6)
- Migration `0002_coach_rate_limit.sql`, already applied: `coach_calls` (RLS, no policies, no grants) and `claim_coach_slot(p_min_interval_seconds)`, security definer and atomic (`insert … on conflict do update … where last_call_at <= now() - gap`). The interval is clamped to 1–3600 s.
- `/api/coach` claims a slot right after the token check: 429 with `Retry-After: 10` if refused, 503 (fail closed, no Claude call) if the check errors. `COACH_MIN_INTERVAL_SEC = 10` is in `api/_lib/advice.ts`.
- **Tested:** live database with a guest token: first claim true, immediate second false, direct table read denied, signed-out caller denied, true again after the gap, and interval 0 clamped to 1 s. 3 endpoint tests with a fake Supabase (429 before any history or Claude call; 503 when the check fails; normal path when claimed). 56 tests in total.

## Requests

_For things outside my folders: src/ui (Lovable Claude), src/pose (Abdo), src/game, src/input and src/workout (Patrick), packages, keys._

- **Abdo:** wire `detect.ts` and calibration into `createPoseInput()`, which is still the stub on `abdo-1`, and open the PR. Export `mountPoseDebug` from `src/pose/index.ts` so the app can wire `?dev=pose`.
- **Patrick:** open PRs for `p1-workout`, then `p2-game`. Fix the 3 slow fairness tests in `src/workout/level.test.ts` (5 s vitest timeout; they take 6.5–57 s here) so `npm run check` stays green.
- **Lovable UI:** the "REACH" label on the HUD (Patrick's request #3).

## Needs Greg

- Add `ANTHROPIC_API_KEY` in Vercel, but only after the coach rate limit is merged.
- Pick the demo laptop. Record the backup video. Prepare the localhost preview tab and the second laptop (DEMO.md).
- After the hackathon: restore the paused Supabase project "dailydle".
