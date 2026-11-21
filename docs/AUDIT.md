# Audit: Saturday 21 Nov, ~5:40 AM

Read-only for other people's folders. Commands and results are reproducible from `main` at `c1e15ce`.

## Summary

**Overall:** `main` is live at https://codejam-jet.vercel.app and works end to end with the keyboard:
- A guest finished a round on the live site.
- The session reached Supabase and showed on the dashboard and leaderboard.
- `/api/coach` answered 503 "coach not configured" (no key yet, by design).

Security is clean. An integration dry run of `main` + `p1-workout` + `p2-game` + `abdo-1` merges without conflicts and plays Patrick's real 3D game at 46 FPS on this laptop's Intel UHD GPU. **The two biggest risks are that neither body control nor the 3D game is on `main` yet**, and that `npm run check` turns red once Patrick's workout tests land.

### Top 10 problems by demo risk

| # | Problem | Owner | One-line fix |
| --- | --- | --- | --- |
| 1 | Body control doesn't exist yet: `createPoseInput()` in `abdo-1` is still the stub that throws, although the detection code (`detect.ts`) is there | Abdo | Wire `detect.ts` and calibration into `createPoseInput()` per the contract, then open the PR |
| 2 | The real game and generator aren't on `main`; there's no PR for `p1-workout` or `p2-game` | Patrick | Open both PRs (order: `p1-workout`, then `p2-game`). Both merge cleanly today |
| 3 | `npm run check` goes red once `p1-workout` merges: 3 fairness tests in `src/workout/level.test.ts` take 6.5–57 s and exceed vitest's 5 s default. All 20 pass with a longer timeout | Patrick | Fewer seeds per combination, or `{ timeout: 60_000 }` on those 3 tests |
| 4 | K mid-round restarts the round: switching input remounts `PlayScreen` | Greg | Hand the game a switchable input that forwards to the current source (`src/app`) |
| 5 | The HUD takes its duration and mode from the app's config, not `level.config`. With Patrick's `?demo=1` (which swaps in the 45 s demo in `generateLevel`), the countdown would show 90 s for a 45 s round | Greg | Use `level.config` in `PlayScreen` |
| 6 | The coach has no per-user rate limit, and there's no Claude key in Vercel | Greg | Rate limit first (1 call per user per 10 s), then Greg adds the key |
| 7 | `?dev=pose` is a placeholder: `mountPoseDebug` isn't exported from `src/pose/index.ts` | Abdo + Greg | Abdo exports it (or approves `@/pose/debug`); Greg wires it |
| 8 | One 1.81 MB JS chunk (512 KB gzipped) loads Three.js and MediaPipe on the landing page | Greg | Lazy-load `PlayScreen` and `CalibrateStep` |
| 9 | With `?demo=1` the select screen still shows "Full body · floor · 90 s" while the demo plays 45 s | Greg | After `p1-workout` merges, preselect its exported `DEMO_CONFIG` on the select screen |
| 10 | Until the key exists, every round logs the browser's "failed to load resource (503)" for `/api/coach` | Greg | Goes away with the key; harmless meanwhile |

**Not checked (needs hardware or a human):** a real camera and real body input; frame rate on the demo laptop and venue lighting; a real Claude coach answer (no key, no spending); projector or stage; floor space.

## 1. GitHub

| Branch | Ahead / behind `main` | State | Merges with `main`? | Last commit |
| --- | --- | --- | --- | --- |
| `abdo-1` | +6 / −24 | open, no PR | clean | Abdo, press-style arm reps, second-session clips |
| `p1-workout` | +4 / −6 | open, no PR | clean | Patrick, "Merge origin/main into p1-workout: Greg reverted his demo preset" |
| `p2-game` | +28 / −0 | open, no PR | clean | Patrick, merged `main` minutes ago |
| `p1-game`, `p0-game` | +12 / +4 | contained in `p2-game` | clean | Patrick |
| `abdo-2`, `patrick-1`, `greg-1`, `greg-2`, `d-*` (5) | 0 ahead | merged | n/a | safe to delete (not deleted) |

