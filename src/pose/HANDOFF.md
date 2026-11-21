# HANDOFF — src/pose (role A, Vision)

_Last refresh: Sat ~2:20 PM, after a self-check pass (low FPS, visibility flicker). Read this first in a new conversation._

## 1. Context

- CodeJam 16 webcam fitness game: a 3-lane runner played with your body (Vite + React + TS strict,
  Three.js, MediaPipe pose on device, Supabase, Vercel). Docs: `AGENTS.md`, `docs/PLAN.md`,
  `docs/CONTRACTS.md` (the law), `docs/DEMO.md`.
- Role A (Vision, Abdo). Branch **`abdo-1`**. Never commit, merge or push to `main`, never rebase,
  never force-push. Greg merges PRs.
- A owns only `src/pose/`, `public/models/`, `public/mediapipe/`. Anything else → `src/pose/NEEDS.md`.
- No new npm packages; every number in `src/pose/tuning.ts`; `npm run check` passes before each push.
- Code freeze **Sunday 12:00 PM** Montreal time.

## 2. Current state

- **PR #27 is open:** https://github.com/gregorysudjian/CodeJam/pull/27 (`abdo-1` → `main`),
  mergeable, changes only the three A folders. `main` (with Patrick's game and workout already
  merged, and `vercel.json`) was merged into `abdo-1` at ~1:50 PM with no conflicts.
- **Last commit:** see `git log -1` (this handoff's own commit). **`npm run check` passes:** 564 tests
  with the whole team's code, 351 of them in `src/pose`. A's local `node_modules` is fixed (`npm ci`
  worked once the old dev server was gone).
- **Greg merged `abdo-1` (up to `187a57f`) into `main` via PR #28** and wired `?dev=pose` (NEEDS 1
  done). `main` was merged back into `abdo-1`; PR #27 now carries only the self-check commits and
  `src/pose/clip-viewer.html` (open the file in Chrome, drop clip JSONs on it: skeleton playback).
- **Self-check, Sat ~2 PM** (DECISIONS 37–38): at a steady 15 FPS a crouch-and-jump read as a
  squat, and a one-frame visibility flicker made the next frame raw (lost a quick reach). Both
  fixed, with new variants "15 FPS steady" and "hip visibility flicker". State timing for the
  game is unchanged (pinned test). Combined-variant probe: at 15 FPS everything holds except
  Greg's marginal half step under ±1% jitter; at 10 FPS crouch-and-jumps and quick reaches fail.
- **Works:** real `createPoseInput()` (contract-exact): camera, MediaPipe, `calibrate()` with status
  messages, lane, jump, squat, armsUp, reachLeft/reachRight, `tracking`, move events,
  `drawSkeleton`. Also treadmill mode, the D-key debug overlay (sliders, threshold lines on the
  video), and `?dev=pose` (`mountPoseDebug`, exported from `src/pose`) with calibrate buttons, a move
  tally and a clip recorder.
- **Evidence:**
  - Clips from two bodies (A and Greg) plus 13 synthetic variants each.
  - Full app flows with replayed clips: calibration → tutorial → real 3D game round. Also the
    `vite preview` production build.
  - Greg ran it on his machine too (his README on branch `greg-clips`).
- **Real camera, Sat ~1:30 PM:** 25.7 FPS on GPU (camera 30 fps, 640×480); calibrated W 0.107,
  T 0.214; threshold lines line up with the body. Sat ~2 PM A tried the moves (§6 step 3) and
  reported "seems good so far", without per-move tallies. Steps 4–9 are left for the full check
  with everything integrated.
- **Half-done:** nothing.

## 3. Architecture of `src/pose/`

```
webcam ─► camera.ts (getUserMedia stream) ─► <video> (mirrored with CSS in engine.ts)
             │ requestVideoFrameCallback per new frame, plus a 30 ms watchdog (engine.ts)
             ▼
landmarker.ts  detect(video) → raw landmarks for 1..MAX_POSES bodies (one shared model, GPU→CPU,
               MediaPipe JS loaded lazily)
             ▼
session.ts     size gate → pickBody → calibrating? calibration.ts : detect.ts; listeners isolated
             ▼                                   │ status in 5% steps → calibrate(onStatus)
detect.ts      EMA smoothing → lane / jump / squat / arms / tracking / drift → InputState + MoveEvents
             ▼
engine.ts      getState() (game polls), onMove, drawSkeleton (skeleton.ts), D → overlay.ts
```

