# src/pose — decisions (owner A)

Choices made without A awake, with the reason. Newest last. Each one is easy to undo in `tuning.ts`
or the named file.

1. **Lane line 0.55 W on / 0.3 W off** (contract starts at 0.8 / 0.4). A's left sidestep in
   `sidestep.json` moved the hips only 0.8 W, right on the contract's line.
2. **Arm "down" is back near nose height** (`ARM_DOWN_ABOVE_NOSE_T = 0.05`), not below the shoulder.
   In `armsUp.json` and `mixed.json` A lowered the arms only to shoulder height between presses, every
   time; with the contract's rule, 3 presses read as 1. "Up" was 0.3 T above the nose (raised
   to 0.4 T later, see 26).
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
   built and tested; raise `MAX_POSES` to 2 after measuring FPS. **Superseded by 49** (2 bodies,
   follow the calibrated player; `pickBody` now only picks during calibration).
10. **Calibration edge margin 0:** A's feet sit at 0.97 of the frame height at playing distance, so
    any margin would say "step back" for no reason.
11. **Treadmill T without visible hips is estimated as 1.5 × W in pixels** (A's clips: W 64 px,
    T 96 px). Treadmill mode needs T only for arm heights.
12. **Did not merge `main` into `abdo-1`** (A's call). The pose module is built to match how `main`'s
    app uses it, read with `git show origin/main:…`.
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
21. **Jump speed must exceed 1.0 T/s** (was 0.5). A's jumps rise at 1.1–3.6 T/s even with 40%
    dropped frames; stepping back quickly rises ~0.6 T/s and used to fire a jump. (A 150 ms speed
    window was tried too; a later mutation sweep showed no scenario where it helped, so it was
    removed: speed is frame to frame again.)
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
26. **(Reverted by 33.) Arm "up" line raised from 0.3 T to 0.4 T above the nose,** so hands resting on top of the head
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
33. **Arm-up line back to 0.3 T (reverts 26).** Patrick's game draws pose objects early by measured
    detector lag (`VISUAL_LEAD_SEC`, src/game on `p2-game`), tuned on 0.3 T. At 0.4 T the arm state
    turns on 33–102 ms later (mean 70 ms; 0.35 T: 40 ms), which would push on-sight reactions past
    the judging window's +0.15 s for crates and orbs. A missed crate hurts more than an extra rep
    counted when someone rests their hands on their head. A test now pins when each state turns
    on in the clips (±1 frame), so a future threshold change cannot silently desync the game.
34. **Second body: Greg's clips** (`fixtures/greg/`, one spot, calibrated on his `standing.json`),
    recorded on `?dev=pose` on main. Everything already matched his README except two moves, fixed
    in 35 and 36. They are now in the expected-moves table and all 11 variants.
35. **A reach needs the other arm clearly down** (below the arm-down line) when it fires. Greg's
    first press peaked just under the line (right wrist 0.35 T, left 0.29 T) and read as
    `reachRight`. Stricter, "sticky" rules were tried and lost real quick left/right reaches in his
    `reach` clip, so the rule stays simple. Known limits (tested as "may miss, never invents"):
    on a camera tilted ±3° that half press can still read as a reach; his fastest swaps lose one rep
    at ±1% landmark jitter or ≥ 30% dropped frames (same before this change).
36. **The squat rep is decided after standing up.** `ducking` is still instant. A squat held
    0.8 s counts at once (`SQUAT_HOLD_MS`); a shorter one (≥ 0.15 s, `SQUAT_MIN_MS`) counts once
    the player is up, unless a jump follows within 0.35 s (`SQUAT_JUMP_GRACE_MS`): then it was a
    crouch. Greg's pre-jump crouch (0.46 s, 0.55 T) and his real quick squat (0.51 s, 0.64 T) can't
    be told apart by depth or time, only by what follows. Replaces the 250 ms rule of 25; the
    "2× deeper crouch" variant no longer adds a squat. State timing for the game is unchanged.
37. **Crouch-and-jump at low FPS** (`JUMP_AFTER_SQUAT_SPEED_WINDOW_MS = 150`). A self-check at a
    steady 15 FPS (pose plus the 3D game on a slow laptop) turned Greg's crouch-and-jump into a
    squat: the last fast frame was just under the raised after-squat line (0.45 T), the next one
    past it but near the top of the jump (0.66 T/s). For that line only, a fast rise up to 150 ms
    before crossing counts. Tried and rejected: the same window for the normal line (rising onto the
    toes in a reach, ~0.15 T, became a jump under jitter) and frame-time-scaled smoothing (changed
    30 FPS behaviour and the pinned state timing the game's leads use). New variant: "15 FPS steady".
38. **A one-frame visibility flicker keeps the smoothing** (`GAP_RESET_MS = 500`). Before, any
    frame with a core landmark under the visibility line cleared the smoothing, so the next frame
    was raw: arms jolted by ~0.6 T and cost one of Greg's quick reaches. Smoothing now restarts
    only after a gap of 0.5 s, the same gap after which speed and drift were already not measured.
    Tried and rejected: letting short gaps not restart the 0.3 s tracking regain count. On Greg's
    real `leaveFrame` it regained tracking while he was half out at the frame edge (a false squat
    and extra sidesteps), so the strict regain stays. New variant: "hip visibility flicker".
39. **With both arms up, a jump must rise 0.3 T** (`JUMP_ARMS_UP_ON_T`). Patrick's replay of
    `greg/armsUp` with ±1% landmark noise (20 seeds) set `airborne` mid-press for 3 seeds: raising
    both arms lifts the hip landmarks 0.10–0.16 T, right at `JUMP_ON_T`, and the noisy speed passed.
    A false jump turns both arms off, so a held crate became a hit. In every real jump (both
    bodies) the arms are down at take-off and the hips peak at 0.49–0.70 T, so the raised line
    never applies to them: 0 real jumps lost in 560 noisy replays, and the pinned state timing is
    unchanged. Tried: the same for either arm up, to also catch a false jump in Greg's reach swap
    (±1% noise, 2 of 20 seeds, already there before). It does not help (mid-swap neither arm counts
    as up), so it was left out; that case is a known limit.
40. **Floor calibration is head to knees, about 1.5 m** (`CALIBRATION_FEET_IN_VIEW = false`).
    Players backed up so far to show their feet that they could not read the screen; detection uses
    the hips, never the feet. Knees alone would let a player stand so close that a deep squat takes
    the hips out of the frame (A's hips drop 1.03 T) or a jump the shoulders (A's rise 0.68 T), so
    calibration also wants that room: `CALIBRATION_JUMP_ROOM_T = 0.7` above the shoulders and
    `CALIBRATION_SQUAT_ROOM_T = 1.0` below the hips. That makes ~1.2 m the closest. Detection
    numbers are all in W and T, so none assumed the feet; the new "closer, head to knees (~1.5 m)"
    variant (1.45×, out-of-frame landmarks at low visibility) gives the same moves, times and
    tracking on every clip. Messages say "about 1.5 m … head and knees in view".
41. **Pause gesture: forearms crossed in an X in front of the chest, held 1 s** (`gesture.ts`).
    A fist is invisible to the pose model. Crossed = the player's left wrist at least 0.2 W to the
    right of the right wrist, both between 0.3 T above and 0.7 T below the shoulders (under the
    nose, above the hips) and within 1.2 W of the centre line. Fires once per hold; re-arms after
    the arms are uncrossed for 0.2 s (a shorter wobble neither restarts nor re-arms). Never while
    airborne, ducking or with an arm up. It runs after the move detector and only reads it, so move
    detection and the pinned timing are unchanged. Checked: 0 pauses on every clip × every variant
    and in 960 noisy replays (±0.5–2%); exactly one for an X spliced into the standing clip, also
    with ±1% noise, at 15 FPS and at 1.5 m. Not yet seen on a real camera: record one with the
    `● pauseX` button on `?dev=pose` (the tally counts `pause X`).
42. **Real clips at ~1.4 m (A, Sat ~3:20 PM, `fixtures/near/`) corrected 40 and 41.**
    - At 1.5 m calibration said "too close": the 1.0 T squat room (40) left A a 1.5% margin, so
      players had to back up again. And A's real deep squat took the hips to the bottom edge
      (y 1.04, visibility 0.32): tracking dropped for 1.2 s and the rep was lost. Fix in detection,
      not distance: **while ducking, the shoulders are enough to count as present** (the hips'
      estimate still gives the depth). The rooms drop to 0.5 T each (a crouch-and-jump's 0.45 T
      line and the 0.3 T squat line stay in view), so head and knees in view set the distance.
      No change on any older clip (their hips never left the frame); the pinned timing passes.
    - A's real X crosses the wrists by only 0.13–0.38 W, at chin height (0.2–0.27 T above the
      shoulders): `GESTURE_CROSS_W` 0.2 → 0.08 W, and the wrists may be anywhere from the shoulders
      up to the nose (never above it, so it cannot overlap arms up).
    - Checked: near clips give 4 sidesteps, 4 jumps, 2 squats, 3 presses with tracking never lost
      (also with ±0.5% noise and at 15 FPS); the real X gives exactly 2 pauses (40/40 with noise);
      0 false pauses in 1,440 noisy replays of every clip from all three sessions.
    - A's `near/reach` has two low reaches (wrist only 0.2–0.3 T above the nose) that do not
      count: that is the 0.3 T arm line Patrick's timing is tuned on, not a bug.
43. **Demo-day card and a self-review (Sat ~5 PM, no behaviour change).** `STATION.md` now opens
    with a 1-minute operator card: 1.5 m mark, face the light with nothing bright behind, what each
    calibration message means, R during a round when moves feel off, and **K to give up on the
    camera** after a camera error, ~30 s stuck in calibration, or moves still wrong after one R.
    The tuning table moved below it, marked "A only, never after Sunday 10 AM". Review fixes:
    `Gesture` now comes from `src/contracts` (it was a local copy from before D added it);
    `DEFAULT_ASPECT` in `tuning.ts` replaces three inline `4 / 3`; stale comments (feet as the
    default, `p2-game`, "once that lands") updated; the wobble test now also wobbles *after* the
    pause, so "nor re-arms it" is really tested (checked: it fails if the grace is removed). No
    threshold changed; 729 tests pass.
44. **A judge who steps closer or backs off keeps playing** (`RESCALE_*`, HANDOFF risk 7).
    - **Problem (synthetic drift on A's real 1.4 m clips, scaled over 1 s about the image point that
      stays put):** with the camera aimed above the hips (`cy` 0.35), a 30 cm step closer (1.3×)
      moved the hips down the frame by more than the squat line: a **false squat**, then `ducking`
      stuck, so 2 of 4 jumps and both squats were lost. A level camera held to 1.45× but gave a
      false squat at 1.5–1.55×. Past 1.67× or under 0.6× the size gate called the player a
      stranger and tracking was lost. A's real `near/mixed` already contains such a step: W 1.54×,
      T 1.12–1.29× after a squat at ~6.3 s.
    - **Tried and dropped:** telling a squat from a closer body by T/W (real squats reach 0.95,
      distance changes 0.9–1.1) or by the thigh (hip→knee over T): at real squat onsets it is
      0.31–0.76 (Greg 0.63–0.76) against 0.64–0.83 standing, so it would delay real squats.
    - **Fix:** a distance change = W **and** T both ≥ 20% off their baselines, the same way, with
      T/W within 12% of 1, for 300 ms, in the centre lane, not airborne, no arm up. Then W, T and
      the standing height re-baseline at once, and a `ducking` that came from walking closer is
      dropped without a squat. While ducking, only growth counts (a shrinking squat may be a real
      one leaning back; Greg's squats reach W 0.86×). Real moves never qualify: T stays ≤ 1.00× while
      ducking in every clip, and normal play keeps W and T within 0.83–1.16× with no arm up. The
      size gate needs no change: it compares to the detector's W, which now follows the player.
    - **Evidence:** `drift.test.ts`, 32 cases. Before: 11 fail (false squats, lost jumps/squats,
      tracking lost at 1.7×). After: all pass, also with ±0.5% noise at 15 FPS; a much bigger
      stranger stepping in at once still loses tracking. Every existing test passes unchanged,
      including the pinned timing. Events on every real clip (3 sessions × 8 clips, two
      calibrations): unchanged except (1) `standing` after 6.4 s, A walking up to the laptop
      (W up to 3.9×): 4 false moves → 2; (2) `reach` calibrated on session 1's standing clip,
      where A stood 0.8× smaller: reaches 68 ms earlier (the arm line is now in A's real size;
      the pinned timing calibrates on the clip itself and is unchanged); (3) `greg/mixed`: one
      more sidestep at 5.5 s, where Greg, shrunk to 0.77×, moved 0.51 calibrated W right =
      0.66 W in his real size, a real step the stale W missed.
    - **Still to check on real clips:** A's `● drift` and `● turnStep` (turning narrows W, but
      not T).
45. **Lag study: no threshold can buy back the squat and arm lag without new false moves.**
    Proposal for Greg: **change nothing**; the game's leads stay valid. Method: each state's onset
    line swept lower, one at a time; a value counts only if all 19 real clips (3 sessions) keep
    their exact moves, ±0.5% noise (4 seeds per clip) adds nothing new, and then the full test
    suite (variants, crouches, drift) passes.
    | Line (today) | Lowest value safe on the clips | State onset earlier | Full suite |
    | --- | --- | --- | --- |
    | `SQUAT_ON_T` 0.3 | 0.17 (0.20, 0.22, 0.25 too) | 146 ms median, 234 max (95 at 0.20) | **fails**: crouch-then-jumps count squats (1.4–1.6× deeper crouches), jumps after a crouch turn on later (the post-squat line starts sooner), `leaveFrame`, `mixed` and tilt variants change |
    | `ARM_UP_ABOVE_NOSE_T` 0.3 | none: any lower turns Greg's half press into a 4th press | 29 ms at 0.25, 61 ms at 0.15 (without that clip) | not run |
    | `LANE_ON_W` 0.55 | 0.52 (0.50: a false sidestep on Greg standing, with noise) | 31 ms | not worth it |
    | `JUMP_ON_T` 0.15 | 0.12 | 0 ms | nothing to gain |
    | `SMOOTHING_ALPHA` 0.5 | none (noise changes Greg's reaches and presses) | ≤ 32 ms | — |
    The squat and arm lag is mostly the body travelling to a line that must sit clear of noise
    and crouches. Earlier detection would need a different signal (e.g. onset by speed), judged
    on the steady-rhythm `● lag*` clips; not before the freeze unless those clips show a large,
    clean gain. Nothing in `src/pose` changed for this.
46. **Calibration under fidgeting: candidate parked until A's `● fidget` clip.** On the real
    still clips calibration takes 1.53–1.56 s (the 1.5 s hold), so the target holds for a still
    player. With ±1% per-frame noise it failed in most clips (0/10 starts on session 1 and Greg),
    because one jittery frame restarts the hold. (a) A 250 ms grace for "moved" frames fixed the
    noise (8–10/10, median ~1.53 s, W/T within 2% median) but let a ±0.1 T bob finish and broke
    "moving during the hold restarts it": rejected. (b) Judging stillness on a 5-frame median
    (`CALIBRATION_STILL_WINDOW`) gets 7–10/10 under ±1% noise, still rejects the bob, keeps W/T
    within 1.5% median (worst 3–8%), but restarts ~100 ms after a real step instead of at once.
    It changes nothing measurable on real still clips, so it waits for real fidgeting to show a
    need. Patch: HANDOFF §8.
47. **Codex finding "a lone passerby controls a standing player" (`a2-pose-robust` f7c6525):
    plausible, needs a real repro before any change.** Synthetic: when the session is fed only a
    passerby 0.6× the player's size or bigger, it accepts them at once (a false jump and sidestep on
    the first frame, then lane changes as they walk). With both bodies reported, the picker never
    errs (0.4–1.05×). The case needs MediaPipe (one pose, video mode, which follows the previous
    frame's body) to drop the player for the passerby; how often that happens on a camera is
    unknown, and someone walking in front blocks the player anyway. A "no teleport" check (reject a
    body far from the player's last position while still tracked) removes the first-frame jump and
    sidestep, but a passerby who crosses through the player's spot is then picked up there and still
    moves lanes, and in between the round pauses ("tracking lost"). Not worth a logic change on
    synthetic evidence the night before the freeze. Next: A records `● passerby` (someone walks
    behind, near and far, while A stands still); if the model switches bodies in that clip, the
    continuity check comes back as a candidate with the clip as its test. Codex's `test.fails`
    cases stay as they are.
48. **The drift re-baseline (44) no longer fires for a body walking into or across the frame.**
    Codex (`a2-pose-robust`, matrix at irregular 10 FPS): `greg/leaveFrame` gave 2 extra sidesteps
    (5.25 s, 6.2 s). Trace: Greg re-enters smaller and turned (W 0.65–0.76×, T 0.70–0.82×) while
    his hips slide from x 0.33 to 0.47; tracking returns at 4.05 s and the re-baseline fired 0.1 s
    later with uneven bases (W 0.71, T 0.82). Once he faced the camera his real size read as 1.34×
    W but only 1.17× T, so the same-ratio check never undid it and lanes were judged in a W 25%
    too small. A real path (someone walking back in mid-round), not contrived; 30 FPS only missed
    it by timing. Fix, three conditions: (1) only while tracked; (2) no sideways travel of more
    than `RESCALE_MAX_SHIFT_W` = 0.25 W during the 300 ms wait, else it restarts (a judge stepping
    toward the screen barely moves sideways; walking in or across does); (3) W and T scale by one
    shared factor √(kW·kT), so a later step back still reads as the same ratio. Evidence: new test
    in `drift.test.ts` red before, green after; the 32 drift cases still pass; across 149 replays
    (every real clip, 2 calibrations, 30/15/10 FPS) the only change is those two false sidesteps
    gone. Codex's matrix passes against this tree (875 + 17 expected failures); its known entries
    `extra sidestep 155/184` for `fps 10|greg/leaveFrame` can be removed.
49. **Two bodies; follow the calibrated player; `otherPerson` (Greg's call, Sat night, Patrick 1,
    `p5-camera`).** `MAX_POSES = 2`, so a second person is reported next to the player instead of
    replacing them (the "lone passerby" of 47 no longer needs the model to drop the player).
    After calibration `session.ts` never picks the largest or newest body:
    - **Follow:** the body nearest the player's last pose (mean distance of nose, shoulders, hips),
      within `FOLLOW_MAX_SPEED_W` = 10 W/s of it (at least 0.4 W, at most 1.2 W, in the last frame's
      own width), shoulder width within ×0.7–1.43 of the last frame (`FOLLOW_SIZE_TOLERANCE`). From
      the recorded clips: jumps peak at 8–10 W/s between frames, moves cover at most 1.6 W in 100 ms,
      width changes at most ×1.30 in 100 ms and ×1.38 in 400 ms.
    - **Found again** after `FOLLOW_GAP_MS` = 400 ms: a body standing still (0.3 W) for 400 ms within
      1 W of where the player vanished or of the mark, with the player's W and torso within 25%, or
      within 40% when it is alone in the play area (players come back a step closer or further:
      ×1.5 / ×0.7). The one nearest where the player vanished wins.
    - **`otherPerson`** (and `tracking: false`): another body with both shoulders seen, at least 0.6×
      the player's width (smaller = the crowd far behind), shoulder centre within 1.5 calibrated W of
      the mark (outside = at the side or the edge of the image). On after 300 ms, off after 500 ms.
      A second pose under 0.5 W from the player is the same body twice. With the player away, a
      body that may be them coming back is not flagged. While the player is missing but not yet
      lost, the flag keeps its state (no 3-2-1 for a few frames). No moves and no X fire while it is on.
    - **Camera session (Sat ~10:30 PM, demo Mac):** a newcomer walked in close to the camera in front
      of the player (only the newcomer reported for 1.4 s), then stood on the mark at ×1.2–1.3. The
      first version took the newcomer at once: it ranked by the mark and followed at ×1.56. Fixed by
      ranking by where the player vanished and `FOLLOW_SIZE_TOLERANCE`; the replay of that session
      now keeps the player, names the newcomer `otherPerson`, and gives the same moves as live in
      every one-person step. Model time with a body in view: 7.2 ms (1 pose) vs 11.2 ms (2 poses).
    - **Rivals (second camera session, a real helper):** shoulder to shoulder, the model never
      reported both people in one frame: it alternated, then reported only the helper, who was
      followed for 4 s. Now a body seen apart from the player in the same frame, or seen while the
      player was missing and then the player seen again elsewhere within 100 ms
      (`RIVAL_WINDOW_MS`), is someone else until out of view for 500 ms (`RIVAL_MEMORY_MS`): never
      followed (whole pose and size, ×0.7–1.43), never taken back, and it sets `otherPerson`. A
      missed follow frame of a lone player is no proof, so the drift and single-body tests are
      unchanged. Session 2 replay: beside → `otherPerson` for as long as the helper stands there;
      far behind → nothing; the player back a step closer (×1.5) or further, alone → taken back,
      never "someone else". Close behind (1 m, at the side): the model dropped the player for 1.7 s
      (tracking lost, nobody else followed). A same-size stranger alone on the mark while the
      player is fully out of view is still taken (accepted limit).
    - **Third camera session (live, on the rivals code):** shoulder to shoulder again, following
      took the helper during the alternation and the real player became the rival: alone on the
      mark after the helper left, they stayed "someone else" for 6 s. Fixes: a body seen while the
      player was missing is not followed until settled (`maybeRivals`); a rival who is the only
      person in the frame for `RIVAL_ALONE_MS` = 1 s is forgotten (replay: 6 s → 1.5 s, then the
      player is back); a returning body may match the calibrated size too (back behind the mark
      after a step closer read ×0.55 of the grown baselines, ×0.83 of the calibration).
      **Limits:** side by side at 1.5 m, the lite model often reports only one of the two for
      seconds; then nobody can tell who it is: session 2 paused throughout, session 3 paused about
      half the time and then followed the helper until they left. Walking from behind the mark
      onto it (×1.4 bigger) reads as 1–3 jumps in `detect.ts` (the drift re-baseline needs
      stillness); not changed (detection logic).
    - The play area uses the calibrated W and centre, so a player who steps closer does not widen it.
    Evidence: `other.test.ts` (beside at 0.65–1.2×, far behind, edge, duplicate, a passer-by crossing,
    a stranger on the mark while away, coming back closer/further, every clip at 30/15/10 FPS never
    drops the player, a crowd leaves every clip's moves unchanged); `crowd.robust.test.ts`: the lone
    passer-by at 0.6–1× now passes. Known limits (kept as `test.fails`): with the player out of the
    frame, someone alone and standing still on the mark at ×0.6–1.67 their size is taken as them; a
    0.8–1× spectator under 1 W from where the player stood, right as the player vanishes, is followed.
