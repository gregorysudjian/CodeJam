# Progress (Greg: D + C)

## Status (Saturday about 6:30 AM, unattended night run)

**First 3 things for Greg at 10 AM**
1. **Merge PR #13** (the Lovable UI pass: cleanup, race progress bar, "REACH" label). I reviewed it: clean merge, check green, click-through fine. Your rule says only you merge other people's PRs.
2. **Get Patrick and Abdo to open their PRs.** Patrick: `p1-workout`, then `p2-game`, **and fix the 3 slow tests in `src/workout/level.test.ts` first**, or `npm run check` goes red. Abdo: wire `detect.ts` into `createPoseInput()` (still the stub) and export `mountPoseDebug`. Everything merges cleanly with `main` today (dry run in `docs/AUDIT.md`).
3. **Add `ANTHROPIC_API_KEY` in Vercel.** It's safe now: the per-user rate limit is live (#16). Then play one round on the live site and check the coach card says AI, not rules.

**Live:** https://codejam-jet.vercel.app, deployed from `main` at #18. Working end to end with the keyboard:
- landing → profile → select → "try each move" (first round) → play → results (1.5 s fanfare delay) → dashboard → leaderboard → New guest.
- Supabase saves with an offline queue. The rules coach answers until the key is added.
- `?store=local` (offline path) and `?kiosk=1` (board for between players).
- Camera error, player-lost and offline states.
- Panic keys K, R, D and Esc, with K continuing the round.
- The game is still the 2D placeholder (Patrick's 3D game isn't merged), and body control is still the pose stub.

**Merged tonight (each with `npm run check` green, a short real test and a live deploy check)**
- #5 `signOut`: New guest is a new player · #7 revert of my `src/workout` demo preset · #8 `signOut` never hangs on bad wifi
- #9 1.5 s finish delay · #10 error states · #11 kiosk leaderboard plus a sign-in race fix · #12 audit
- #14 HUD reads `level.config` · #15 K mid-round without a restart · #16 coach rate limit (1 call per 10 s, Postgres) · #17 lazy loading (main chunk −36 %) · #18 "try each move" tutorial
- Skipped: the low-graphics toggle. No room on the select screen without editing `src/ui`; `?gfx=low` already works. UI request filed.

**How it was tested:** unit tests (60, plus 128 more in Patrick's branches); one scripted keyboard round per change; the live database for the security rules and the rate limit; the live site for a full round (session in Supabase, on the dashboard and leaderboard); an integration dry run of all branches (3D game at 46 FPS on this laptop's Intel UHD).

**Not tested (needs hardware or a human):** a camera and real body input; R recalibration with real pose; a real Claude coach answer; the demo laptop's frame rate with pose and 3D together; projector, stage, lighting.

**Open problems, ranked by demo risk** (details and owners in `docs/AUDIT.md`)
1. Body control doesn't exist yet: Abdo's `createPoseInput()` is a stub. **Abdo**
2. The 3D game and real generator aren't on `main`; no PRs opened. **Patrick**
3. Patrick's 3 fairness tests time out at 5 s, so `check` goes red after his merge. **Patrick**
4. No Claude key, so the coach card is always rules. **Greg** (now safe to add)
5. With `?demo=1` the select screen shows the app's default (90 s) while the demo plays 45 s; the HUD is already correct. **Greg**, after `p1-workout` merges: preselect its `DEMO_CONFIG`
6. `?dev=pose` is a placeholder until Abdo exports `mountPoseDebug`. **Abdo**, then Greg
7. An offline save waits up to about 10 s before the coach card falls back (results show at once). **Greg**, low priority

**Next 3 for me:** preselect the demo config with `?demo=1` once `p1-workout` is merged → wire `?dev=pose` once Abdo exports `mountPoseDebug` → review Patrick's and Abdo's PRs as they open (verdict before merging, merge order `p1-workout` → `p2-game` → `abdo-1`).

**Testing rule (from Greg):** unit tests first; one scripted round per change; browser tests time-boxed to 5 minutes.

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

### #17 Lazy loading (audit #8)
- `PlayScreen` (and with it the game, plus Three.js once Patrick's game merges) and `DashboardScreen` (Recharts) are `React.lazy` with a plain `Suspense` fallback. The pose module (MediaPipe once Abdo's tracker lands) is imported when the player switches to the camera; the keyboard stays the input until it has loaded.
- The screens are now imported from their own files instead of the `src/ui/screens` barrel, which kept the dashboard in the main chunk.
- **Result:** main chunk 1,198 KB → 762 KB (gzip 355 → 232 KB); dashboard 429 KB on demand.
- **Tested:** `npm run check` passes (56 tests). One scripted round with `?store=local`: no lazy chunk on landing; K loaded the pose module and showed the camera overlay; Start loaded the play screen; the round finished; the dashboard loaded and rendered. No errors.

### #18 "Try each move" tutorial
- `src/app/TryMoves.tsx`, built from the kit (`Screen`, `MoveFigure`, `GameButton`, move labels and colours). It shows each move of the coming round (`tutorialMoves`: all 6 on the floor, no jump in low impact, upper body only on the treadmill) for `TUTORIAL_STEP_MS` (2.5 s), or until the player does it (a tick, then the next move). Keyboard players see the key and camera players the body move (`moveHint`). Esc or Enter skips.
- Shown before a player's first round only (no sessions and not yet seen), after calibration when the camera is used. "New guest" shows it again.
- **Tested:** 4 unit tests (60 in total). One scripted pass: the tutorial showed on the first Start; a quick double sidestep advanced exactly one step; Space advanced past jump; Esc went into the round; after the round, "Play again" went straight to play. No errors.

## Requests

_For things outside my folders: src/ui (Lovable Claude), src/pose (Abdo), src/game, src/input and src/workout (Patrick), packages, keys._

- **Abdo:** wire `detect.ts` and calibration into `createPoseInput()`, which is still the stub on `abdo-1`, and open the PR. Export `mountPoseDebug` from `src/pose/index.ts` so the app can wire `?dev=pose`.
- **Patrick:** open PRs for `p1-workout`, then `p2-game`. Fix the 3 slow fairness tests in `src/workout/level.test.ts` (5 s vitest timeout; they take 6.5–57 s here) so `npm run check` stays green.
- **Lovable UI:** the "REACH" label on the HUD (Patrick's request #3), in PR #13, which waits for Greg's merge. **New:** an optional `settingsSlot?: ReactNode` on `WorkoutSelectScreen`, shown near the duration and low-impact rows, so the app can add a "Low graphics" switch without overlapping the header (it overlapped both the header button and the Floor/Treadmill control).

## Needs Greg

- Add `ANTHROPIC_API_KEY` in Vercel, but only after the coach rate limit is merged.
- Pick the demo laptop. Record the backup video. Prepare the localhost preview tab and the second laptop (DEMO.md).
- After the hackathon: restore the paused Supabase project "dailydle".