PRs: #1–#11, all merged, all by Greg. #6 (demo preset in `src/workout`) was reverted by #7.

**`p1-workout` and the #6 conflict:** already resolved by Patrick. After #7 he merged `main` into `p1-workout` again, and it now merges cleanly. His branch has his own generator, his own `demo.test.ts` and `tuning.ts`, and none of the seed-189 preset. **Note:** his demo seed is now **41492**, not 594. If a conflict ever comes back, the rule is to keep his `src/workout/*` and `docs/DEMO.md` lines ("ours" on his branch) and drop anything mentioning seed 189 or `DEMO_SEED = 189`.

## 2. Integration dry run (throwaway local branch, never pushed, deleted)

`main` + `p1-workout` + `p2-game` + `abdo-1`: **no merge conflicts.**
- **Typecheck:** passes. **Lint:** 0 errors (the same 7 known `src/ui` warnings). **Build:** passes.
- **Tests:** 185 of 188 pass. 3 time out in `src/workout/level.test.ts` (Patrick, problem 3). Not logic failures: with `--testTimeout=120000` all 20 in that file pass.
- **One `?demo=1&store=local` round by keyboard:** the 3D game ran at 46 FPS. Seed 41492 was played and saved (45 s, Full body). Results worked. No console errors or warnings. This exposed problems 5 and 9.

## 3. Contracts

- `src/contracts/index.ts` is byte-identical to the code block in `docs/CONTRACTS.md`, including `signOut`.
- No module imports another module; only `src/app` imports modules (checked by grep).
- Each module exports its contract factory. `src/workout` also exports `DEMO_CONFIG` and `DEMO_SEED`, harmless extras.

## 4. Modules

**`src/pose` (Abdo, `abdo-1`)**
- Assets come from `public/` only (`/mediapipe/wasm`, `/models/pose_landmarker_lite.task`). No CDN in code.
- `1 - x` appears exactly once (`detect.ts:36`). Thresholds are in `tuning.ts`.
- **`createPoseInput()` is still the stub**: `start()` throws, and `calibrate()` reports `done` at once. There's no tracking flag, no calibration statuses and no move events yet. Problem 1.
- `mountPoseDebug` isn't exported from the index. Problem 7.

**`src/game`, `src/input` (Patrick, `p2-game`)**
- The loop runs outside React (`core.ts`, `index.ts`). The time step is capped at 0.05 s (`MAX_DT_SEC`).
- Collision windows match the contract: 0.35 s before, 0.15 s after, 0.3 s hold grace. There's also a per-input "lead" for pose lag, which is reasonable.
- All 7 GameEvents are emitted. Pause and resume work, with auto-pause on tracking loss. `destroy()` disposes resources across the files.
- The keyboard mapping matches the contract (airborne 450 ms). Graphics are chosen from `?gfx=` or `localStorage game.gfx` (`high` / `medium` / `low` / `2d`, else automatic). Audio can be muted with `?mute=1` or `game.muted`.

**`src/workout` (Patrick, `p1-workout`)**
- Level rules match the contract: first wave at 4 s or later, 1.8 s warm-up and 1.1 s minimum gaps, 1.5 s from beam to hurdle, 1.3 s after a hold. Free-lane and treadmill-subset tests pass.
- Scoring and the calorie formula are in `tuning.ts` (MET 8/6, treadmill 9).
- **`?demo=1` now respects low impact** (`{ ...DEMO_CONFIG, lowImpact: config.lowImpact }`).
- Problem 3: slow tests.

