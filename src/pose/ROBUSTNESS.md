# Pose robustness on laptop 2

## Saturday, first pass

Baseline `7be4281` passed all 762 tests on Windows with Node 24.22.3 and the committed dependency lock. Chrome 157 answered DevTools Protocol calls from plain Node. Windows enumerated no camera and Chrome reported zero video inputs. The pose debug page and clip viewer both opened. No ffmpeg executable found. Live bodies, a physical camera unplug and Patrick’s Mac are **not tested** here.

### A passerby controls a stationary player

**Possible at the expo. Owner: Abdo.** The production model returns at most one pose. If it starts reporting the passerby alone, the calibrated session can accept that person immediately. The chance of the model making this switch on camera is unknown.

`crowd.robust.test.ts` feeds the real session a deterministic splice of `near/standing` (player) and `greg/sidestep` (walker). The shoulders cross from x = 0.15 to 0.85 over two seconds. Scale is the ratio of initial shoulder widths. Frame numbers are zero-based indices in the player clip. Expected zero stranger picks, moves and pauses.

| Poses reported to the session                        | Measured outcome                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Both, while playing or during calibration            | Zero wrong picks, moves or pauses across the sampled scales from 0.40× to 1.05×. Calibration completed.           |
| Only walker from 2.5 to 4.5 s, 0.40×, 0.50× or 0.55× | Zero wrong picks or moves.                                                                                        |
| Only walker, 0.60×                                   | 5 wrong picks in 53 crossing frames. First wrong pick, jump and sidestep all on frame 72.                         |
| Only walker, 0.65× or 0.70×                          | 53 wrong picks in 53 frames. False jump and sidestep on frame 72, further lane changes on frames 96, 105 and 127. |
| Only walker, 1.00×                                   | 53 wrong picks, four false lane changes starting on frame 72.                                                     |

