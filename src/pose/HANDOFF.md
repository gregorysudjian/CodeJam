# HANDOFF — src/pose (role A, Vision)

_Last refresh: Sat 07:29 (overnight autonomous session). Read this first in a new conversation._

## 1. Context

- CodeJam 16 webcam fitness game: a 3-lane runner you play with your body. Vite + React + TS strict,
  Three.js, MediaPipe pose on device, Supabase, Vercel. Docs: `AGENTS.md`, `docs/PLAN.md`,
  `docs/CONTRACTS.md` (the law), `docs/DEMO.md`.
- Role A (Vision). Branch **`abdo-1`**. Never commit, merge, rebase or push to `main`; never force-push.
  `main` has NOT been merged into `abdo-1` (A's call) — the module was built to match `main`'s app.
- A owns only `src/pose/`, `public/models/`, `public/mediapipe/`. Anything else → `src/pose/NEEDS.md`.
- No npm packages; every number in `src/pose/tuning.ts`; `npm run check` before each commit.
- Code freeze **Sunday 12:00 PM** Montreal time.

## 2. Current state

- **Works:** real `createPoseInput()` (contract-exact), calibration with status messages, all six
  moves, tracking flag, background-person handling, treadmill mode, D-key debug overlay with
  sliders, `?dev=pose` page with recorder. See README's MORNING REPORT for the evidence.
- **Half-done / not done:**
  - Nothing is half-written in code. Not done: "raise both arms to start" (app-side, NEEDS.md 5),
    station setup notes (Phase 4), real-camera tuning (needs A).
- **Last commit:** see `git log -1`.
- **`npm run check`:** passes (212 tests). Use its exit code; a `| grep` can hide a failure.
  A clean checkout of `origin/abdo-1` + `npm ci` + `npm run check` passes too (nothing local needed).
  Mutation sweep: each of the 23 `DETECTION` thresholds and the calibration / body-picking constants
  set to an extreme breaks at least one test (only the overlay's list length is cosmetic).
- **End to end:** `main`'s full flow (calibrate → tutorial with the video off-page → play) ran on
  replayed clips with only the model swapped, in floor and treadmill mode (see §6 "Testing without
  a camera"). Phase 3's "treadmill round playable" holds on replayed data.
- **Whole team:** scratch merge of `main` + `p1-workout` + `p2-game` + `abdo-1`: no conflicts,
  403 tests (with `--testTimeout=120000` for Patrick's slow ones), build OK, a full round of the real
  3D game ran on replayed pose with no errors.
- **Integration:** verified against `origin/main` PR #19 in a scratch worktree (never merged): `main`'s
  check passes with this `src/pose` (236 tests incl. the DevPose snippet from NEEDS.md 1), the real
  calibration screen and `?dev=pose` work with a stubbed camera, StrictMode leaves one camera track.
  `main` added packages since `abdo-1` branched: after any merge of `main` into `abdo-1`, run
  `npm install`.

## 3. Architecture

```
webcam ─► camera.ts (stream) ─► <video> (mirrored by CSS in engine.ts)
            │ requestVideoFrameCallback, once per new frame (engine.ts)
            ▼
landmarker.ts  detect(video) → raw landmarks for 1..MAX_POSES bodies (shared model, GPU→CPU)
            ▼
session.ts     pickBody (largest, nearest) → size gate → calibrating? calibration.ts : detect.ts
            ▼                                   │ statuses (5% steps) → calibrate(onStatus)
detect.ts      EMA smoothing → lane / jump / squat / arms / tracking / drift → InputState + MoveEvents
            ▼
engine.ts      getState() (game polls), onMove listeners, drawSkeleton (skeleton.ts), D → overlay.ts
```

- `index.ts` — `createPoseInput()` = `createPoseEngine().source`; also exports `mountPoseDebug`
  (Greg asked for it in `main`'s docs/PROGRESS.md and docs/AUDIT.md #7).
- `engine.ts` — browser glue; StrictMode-safe start/stop; `calibrate()` before `start()` works;
  a 30 ms watchdog keeps frames flowing when the app takes the video off the page (it pauses) and
  turns a stalled camera into "no body" after 1 s; frames are deduplicated by decoded-frame count.
- `session.ts` — pure per-frame core (tested on clips).
- `calibration.ts` — pure calibrator, messages per mode, treadmill T estimate.
- `detect.ts` — pure detector; landmark indices; `toPlayerX` (the only `1 - x`); `pickBody`.
- `tuning.ts` — **all thresholds**; `DETECTION` is live (sliders), `DETECTION_DEFAULTS` committed.
- `overlay.ts`, `skeleton.ts`, `landmarker.ts`, `camera.ts`, `debug.ts`, `recording.ts`.
- Tests: `detect.test.ts` (rules), `variants.test.ts` (clips × variants), `session.test.ts`,
  `treadmill.test.ts`, `calibration.test.ts`, `skeleton.test.ts`, `overlay.test.ts`;
  helpers in `fixtures.ts`; clips in `fixtures/*.json` (A, two sessions at different spots;
  what each clip contains and its quirks: `fixtures/README.md`).

## 4. Decisions

All in `src/pose/DECISIONS.md` (32, with reasons). The big ones: lane 0.55/0.3 W; arm up 0.4 T above
the nose, "down" back near the nose (press reps); arms ignored mid-jump; squat rep after 250 ms down,
and a raised jump line (0.45 T) for 0.4 s after a squat instead of a block (crouch-then-jump works);
jump speed > 1.0 T/s; tracking lost when hips leave the frame; baselines drift only when
still; size gate 40%; `MAX_POSES = 1`; pose handles D, app handles R; video kept playing off-page.

## 5. Known bugs and risks (ranked)

1. **Not yet run on a real camera since Phase 0.** All detection evidence is from recorded clips.
2. **FPS with the full input is unmeasured on your camera** (overlay shows it). Phase 0 spike: 25.9 FPS
   GPU. The pose logic itself costs ~2 µs per frame (measured), so FPS is the camera plus MediaPipe.
3. **Only one body type recorded** (A). A teammate of a different height is the Phase 1 done-check.
4. **Treadmill was simulated** by scaling floor clips; real jogging arm swing is untested. Treadmill
   does not re-baseline size while jogging, so if the runner drifts much closer or further on the
   belt, press R (a ~40% size change also trips the size gate and pauses tracking).
5. **The app moves the `<video>` between screens.** Removing it pauses it; the engine now resumes it
   and processes frames on a watchdog timer (verified in Chromium). Watch FPS in the play screen.
6. **Video mirroring owner mismatch**: contract says UI mirrors, app says A does; pose mirrors now.
   If any screen adds `scale-x-[-1]` the video flips back (NEEDS.md 2).
7. **Jump out of a deep crouch registers ~0.17 s later** (it must clear 0.45 T, not 0.15 T, for 0.4 s
   after a squat/crouch). Normal jumps are unchanged. If hurdles feel late, lower
   `JUMP_AFTER_SQUAT_ON_T` (0.45) a little; never below ~0.3 (standing up onto the toes).
8. Background people with `MAX_POSES = 1`: MediaPipe may lock onto someone else; the size gate stops
   tracking a much smaller/larger person, but a same-size person beside you could be picked.
9. The `squat` **event** fires 250 ms after the hips cross the line (the `ducking` state is instant,
   so beams are unaffected); the rep counter and tutorial see it a moment later.

## 6. Needs real-camera test (about 10 minutes)

Setup: `npm run dev`, Chrome, open `http://localhost:5173/?dev=pose`, paste the console snippet from
README "How to use it". Stand at playing distance (feet in view).

1. **FPS:** overlay top line. Expect ≥ 25 FPS and `GPU`. If < 25, look at the second line: if the
   camera's own fps is also low, it is the camera (add light); if the camera says ~30, it is the
   model (check `GPU`, close other tabs). Note both numbers.
2. **Calibration:** click `⟳ calibrate floor`, walk back. Expect `tooClose` while your feet are cut
   off, then `holdStill` climbing to 100%, then "Calibrated". Step far back first: expect `tooFar`.
   If the room is too small to get your feet in view, set `CALIBRATION_FEET_IN_VIEW = false` in
   `tuning.ts` (head and knees are then enough; detection uses the hips).
3. **Moves, 10 each:** press `Reset tally` (right panel), do 10 sidesteps (right, back, left,
   back… each lane change counts), then read the tally; repeat for jump, squat, both arms up, left
   arm only, right arm only. Expect 10/10 each, nothing counted under the other moves. With the
   overlay on, the coloured lines show the lane, squat, jump and arm-up thresholds on the video.
4. **No false moves:** stand still 20 s, shuffle a little, scratch your head, rest both hands on top
   of your head. Expect nothing. (If arm raises are missed instead, lower `ARM_UP_ABOVE_NOSE_T`.)
5. **Squat then stand up fast onto your toes:** expect `squat` only, no `jump`. Then **crouch deep
   and jump**: expect `jump` (and no `squat` unless you paused at the bottom). Then **10 fast squats**
   (no pause): expect 10.
6. **Walk out of frame:** `tracking □` within ~0.5 s; walk back: `■` within ~0.3 s.
7. **Sliders:** move `LANE_ON_W` to 1.0 → small sidesteps stop counting. Press Reset.
8. **Treadmill:** click `⟳ calibrate treadmill` at about 1–1.5 m. Jog on the spot 20 s: expect no
   moves. Then reaches and both-arms presses: expect them to count.
9. **In the real app, without merging** (Git Bash, in the CodeJam folder):
   ```bash
   git fetch && git worktree add --detach ../codejam-main-try origin/main
   cd ../codejam-main-try && rm -rf src/pose && cp -r ../CodeJam/src/pose src/pose
   cp -r ../CodeJam/public/models ../CodeJam/public/mediapipe public/ && npm ci && npm run dev
   ```
   Open the printed localhost URL, play as guest, press **K** (pose), START: calibration screen shows
   the skeleton over you; the tutorial counts your moves; press **D** in play for the overlay, **R**
   to recalibrate. Afterwards: `cd ../CodeJam && git worktree remove --force ../codejam-main-try`.
   Never commit in that folder.
10. **Teammate** of a different height: repeat step 3; target 8/10.
11. Optional: set `MAX_POSES = 2` in `tuning.ts`, check FPS, have someone walk behind you.

Recording a new clip for a failing case: use the `● …` buttons, then put the JSON in
`src/pose/fixtures/` and add an expectation in `variants.test.ts`.

**Testing without a camera (how the overnight session verified things):**
- Detection: replay clips in Vitest (`fixtures.ts`: `replay(clip, { transform, dropFraction, … })`).
- Browser lifecycle: in Playwright, `page.addInitScript` replacing `navigator.mediaDevices.getUserMedia`
  with a `canvas.captureStream(30)`; MediaPipe runs (no body found), so start/stop, FPS, overlay,
  calibration status and the app's screens can be checked. Never use the real webcam unattended.
- Against `main` without merging: `git worktree add --detach <scratch dir> origin/main`, copy
  `src/pose` and `public/models`, `public/mediapipe` in, `npm ci`, `npm run check`, then
  `git worktree remove --force <dir>`. Never commit there.
- Full game flow with your moves but no camera: in that scratch app, Playwright `page.route` serves a
  replacement `/src/pose/landmarker.ts` whose `getLandmarker()` returns `{ delegate, detect() }` that
  plays clips from `/src/pose/fixtures/*.json?import` by elapsed time (camera stubbed as above).
  Everything else is the real code. Note: React StrictMode creates two pose inputs (useMemo runs
  twice); only one is started.

## 7. Waiting on teammates

Copy-paste messages for Greg are in `src/pose/NEEDS.md`: 1 wire `?dev=pose` (ready `DevPose.tsx`,
verified against `main`); 2 who mirrors the video; 3 skeleton canvas over the video; 4 FYI tuned
thresholds; 5 optional "raise both arms to start"; 6 optional skeleton on the play preview; 7 FYI
mid-round K switch calibrates silently.

## 8. Next tasks (priority, PLAN.md phase)

1. Run §6 with A at the camera; tune `tuning.ts` from the overlay (Phase 1 done-check).
2. Teammate test, 8/10 (Phase 1 done-check).
3. Merge `abdo-1` via PR when Greg asks (PLAN.md §7 merge order C, B, A, D). Before that, A decides
   whether to merge `origin/main` into `abdo-1` (dry run at 07:15: no conflicts) and then runs
   `npm install` and `npm run check`.
4. Measure `MAX_POSES = 2` FPS; keep it if ≥ 25 (Phase 2 "ignore background people").
5. Phase 4: demo-conditions test (venue light, people behind), station setup notes.

### Ready PR description (when A opens `abdo-1` → `main`; merge order C, B, A, D)

Title: `pose: real pose input — calibration, moves, treadmill, debug overlay`

```
Replaces the src/pose stub with the real pose input (CONTRACTS.md, unchanged interfaces).

- createPoseInput(): camera, MediaPipe Pose Landmarker (lite, from public/), calibrate() with
  status messages, lane / jump / squat / armsUp / reachLeft / reachRight, tracking flag,
  move events, drawSkeleton (handles VideoSlot's object-cover crop)
- Treadmill mode: shoulder calibration at 1–1.5 m, arm moves only
- D toggles a pose debug overlay (live values, threshold lines, sliders); R stays in the app
- The pose module mirrors its own <video> (slots.tsx expects that) and keeps it playing when a
  screen takes it off the page
- ?dev=pose: mountPoseDebug exported from src/pose (see src/pose/NEEDS.md 1 for DevPose.tsx)
- Thresholds tuned from recorded clips: src/pose/DECISIONS.md; station notes: src/pose/STATION.md
- 212 tests on recorded landmark clips and synthetic variants; npm run check passes

Only src/pose/, public/models/, public/mediapipe/ changed. No new packages or env vars.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## 9. Starter prompt for a new conversation

```
I'm role A (Vision) on our CodeJam 16 project. Work only on branch abdo-1 and only in
src/pose/, public/models/ and public/mediapipe/; never touch main. Read AGENTS.md, then
read src/pose/HANDOFF.md first, then continue from the next task.
```
