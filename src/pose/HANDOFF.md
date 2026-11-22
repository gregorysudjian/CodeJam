# HANDOFF — src/pose (role A, Vision) + Abdo's UI work tonight

_Last refresh: Sun ~7:05 AM Montreal. A new conversation starts here: read this, then do §8 task 1._

## 1. Context

- CodeJam 16: a webcam fitness game, a 3-lane runner you play with your body (Vite, React, TS strict, plain Three.js, MediaPipe pose on the device, Supabase, Vercel, Claude API). Docs: `AGENTS.md`, `docs/PLAN.md`, `docs/CONTRACTS.md`, `docs/DEMO.md`.
- Abdo is role **A (Vision)**, branch **`abdo-1`**, owning `src/pose/`, `public/models/`, `public/mediapipe/`. Never commit, merge, rebase or push to `main`; never force-push. Anything outside goes to `src/pose/NEEDS.md`.
- **Since Sun ~0:30 AM Abdo's Claude has also done the UI look** (Greg's call). **All three UI branches are merged** (`ui-theme` #110, `ui-landing` #113, `ab-calib` #119). If more UI work comes: only `src/ui/theme.css`, `src/ui/kit/tokens.ts`, `LandingScreen.tsx`, `ProfileScreen.tsx`, `profileRules.ts`(+test) and `CalibrationScreen.tsx`. Never touch `src/app`, `src/contracts`, `src/game`, config or other screens. The orchestrator **Jiscar 2** reviews and merges. Ready means: merge origin/main, `npm run check`, screenshots at 1280×720 and 1920×1080 with 0 console errors, then a PR (gh works) plus a 3-line READY.
- Rules: no new npm packages or env vars; every pose number goes in `src/pose/tuning.ts`; run `npm run check` before each push; never commit raw videos or a `higgsfield/` folder; never `git add public/media` wholesale.
- **Clock (Montreal):** features ready by **8:00 AM**. After **10:00 AM**, only crash or unplayable fixes, and **no threshold changes**. Nothing after 11:30. **Code freeze 12:00 PM Sunday.** Every Sunday fix needs a second reader.

## 2. Current state

- **`abdo-1` = `main` `4ab8b0e`** (Merge #120, the 6:00 batch) + the HANDOFF commits, merged at `6809048` without conflicts. Main changed nothing in `src/pose` since A's last pose commit `fdb1105` (DECISIONS 48). **`npm run check` passes on it:** 1,607 tests (1,029 in `src/pose`; 22 expected-fail and 4 skipped are the judge/drift referees waiting for clips), 0 lint errors, 7 warnings in `src/ui` (Sun ~7:05 AM).
- **Pose works (all in main):**
  - `createPoseInput()` returns a `PoseSource` (the contract's `PoseInputSource` + `onGesture`).
  - Tracking: camera, MediaPipe lite (2 poses), `calibrate()` with messages (head to knees, ~1.5 m), lane / jump / squat / armsUp / reachLeft / reachRight, `tracking`, `otherPerson`, the **pause X**, `drawSkeleton`, treadmill mode.
  - Debug tools: the D overlay (live values, sliders, `pause X NN%`), `?dev=pose` (calibrate, tally, a recorder for every clip label), `clip-viewer.html`.
- **Merged in `src/pose` by others:**
  - Patrick 1's `p5-camera` (DECISIONS 49): two bodies, follows the calibrated player, `otherPerson`, rivals.
  - Codex's `a2-pose-robust`: `*.robust.test.ts`, `ROBUSTNESS.md`, engine fix `bb495aa`.
  - Demo Mac: pose 30 fps, render ~120 fps.
- **Half-done (pose): A's camera clips are still NOT recorded.** `~/Downloads` has only Saturday's 3 PM clips. The referees are ready:
  - `judge.test.ts` checks each judge clip at `fixtures/near/<label>.json` and is skipped until the clips exist;
  - `variants.test.ts` › extra clips takes `fixtures/extra/<label>-<count>-greg.json`;
  - `drift.test.ts`.
  - Parked: `pending-calibration-median.patch` (DECISIONS 46).
- **UI, all merged (Sun 4:09 AM, through batch #120):**
  - **`ui-theme` (#110):** the Montreal look (limestone, slate ink, maple-red accent, solid cards).
    - `theme.css` keeps the old token NAMES: `lime` = maple red, `cyan` = metro blue, `magenta` = plum, `amber` = ochre, `violet` = Mont-Royal green.
    - `.hud-root` and `.calibration-stage` keep the old dark neon palette.
    - `ACCENT_HEX` holds page colours, so don't use it on dark video.
  - **`ui-landing` (#113, + contrast fix `85ad613`):**
    - Sign-up is built into the landing, with `/media/landing-montreal.mp4` behind the title.
    - The profile gets age and height.
    - Contrast passes at 1280×720: eyebrow 7.2:1 over the clip and 9.4:1 with reduced motion; "with your body" 3.8:1 and 3.2:1.
  - **`ab-calib` (#119, `1e90cef`):**
    - `CalibrationScreen` gets the Montreal frame (cream card border, arena skyline). The stage stays dark; guide and corners use `var(--na-lime/amber/text-dim)` with a glow.
    - `ProfileScreen` gets `nav?: NavBarProps`, as wide as on select.
    - `checkUsername?(name): Promise<boolean|null>` on LandingScreen sign-up and ProfileScreen: "Username taken" plus a disabled START/CONTINUE, checked 400 ms after the last keystroke (`USERNAME_CHECK_DELAY_MS` in `profileRules.ts`, since src/ui has no tuning.ts).
    - Patrick wired both in App (`a9217ed`); the live check is migration 0008 (`7870d7d`).
    - Screenshots: `C:\Users\kalla\Downloads\ab-calib-shots\`.
- **UI not tested:**
  - calibration with a real webcam;
  - "Username taken" against live Supabase;
  - the profile bar through App's `editingProfile`.
- **Local leftovers:**
  - The branches `ab-calib-prep` and `ab-calib-prep2` are fully merged as cherry-picks. **Never push them**; they're safe to delete.
  - `.git/info/exclude` has `shots/`.

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

**All thresholds live in `tuning.ts`:**
- `DETECTION` holds the live values (the overlay sliders write to it); `DETECTION_DEFAULTS` holds the committed ones.
- Plus the `CALIBRATION_*`, `GESTURE_*`, `FOLLOW_*`, `RIVAL_*` and `RESCALE_*` constants.
- Distances are fractions of the calibrated shoulder width **W** (x) and torso length **T** (y).

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

`src/pose/DECISIONS.md` has 49 entries, each with its reason. The key ones:
- **Pinned timing:** `variants.test.ts` › "when states turn on" must pass, because Patrick's `VISUAL_LEAD_SEC` in `src/game/tuning.ts` depends on it. Lag study: change nothing (45).
- **Calibration and moves:** head to knees at ~1.5 m (40/42); the pause X is built from A's real X (41/42); a squat is decided after standing up (36); a jump after a squat must rise 0.45 T (37).
- **Drift (44, tightened 48):** a player who steps 20%+ closer or back re-baselines after 300 ms. This happens only while tracked, in the centre lane, and still sideways.
- **Two bodies (49, Patrick 1):** follow the calibrated player; `otherPerson` pauses. Side by side at 1.5 m, the lite model often sees only one body (an accepted limit).
- **UI (not in DECISIONS):**
  - The page theme is light, but the HUD and the camera stage stay dark.
  - Street View stills aren't used (Google watermarks, bystanders).
  - The landing video plays only through `HeroVideo` in LandingScreen.
  - Contrast is measured on glyph pixels over the brightest clip frame.

## 5. Known bugs and risks (ranked)

1. **The drift fix (44/48) has never been seen on a real body**, only on synthetic data and replays. A's `● drift` clip decides it. Any false squat or lost tracking means fixing or reverting `b14c176`/`fdb1105` and telling Greg, **before 10 AM**.
2. **Walking onto the mark from behind reads as 1–3 jumps** (Patrick's session 3; DECISIONS 49 limits).
   - The re-baseline needs stillness, so it catches up only after.
   - Not changed. A fix needs a clip (ask Patrick for `capture-1795319347861.json`) and must land before 10 AM, or not at all.
3. **Side by side at 1.5 m**, the lite model reports one body for seconds, which means a pause or following the helper. Operator rule: spectators stand beside the laptop, never behind or next to the player (in `STATION.md`).
4. **The X rests on one body:** the near-miss clips (`xLow`, `xTouch`, `xOverhead`, arms-out X) aren't recorded.
5. **Low-FPS judge laptops:** at 10 FPS, crouch-then-jumps read as squats and quick reaches get lost. The demo Mac is fine at 30 fps.
6. Low reaches (< 0.3 T above the nose) don't count, and hands on the head can read as arms up (33). Tell players to reach high.
7. A player who walks closer while in a side lane keeps the old size until back in the centre lane.
8. Treadmill mode is only simulated; press R if the runner drifts.
9. **UI:**
   - The QA sweep's 4 failures ("Camera blocked" over results) still need one run on a clean main.
   - WorkoutSelect still has a few `white/…` overlays (not our file).
   - "Username taken" and the profile bar are unverified in the live app (§6 step 9).

## 6. Needs real-camera test (10 minutes, A's laptop)

Setup: `git checkout abdo-1 && git pull`, `npm run dev`, close other camera tabs, stand **~1.5 m** back with head to knees in view.

1. `localhost:5173/?dev=pose` → `⟳ calibrate floor`: holdStill 0→100%, then "Calibrated". Closer → "Step back"; far → "Come closer". D overlay: FPS ≥ 25, GPU.
2. **`● drift` first** (8 s; stand still the first second): step 30–50 cm forward, hold 2 s, step back; do it twice.
   - Expect: the tally adds **no moves and no pause**, and tracking is never lost.
   - Save it as `src/pose/fixtures/near/drift.json`; `npx vitest run src/pose/judge.test.ts` must pass.
3. Moves, ~5 each, pressing `Reset tally` first: sidestep, jump, deep squat, both arms up (down to the chin between reps), left reach, right reach (high). The counts match; nothing else counts.
4. Stand still 20 s, shuffle, scratch your head: nothing counts.
5. X at chest height, held: `pause X NN%` climbs, and the tally's `pause X` goes up by 1 after ~1 s, once per hold. Presses and reaches never add one.
6. Walk 2 steps behind the mark, then onto it (risk 2): count any `jump` in the tally. Record it as `● mixed` if it happens.
7. Ask someone to stand beside you, then behind you: the overlay shows `otherPerson`, and no moves fire.
8. Record when time allows: `● pauseX` (arms out in front, twice), `● xLow`, `● xTouch`, `● xOverhead`, `● fidget`, `● handsOnHead`, `● lowReach`, `● turnStep`, `● squatArmsOut`, `● passerby`.
9. App at `localhost:5173` (this also checks tonight's UI):
   - **Landing:** sign up with a username that already exists. "Username taken" should appear about 0.4 s after you stop typing, with START disabled; a new name clears it.
   - **Select** (switch on **Camera**) → **calibration**: the dark stage in a cream frame, the guide bright red-lime, amber when too close or too far.
   - **Round** with the camera preview: X pauses, X again resumes, END ROUND leaves. Squats, presses and reaches never pause.
   - **Profile:** edit the existing player from the nav. The profile shows the nav bar; first-time setup shows none.

If something misses, use the `STATION.md` symptom → fix table and record a clip. No threshold changes after 10 AM.

## 7. Waiting on teammates (copy-paste for Greg/D; full text in `NEEDS.md`)

- **To Greg (9 clips, still pending):**
  > When you have 5 minutes: on `?dev=pose`, calibrate at ~1.5 m and record standing, sidestep, jump, squat, armsUp, reach, leaveFrame, mixed, pauseX (stand still the first second). Save them as `src/pose/fixtures/extra/<label>-<count>-greg.json` (`leaveFrame-greg.json`, `mixed-greg.json` take no count); they become tests automatically.
- **To Patrick (risk 2):**
  > Could you drop your session-3 capture `capture-1795319347861.json` (steps backFurther → onMark) into `src/pose/fixtures/greg/` or send it to me? Walking onto the mark reads as 1–3 jumps; I need the clip as the referee before deciding on a fix (before 10 AM or not at all).
- **To Greg (sweep):**
  > On ui-theme and ui-landing the sweep gives 22/26: a "Camera blocked" overlay over results (select defaults to Camera, the sweep denies it) plus a GL console warning. Please run it once on clean main to confirm it isn't new. (`origin/j1-qa` has a newer sweep with calibration and the profile nav.)
- **Done since the last refresh:** the `onSignUp`, `nav` and `checkUsername` wiring (Patrick, `a9217ed`) and the landing clip (#111).
- NEEDS 1, 2, 5, 6, 7, 9, 10, 11 and 12 are done; 3, 4 and 8 are FYI.
- **FYI:** `origin/a-runner*` (runner models, "package A") is Greg's branch, not ours.

## 8. Next tasks (priority; PLAN.md phases)

1. **Phase 4, pose: A's camera session (§6), `drift` first → `judge.test.ts`.** Decide risk 1 and risk 2 **before 10 AM**: keep, fix or revert. Then push `abdo-1` and send "abdo-1 ready to merge at <sha>".
2. **§6 step 9: a live check of tonight's UI** (Username taken, profile bar, calibration frame). Any break goes to Jiscar 2 with a screenshot. The fix lands on a new branch from origin/main (for example `ab-fix`), touching only the UI files in §1, before 10 AM unless it's a crash.
3. **Token requests** from Patrick 3 or Gabriel: add them to `theme.css`/`tokens.ts`, never rename.
4. **Phase 1/2 done-check:** Greg's 9 clips → `fixtures/extra/` (≥ 8 in 10).
5. **Near-miss, fidget, handsOnHead, lowReach and lag clips** (§6 step 8): add them as tests. Propose changes only with clip evidence (DECISIONS 45/46), and only before 10 AM.
6. **Phase 5 (Sunday):** a fresh-eyes playtest. After 10 AM, only crash or unplayable fixes. Rehearse the X on the pause screen. Nothing after 11:30.

## 9. Starter prompt for a new conversation

```
I'm Abdo, role A (Vision) on our CodeJam 16 project. My pose branch is abdo-1 (src/pose/,
public/models/, public/mediapipe/). Overnight I also did the UI look (ui-theme #110,
ui-landing #113, ab-calib #119, all merged); any further UI work goes on a new branch from
origin/main with only the files in src/pose/HANDOFF.md §1. Never commit, merge, rebase or
push to main, never force-push; if something outside my files needs changing, tell me and
write it in src/pose/NEEDS.md. Clock (Montreal): features by 8 AM, after 10 AM only
crash/unplayable fixes and no threshold changes, nothing after 11:30, code freeze 12:00 PM
Sunday. Before doing anything, check git status, open PRs (gh pr list) and whether npm run
check passes, and tell me in 3 lines what changed. Read AGENTS.md, then src/pose/HANDOFF.md,
then continue from §8 task 1.
```

## 10. Hourly self-grade

- **Sat ~6:30 PM.** Drift fix (44) shipped: 11 of 32 synthetic drift cases went red → green, and no real clip got worse. Lag study (45) and calibration under noise (46): measured, no change.
- **Sat ~8 PM.** Codex's leaveFrame finding was real, so drift got tightened (48); only those 2 false sidesteps changed across 149 replays.
- **Sun ~2:30 AM.** Switched to the UI look on Greg's call: `ui-theme` merged (#110), `ui-landing` READY (#113).
- **Sun ~7:00 AM.**
  - *Shipped:* the `ui-landing` contrast fix (`85ad613`, by the 3:40 deadline), and `ab-calib` #119 (calibration restyle, profile nav, "Username taken" with 5 tests), READY at 3:41, all merged in #120 at 4:09.
  - *Not done:* any pose camera test (A asleep), so drift is still unverified on a real body. That's the top item, before 10 AM.
