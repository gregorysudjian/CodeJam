# src/pose — Vision (owner A)

## Status

Why each threshold is what it is: `DECISIONS.md`. Demo day: `STATION.md`.

## How to use it

- App: `createPoseInput()` from `@/pose` (the contract's `PoseInputSource` plus `onGesture`, the
  pause X). Press **D** in the app for the overlay.
- Debug page: `npm run dev`, open `/?dev=pose` (calibrate buttons, overlay, move tally, recorder).
- Clip playback without a camera: open `clip-viewer.html` in Chrome and drop clip JSONs on it.

## Files

| File | What |
| --- | --- |
| `index.ts` | `createPoseInput()` (the contract + `onGesture`) and `mountPoseDebug` |
| `engine.ts` | Browser side: camera, `requestVideoFrameCallback` loop, D key, overlay, `PoseInputSource` |
| `session.ts` | Pure core per frame: pick the player, calibrate or detect, status throttling, listeners |
| `calibration.ts` | Pure calibrator: noBody / tooFar / tooClose / holdStill / done, median over 1.5 s |
| `detect.ts` | Pure detector: smoothing, lane, jump, squat, arms, tracking, drift; `toPlayerX` (the only `1 - x`) |
| `gesture.ts` | Pure pause X: forearms crossed at the chest, held 1 s, fires `'pause'` once per hold |
| `tuning.ts` | Every number. `DETECTION` is live (sliders); `DETECTION_DEFAULTS` is what is committed |
| `overlay.ts` | Debug overlay DOM and its text |
| `skeleton.ts` | Skeleton drawing with the app's object-cover crop |
| `landmarker.ts` | One shared MediaPipe model per page, GPU with CPU fallback |
| `camera.ts` | Camera stream, attach, stop, readable errors |
| `debug.ts` | `mountPoseDebug` for `?dev=pose`: calibrate buttons, overlay, move tally, clip recorder |
| `STATION.md` | Demo station setup, keys, symptom → fix table |
| `recording.ts` | Clip format and JSON download |
| `fixtures/` | Recorded clips (landmarks only, no images): A's, `greg/`, `near/` (~1.4 m), `extra/` (auto-tested) |
| `fixtures.ts` | Test helpers: replay clips, synthetic variants |
| `*.test.ts` | Unit, replay, variant, session, treadmill tests |

## Assets (served from `public/`, never a CDN)

- `public/models/pose_landmarker_lite.task` — from
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`
- `public/mediapipe/wasm/` — copied from `node_modules/@mediapipe/tasks-vision/wasm` (1.2.3). If the
  package version changes: `cp node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe/wasm/`

## History

- Phase 0 (Sat ~3 AM): spike at 25.9 FPS GPU on A's laptop, mirroring correct, full body tracked.
