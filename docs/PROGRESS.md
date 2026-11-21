# Progress (Greg: D + C)

## Status (Saturday about 2:30 PM)

**All three parts are on `main`:** Patrick's game and workout (#24, #25) and Abdo's body control (#27). `npm run check`: 530 tests.

**First 3 things for Greg**
1. **Demo on Patrick's Mac:** `npm run dev`, `http://localhost:5173/?demo=1`, pick Camera, calibrate, play (DEMO.md station checklist). No deploy needed.
2. **Coach:** rule-based for the demo (no Claude key for now).
3. **Play a few camera rounds** on the demo laptop with Patrick and Abdo (Patrick's prompt: latency leads, holds, FPS with pose and 3D, demo level, ghost rehearsals).

**Vercel:** the Hobby cap (100 deployments per 24 h) is used up; Vercel's API says it fully resets **Sunday 1:40 PM**, slots may free from about 3 AM. The live site is at #25 (game, no body control) until then. The demo doesn't need it: `vercel dev` runs everything locally, coach included. No trial is offered to this account; Pro would be $20.

**Tested:** #27 reviewed and checked merged with `main` and `?dev=pose` (530 tests). Browser: a keyboard demo round to results; the Camera switch started the real webcam (MediaPipe running) and Keyboard stopped it; `?dev=pose` shows Abdo's page; no console errors. `vercel dev` locally: a round saved to Supabase, `/api/coach` passed auth and the rate limit, then "not configured" (no key yet), so rules.

**Not tested:** a full calibrated camera round through the app with a person in front of it (Greg did calibration and moves on the debug page this morning); a real Claude answer.

**Open problems, ranked by demo risk**
1. Camera play through the app on the demo laptop: calibration, holds, FPS. **Everyone**, now
2. No Claude key. **Greg**
3. The HUD cue word covers the obstacle it announces. **Lovable UI**
4. The live site lags `main` until the Vercel cap frees. **Greg** (check Sunday morning)

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

### #24, #25 Patrick's workout and game (merged)
- Reviewed both against the contracts and AGENTS.md: only his folders, no contract, package or config change, no cross-module imports. `main` + #24: 107 tests; + #25: 213 tests; build OK. His slow tests are fixed (all workout tests in about 0.3 s).
- Checked `src/input`'s new key handling against the tutorial: it only gates `preventDefault` on a running round; moves still reach every listener, so the tutorial still ticks.

### Demo preset and DEMO.md
- `?demo=1` preselects `DEMO_CONFIG` (Full body, floor, 45 s) on the select screen, so the screen matches the level the workout module plays.
- DEMO.md: Patrick's ghost-runner notes (one ghost per origin, per low-impact setting, and per input) and a station checklist line to rehearse on each tab.

### #27 Abdo's body control (merged, with `?dev=pose` and the demo plan)
- Reviewed against the contracts and AGENTS.md: `src/pose` plus the model and WASM in `public/` (rule 11, no CDN); no contract, package or config change; no imports from other modules; no network calls in pose code (rule 5). `main` + #27 + `?dev=pose`: 530 tests, build OK.
- Greg's clips are in `src/pose/fixtures/greg/` and both findings are fixed (DECISIONS 34 to 36). Squats shorter than 0.8 s now count when the player stands up, unless a jump follows; the game judges beams on the instant `ducking` state, so play is unchanged, and the tutorial's squat tick comes a moment later.
- Merged in one push with `?dev=pose` (mounts `mountPoseDebug`) and the DEMO.md station plan (demo on `npx vercel dev` locally), to spend one deployment.

### #27 follow-up (Abdo) and the demo laptop
- Abdo's follow-up: a crouch-then-jump at 15 FPS no longer counts a squat; a one-frame tracking flicker no longer loses a quick reach; `src/pose/clip-viewer.html` plays recorded clips (loads nothing external). Only `src/pose`, contains `main`, check green (564 tests). No screen adds a second mirror to the camera video (his NEEDS 2).
- DEMO.md: the demo runs on **Patrick's Mac** with `npm run dev` at `http://localhost:5173/?demo=1` (rule-based coach, no Claude key for now); ghosts are rehearsed on that URL.

## Requests

_For things outside my folders: src/ui (Lovable Claude), src/pose (Abdo), src/game, src/input and src/workout (Patrick), packages, keys._

- **Abdo (optional):** preload the pose model on the landing screen if calibration starts slowly on the demo laptop.
- **Lovable UI (Patrick's request 7):** the HUD cue word ("SQUAT" with its countdown ring, `hud-cue` at `top-[40%]` in `GameHud`) sits where the announced obstacle approaches and covers it and the free-lane chevron. Move it to the top band between score and timer, or make it much more transparent.
- **Patrick (optional):** a low-graphics switch was requested; the select screen's slot now holds the camera switch and the auto quality ladder plus `?gfx=low` already cover it, so I'm leaving it out unless the demo laptop needs it.

## Needs Greg

- Add `ANTHROPIC_API_KEY` in Vercel (the rate limit is live).
- Check that `main` redeployed once the Vercel cap clears; if not by tonight, redeploy it from the dashboard.
- Pick the demo laptop. Record the backup video. Prepare the localhost preview tab and the second laptop (DEMO.md).
- After the hackathon: restore the paused Supabase project "dailydle".
