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
