# src/pose — decisions (owner A)

Choices made without A awake, with the reason. Newest last. Each one is easy to undo in `tuning.ts`
or the named file.

1. **Lane line 0.55 W on / 0.3 W off** (contract starts at 0.8 / 0.4). A's left sidestep in
   `sidestep.json` moved the hips only 0.8 W, right on the contract's line.
2. **Arm "down" is back near nose height** (`ARM_DOWN_ABOVE_NOSE_T = 0.05`), not below the shoulder.
   In `armsUp.json` and `mixed.json` A lowered the arms only to shoulder height between presses, every
   time; with the contract's rule, 3 presses read as 1. "Up" is 0.3 T above the nose.
3. **Arms are ignored while airborne, and a take-off resets them.** Arms swing above the nose during a
   jump (`jump.json`, `mixed.json`), which fired false `armsUp` / `reachRight`.
4. **One arm must stay up alone for 250 ms before it is a reach.** When raising both arms one leads by
   up to ~0.3 s (`armsUp.json`), which would fire `reachLeft` before `armsUp`.
5. **Tracking is also lost when the centre (hips; shoulders on a treadmill) leaves the frame.** In
   `leaveFrame.json` visibility stayed ≥ 0.93 until MediaPipe dropped the body entirely, so the
   contract's visibility rule alone never fired.
6. **T, W and standing height drift only while standing still**; the lane centre drifts slower
   (0.1/s) and only in the centre lane. Torso length shrinks during a squat (0.15 vs 0.20), so a
   per-frame T would measure squat depth with a shrinking ruler.
7. **Lane fix:** from a side lane, a position between the far side's off and on lines now returns to
   the centre lane (it used to stay in the old side lane).
8. **Detection thresholds live in one mutable `DETECTION` object** in `tuning.ts`, so the debug
   overlay's sliders change them live. `DETECTION_DEFAULTS` holds the committed values.
9. **`MAX_POSES = 1`** (A's call). `pickBody` (largest and closest to the player's last position) is
   built and tested; raise `MAX_POSES` to 2 after measuring FPS.
10. **Calibration edge margin 0:** A's feet sit at 0.97 of the frame height at playing distance, so
    any margin would say "step back" for no reason.
11. **Treadmill T without visible hips is estimated as 1.5 × W in pixels** (A's clips: W 64 px,
    T 96 px). Treadmill mode needs T only for arm heights.
