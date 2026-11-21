# src/pose — Vision (owner A)

## MORNING REPORT (last update: Sat 07:14 — refreshed through the night)

**TL;DR:** the real pose input is done on `abdo-1` (Phase 1, most of Phase 2, Phase 3 treadmill),
205 tests pass, and it runs end to end inside `main`'s real app (calibration → tutorial → play) on
your replayed clips. Nothing touched `main`. It has **not** met a real camera since Phase 0.

**Do this first (≈20 min):**
1. **10-minute camera check:** `HANDOFF.md` §6 (FPS, calibration, 10 of each move with the new move
   tally, no false moves, crouch-and-jump, treadmill). Tune with the D overlay's sliders if needed.
2. **Send Greg** `NEEDS.md` items 1 (ready `DevPose.tsx` for `?dev=pose`) and 2 (who mirrors the video).
3. **Decide the merge:** `main` has moved (PR #19, new packages). Merge `origin/main` into `abdo-1`,
   `npm install`, `npm run check`, then open the PR with the text in `HANDOFF.md` §8. A dry run
   (`git merge-tree`, nothing changed) shows **no conflicts**: `main` never touched `src/pose`,
   `public/models` or `public/mediapipe`.

**Evidence (no camera; nothing merged):**
- In a throwaway copy of `origin/main` with this `src/pose`: `main`'s `npm run check` passes (236
  tests), Greg's calibration screen shows our live messages, D shows the overlay, `?dev=pose` works
  with the `DevPose.tsx` from NEEDS.md, React StrictMode leaves exactly one camera track.
- Full flow with only the model swapped for your clips: calibration done → "try each move" ticked all
  six moves **while the video was off the page** → play received moves, timer ran, score rose.
  Treadmill (clips scaled to ~1.2 m): calibrated, tutorial passed, orbs collected, bouncing gave no
  moves. No console errors.

**What works (tested on your clips + synthetic variants)**
- `createPoseInput()` per the contract: camera, MediaPipe, `calibrate()` with status messages,
  smoothing, lane (hysteresis), jump, squat, arms up, reach left/right, `tracking`, move events,
  `drawSkeleton` (handles the app's object-cover crop).
- Every clip gives the right moves; so do 11 variants of every clip (shorter/taller, closer/farther,
  ±0.5–1% jitter, ±3° tilt, 20–40% dropped frames, all at once), at the same times (±100–250 ms).
- No moves standing still or with hands resting on the head. Standing up from a squat, even onto the
  toes: no jump. Crouch-then-jump: a jump. Squats 4× faster or slower count. Stepping back quickly
  is not a jump; stepping closer re-baselines.
- Background people: largest, nearest body wins; bodies far from the player's size are ignored.
- Treadmill: shoulder calibration at 1–1.5 m, arms only; floor results unchanged.
- **D** overlay: live values vs thresholds, 12 sliders, Reset, Copy, threshold lines on the video.
  `?dev=pose` adds calibrate buttons, a **move tally** and the clip recorder.

**Bugs found and fixed overnight**
1. **Pose froze for good when a screen took the video off the page** — on `main` that is every first
   round (calibrate → tutorial has no camera view → play). Fixed and verified end to end.
2. **Crouch-then-jump lost the jump** (crouch counted as a squat, then the jump was blocked).
3. Camera stayed on after React StrictMode start/stop/start.
4. Baseline stuck after stepping closer; quick step back fired a jump; overhead holds shrank W/T.
5. Smaller ones: lane hysteresis leaving a side lane; a GPU error stopped the loop; a throwing game
   listener or UI callback corrupted tracking; a bigger stranger in front hid the player;
   calibration restarted on every one-frame flicker; unhandled rejection on camera failure; an
   unplugged or stalled camera kept `tracking: true` with a frozen pose.

**Also new:** MediaPipe JS loads only when pose starts (main bundle 407 → 254 kB); `STATION.md` (demo
setup, keys, symptom → fix table); small-room switch `CALIBRATION_FEET_IN_VIEW`.

**Pointers:** decisions `DECISIONS.md` (31) · messages for Greg `NEEDS.md` (7) · new session
`HANDOFF.md` (starter prompt in §9) · demo `STATION.md`.

## How to use it

- App: `createPoseInput()` from `@/pose` (the contract). Press **D** in the app for the overlay.
- Debug page: `npm run dev`, open `/?dev=pose`, then in the Chrome console (until Greg wires it):

```js
const host = document.createElement('div');
host.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#111;overflow:auto';
document.body.append(host);
const { mountPoseDebug } = await import('/src/pose/debug.ts');
mountPoseDebug(host);
```

## Files

| File | What |
| --- | --- |
| `index.ts` | `createPoseInput()` — the only export the contract names |
| `engine.ts` | Browser side: camera, `requestVideoFrameCallback` loop, D key, overlay, `PoseInputSource` |
| `session.ts` | Pure core per frame: pick the player, calibrate or detect, status throttling, listeners |
| `calibration.ts` | Pure calibrator: noBody / tooFar / tooClose / holdStill / done, median over 1.5 s |
| `detect.ts` | Pure detector: smoothing, lane, jump, squat, arms, tracking, drift; `toPlayerX` (the only `1 - x`) |
| `tuning.ts` | Every number. `DETECTION` is live (sliders); `DETECTION_DEFAULTS` is what is committed |
| `overlay.ts` | Debug overlay DOM and its text |
| `skeleton.ts` | Skeleton drawing with the app's object-cover crop |
| `landmarker.ts` | One shared MediaPipe model per page, GPU with CPU fallback |
| `camera.ts` | Camera stream, attach, stop, readable errors |
| `debug.ts` | `mountPoseDebug` for `?dev=pose`: calibrate buttons, overlay, move tally, clip recorder |
| `STATION.md` | Demo station setup, keys, symptom → fix table |
| `recording.ts` | Clip format and JSON download |
| `fixtures/*.json` | A's recorded clips (landmarks only, no images) |
| `fixtures.ts` | Test helpers: replay clips, synthetic variants |
| `*.test.ts` | Unit, replay, variant, session, treadmill tests |

## Assets (served from `public/`, never a CDN)

- `public/models/pose_landmarker_lite.task` — from
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`
- `public/mediapipe/wasm/` — copied from `node_modules/@mediapipe/tasks-vision/wasm` (1.2.3). If the
  package version changes: `cp node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe/wasm/`

## History

- Phase 0 (Sat ~3 AM): spike at 25.9 FPS GPU on A's laptop, mirroring correct, full body tracked.
