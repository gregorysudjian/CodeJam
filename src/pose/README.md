# src/pose — Vision (owner A)

## Phase 0: pose spike

`mountPoseDebug(container: HTMLElement): () => void` in `debug.ts` starts the webcam, runs the MediaPipe
Pose Landmarker (lite, VIDEO mode, one pose, GPU with CPU fallback), draws the skeleton over the mirrored
video and shows an FPS counter, the delegate in use and whether a body is found. The returned function stops
the camera, closes the model and removes the DOM.

Wiring (D): in the `?dev=pose` screen, call it from an effect:

```tsx
useEffect(() => mountPoseDebug(ref.current!), []);
```

Until that lands, open `/?dev=pose` with `npm run dev` and paste into the Chrome console:

```js
const { mountPoseDebug } = await import('/src/pose/debug.ts');
mountPoseDebug(document.body);
```

## Files

| File | What |
| --- | --- |
| `tuning.ts` | Every tunable number (paths, video size, confidences, drawing, FPS window) |
| `camera.ts` | `getUserMedia` at 640×480, front camera |
| `landmarker.ts` | Creates the Pose Landmarker from `public/`, GPU first, CPU fallback |
| `skeleton.ts` | `toPlayerX` (the only `1 - x` in the app) and `drawPose` |
| `debug.ts` | The `?dev=pose` view |
| `index.ts` | `createPoseInput()` — still the scaffold stub; real version is Phase 1 |

## Assets (served from `public/`, never a CDN)

- `public/models/pose_landmarker_lite.task` — from
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`
- `public/mediapipe/wasm/` — copied from `node_modules/@mediapipe/tasks-vision/wasm` (version 1.2.3). If the
  package version changes, re-copy: `cp node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe/wasm/`

## Status

- Works: `npm run check` passes. In headless Chrome the model and WASM load from `public/` (GPU delegate,
  about 1.2 s) and `detectForVideo` runs; the cleanup removes everything.
- Not tested yet: the real webcam, the skeleton on a real body and real FPS (needs a person in front of a
  camera; the headless browser uses a software GPU, so its timing means nothing).
- Next (Phase 1): `createPoseInput()` with calibration, smoothing, lane hysteresis, jump, squat, arms, tracking
  flag, move events and a debug overlay with sliders.