No false pauses in this sweep. The between-person rows use synthetic model output. The out-of-position first pick is a candidate for a continuity check. Abdo owns that decision and the real-camera reproduction. [Report to Abdo](https://github.com/gregorysudjian/CodeJam/commit/a1e2857acaea4f52a56d0062f9841337ed65da78#commitcomment-211229250).

### Cancelling calibration before the camera starts

**Likely when a judge presses K or leaves setup during a permission prompt.** On `56fb514`, `engine.robust.test.ts` starts calibration, holds the camera request unresolved, then calls `stop()` before frame 0. Expected the public calibration promise to reject immediately. It stayed pending through the next event-loop turn and Vitest reported an unhandled rejection from the internal session. Observing both startup and calibration immediately fixes this, while preserving the browser's original startup error for the app overlay. Restoring the old engine reproduced both failures. The late camera grant still releases its track.

Node stubs additionally cover denied, busy and missing device errors, a failed model load followed by a retry, overlapping StrictMode starts and a 5 s simulated load. `landmarker.robust.test.ts` checks shared-model GPU → CPU fallback and retry after model or WASM failure. These are module-level tests.

## Synthetic body and frame-rate matrix

All 25 recordings, including the real X, ran through each of 16 perturbations. Each cell gives matched reps / reps in the reference replay. Each extra event is counted separately. The mirror control swaps anatomical labels, so the hand-specific denominators switch. Every X column is 2/2 and all 400 replays produced **zero false pauses**.

| Perturbation | Sidestep | Jump  | Squat | Both arms | Left reach | Right reach | X   | Extras       |
| ------------ | -------- | ----- | ----- | --------- | ---------- | ----------- | --- | ------------ |
| scale 0.7    | 33/33    | 14/14 | 10/10 | 12/12     | 8/8        | 8/8         | 2/2 | 0            |
| scale 1.3    | 31/33    | 13/14 | 9/10  | 12/12     | 8/8        | 8/8         | 2/2 | 0            |
| roll -5      | 33/33    | 14/14 | 10/10 | 12/12     | 8/8        | 7/8         | 2/2 | 3 reachLeft  |
| roll 5       | 33/33    | 14/14 | 10/10 | 12/12     | 8/8        | 8/8         | 2/2 | 3 reachRight |
| height -0.2  | 33/33    | 14/14 | 10/10 | 12/12     | 8/8        | 8/8         | 2/2 | 0            |
| height 0.2   | 33/33    | 14/14 | 10/10 | 12/12     | 8/8        | 8/8         | 2/2 | 0            |
| mirror       | 33/33    | 14/14 | 10/10 | 12/12     | 8/8        | 8/8         | 2/2 | 0            |
| fps 10       | 32/33    | 13/14 | 10/10 | 12/12     | 6/8        | 7/8         | 2/2 | 1 squat      |
| fps 15       | 33/33    | 14/14 | 10/10 | 12/12     | 7/8        | 7/8         | 2/2 | 0            |
| fps 20       | 33/33    | 14/14 | 10/10 | 12/12     | 7/8        | 8/8         | 2/2 | 0            |
| fps 30       | 33/33    | 14/14 | 10/10 | 12/12     | 8/8        | 8/8         | 2/2 | 0            |
| visibility 1 | 33/33    | 14/14 | 10/10 | 12/12     | 8/8        | 8/8         | 2/2 | 0            |
| visibility 2 | 33/33    | 14/14 | 10/10 | 12/12     | 8/8        | 8/8         | 2/2 | 0            |
| visibility 3 | 32/33    | 14/14 | 10/10 | 12/12     | 8/8        | 8/8         | 2/2 | 0            |
| visibility 4 | 31/33    | 14/14 | 10/10 | 12/12     | 7/8        | 8/8         | 2/2 | 0            |
| visibility 5 | 31/33    | 14/14 | 10/10 | 12/12     | 7/8        | 8/8         | 2/2 | 0            |

`matrix.robust.test.ts` uses the recorded setup per clip, including the standing tail for the two late squat decisions. The oracle is the unperturbed detector replay, with the existing labeled clip tests as controls. It matches by type and nearest time within 500 ms, once per event. Scaling is about the feet, roll uses the 640 × 480 image and height is a vertical shift in units of frame height. Transformed joints outside the image get zero visibility. FPS samples the nearest recorded pose on a clock with ±20% jitter, seed 16. Visibility drops affect all joints for 1–5 consecutive frames in every 45. Detector replay starts with a measured baseline, bypassing the interactive calibration gate.

- **Possible, tall or close player.** At 1.3× the near jump misses source frame 182 (6773 ms). Three of four jumps survive. The same framing also loses the late squat and two lane changes in near/mixed.
- **Likely on a loaded laptop.** Greg’s rapid left reach (source frame 140, 4695 ms) disappears at irregular 10, 15 and 20 FPS. At 10 FPS the crouch-jump in greg/mixed (frame 35, 1240 ms) becomes a squat (frame 42, 1477 ms).
- **Possible with a tilted camera.** Greg’s half press becomes a false reach on source frame 41 (1379 ms) at either ±5°. The hand depends on roll direction. At −5° near/reach also misses a right reach at frame 8.
- **Lower demo priority.** Three consecutive low-visibility frames lose a lane change while Greg walks out of the frame. At four or five, greg/mixed also loses the left reach at frame 75. All departures from the reference, including extra reaches in near/reach, are named by clip and frame in the tests.

Abdo owns the detection findings. [Report and real-camera checks](https://github.com/gregorysudjian/CodeJam/commit/b14c17617b6d7e1250c83e8d6dd49040270c0244#commitcomment-211230024).

The full session calibration gate changes the interpretation of the body-size sweep. At 1.3×, near/standing says `tooClose` over the four-second window, so a new player at that framing would be asked to step back before reaching the missing fourth jump. This lowers its priority relative to the FPS misses. At 0.7×, the two farther standing clips say `tooFar`, while the near clip calibrates. At +20% height shift, the original and near clips say `tooClose`; near also says `tooClose` at −20%. The three unmodified baselines calibrate on source frames 44, 46 and 42 respectively. Both rolls and anatomical mirroring calibrate on all three.

## Camera round, network and frame cost

> A headless Chrome 157 production run completed the 45-second pose demo twice, once online and once with Chrome offline before starting the second round. The model, JavaScript loader and WASM came from localhost. MediaPipe also attempted a POST to Google’s metrics endpoint. The SDK describes this as performance and utilization reporting. Both rounds used the local store and a file-fed camera.

Cold-cache production preview at `7be4281`, query `?demo=1&store=local&gfx=low`. A local Y4M loop of the public MediaPipe pose sample photo drove Chrome’s camera through real calibration, the game HUD and Results. From initial navigation to the second Results screen, page CDP recorded 17 local GETs, one external POST and its OPTIONS preflight to `odml.pa.googleapis.com/v1/log`. The external attempts appeared during the offline replay. Zero WebSocket connections, outgoing WebSocket frames or WebTransport sessions were observed. MediaPipe 1.2.3 schedules a 60 s flush. The network trace did not decode the metrics payload. A fresh page load with no network, a connected Supabase session, real participant video and the Mac are **not tested**. [Report to Greg](https://github.com/gregorysudjian/CodeJam/commit/bb495aac313e66870d5331a2c465548dfe3f92eb#commitcomment-211229870).

In a separate headless Chrome run, one warm-up and 30 new engines each processed at least three real model frames, then stopped. The harness counted returned camera tracks, pending video-frame callbacks, watchdog intervals and successful model creations. After each stop there were **zero** live tracks, pending callbacks or watchdogs. One CPU landmarker served the page. After forced GC, V8 used heap went from 4,408,484 to 4,594,556 bytes (+186,072). Backing storage stayed at 7,364,607 bytes. These are two heap samples, so they do not establish a long-term leak rate.

Forcing GPU creation to reject exercised the real CPU fallback on the same local file camera. Excluding three warm-up frames, 91 CPU inference calls took 16.3 ms median and 20.9 ms p95. A 30 FPS frame allows 33.3 ms, leaving about 12.4 ms at p95 for other work. This measurement excludes Three.js rendering and is specific to this Windows machine.

The Node 24.22.3 microbenchmark in `frame-cost.robust.test.ts` replays preconverted near/pauseX landmarks, with 2,190 frames per batch. After warm-up, the median of 11 batch means was 0.00114 ms/frame for the whole session, 0.00044 for the detector alone, and 0.00010 for the gesture detector alone. Each path with gestures recognized both X holds on all 120 replays. The session includes both detectors, so these figures overlap. The test asserts pause counts and reports elapsed time.

To repeat the network check, start a clean Chrome profile on the production preview with the local store. Open DevTools Network, clear the log and cache, enable Preserve log, then navigate to the demo. Start the camera, calibrate and finish one 45 s round. Set Network to Offline, choose Play again and finish a second round. Save the sanitized HAR locally as `codejam-pose-round.har` in the operating system’s temporary directory. Run `npx vitest run src/pose/network.robust.test.ts`. The test skips on machines without the trace. A new destination fails separately from Greg’s known metrics finding. Laptop 2 used the same request method/URL fields from CDP and retained no headers or payloads in the test input.

### Failure handling in the production app

A clean local-store production page used Chrome’s file-backed camera and real MediaPipe. DevTools blocked the metrics endpoint during these fault injections. All seven cases ran without page exceptions.

| Injected condition                                             | Observed through the game UI                                                                                                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camera startup rejects with NotAllowedError / NotReadableError | Camera blocked / Camera in use respectively. Use keyboard dismisses the overlay. The busy error simulates a competing application. Physical two-app contention is **not tested**. |
| Model 404, WASM 404                                            | Camera did not start. The acquired video track ended, and Use keyboard dismissed the overlay in both cases.                                                                       |
| Model response held for five seconds                           | Camera startup recovered when the response was released. Calibration finished and the pose-controlled round reached the HUD with a live video track.                              |
| Active track stopped and an ended event dispatched             | Tracking-lost screen offered the keyboard. Clicking it resumed the same round and the timer advanced. Physical unplug is **not tested**.                                          |
| DevTools revoked camera permission during play                 | Chrome ended the actual file-backed video track. The tracking-lost screen offered the keyboard. Clicking it resumed the round and the timer advanced.                             |

## Follow-up after the distance-drift merge

**Possible, tracked identity after occlusion.** Headless Chrome ran the real GPU-delegate MediaPipe model on two composited copies of the public pose sample. The subject was segmented once and drawn at a fixed hip centre; a mirrored cutout crossed behind it from x = 0.12 to 0.88 during frames 75–149. The session ran for 180 frames on a synthetic 30 FPS clock. An assignment counted as unambiguous when the measured hip was within 0.08 frame widths of the walker and over 0.12 away from the player's centre. The fully overlapping portion cannot distinguish identities.

With the foreground continuously visible, scales 0.40, 0.60, 0.80, 0.95 and 1.00 produced zero unambiguous wrong picks or moves. Removing the foreground on frames 90–134 gave no moves at 0.40×. At 0.60×, the real model and session produced four lane changes (92, 111, 119, 154). On frame 149, fifteen frames after the player reappeared, the accepted hip still matched the walker. The model also produced four lane changes at 0.80×, 0.95× and 1.00×. This is a synthetic pixel sequence with a static pose and abrupt disappearance, so it cannot establish a live crowd handover rate. [Model result sent to Abdo](https://github.com/gregorysudjian/CodeJam/commit/821b882fec3a59192181012bcffcefc382cdaf64#commitcomment-211230714).

**Possible, spectator demonstrates X.** `crowd.robust.test.ts` first calibrates on 2.5 s of near/standing and then supplies only the spectator from near/pauseX, displaced sideways by 0.15 frame widths. Expected zero pauses from a stationary player. At 0.65× and 0.70×, source frame 123 incorrectly pauses the game. At 0.80× both frames 44 and 123 pause it. At 0.60× neither does. This is a synthetic identity switch involving a real recorded X gesture. [Frame evidence sent to Abdo](https://github.com/gregorysudjian/CodeJam/commit/821b882fec3a59192181012bcffcefc382cdaf64#commitcomment-211230809).

**Low demo priority, detector-only regression.** On main `646254f`, greg/leaveFrame at irregular 10 FPS adds two unmatched sidesteps on source frames 155 and 184 (5250 and 6225 ms). Neither reaches the public session's move listener in the corresponding calibrated replay. That listener emits one sidestep at 6796 ms. The original matrix above is from `56fb514`; the current detector's 10 FPS row therefore has two additional extra sidesteps. The regression test now checks the user-visible result as well as the isolated detector.

## Two tabs sharing a camera

On Windows with headless Chrome 157, two same-origin tabs opened independent pose engines against the same file-backed camera. In five runs both streams stayed live. While the second tab was in front, the first processed 2–3 frames in 2.2 s. Bringing the first tab back to the front restored 46–49 processed frames in 1.65 s, even while the second tab still held its stream. Closing the second stream left the first processing 35–43 frames over the next 1.4 s. Both tracks ended on explicit stop. There were zero page exceptions. These windows use wall-clock waits, so the counts are observations, not timing assertions.

To reproduce, start the Vite server and open `/src/pose/clip-viewer.html` in two Chrome tabs with the same local fake video capture. In each tab's DevTools console run:

```js
const { createPoseEngine } = await import('/src/pose/engine.ts');
const engine = createPoseEngine({ keys: false });
let frames = 0;
engine.onFrame(() => frames++);
await engine.source.start();
const track = engine.source.video.srcObject.getVideoTracks()[0];
const sample = () => ({ frames, track: track.readyState });
```

Read `sample()` before and after switching foreground tabs, stop the second with `engine.source.stop()`, and sample the first again. Stop the first stream at the end. An exclusive physical camera or another application can still reject acquisition; the injected busy-error test above covers that UI path. Physical device sharing on Patrick’s Mac is **not tested**.

## Camera ends while setup is starting

**Possible on a cold start, before frame 0.** On `ed6098f`, Chrome granted the file-backed camera and DevTools held the model response for 3.5 s. Revoking camera permission during that window ended the track. After the response was released, calibration still asked the player to stand in frame. The manual keyboard button was visible, but the app never surfaced a camera error during the observation. Chrome also resolved `video.play()` on an already-ended stream.

The engine now observes the track until video playback and model startup finish. An ended track rejects startup and runs the existing cleanup and app error handling. `engine.robust.test.ts` covers an already-ended track and loss during either pending operation, followed by a successful retry. Removing the fix reproduced all three failures. In five production-browser runs with real permission revocation, the camera error overlay appeared while the model response was still held. Use keyboard dismissed it each time, and Chrome reported zero page exceptions. A follow-through run reached the 45-second keyboard HUD with zero live camera tracks. A physical unplug during startup is **not tested**.
