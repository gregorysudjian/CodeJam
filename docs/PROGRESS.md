# Progress (Greg: D + C)

## Status (Saturday about 1:15 PM)

**First 3 things for Greg**
1. **Get Patrick and Abdo to open their PRs, and to merge `main` into their branches first** (that brings in `vercel.json`, which stops their pushes from using up Vercel's daily deploy quota). Patrick also fixes the 3 slow tests in `src/workout/level.test.ts`. Abdo's `createPoseInput()` is real now; his branch tracked Greg's body this morning.
2. **Check the live site has redeployed.** Vercel's Hobby cap (100 deployments per 24 h) was hit at 12:38: #20, #21 and #22 are merged but **not live**; the live site is #13. Once the cap clears, the next push to `main` deploys everything. If nothing has gone out by tonight, redeploy `main` from the Vercel dashboard.
3. **Add `ANTHROPIC_API_KEY` in Vercel** (still missing). The rate limit is live, so it's safe. Then play one round and check the coach card says AI.

**On `main` (5643424):** everything from last night, plus #13 (Lovable UI pass), #20 (camera/keyboard switch on the select screen), #21 (offline fixes), #22 (Vercel deploys `main` only).

**Tested today:** `npm run check` green (67 tests) for each PR. Browser: the switch starts the camera and falls back with the error dialog when there is none; a full keyboard pass over every screen with no console errors; a wifi-drop drill against live Supabase (offline mid-round → results and rules coach at once, round queued; back online → uploaded within 4 s, row checked and deleted).

**Not tested (needs hardware or a person):** the switch with a real webcam; pose and the 3D game together on the demo laptop; a real Claude answer.

**Open problems, ranked by demo risk**
1. Patrick's 3D game and Abdo's body control aren't on `main` (no PRs). **Patrick, Abdo**
2. The live site is behind `main` until the Vercel cap clears. **Greg** (check)
3. Patrick's 3 slow tests turn `check` red after his merge. **Patrick**
4. No Claude key, so the coach is always rules. **Greg**
5. `?dev=pose` and the `?demo=1` preset wait for Abdo's and Patrick's merges. **Greg**, right after

**Next for me:** review Patrick's and Abdo's PRs as they open (order `p1-workout` → `p2-game` → `abdo-1`), then wire `?dev=pose` and the demo preset.

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

### #13 Lovable UI pass (merged)
- Re-checked after its last commit (`settingsSlot` on the select screen): only `src/ui`, clean merge, `check` green, verdict posted on the PR. Merged on Greg's go-ahead to proceed without waiting.

### #20 Camera/keyboard switch
- `src/app/InputSwitch.tsx`: a kit `SegmentedControl` in the select screen's `settingsSlot`. Picking Camera starts it at once, so Chrome's permission prompt comes on the select screen, not mid-round. A failed start shows the existing camera dialog and the switch returns to Keyboard. K still works.
- **Tested:** `check` green; in the browser the switch renders next to Low impact, and clicking Camera with no webcam shows the dialog and falls back. **Not tested:** a real webcam.

### #21 Offline fixes (wifi-drop drill)
- **postgrest-js retries failed reads 3 times (1 + 2 + 4 s)**, so offline every leaderboard or session read hung until our 5 s timeout. Turned off (`db: { retry: false }`); the store has its own offline path. Offline reads now answer in about 20 ms.
- Results show the coach card and rank as soon as each arrives, not after the session list and leaderboard too.
- **False "#1 on the leaderboard" offline:** an empty board (offline, nothing cached) meant nobody beat you. Empty board now shows no rank.
- 4 tests: offline save queues and still lists the round; a hanging network gives up after the timeout; coach falls back to rules; leaderboard answers from cache.

### #22 Vercel deploys `main` only
- The Hobby cap (100 per 24 h) was hit because every branch push made a preview (about 270 branch commits in 24 h). `vercel.json` sets `git.deploymentEnabled` to `{ "*": false, "main": true }`. **Checked:** the PR branch push got no Vercel deployment, while the previous branch got one within 5 s.
- Branches based on an older `main` still preview until they merge `main`.
- Skipped: preloading the pose model on the landing screen. The model files and loader are only on `abdo-1`, and his loader already shares one model per page; worth measuring after his merge.

## Requests

_For things outside my folders: src/ui (Lovable Claude), src/pose (Abdo), src/game, src/input and src/workout (Patrick), packages, keys._

- **Patrick and Abdo:** merge `main` into your branches before pushing again (`vercel.json` stops branch previews, which used up the deploy quota), then open your PRs. Patrick: fix the 3 slow tests in `src/workout/level.test.ts` first.
- **Abdo:** optional, after merging: preload the pose model while the player is on the landing screen, if it makes calibration start faster on the demo laptop.

## Needs Greg

- Add `ANTHROPIC_API_KEY` in Vercel (the rate limit is live).
- Check that `main` redeployed once the Vercel cap clears; if not by tonight, redeploy it from the dashboard.
- Pick the demo laptop. Record the backup video. Prepare the localhost preview tab and the second laptop (DEMO.md).
- After the hackathon: restore the paused Supabase project "dailydle".
