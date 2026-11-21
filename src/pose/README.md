# src/pose — Vision (owner A)

## MORNING REPORT (last update: Sat 07:13 — refreshed through the night)

**State:** Phase 1 (real detection), most of Phase 2 (robustness) and Phase 3 (treadmill input) are
done and pushed to `abdo-1`. `npm run check` passes: **205 tests**. Nothing was pushed to `main`.

**Integration with `main` (verified, nothing merged):** in a throwaway worktree of `origin/main`
(PR #19) with this `src/pose` copied in, `main`'s full `npm run check` passes (220 tests incl. the
team's), and the real app with a stubbed camera works: K switches to pose, START opens Greg's
calibration screen showing our live status message ("Step in front of the camera…"), the video is
mirrored and fills the frame, D shows the overlay (27 FPS GPU), Esc and K back to keyboard: no errors.

**End to end in `main`'s real app (verified, nothing merged):** with the camera stubbed and only the
MediaPipe model swapped for a replay of your clips, the full flow ran: K → START → calibration done
from your standing frames → "try each move" ticked sidestep, jump, squat, arms up, reach left, reach
right **while the video was off the page** → play screen received moves, timer ran, score went up.
Treadmill too (clips scaled to ~1.2 m): shoulder calibration, tutorial reach left / right / arms up,
orbs collected in play, lane stays 0, bouncing gave no moves. No console errors in either run.

**What works (tested on your recorded clips, no camera needed)**
- `createPoseInput()` is real: camera, MediaPipe, `calibrate()` with status messages, smoothing,
  lane (hysteresis), jump, squat, arms up, reach left/right, `tracking`, move events, `drawSkeleton`.
- Every clip gives the right moves, and so do 11 synthetic variants of every clip (shorter/taller,
  closer/farther, ±0.5–1% jitter, ±3° camera tilt, 20–40% dropped frames, and all of these at once)
  with the same timing (±100–250 ms).
- Zero moves standing still. Standing up out of a squat, even springing onto the toes: no jump (a
  test proves the guard is what prevents it). Squats up to 4× slower count. Stepping back quickly
  is not a jump. Stepping closer re-baselines. Long overhead holds do not distort W/T.
- Background people: largest, nearest body wins; bodies far from the player's size are ignored.
- Treadmill mode: shoulder calibration at 1–1.5 m, arms only, bouncing gives nothing; floor unchanged.
- **D** toggles the overlay: live values vs thresholds, sliders, Reset, Copy, and **threshold lines
  drawn on the video** (lane, stand, squat, jump, arm-up).

**Bugs found and fixed overnight (most by tests or the stubbed camera)**
1. Camera stayed on after React StrictMode start/stop/start (leaked stream).
2. **Pose froze for good if the app took the video off the page** (it pauses and never resumes).
   This would have hit every new player: on `main`, calibrate → "try each move" tutorial → play,
   and the tutorial screen shows no camera, so the video leaves the page right after calibration.
3. Baseline never adapted after stepping ~20% closer; stepping back quickly could fire a jump.
4. **A crouch before a jump (20% deeper than yours) became a squat and the jump was lost.** Now the
   squat rep needs 250 ms down, and after a squat a jump just has to rise higher (0.45 T).
5. Overhead holds shrank W and T; lane hysteresis bug leaving a side lane; GPU error stopped the loop;
   unhandled rejection when the camera failed inside `calibrate()`; a throwing `onMove` listener
   corrupted tracking.

**New on `?dev=pose`:** a move tally (do 10, read 10), threshold lines on the video.

**Also new:** MediaPipe's JS now loads only when pose starts (main bundle 407 → 254 kB); `STATION.md` (demo setup, keys, symptom → fix table); a small-room switch if the feet
cannot be in view (`CALIBRATION_FEET_IN_VIEW`); arm-up line 0.4 T so hands resting on the head are
not "arms up"; a verified `DevPose.tsx` for Greg (NEEDS.md 1); a ready PR description (HANDOFF §8).

**Decisions:** `DECISIONS.md` (30). **For Greg:** `NEEDS.md` (7 copy-paste messages).
**New session:** `HANDOFF.md`. **Real-camera checklist:** `HANDOFF.md` §6 (10 min).

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
