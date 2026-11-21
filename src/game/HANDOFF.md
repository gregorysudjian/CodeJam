# Handoff: Patrick's game, input and workout (Sat Nov 21, evening)

For the next AI session working with Patrick. Read this, then `AGENTS.md`, then `docs/CONTRACTS.md`. Hard code freeze: **Sunday 12:00 PM Montreal**.

## The project and the team

A webcam fitness runner for CodeJam 16. The player's body steers a 3-lane runner: sidestep to change lane, jump hurdles, squat under beams, raise both arms to smash crates, raise one arm to grab orbs. Stack: Vite, React, TypeScript (strict), plain Three.js, MediaPipe pose on the device, Supabase, Vitest. Chrome only.

| Person | Owns |
| --- | --- |
| **Patrick (B)** | `src/game/` (runner), `src/input/` (keyboard), `src/workout/` (levels, scoring) |
| Greg (D) | `src/app/`, `src/ui/`, `src/data/`, `docs/`, `src/contracts/`, all config. Merges PRs. |
| Abdo (A) | `src/pose/` (camera, detection) |

## Rules that bite

- Edit only Patrick's three folders. Never edit `src/contracts`, `package.json`, the lockfile or config. Ask before adding a package. If something outside is needed, write a request for Greg or Abdo.
- `npm run check` (types, lint, tests, build) must pass before any commit or push. Check its real exit code: write the output to a file, then test the code. Never pipe it through `grep`.
- Commit small, with clear messages. Push only to `p5-game`. Only `main` deploys, and deploys are rationed, so there is **one PR at the end**.
- Work in **`~/CodeJam`**, a clean clone outside iCloud. It has a gitignored `.env.local` (Supabase URL and anon key); never commit it. `/Users/patrick/Desktop/CodeJam` is in iCloud: never switch branches there, it creates "name 2" copies. `src/game/hygiene.test.ts` fails on them.
- Every tunable number lives in a `tuning.ts`. Pose data never leaves the device.

## Where the branches are

- **`p5-game` is the active branch:** `main` (already merged in, 706 tests pass) plus:
  - `?debug=timing` hit report: after each round, each hit or missed orb with a cause (late or early by X s, not seen, hold dropped, let go), plus a `VISUAL_LEAD_SEC.pose = { … }` line to paste into `tuning.ts`;
  - a ghost status line at each round start, and graphics that start at the level an earlier round reached;
  - the quality ladder's first step at 3 s, before the first obstacle;
  - fixes: held objects end visually when the judge ends them, and the view gets this frame's input before judging;
  - workout: gentler low-impact levels, no holds in the last 15 % of a round.
- **`p3-game` is superseded.** It holds a parallel version of the game-feel polish that `main` already has from another session. Do not merge it.
- `main` already has the game-feel pass (PR #38): runner rig, city / tunnel / bridge world, PERFECT / GOOD / LATE, music, three looks per obstacle, intro.

## What is left, in order

1. **Camera session.** Patrick does this: it needs his body, the webcam and his Mac, which is the demo laptop.
   - Start: `cd ~/CodeJam && git pull && npm run dev -- --strictPort`, then open `http://localhost:5173/?demo=1&debug=timing` and pick Camera. D shows the pose overlay and its FPS.
   - **Frame rate:** the console prints `[game] frame rate this round: …`. If pose FPS drops under about 25 with the game running, fix a lower level on the laptop: `localStorage.setItem('game.gfx', 'medium')`, or `'low'`.
   - **Latency leads:** 2–3 rounds. From the second round, the console prints a combined table and the leads line to paste.
   - **Holds and fair attempts:** the hit table after each round says why each hit happened.
   - **Body rounds:** 3 with the body, plus 1 in low impact. Note unfair or tiring combos.
   - **Greg's #31 checks:**
     - On results, wait 2 s, then raise both arms: a new round starts.
     - Press K mid-round with the keyboard: calibration messages appear, then play continues with the body.
     - The camera preview during play shows the skeleton.
   - Patrick has a checklist page that builds a report; he will paste it.
2. **Your part, once he pastes the console output or report:**
   - **Leads:** the console prints `[game] camera session, paste both lines:`. The first goes after `VISUAL_LEAD_SEC.pose = ` in `src/game/tuning.ts`, the second after `SESSION_LAG_SEC = ` in `src/game/latency.test.ts`.
   - **Hit table:** read it with the checklist in `src/game/README.md`, step 3 (which cause means what, and who fixes it).
   - **Hit causes:**
     - `late` or `early`: the leads.
     - `not seen`, or `dropped` while he really held: write a request for Abdo in `src/game/README.md`, under "Requests for A", with times and objects.
   - **Tiring combos:** tune `src/workout/tuning.ts`. Keep `src/workout/demo.test.ts` passing.
     - Changing the generator or `DEMO_SEED` makes new levels. That invalidates ghosts, and Greg's `docs/DEMO.md` names the seed: tell Greg.
   - Then `npm run check`, commit, and push `p5-game`.
3. **Ghost rehearsals, last** (Patrick):
   - Play the demo level once in normal and once in low impact, with the camera, on exactly `http://localhost:5173/?demo=1`.
   - Ghosts live in that origin's browser storage, so the port and host must not change.
   - Each round start logs `[game] ghost: racing …`.
4. **The PR:** `p5-game` into `main`, before the freeze.
   - It must include the FPS he measured (game and pose) and what was tested with the camera.
   - Merge `main` in first if it moved; it merged cleanly so far.
   - Greg merges it.

## How to check your work

- `npm run check` must pass.
- Pure logic gets Vitest tests next to the code (see `timing.test.ts`, `core.test.ts`).
- For visuals or app flow, run `npm run dev` and play with the keyboard:
  - arrows: lane;
  - Space or Up: jump;
  - Down held: squat;
  - W held: both arms;
  - Q or E held: one arm.
- Scripted rounds of the demo level should give 16 cleared, 7 collected, 0 hits when played perfectly.
- More detail: `src/game/README.md` (camera session plan, latency compensation, ghost), `src/workout/README.md`, `src/pose/HANDOFF.md` (Abdo's side).
