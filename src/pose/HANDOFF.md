# HANDOFF — src/pose (role A, Vision)

_Last refresh: Sat ~6:30 PM. A new conversation starts here: read this, then do §8 task 1._

## 1. Context

- CodeJam 16: a webcam fitness game, a 3-lane runner you play with your body (Vite, React, TS strict, Three.js, MediaPipe pose on the device, Supabase, Vercel). Docs: `AGENTS.md`, `docs/PLAN.md`, `docs/CONTRACTS.md`, `docs/DEMO.md`.
- Abdo is role **A (Vision)** and works on branch **`abdo-1`**. Never commit, merge, rebase or push to `main`, and never force-push. Greg (D) merges every PR.
- A owns only `src/pose/`, `public/models/` and `public/mediapipe/`. Anything else goes into `src/pose/NEEDS.md` as a message for Greg. Exception: `src/app/App.tsx` in #43, done with the user's OK while Greg was busy, and merged by him.
- Rules: no new npm packages; every number lives in `src/pose/tuning.ts`; `npm run check` must pass before each push.
- **Code freeze: Sunday 12:00 PM, Montreal time.** Sunday rules: fix only crashes and unplayable bugs, a second person reads every fix, and no threshold changes after 10 AM.

## 2. Current state

- **Branch:** `abdo-1` = `main` at `4ed83c9` (Merge #47: Patrick's p5-game and p6-look, merged clean, nothing in `src/pose` changed) plus the station card and self-review (DECISIONS 43). Greg merges `abdo-1` as it stands in his batch tonight; the near-miss clips follow in a later PR.
- **`npm run check` passes:** 757 tests with the whole team's code, 411 of them in `src/pose` (Sat ~5:30 PM). The 7 lint warnings are in `src/ui`, not ours.
- **Merged today:** #27/#30 (self-check: 15 FPS, flicker), #32 (no false jump during a press), #37/#39 (head-to-knees calibration at about 1.5 m and the pause X), #43/#44 (the app picks the camera on the select screen when one exists, and remembers the choice).
- **Works (all in `main`):**
  - `createPoseInput()`, which returns `PoseSource` = the contract's `PoseInputSource` + `onGesture`. It covers the camera, MediaPipe, `calibrate()` with status messages, lane / jump / squat / armsUp / reachLeft / reachRight, `tracking`, move events and `drawSkeleton`.
  - Treadmill mode.
  - The **pause X**: forearms crossed in front of the chest for 1 s gives `'pause'`. Greg wired it: X pauses, the next X resumes, and the pause menu has END ROUND.
  - Calibration at **about 1.5 m, head to knees**, with the feet allowed out of frame.
  - The D overlay: live values, sliders, threshold lines, and `pause X NN%`.
  - `?dev=pose`: calibrate buttons, a move tally including `pause X`, and a recorder with `standing … mixed`, `pauseX`, `xLow`, `xTouch` and `xOverhead`.
  - `src/pose/clip-viewer.html`: open it in Chrome and drop clip JSONs on it to play back the skeleton.
- **Real camera (A's laptop, Sat ~4 PM):** calibration at about 1.4–1.5 m works. In the app, the X paused and resumed a round. A's clips at about 1.4 m (`fixtures/near/`) give 4/4 sidesteps, 4/4 jumps, 2/2 squats and 3/3 presses with tracking never lost, and the real X gives 2/2 pauses.
- **Done Sat ~5 PM:** `STATION.md` operator card (1 minute: distance, light, calibration messages, R, when to give up and press K) and a strict self-review of every `src/pose` file (DECISIONS 43).
- **Half-done:** the X near-miss clips aren't recorded yet (`~/Downloads` has only the chest `pauseX`, already in `near/`). The `debug.ts` `CLIP_LABELS` buttons for them exist; the clips go into `fixtures/near/` with tests in `variants.test.ts` (`describe('closer play …')`). That's §8 task 1.
- **Local dev:** `npm run dev`, then `http://localhost:5173` (the app) and `/?dev=pose` (the debug page). Close the `?dev=pose` tab before playing the app; on Windows only one tab can hold the camera.

## 3. Architecture of `src/pose/`

```
webcam ─► camera.ts (getUserMedia 640×480) ─► <video> (engine.ts mirrors it with CSS)
             │ requestVideoFrameCallback once per new frame + a 30 ms watchdog (engine.ts)
             ▼
landmarker.ts  detect(video) → raw landmarks for 1..MAX_POSES bodies (one shared model from
               public/, GPU then CPU, MediaPipe JS loaded only when pose starts)
             ▼
session.ts     size gate → pickBody → calibrating? calibration.ts : detect.ts → then gesture.ts
             ▼                                       │ status in 5% steps → calibrate(onStatus)
detect.ts      EMA smoothing → lane / jump / squat / arms / tracking / drift → InputState + MoveEvents
gesture.ts     reads detect's state and size → the held X → 'pause' (moves stay unchanged)
             ▼
engine.ts      source: getState() (the game polls it), onMove, onGesture, drawSkeleton (skeleton.ts),
               D → overlay.ts
```

**All thresholds live in `tuning.ts`.** `DETECTION` holds the live values (the overlay sliders write to it), `DETECTION_DEFAULTS` the committed ones. The `CALIBRATION_*` and `GESTURE_*` constants sit next to them. Distances are fractions of the calibrated shoulder width **W** (x) and torso length **T** (y).

| File | One line |
| --- | --- |
| `index.ts` | `createPoseInput()` (returns `PoseSource`), `mountPoseDebug`, `Gesture` and `PoseSource` types |
| `engine.ts` | Browser side: StrictMode-safe start/stop, frame loop, watchdog (frames keep flowing while the app moves the video off the page; a camera stalled for over 1 s counts as "no body"), the D key |
| `session.ts` | Pure per-frame core: player pick and size gate, calibrate or detect, then the gesture; quiet auto-calibration |
| `calibration.ts` | Pure calibrator: noBody / tooFar / tooClose / holdStill / done; head to knees plus room for a jump and a squat |
| `detect.ts` | Pure move detector; `toPlayerX` is the only `1 - x`; `pickBody`; landmark indices; while ducking, the shoulders are enough to count as present |
| `gesture.ts` | Pure pause X: `isCrossed()` + `createGestureDetector()` (1 s hold, once per hold, 0.2 s grace) |
| `tuning.ts` | **Every number** (see above) |
| `overlay.ts` | Debug overlay text, sliders, Reset, Copy changed values |
| `skeleton.ts` | Skeleton and threshold lines, matching the object-cover crop |
| `landmarker.ts`, `camera.ts` | Model and camera, with readable errors |
| `debug.ts`, `recording.ts` | The `?dev=pose` page (tally, recorder); the clip format |
| `fixtures.ts`, `fixtures/` | Replay helpers (`replay()` returns events, tracking and gestures). Clips: A's (`*.json`), `greg/`, `near/` (A at about 1.4 m, with the real `pauseX`); `extra/<move>-<N>-<name>.json` become tests automatically |
| `*.test.ts` | detect, gesture, session, calibration, treadmill, skeleton, overlay, variants (every clip × 14 variants, the near clips, and the **pinned state timing** the game's latency leads rely on) |
| `clip-viewer.html` | Offline skeleton playback of clip JSONs |
| `DECISIONS.md`, `NEEDS.md`, `STATION.md`, `README.md` | Why (43 entries), requests for Greg, demo operator card + tuning table, file list |

## 4. Decisions

`src/pose/DECISIONS.md` has 43 entries, each with its reason. The most important ones:

- **Pinned timing:** `variants.test.ts` › "when states turn on" must pass. Patrick's game draws objects early by the measured pose lag. Arm line 0.3 T above the nose (33), lane 0.55 / 0.3 W, jump speed above 1.0 T/s.
- The squat rep is decided after standing up (36). After a squat, a jump must rise 0.45 T (37: a fast rise up to 150 ms earlier counts, for 15 FPS). With both arms up, a jump must rise 0.3 T (39).
- A one-frame visibility flicker keeps the smoothing (38).
- **Head to knees at about 1.5 m** (40, corrected by 42). While ducking, the shoulders are enough, because deep squats push the hips to the frame's bottom edge. The room checks are 0.5 T above the shoulders and 0.5 T below the hips.
- **Pause X** (41, corrected by 42 with A's real X): wrists past each other by at least 0.08 W, between the shoulders and the nose, in front of the body, held 1 s. Never fires while airborne, ducking or with an arm up.
- `MAX_POSES = 1` with a size gate; pose handles D, the app handles R; the video keeps playing off the page.

## 5. Known bugs and risks (ranked)

1. **The X rests on one body.** The thresholds come from A's real X (chest height, plus spliced tests). The near-miss clips (arms folded low, hands touching, an X overhead) and the "arms out in front" X style aren't recorded yet (§8 task 1). No teammate has done the X on camera yet.
2. **The demo Mac's camera is untested by A.** Its field of view may differ from A's laptop: 1.5 m might say "too close" there, or deep squats might drop tracking. Patrick runs that session (§7).
3. **No teammate real-camera check** at 1.5 m. Greg's 9 clips are pending (§7).
4. **Low FPS:** at 10 FPS, crouch-then-jumps read as squats and quick reaches get lost; 15 FPS is fine. Patrick measures the combined FPS and uses `?gfx=low` if pose falls under about 20.
5. Low reaches (wrist less than 0.3 T above the nose) don't count. That's deliberate, because the game timing is tuned on it. Tell players to reach high.
6. Hands resting on the head can count as arms up (DECISIONS 33).
7. ~~A player more than 40% closer or further is a stranger~~: fixed Sat ~6 PM (DECISIONS 44, synthetic + `near/mixed`); confirm on A's `● drift` and `● turnStep` clips. Remaining: a player who walks closer while standing in a **side lane** keeps the old size until back in the centre lane.
8. Treadmill mode is only simulated (scaled clips). If the runner drifts on the belt, press R.
9. Known noise limits: a half press on a camera tilted 3° can read as a reach; Greg's fastest reach swaps can lose a rep or read as a jump at ±1% noise.

## 6. Needs real-camera test (10 minutes, A's laptop)

**Setup:** `npm run dev`. Close every other tab that uses the camera. Stand about **1.5 m** back with your head to your knees in view and some room above your head.

1. **Debug page** `localhost:5173/?dev=pose` → `⟳ calibrate floor`: you should see holdStill 0→100% and then "Calibrated". Step closer and it should say "Step back"; step far back and it should say "Come closer". Press D if the overlay isn't open: FPS ≥ 25, GPU.
2. **Moves**, about 5 each, pressing `Reset tally` before each: sidestep, jump, deep squat, both arms up (down to the chin between reps), left arm only, right arm only (reach high). Each count should match, with nothing counted under the other moves.
3. **No false moves:** stand still for 20 s, shuffle, scratch your head. Nothing should count.
4. **X on the debug page:** cross your forearms at chest height and hold. `pause X NN%` climbs and the tally's `pause X` goes up by exactly 1 after about 1 s. Holding longer adds nothing more; uncrossing and crossing again adds 1. Presses and reaches never add one.
5. **Record** (stand still for the first second of each 8 s clip): `● pauseX` with an X on the chest held about 2 s, twice; `● pauseX` again with the arms out in front, twice; `● xLow`, `● xTouch` and `● xOverhead` (expect 0). Then do §8 task 1.
6. **App** `localhost:5173` → play as guest → workout select. The switch should jump to **Camera** by itself. Then calibration, then a round with the small camera preview and skeleton in the HUD. **X = pause** (the screen shows "Cross your arms to resume"), **X again = resume**, and END ROUND leaves the round. Squats, presses and reaches must never pause it.

If something misses: `STATION.md` has a symptom → fix table. Record a clip of the case. Don't change thresholds after Sunday 10 AM.

## 7. Waiting on teammates (copy-paste; full text in `NEEDS.md`)

**Who does what (Greg, Sat ~5:30 PM):**
- **A's second laptop** (Codex, branch `a2-pose-robust`) works on pose robustness: strangers walking behind the player, camera and model failures, synthetic bodies and FPS, false pauses, and proof that no video leaves the laptop. It **never touches** `tuning.ts`, `detect.ts`, `gesture.ts`, `calibration.ts`, `session.ts`, `variants.test.ts` or `fixtures/near/`. Its findings come to A; **A alone decides thresholds.**
- **Patrick's camera session:** after each camera round with `?debug=timing`, the Mac prints a table of every hit with its cause. Rows marked `not seen` come to A as requests, using the "Requests for A" template in `src/game/README.md` (move, round and time; the cause and detail columns; what the body did and the pose FPS). Top priority whenever one arrives.
- **Second person's X:** Greg records his 9 clips tonight, `pauseX` among them. Don't wait for them; they come in a later merge.

NEEDS 1, 2, 5, 6, 7, 9, 10, 11 and 12 are done. 3, 4 and 8 are FYI. Open items:

- **To Patrick (the camera session on the demo Mac):**
  > When you run the camera session on the Mac, please check the pose side too: calibrate at about 1.5 m, head to knees (it should not say "too close"); do a few deep squats (tracking must not drop) and a crouch-then-jump (it must be a jump); try the X (pause, then X again to resume). If anything is off, record it on `?dev=pose` (`● standing`, `● squat`, or `● pauseX`) and send me the JSON. I fix it in `src/pose`, and your pinned timing test stays green.
- **To Greg (teammate check):**
  > When you have 5 minutes: on `?dev=pose`, calibrate at about 1.5 m, then record the 9 clips (standing … mixed, pauseX), standing still for the first second of each. Send them to me, or save them as `src/pose/fixtures/extra/<move>-<count>-greg.json`; they become tests automatically (the Phase 1 teammate check, 8 out of 10).

## 8. Next tasks (priority, mapped to docs/PLAN.md phases)

**Greg's standing order (Sat ~5:45 PM):** work in a loop on your own; you own detection quality.
Loop: `git fetch`, merge origin/main, take the top item, test it (real clips are the referee; red
then green; DECISIONS entry before the commit; adversarial review: could it fire a move or pause
the player didn't make, does it change when a state turns on, is every number in `tuning.ts`),
`npm run check`, push, then "abdo-1 ready to merge at <commit>". Message Greg only for ready, for
demo breakers, or for the lag proposal; otherwise a digest under 10 lines about hourly. Grade
yourself hourly in §10.

**Sat ~7 PM (Greg):** lag study decided, change nothing (DECISIONS 45 stands). The drift fix (b14c176) is on main untested on a real camera: judge A's `● drift` clip **first**; any false squat or lost tracking → fix or revert b14c176 at once and tell Greg. Referees are ready: `judge.test.ts` holds the expected outcome of every judge clip (drop `pose-<label>-*.json` into `fixtures/near/<label>.json`; the arms-out X goes to `near/pauseX-armsOut.json`), and `variants.test.ts` › extra clips takes Greg's 9 as `fixtures/extra/<label>-<count>-greg.json` (`leaveFrame-greg`, `mixed-greg` take no count; ≥ 8 in 10, never more, nothing else, pauseX exact). Codex's `bb495aa` (engine.ts: calibration rejects at once when stopped during the camera prompt) reviewed and accepted; it reaches main through Greg.

**Waiting on A's camera session** (the 17-step list in the conversation; recorder buttons exist in
`debug.ts`): app check, `pauseX` arms out, `xLow`, `xTouch`, `xOverhead`, `drift`, `fidget`,
`handsOnHead`, `lowReach`, `turnStep`, `squatArmsOut`, `lagSidestep/Jump/Squat/ArmsUp/Reach`.
When they land in `~/Downloads`:
- near-misses → `fixtures/near/`, tests in `variants.test.ts` › closer play (task 1 below);
- `drift`, `turnStep` → check DECISIONS 44 holds (no false moves, tracking kept) and add as tests;
- `fidget` → measure time to calibrate with and without `pending-calibration-median.patch`
  (DECISIONS 46: `git apply src/pose/pending-calibration-median.patch`; it also needs the
  "moving during the hold restarts it" test to allow the restart within the 5-frame window).
  Ship only if real fidgeting needs it;
- `handsOnHead`, `lowReach` → item 3 of Greg's list: count how many real reaches fall under the
  0.3 T line and how often hands on the head read as arms up; propose only if no clip breaks
  (DECISIONS 45 already shows lowering the arm line costs Greg's half press);
- `lag*` → item 4: onset by speed instead of a lower line (DECISIONS 45). Proposal only.
- `squatArmsOut` → add to the closer-play expectations (3 squats, no armsUp, no pause).

0. **App check on the merged main** (§6 step 6), then tell Greg the result.
1. **Phase 4 (hardening): X near-miss clips.** After §6 step 5, copy the new `~/Downloads/pose-{pauseX,xLow,xTouch,xOverhead}-*.json` into `src/pose/fixtures/near/` with clear names (for example `pauseX-chest.json`, `pauseX-armsOut.json`, `xLow.json`). In `variants.test.ts` › `describe('closer play …')`, expect the real number of pauses for the pauseX clips and 0 for the x* clips. If one fails, look at `isCrossed` with real values (see the probe pattern in DECISIONS 42) before changing `GESTURE_*` thresholds, and only before Sunday 10 AM. Run `npm run check`, push `abdo-1` and tell Greg **"ready"**.
2. **Phase 4: on call for Patrick's Mac session** (§7). His cases come in as clips; fix them in `src/pose`. The pinned timing test must pass.
3. **Phase 1/2 done-check: the teammate check** with Greg's clips at 1.5 m (§7), added as `fixtures/extra/` tests.
4. **Phase 4: `STATION.md`.** The operator card is done; add what the Mac session shows (distance, light, whether `?gfx=low` is needed) to the "Before the demo" list.
5. **Phase 5 (Sunday):** fresh-eyes playtest. Only crash or unplayable fixes, a second reader for each, no threshold changes after 10 AM. Rehearse the X on the pause screen.
6. Skip: new features, `MAX_POSES = 2`, treadmill tuning.

## 9. Starter prompt for a new conversation

```
I'm Abdo, role A (Vision) on our CodeJam 16 project. Work only on branch abdo-1 and only in
src/pose/, public/models/ and public/mediapipe/; never commit, merge, rebase or push to main,
never force-push. If something outside my folders needs changing, tell me and write it in
src/pose/NEEDS.md. Code freeze is Sunday 12:00 PM Montreal time (Sunday: crash/unplayable fixes
only, a second reader for every fix, no threshold changes after 10 AM). Before doing anything,
check git status, open PRs (gh pr list) and whether npm run check passes, and tell me in 3 lines
what changed. Read AGENTS.md, then read src/pose/HANDOFF.md first, then continue from the next
task.
```

## 10. Hourly self-grade

- **Sat ~6:30 PM.** *Improved for a real judge:* stepping 30–60 cm closer or back mid-play no
  longer causes false squats, stuck ducking or lost tracking (DECISIONS 44; 11 of 32 drift cases
  red → green; no real clip got worse, one real missed sidestep is now counted). *Measured, no
  change:* the lag study (45: lower lines cost crouch-jumps and Greg's half press) and calibration
  under noise (46: real still players already calibrate in ~1.53 s; candidate parked). *Noise:*
  none shipped. *Next:* A's camera clips (near-misses first, then drift/fidget/handsOnHead/
  lowReach/lag), Codex's `a2-pose-robust` once it exists (not on the remote yet).