| File | One line |
| --- | --- |
| `index.ts` | `createPoseInput()` (contract) and `mountPoseDebug` (Greg asked for it) |
| `engine.ts` | Browser side: StrictMode-safe start/stop, frame loop and watchdog (keeps frames flowing when the app takes the video off the page; a camera stalled > 1 s counts as "no body"), D key |
| `session.ts` | Pure per-frame core: player pick and size gate, calibrate or detect, quiet auto-calibration |
| `calibration.ts` | Pure calibrator: noBody / tooFar / tooClose / holdStill / done; treadmill tolerates jogging |
| `detect.ts` | Pure detector; `toPlayerX` is the only `1 - x`; `pickBody`; landmark indices |
| `tuning.ts` | **All thresholds.** `DETECTION` is live (sliders), `DETECTION_DEFAULTS` is committed |
| `overlay.ts` | Debug overlay text, 12 sliders, Reset, Copy; hands keyboard focus back after use |
| `skeleton.ts` | Skeleton and threshold-line drawing with the object-cover crop |
| `landmarker.ts`, `camera.ts` | Model (from `public/`) and camera, with readable errors |
| `debug.ts`, `recording.ts` | `?dev=pose` page; clip recorder format |
| `fixtures.ts`, `fixtures/` | Test replay helpers; A's clips, `greg/`, `extra/<move>-<N>-name.json` auto-tests |
| `*.test.ts` | detect (rules), variants (clips × variants, state timing), session, treadmill, calibration, skeleton, overlay |

## 4. Decisions

`src/pose/DECISIONS.md` (41 entries, each with its reason). The ones that matter most:

- Lane line 0.55 / 0.3 W.
- **Arm up 0.3 T** above the nose (kept: Patrick's game latency leads were tuned on it; 0.4 added
  ~70 ms of lag); arm down back near the nose (press reps).
