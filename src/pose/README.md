# src/pose — Vision (owner A)

## MORNING REPORT (last update: Sat 06:35 — refreshed through the night)

**State:** Phase 1 (real detection), most of Phase 2 (robustness) and Phase 3 (treadmill input) are
done and pushed to `abdo-1`. `npm run check` passes: **153 tests**. Nothing was ever pushed to `main`.

**What works (tested on your recorded clips, no camera needed)**
- `createPoseInput()` is real: camera, MediaPipe, `calibrate()` with status messages, smoothing,
  lane (hysteresis), jump, squat, arms up, reach left/right, `tracking`, move events, `drawSkeleton`.
- Every clip gives the right moves, and so do 8 synthetic variants of every clip (shorter/taller,
  closer/farther, ±0.5–1% jitter, 20–40% dropped frames) with the same timing (±100–250 ms).
- Standing still: zero moves. Standing up out of a squat, even springing onto the toes: no jump
  (and a test proves the guard is what prevents it). Squats up to 4× slower still count.
- Background people: picks the largest, nearest body; ignores bodies far from the player's size
  (so a person behind you is not tracked after you walk off). `MAX_POSES` stays 1 until you measure.
- Treadmill mode: calibrates on the shoulders at 1–1.5 m, arms only; bouncing gives no moves.
  Floor results are unchanged.
- **D** toggles a debug overlay during play: live values next to thresholds, sliders, Reset, Copy.
- `?dev=pose` page now runs the real input with calibrate buttons, overlay and recorder.
- Browser-checked with a stubbed camera: 30 FPS GPU loop, overlay, StrictMode start/stop/start
  leaves exactly one camera track, stop leaves none, denied camera gives a readable message.

**Fixed overnight:** a leaked camera stream on React StrictMode start/stop/start (camera light
would stay on); lane hysteresis when leaving a side lane; a lint error that slipped into one commit.

**Decisions:** `DECISIONS.md` (19 items). **For Greg:** `NEEDS.md` (5 messages, copy-paste ready).
**New session:** `HANDOFF.md`.

**Needs real-camera test** (10 min checklist with exact steps in `HANDOFF.md` §6):
1. FPS with the real input (overlay) — still ≥ 25?
2. Calibration flow messages at your playing distance.
3. Each move 10/10 for you; 8/10 for a teammate of a different height.
4. Skeleton lines up in the app's calibration screen (object-cover crop).
5. `MAX_POSES = 2`: FPS cost, and a person walking behind you.
6. Treadmill at 1–1.5 m: jogging on the spot gives no arm moves; reaches and presses count.
7. D overlay sliders change detection live.

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
| `debug.ts` | `mountPoseDebug` for `?dev=pose`: calibrate buttons, overlay, clip recorder |
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
