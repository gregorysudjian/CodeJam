# HANDOFF — src/pose (role A, Vision) + Abdo's UI work tonight

_Last refresh: Sun ~2:30 AM Montreal. A new conversation starts here: read this, then do §8 task 1._

## 1. Context

- CodeJam 16: a webcam fitness game, a 3-lane runner you play with your body (Vite, React, TS strict, plain Three.js, MediaPipe pose on the device, Supabase, Vercel, Claude API). Docs: `AGENTS.md`, `docs/PLAN.md`, `docs/CONTRACTS.md`, `docs/DEMO.md`.
- Abdo is role **A (Vision)**, branch **`abdo-1`**, owning `src/pose/`, `public/models/`, `public/mediapipe/`. Never commit, merge, rebase or push to `main`; never force-push. Anything outside goes to `src/pose/NEEDS.md`.
- **Since Sun ~0:30 AM Abdo's Claude also does the UI look** (Greg's call): branches `ui-theme` (merged, #110), `ui-landing` (PR #113) and next `ab-calib`. Tonight's UI files only: `src/ui/theme.css`, `src/ui/kit/tokens.ts`, `LandingScreen.tsx`, `ProfileScreen.tsx`, `profileRules.ts`(+test), `CalibrationScreen.tsx`. Never `src/app`, `src/contracts`, `src/game`, config, other screens. The orchestrator **Jiscar 2** reviews and merges; ready = merge origin/main, `npm run check`, screenshots at 1280×720 and 1920×1080 with 0 console errors, open a PR (gh works) or send the 3-line READY.
- Rules: no new npm packages or env vars; every pose number in `src/pose/tuning.ts`; `npm run check` before each push; never commit raw videos or a `higgsfield/` folder.
- **Clock (Montreal):** features ready by 8:00 AM; after **10:00 AM** only crash/unplayable fixes (and **no threshold changes**); nothing after 11:30; **code freeze 12:00 PM Sunday**. A second reader for every Sunday fix.

## 2. Current state

- **`abdo-1` = `main` `fd08f82`** (Merge #110, ui-theme). All of A's pose work is merged; A's last pose commit is `fdb1105` (DECISIONS 48). **`npm run check` passes** on it: 1,574 tests, 1,029 of them in `src/pose` (Sun ~2:20 AM; the 7 lint warnings are in `src/ui`, not ours).
- **Pose works (all in main):** `createPoseInput()` → `PoseSource` (contract `PoseInputSource` + `onGesture`): camera, MediaPipe lite (2 poses), `calibrate()` with messages (head to knees, ~1.5 m), lane / jump / squat / armsUp / reachLeft / reachRight, `tracking`, `otherPerson`, the **pause X**, `drawSkeleton`, treadmill mode, the D overlay (live values, sliders, `pause X NN%`), `?dev=pose` (calibrate, tally, recorder for every clip label), `clip-viewer.html`.
- **Merged overnight by others in `src/pose`:** Patrick 1's `p5-camera` (DECISIONS 49: two bodies, follow the calibrated player, `otherPerson`, rivals, fixes from 3 camera sessions on the demo Mac) and Codex's `a2-pose-robust` (`*.robust.test.ts`, `ROBUSTNESS.md`, engine fix `bb495aa`). Demo Mac measured: pose 30 fps, render ~120 fps with 2 poses, no `?gfx=low` needed.
- **Half-done (pose):** A's camera clips are still **not recorded** (`~/Downloads` has only Saturday's 3 PM clips). Referees are ready: `judge.test.ts` (expected outcome per judge clip in `fixtures/near/<label>.json`, skipped until recorded), `variants.test.ts` › extra clips (`fixtures/extra/<label>-<count>-greg.json`), `drift.test.ts`. Parked: `pending-calibration-median.patch` (DECISIONS 46).
- **UI tonight:**
  - `ui-theme` **merged (#110)**: Montreal look (limestone, slate ink, maple-red accent, solid cards). `theme.css` keeps the token NAMES (`lime` = maple red, `cyan` = metro blue, `magenta` = plum, `amber` = ochre, `violet` = Mont-Royal green). `.hud-root` and `.calibration-stage` keep the old dark palette. Kit: `MontrealSkyline`, `Backdrop` skyline, MoveFigure/MoveChip/ProgressRing use `var(--na-*)`.
  - `ui-landing` **PR #113 at `48fdb2c`, READY sent** (Jiscar 2 merges in the 4:00 AM batch): `LandingScreen` with sign-up built in (`SignUpCard`: username required, age/weight/height optional, goal, level, START; `onSignUp?(p: ProfileInput)`; without it the old "Play as guest"), returning "Continue as" + "New player", `HeroVideo` playing `/media/landing-montreal.mp4` behind the title (the file comes with Greg's `g2-media`/#111; missing or reduced motion → slate panel with the awning and fleur-de-lis). `ProfileScreen` has age and height. `profileRules`: `validateName`, `validateRange`, `PROFILE_RANGES`, `optionalNumbers` (age whole, height to 0.1 cm; migration 0006 ranges).
  - Local only: `public/media/landing-montreal.mp4` is an **untracked test copy** (from `origin/g2-media`). Never `git add public/media` wholesale.
  - QA sweep (`docs/qa/sweep`) on ui-theme and ui-landing: 22/26; the same 4 fail (a "Camera blocked" overlay over results because select defaults to Camera and the sweep denies it, plus a GL console warning). Not from the UI diff; a clean main baseline couldn't be run on this laptop. Reported to Greg.

## 3. Architecture of `src/pose/`

```
webcam ─► camera.ts (getUserMedia 640×480) ─► <video> (engine.ts mirrors it with CSS)
             │ requestVideoFrameCallback per new frame + 30 ms watchdog (engine.ts)
             ▼
landmarker.ts  detect(video) → raw landmarks for up to MAX_POSES = 2 bodies (model + WASM from
               public/, GPU then CPU, MediaPipe JS loaded only when pose starts)
             ▼
session.ts     calibrating? pickBody → calibration.ts
               playing: follow the calibrated player (nearest, speed/size limits), find them again
               after a gap, flag otherPerson / rivals → detect.ts → gesture.ts
             ▼
detect.ts      EMA smoothing → lane / jump / squat / arms / tracking / drift re-baseline → InputState + MoveEvents
gesture.ts     held forearm X (1 s) → 'pause'
             ▼
engine.ts      source: getState() (the game polls it), onMove, onGesture, drawSkeleton (skeleton.ts), D → overlay.ts
```

**All thresholds live in `tuning.ts`:** `DETECTION` (live, the overlay sliders write it) / `DETECTION_DEFAULTS` (committed), plus `CALIBRATION_*`, `GESTURE_*`, `FOLLOW_*`, `RIVAL_*`, `RESCALE_*`. Distances are fractions of the calibrated shoulder width **W** (x) and torso length **T** (y).

| File | One line |
| --- | --- |
| `index.ts` | `createPoseInput()` (→ `PoseSource`), `mountPoseDebug`, types |
| `engine.ts` | Browser side: StrictMode-safe start/stop, frame loop, watchdog, D key, calibration promise |
| `session.ts` | Pure per-frame core: size gate, player follow / find again, `otherPerson`, rivals, calibrate or detect, gesture |
| `calibration.ts` | noBody / tooFar / tooClose / holdStill / done; head to knees plus room for a jump and a squat |
| `detect.ts` | Pure move detector; `toPlayerX` is the only `1 - x`; `pickBody`; drift re-baseline (44/48) |
| `gesture.ts` | `isCrossed()` + `createGestureDetector()` (1 s hold, once per hold, 0.2 s grace) |
| `tuning.ts` | **Every number** |
| `overlay.ts`, `skeleton.ts` | D overlay (values, sliders, copy) and skeleton/threshold lines |
| `landmarker.ts`, `camera.ts` | Model and camera with readable errors |
| `debug.ts`, `recording.ts` | `?dev=pose` page (tally, recorder, `CLIP_LABELS`) and the clip format |
| `fixtures.ts`, `fixtures/` | `replay()`; clips: A's (`*.json`), `greg/`, `near/` (A at ~1.4 m incl. the real `pauseX`) |
| `*.test.ts` | detect, gesture, session, calibration, treadmill, skeleton, overlay, variants (incl. **pinned state timing**), drift, judge, other (2 bodies); `*.robust.test.ts` are Codex's |
| `DECISIONS.md`, `NEEDS.md`, `STATION.md`, `ROBUSTNESS.md`, `README.md` | Why (49 entries), requests, demo card, Codex findings, file list |

## 4. Decisions

`src/pose/DECISIONS.md`, 49 entries with reasons. Key ones:
- **Pinned timing:** `variants.test.ts` › "when states turn on" must pass (Patrick's `VISUAL_LEAD_SEC` in `src/game/tuning.ts` depends on it). Lag study: change nothing (45).
- Head to knees at ~1.5 m (40/42); pause X from A's real X (41/42); squat decided after standing up (36); jump after a squat must rise 0.45 T (37).
- **Drift (44, tightened 48):** a player who steps 20%+ closer/back re-baselines after 300 ms, only while tracked, centre lane, still sideways.
- **Two bodies (49, Patrick 1):** follow the calibrated player; `otherPerson` pauses; side by side at 1.5 m the lite model often sees only one (accepted limit).
- UI tonight (not in DECISIONS): light theme with HUD/camera stage kept dark; Street View stills not used (Google watermarks, bystanders); landing video only via `HeroVideo` in LandingScreen (Backdrop/Screen aren't on tonight's file list).

## 5. Known bugs and risks (ranked)

1. **Drift fix (44/48) never seen on a real body.** Synthetic + replays only. A's `● drift` clip decides it: any false squat or lost tracking → fix or revert `b14c176`/`fdb1105` and tell Greg (before 10 AM).
2. **Walking onto the mark from behind reads as 1–3 jumps** (Patrick's session 3; DECISIONS 49 limits). The re-baseline needs stillness. Not changed; a fix needs a clip (ask Patrick for `capture-1795319347861.json`) and must land before 10 AM, or not at all.
3. **Side by side at 1.5 m** the lite model reports one body for seconds → pause or following the helper. Operator rule: spectators beside the laptop, never behind or next to the player (in `STATION.md`).
4. **The X rests on one body:** near-miss clips (`xLow`, `xTouch`, `xOverhead`, arms-out X) not recorded.
5. **Low FPS judge laptops:** at 10 FPS crouch-jumps read as squats, quick reaches get lost (demo Mac is fine: 30 fps).
6. Low reaches (< 0.3 T above the nose) don't count; hands on the head can read as arms up (33). Tell players to reach high.
7. A player who walks closer while in a side lane keeps the old size until back in the centre.
8. Treadmill only simulated; press R if the runner drifts.
9. UI: the sweep's 4 failures (Camera blocked over results) need one run on a clean main by Greg; CalibrationScreen and WorkoutSelect still have a few `white/…` overlays (ab-calib fixes Calibration's).

## 6. Needs real-camera test (10 minutes, A's laptop)

Setup: `npm run dev`, close other camera tabs, stand **~1.5 m** back, head to knees in view.

1. `localhost:5173/?dev=pose` → `⟳ calibrate floor`: holdStill 0→100%, then "Calibrated". Closer → "Step back"; far → "Come closer". D overlay: FPS ≥ 25, GPU.
2. **`● drift` first** (8 s; stand still the first second): step 30–50 cm forward, hold 2 s, step back; twice. Expect: tally adds **no moves, no pause**, tracking never lost. Save it as `src/pose/fixtures/near/drift.json`; `npx vitest run src/pose/judge.test.ts` must pass.
3. Moves, ~5 each, `Reset tally` first: sidestep, jump, deep squat, both arms up (down to the chin between), left reach, right reach (high). Counts match; nothing else counts.
4. Stand still 20 s, shuffle, scratch your head: nothing counts.
5. X at chest height, held: `pause X NN%` climbs, tally `pause X` +1 after ~1 s, once per hold. Presses and reaches never add one.
6. Walk 2 steps behind the mark, then onto it (risk 2): count any `jump` in the tally. Record it as `● mixed` if it happens.
7. Ask someone to stand beside you, then behind you: the overlay shows `otherPerson`; no moves fire.
8. Record when time allows: `● pauseX` (arms out in front, twice), `● xLow`, `● xTouch`, `● xOverhead`, `● fidget`, `● handsOnHead`, `● lowReach`, `● turnStep`, `● squatArmsOut`, `● passerby`.
9. App `localhost:5173`: the landing (Montreal look; sign-up card once Abdo Codex wires `onSignUp`) → select (switch on **Camera**) → calibration → round with the camera preview. X pauses, X again resumes, END ROUND leaves. Squats/presses/reaches never pause.

If something misses: `STATION.md` symptom → fix table. Record a clip. No thresholds after 10 AM.

## 7. Waiting on teammates (copy-paste for Greg/D; full text in `NEEDS.md`)

- **To Greg (9 clips, still pending):**
  > When you have 5 minutes: on `?dev=pose`, calibrate at ~1.5 m and record standing, sidestep, jump, squat, armsUp, reach, leaveFrame, mixed, pauseX (stand still the first second). Save them as `src/pose/fixtures/extra/<label>-<count>-greg.json` (`leaveFrame-greg.json`, `mixed-greg.json` take no count); they become tests automatically.
- **To Patrick (risk 2):**
  > Could you drop your session-3 capture `capture-1795319347861.json` (steps backFurther → onMark) into `src/pose/fixtures/greg/` or send it to me? Walking onto the mark reads as 1–3 jumps; I need the clip as the referee before deciding on a fix (before 10 AM or not at all).
- **To Abdo Codex / Jiscar 2 (UI):**
  > ui-landing (#113) needs `onSignUp(p: ProfileInput)` wired in `src/app` (save the profile, go to select, tier from `level`), and `g2-media`'s `public/media/landing-montreal.mp4` merged for the hero clip. After wiring, the QA sweep's "click Play as guest → WHO'S PLAYING" step changes.
- **To Greg (sweep):**
  > On ui-theme and ui-landing the sweep gives 22/26: a "Camera blocked" overlay over results (select defaults to Camera, the sweep denies it) plus a GL console warning. Please run it once on clean main to confirm it isn't new.
- NEEDS 1, 2, 5, 6, 7, 9, 10, 11, 12 done; 3, 4, 8 FYI.

## 8. Next tasks (priority; PLAN.md phases)

1. **Phase 4 (polish), UI: `ab-calib`.** After #113 merges (4:00 AM batch): `git fetch && git checkout -b ab-calib origin/main`; restyle `src/ui/screens/CalibrationScreen.tsx` to the Montreal theme; keep behaviour and all pose logic. The stage stays dark (`.calibration-stage` scope in `theme.css`); fix its `border-white/…` overlays; guide colour `var(--na-lime)` instead of `ACCENT_HEX` so it stays bright on the video. Check, screenshots 1280×720 + 1920×1080 (0 console errors), PR + 3-line READY **before 8 AM**.
2. **Token requests** from Patrick 3 / Gabriel: add to `theme.css`/`tokens.ts`, never rename.
3. **Phase 4, pose: A's camera session** (§6), `drift` first → `judge.test.ts`. Decide risk 1 and risk 2 **before 10 AM**.
4. **Phase 1/2 done-check:** Greg's 9 clips → `fixtures/extra/` (≥ 8 in 10).
5. Near-misses / fidget / handsOnHead / lowReach / lag clips (§6 step 8): add as tests; propose changes only with clip evidence (DECISIONS 45/46).
6. **Phase 5 (Sunday):** fresh-eyes playtest; crash/unplayable fixes only after 10 AM; rehearse the X on the pause screen; nothing after 11:30.

## 9. Starter prompt for a new conversation

```
I'm Abdo, role A (Vision) on our CodeJam 16 project. My pose branch is abdo-1 (src/pose/,
public/models/, public/mediapipe/); tonight I also do the UI look on separate branches
(ui-theme merged, ui-landing PR #113, next ab-calib) with only the files listed in
src/pose/HANDOFF.md §1. Never commit, merge, rebase or push to main, never force-push; if
something outside my files needs changing, tell me and write it in src/pose/NEEDS.md.
Clock (Montreal): features by 8 AM, after 10 AM only crash/unplayable fixes and no threshold
changes, nothing after 11:30, code freeze 12:00 PM Sunday. Before doing anything, check git
status, open PRs (gh pr list) and whether npm run check passes, and tell me in 3 lines what
changed. Read AGENTS.md, then read src/pose/HANDOFF.md first, then continue from the next task.
```

## 10. Hourly self-grade

- **Sat ~6:30 PM.** Drift fix (44) shipped: 11 of 32 synthetic drift cases red → green, no real clip worse. Lag study (45) and calibration under noise (46): measured, no change.
- **Sat ~8 PM.** Codex's leaveFrame finding was real: tightened drift (48); only those 2 false sidesteps changed across 149 replays.
- **Sun ~2:30 AM.** Switched to the UI look on Greg's call: `ui-theme` merged (#110), `ui-landing` READY (#113: sign-up built in, Montreal clip, profile age/height; fits 1280×720 → 1920×1080 and 125 % with no scroll). *Not done:* any pose camera test (A asleep); drift still unverified on a real body. *Next:* `ab-calib` after the 4:00 batch.