12. **Did not merge `main` into `abdo-1`** (A's call). The pose module is built to match how `main`'s
    app uses it, read with `git show origin/main:…` (see NEEDS.md).
13. **The pose module handles D (debug overlay) itself; R stays with the app** (A's call). `main`'s
    `App.tsx` already calls `pose.calibrate()` on R; `calibrate()` is safe to call again mid-round
    (the older call is rejected with "Calibration restarted.", tracking is false until done).
14. **If play starts without `calibrate()`** (pose switched on mid-round with K), the input calibrates
    quietly in the last mode once the player stands still for 1.5 s. Until then `tracking` is false.
15. **One shared MediaPipe model per page** (`landmarker.ts`). The app makes a new pose input on each
    K toggle and StrictMode starts it twice; loading once avoids 1–2 s reloads and leaked GPU contexts.
16. **The camera stream is taken before touching the video**, and attached only if that start is
    still current. Found with a stubbed camera: StrictMode's start/stop/start leaked a live stream.
17. **Size gate:** once calibrated, a body whose shoulder width is more than 40% off the player's is
    not the player (`PICK_SIZE_TOLERANCE`). A's own clips vary by about ±30% (arms up, slight turns).
18. **Calibration status is sent in 5% progress steps**, not every frame, because the app sets React
    state on each call.
19. **Treadmill mode ignores the hips for tracking** (shoulders only) and has no lanes, jumps or
    squats, per PLAN.md. Squatting at treadmill distance pushes the shoulders out of frame, so
    tracking is lost there; that is expected.
20. **Baselines drift only when the player is still** (the centre stayed within 0.05 T for 0.5 s) and
    within 0.25 T of standing height, and never with an arm up. Found by a test: stepping 20% closer
    sinks the hips ~0.18 T in frame, beyond the old 0.15 T band, so the baseline never adapted and
    squats/jumps were measured from the wrong height. Arms up narrow and lift the shoulders, which
    used to shrink W and T during an overhead hold.
21. **Jump speed is measured over the last 150 ms and must exceed 1.0 T/s** (was per frame, 0.5).
    A's jumps rise at 1.1–3.6 T/s even with 40% dropped frames; stepping back quickly rises ~0.6 T/s
    and used to fire a jump.
22. **A MediaPipe error on one frame no longer stops the loop** (treated as "no body"); if the camera
    fails inside `calibrate()`, the pending calibration is dropped without an unhandled rejection.
23. **The treadmill torso estimate uses the live video aspect** (passed each frame), not the aspect at
    `calibrate()` time, which can be before the camera runs.
24. **The pose video keeps playing when the app takes it off the page.** Verified in Chromium: removing
    a `<video>` pauses it, it stays paused when put back, and `requestVideoFrameCallback` stops, so
    pose input froze for good. The engine now resumes it on `pause` while running, and a 30 ms
    watchdog processes frames when rVFC has been quiet for 100 ms (deduplicated by video time).
    After the fix: 30 FPS attached, detached, re-attached and moved; 0 after `stop()`.
    On `main` this happens on every first round: calibrate → tutorial (no camera view) → play.
25. **Crouch-then-jump works; the squat event needs 250 ms below the line; after a squat a jump must
    rise 0.45 T for 0.4 s** (replaces the 0.4 s jump block). Found by a test: with pre-jump crouches
    just 20% deeper than A's, the crouch counted as a squat and the 0.4 s block swallowed the jump
    (two of four jumps lost). `ducking` still turns on at once, because beams use the state; only the
    rep event waits. Crouches last 0.13–0.31 s below the line; A's squats 0.8–2.6 s, and squats
    sped up 4× still count. Standing up onto the toes rises ≤ ~0.25 T; real jumps 0.55–0.73 T.
    Cost: a jump out of a deep crouch registers ~0.17 s later (normal jumps are unchanged).
26. **Arm "up" line raised from 0.3 T to 0.4 T above the nose,** so hands resting on top of the head
    (wrists ~0.25–0.3 T above the nose, common between sets) are not `armsUp`. A's real raises peak at
    0.65–0.75 T in every clip, so a lower raise (0.5 T) still counts. Unverified on a real camera.
27. **`CALIBRATION_FEET_IN_VIEW` switch (default true, as the contract says).** A's feet were at 0.97
    of the frame height at home; a smaller venue room could leave calibration stuck on `tooClose`
    although detection only needs the hips. Setting it to false asks for head and knees only.
28. **Bodies far from the player's size are dropped before picking**, not after: a bigger stranger
    right in front of the camera used to win the "largest" pick, get rejected, and hide the real
    player. A throwing `onStatus` (UI bug) is isolated like `onMove` listeners.
29. **Calibration grace of 250 ms:** a brief problem (feet flickering at the frame edge, one dropped
    detection) pauses the hold instead of restarting it; a lasting one restarts it and shows its
    message. In A's squat session the ankles sat at the bottom edge (40 frames with y > 1), so the
    old rule could have kept restarting the 1.5 s hold.
30. **MediaPipe's JS is loaded only when the pose input starts** (dynamic import in `landmarker.ts`).
    On `abdo-1` the main bundle drops from 407 kB to 254 kB (MediaPipe becomes a 154 kB chunk), so the
    landing page loads faster on venue wifi and keyboard players never download it. Verified: dev
    page runs at 30 FPS GPU with a stubbed camera; the production build references the chunk and
    copies the model and WASM.
31. **A stalled camera (unplugged, taken by another app, laptop asleep) now loses tracking** within
    ~1.5 s, so the game pauses instead of holding the last pose. New frames are identified by the
    decoded-frame count: verified in Chromium, `currentTime` keeps running on a dead stream while the
    frame count freezes (and the count still rises while the video is off the page and playing).
    After 1 s without a new frame the watchdog feeds "no body" frames.
32. **Treadmill calibration tolerates jogging** (`CALIBRATION_STILL_T_TREADMILL = 0.4` T of centre
    movement; size must still hold within 15%). With the floor rule (0.1 T), a player already jogging
    (shoulders bob ±0.1 T) never finished calibrating. Floor mode is unchanged (tested).