- **A reach needs the other arm down** (Greg's half press).
- **The squat rep is decided after standing up** (crouch then jump is a jump; `ducking` is instant).
- Jump speed > 1.0 T/s; after a squat a jump must rise 0.45 T.
- Baselines drift only when the player is still.
- Size gate 40% before picking a body; `MAX_POSES = 1`.
- Pose handles D, the app handles R.
- The video keeps playing off-page.

## 5. Known bugs and risks (ranked)

1. **The real-camera checklist is only partly done** (§6 step 3 looked fine, no tallies; steps 4–9
   open), and there is no teammate check on a real camera yet (Greg's recorded clips pass).
2. (fixed) A's local `node_modules`.
3. **Combined FPS** of pose plus the 3D game on the demo laptop is unmeasured (pose alone: 25.7 GPU).
4. **Treadmill was simulated** by scaling clips. A runner drifting on the belt → press R.
5. Hands resting on the head can count as arms up (trade-off for the game's timing, DECISIONS 33).
6. Known limits: a half press on a camera tilted 3° can read as a reach; very quick left/right
   reaches can lose a rep at ±1% jitter or ≥ 30% dropped frames.
7. A jump out of a deep crouch registers ~0.17 s later (raised jump line after a squat).
   **At 10 FPS** it reads as a squat (smoothing flattens the peak under the raised line); 15 FPS is
   fine. So measure combined FPS (§8 task 4) and use `?gfx=low` if pose drops under ~20.
8. Video mirroring: the pose module mirrors its own `<video>`. If a screen adds `scale-x-[-1]` it
   flips back (NEEDS 2).

## 6. Needs real-camera test (10 minutes)

**Setup**
1. `npm ci` if `node_modules` is missing (fixed on A's laptop Sat ~2 PM).
2. `npm run dev`, leave it running, and open the printed URL + `?dev=pose` in Chrome (for example
   `http://localhost:5173/?dev=pose`).
3. F12 → Console (type `allow pasting` if asked), paste:
   ```js
   const host = document.createElement('div');
   host.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#111;overflow:auto';
   document.body.append(host);
   const { mountPoseDebug } = await import('/src/pose/index.ts');
   mountPoseDebug(host);
   ```
4. Allow the camera, close DevTools, and stand at playing distance (about 1.5 m, head and knees in view).

**Checklist**
1. ✅ (done Sat 1:30 PM) **FPS:** the overlay shows ≥ 25 FPS and GPU; line 2 shows the camera's own fps.
2. ✅ (done) **Calibration:** `⟳ calibrate floor` → `tooClose` with feet cut off → `holdStill`
   0–100% → "Calibrated". The coloured lines sit on the body.
3. **Moves, about 10 each:** press `Reset tally` before each move and read the tally after.
   - Sidesteps: right, back, left, back (each lane change counts).
   - Jumps, squats (hips below the orange line), both arms up (down to the chin between reps),
     left arm only, right arm only.
   - Expect 10/10 with nothing counted under other moves. Squats are counted when you stand back
     up, or 0.8 s into a hold.
4. **No false moves:** stand still 20 s, shuffle, scratch your head → nothing.
5. **Squat, then stand up fast onto your toes** → squat only. **Crouch deep and jump** → jump only.
6. **Walk out of frame:** `tracking □` within ~0.5 s; walk back: `■` within ~0.3 s.
7. **Treadmill:** `⟳ calibrate treadmill` at 1–1.5 m. Jog on the spot 20 s → no moves; reaches and
   presses count.
8. **In the app:** play a round with K (pose). Press D during play → overlay; R → recalibrate.
9. **Teammate of a different height:** repeat step 3, target 8/10. Save their clips as
   `src/pose/fixtures/extra/<move>-<N>-<name>.json` and tests then expect exactly N.

If something misses: `STATION.md` has a symptom → slider table. "Copy changed values" in the overlay
gives JSON to put into `DETECTION_DEFAULTS`.

## 7. Waiting on teammates (copy-paste, full text in `NEEDS.md`)

- **To Greg:**
  > PR #27 is up (main merged in, vercel.json included, check green with everything: 564 tests).
  > Your clips are in `src/pose/fixtures/greg/` and both findings are fixed: the half press is not
  > a reach, and the crouch before a jump is not a squat (`src/pose/DECISIONS.md` 34–36). After
  > merging, please wire `?dev=pose` with the ready `DevPose.tsx` in `src/pose/NEEDS.md` item 1
  > (imports `mountPoseDebug` from `@/pose`). The pose module mirrors its own video, so please
  > make sure no screen adds another mirror (NEEDS 2).
- **To Greg (optional):** NEEDS 5 ("raise both arms to start" via `onMove` `armsUp`), NEEDS 6
  (skeleton on the play screen's camera preview), NEEDS 7 (a mid-round K switch calibrates silently).
- **To Patrick (FYI):** NEEDS 8. Pose state timing is unchanged from when he measured his latency
  leads; only the squat *event* moved (decided after standing up). Collisions use the state.

## 8. Next tasks (priority, PLAN.md phase)

1. **On call for Patrick (Sat ~2:45 PM).** Patrick owns the camera session, FPS and camera tuning
   on his Mac (the demo laptop); A does not run it or tune for camera quality. If his session
   shows detection itself is wrong (a move missed, or seen when not done), he sends the case and A
   fixes it in `src/pose`, keeping the pinned state timing test green.
2. (done) Patrick's false jump during an overhead press: DECISIONS 39.
   (done, PR pending) Head-to-knees calibration at ~1.5 m (DECISIONS 40) and the pause X gesture
   (`gesture.ts`, `onGesture`, DECISIONS 41; NEEDS 9–10 for Greg). Record a real X with `● pauseX`.
3. Finish §6 steps 4–7 on the real camera (Phase 1 done-check), if Patrick's session doesn't cover it.
4. Teammate check, 8/10 (Phase 1 done-check). Save clips as `fixtures/extra/` tests.
5. (done) PR #27 merged via #30; NEEDS 1, 2, 5, 6, 7 done by Greg (#28, #31).
6. Measure `MAX_POSES = 2` FPS; keep it if ≥ 25 with the game (Phase 2, background people).
7. Phase 4: venue-lighting test, `STATION.md` setup at the venue.

## 9. Starter prompt for a new conversation

```
I'm Abdo, role A (Vision) on our CodeJam 16 project. Work only on branch abdo-1 and only in
src/pose/, public/models/ and public/mediapipe/; never commit, merge, rebase or push to main, never
force-push. If something outside my folders needs changing, tell me and write it in
src/pose/NEEDS.md. Read AGENTS.md, then read src/pose/HANDOFF.md first, then continue from the next
task.
```
