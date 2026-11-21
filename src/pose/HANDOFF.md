# HANDOFF — src/pose (role A, Vision)

_Last refresh: Sat ~07:15 (overnight autonomous session). Read this first in a new conversation._

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
- **Last commit:** see `git log -1` (last code commit at this refresh: `bad9581`).
- **`npm run check`:** passes (160 tests).
- **Integration:** verified against `origin/main` PR #19 in a scratch worktree (not merged): `main`'s
  check passes with this `src/pose` (220 tests) and the real calibration screen works with a stubbed
  camera (see README MORNING REPORT). `main` added packages since `abdo-1` branched, so after any
  merge of `main` into `abdo-1`, run `npm install`.

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

- `index.ts` — `createPoseInput()` = `createPoseEngine().source`.
- `engine.ts` — browser glue; StrictMode-safe start/stop; `calibrate()` before `start()` works.
- `session.ts` — pure per-frame core (tested on clips).
- `calibration.ts` — pure calibrator, messages per mode, treadmill T estimate.
- `detect.ts` — pure detector; landmark indices; `toPlayerX` (the only `1 - x`); `pickBody`.
- `tuning.ts` — **all thresholds**; `DETECTION` is live (sliders), `DETECTION_DEFAULTS` committed.
- `overlay.ts`, `skeleton.ts`, `landmarker.ts`, `camera.ts`, `debug.ts`, `recording.ts`.
- Tests: `detect.test.ts` (rules), `variants.test.ts` (clips × variants), `session.test.ts`,
  `treadmill.test.ts`, `calibration.test.ts`, `skeleton.test.ts`, `overlay.test.ts`;
  helpers in `fixtures.ts`; clips in `fixtures/*.json` (A, two sessions at different spots).

## 4. Decisions

All in `src/pose/DECISIONS.md` (with reasons). The big ones: lane 0.55/0.3 W; arm "down" near the
nose (press reps); arms ignored mid-jump; tracking lost when hips leave the frame; T/W drift only
while idle; size gate 40%; `MAX_POSES = 1`; pose handles D, app handles R.

## 5. Known bugs and risks (ranked)

1. **Not yet run on a real camera since Phase 0.** All detection evidence is from recorded clips.
2. **FPS with the full input is unmeasured** (overlay shows it). Phase 0 spike: 25.9 FPS GPU.
3. **Only one body type recorded** (A). A teammate of a different height is the Phase 1 done-check.
4. **Treadmill was simulated** by scaling floor clips; real jogging arm swing is untested.
5. **The app moves the `<video>` between screens.** Removing it pauses it; the engine now resumes it
   and processes frames on a watchdog timer (verified in Chromium). Watch FPS in the play screen.
6. **Video mirroring owner mismatch**: contract says UI mirrors, app says A does; pose mirrors now.
   If any screen adds `scale-x-[-1]` the video flips back (NEEDS.md 2).
7. **Jump out of a deep crouch registers ~0.17 s later** (it must clear 0.45 T, not 0.15 T, for 0.4 s
   after a squat/crouch). Normal jumps are unchanged. If hurdles feel late, lower
   `JUMP_AFTER_SQUAT_ON_T` (0.45) a little; never below ~0.3 (standing up onto the toes).
8. Background people with `MAX_POSES = 1`: MediaPipe may lock onto someone else; the size gate stops
   tracking a much smaller/larger person, but a same-size person beside you could be picked.

## 6. Needs real-camera test (about 10 minutes)

Setup: `npm run dev`, Chrome, open `http://localhost:5173/?dev=pose`, paste the console snippet from
README "How to use it". Stand at playing distance (feet in view).

1. **FPS:** overlay top line. Expect ≥ 25 FPS and `GPU`. If < 25, tell the session.
2. **Calibration:** click `⟳ calibrate floor`, walk back. Expect `tooClose` while your feet are cut
   off, then `holdStill` climbing to 100%, then "Calibrated". Step far back first: expect `tooFar`.
3. **Moves, 10 each:** press `Reset tally` (right panel), do 10 sidesteps (right, back, left,
   back… each lane change counts), then read the tally; repeat for jump, squat, both arms up, left
   arm only, right arm only. Expect 10/10 each, nothing counted under the other moves. With the
   overlay on, the coloured lines show the lane, squat, jump and arm-up thresholds on the video.
4. **No false moves:** stand still 20 s, shuffle a little, scratch your head. Expect nothing.
5. **Squat then stand up fast onto your toes:** expect `squat` only, no `jump`. Then **crouch deep
   and jump**: expect `jump` (and no `squat` unless you paused at the bottom). Then **10 fast squats**
   (no pause): expect 10.
6. **Walk out of frame:** `tracking □` within ~0.5 s; walk back: `■` within ~0.3 s.
7. **Sliders:** move `LANE_ON_W` to 1.0 → small sidesteps stop counting. Press Reset.
8. **Treadmill:** click `⟳ calibrate treadmill` at about 1–1.5 m. Jog on the spot 20 s: expect no
   moves. Then reaches and both-arms presses: expect them to count.
9. **In the app** (if Greg's branch is merged somewhere you can run): calibration screen skeleton
   lines up with your body; press D during play → overlay; press R → recalibrates.
10. **Teammate** of a different height: repeat step 3; target 8/10.
11. Optional: set `MAX_POSES = 2` in `tuning.ts`, check FPS, have someone walk behind you.

Recording a new clip for a failing case: use the `● …` buttons, then put the JSON in
`src/pose/fixtures/` and add an expectation in `variants.test.ts`.

## 7. Waiting on teammates

Copy-paste messages for Greg are in `src/pose/NEEDS.md` (wire `?dev=pose`; who mirrors the video;
skeleton canvas over the video; FYI tuned thresholds; optional "raise both arms to start").

## 8. Next tasks (priority, PLAN.md phase)

1. Run §6 with A at the camera; tune `tuning.ts` from the overlay (Phase 1 done-check).
2. Teammate test, 8/10 (Phase 1 done-check).
3. Merge `abdo-1` via PR when Greg asks (PLAN.md §7 merge order C, B, A, D). Before that, A decides
   whether to merge `origin/main` into `abdo-1` and re-run `npm run check`.
4. Measure `MAX_POSES = 2` FPS; keep it if ≥ 25 (Phase 2 "ignore background people").
5. Phase 4: demo-conditions test (venue light, people behind), station setup notes.

## 9. Starter prompt for a new conversation

```
I'm role A (Vision) on our CodeJam 16 project. Work only on branch abdo-1 and only in
src/pose/, public/models/ and public/mediapipe/; never touch main. Read AGENTS.md, then
read src/pose/HANDOFF.md first, then continue from the next task.
```
