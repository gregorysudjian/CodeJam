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