**`src/data`, `supabase/`, `api/` (Greg)**
- RLS is on both tables. The leaderboard is a plain view with 5 public columns and no `security_invoker`. Grants: `authenticated` only, with `anon` revoked. Tested earlier with two users.
- `saveSession` and `getCoachAdvice` never reject. `signOut` never hangs (2 s cap, no network; tested with a never-answering fetch). Offline queue tested. Snake/camel mapping lives only in `src/data/mapping.ts`.
- `/api/coach`: token check (401), input validation (400), session ownership through RLS (404), 7 s SDK timeout, output validation. **No per-user rate limit yet.** Problem 6.

**`src/ui` (Lovable Claude)**
- Imports only allowed packages (radix, cva, clsx, lucide, motion, react, recharts, tailwind-merge). No module imports.
- Hotkeys: Enter ×6, Esc ×5, `k` (calibration only), `s`, `l`, `c`, `1`–`4`. The app's global K skips calibration, and its global Esc does nothing. The UI binds no R or D. **No double-firing.**
- Every screen gets real data (see PR #4).
- Request: the "REACH" label on the HUD (Patrick's request #3).

**`src/app` (Greg)**
- All 8 screens are reachable. `?store=local`, `?kiosk=1` and `?dev=pose` (placeholder) work.
- The HUD is fed by a 10 Hz poll; nothing updates per frame.
- The full keyboard flow showed no console errors locally. On the live site the only error is the expected `/api/coach` 503.
- Bugs: problems 4, 5, 8, 9.

## 5. Security

- No secrets in the repo or its history: `sk-ant` never appears; `service_role` appears only in docs and comments; `.env`/`.env.local` were never committed, and `.env.local` is git-ignored.
- **Built bundle:** the only JWT is the public `anon` key (role `anon`). No `sk-ant`, no service role, no database password. The one `sb_secret` match is supabase-js checking key prefixes, not a key.
- `.env.example` has only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the `VITE_` prefix. The Claude key is documented as server-only.

## 6. Live deploy

https://codejam-jet.vercel.app: a guest ("AuditLive") played a 45 s round. Results showed "#1 on the leaderboard". The session was in Supabase and in the `leaderboard` view (700). The dashboard showed the round. `/api/coach` → 503 "coach not configured". The test player was deleted afterwards.

## 7. Demo readiness (docs/DEMO.md)

| Item | State |
| --- | --- |
| Fallback 1: R recalibrates | Wired (pauses the round), but **not testable until pose exists** |
| Fallback 2: K switches to the keyboard | Works, but **restarts the round** (problem 4) |
| Fallback 3: `?store=local`, localhost preview tab | `?store=local` ready; the preview tab is for a human to prepare |
| Fallback 4: backup video | **Needs a human** |
| Fallback 5: second laptop | **Needs a human** |
| App opened on the Vercel URL | Ready |
| `/api/coach` answers 200 at the station | **Not ready:** needs the Claude key (Greg) and the rate limit first |
| Supabase anonymous sign-in limit raised | Ready (1000 per hour) |
| Leaderboard and dashboard filled, test rows deleted | Database is empty now; **the team plays real sessions on Sunday** |
| QR code to the public URL | Ready (landing screen and `?kiosk=1`) |
| Kiosk between players | Ready (`?kiosk=1`, refreshes every 15 s) |
| Demo level | Ready once `p1-workout` merges (`?demo=1`, seed 41492, low-impact toggle) |
| Laptop, tape mark, lighting, projector, stage | **Needs a human** |

## 8. Performance

- **Bundle (integrated):** one JS chunk of 1.81 MB (512 KB gzipped) plus 95 KB CSS and fonts. The app loads Three.js and MediaPipe up front. Problem 8: lazy-loading the play and calibration screens would take both off the landing page.
- **MediaPipe WASM (29 MB) and model (5.6 MB)** are static files fetched only when the pose module starts. Today the stub never starts, so they're never downloaded.
- **Frame rate:** 142 FPS with the UI and the placeholder game, and 46 FPS with Patrick's 3D game, on this laptop's Intel UHD (Chrome). Pose plus 3D together is untested. If the demo laptop drops below 30, use `?gfx=low` (Patrick's game) first.
