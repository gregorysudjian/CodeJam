# src/game — the runner (owner B)

`createGame(canvas, level, input): Game` from `index.ts`. Plain Three.js. Its own `requestAnimationFrame` loop; nothing is pushed into React per frame.

## How to use it (for D)

```ts
const game = createGame(canvas, level, input); // renders right away, time stands still
const off = game.onEvent((e) => tracker.handleGameEvent(e));
game.start(); // after your countdown
// Esc: game.pause() / game.resume()
// unmount: off(); game.destroy();
```

- The canvas is sized by CSS. The game watches it with a `ResizeObserver` and caps the pixel ratio at 2.
- The game only calls `input.getState()`, once per frame. The app owns `input.start()` and `input.stop()`, and wires `input.onMove` to the tracker.
- Before `start()` the scene renders and the runner copies the player's arms, crouch and jump in place. That's useful behind a "raise both arms to start" prompt.
- `destroy()` stops the loop and disposes every geometry, material, texture, the bloom passes and the renderer. It does not force a context loss, so React StrictMode can create a second game on the same canvas.

## Events

| Event | When |
| --- | --- |
| `cue` | Once per wave, when it is `CUE_LEAD_SEC` (2 s) away. `inSec` is the time left. |
| `cleared` / `hit` | Once per spawn, from the judge (below). |
| `collected` | Orb collected. A missed orb fires nothing, as the contract says. |
| `paused` | `reason: 'user'` from `pause()`, or `'trackingLost'` as soon as `getState().tracking` is false. |
| `resumed` | From `resume()`, or automatically when tracking returns after a `trackingLost` pause (a user pause never auto-resumes). |
| `finished` | Once, when game time reaches `durationSec`. Events from the same frame come first. |

Event `t` is `performance.now()`. Game time is the sum of frame deltas, each clamped to 50 ms, and stops while paused. A background tab or a stall acts like a short pause instead of skipping objects.

## Judging (`judge.ts`, pure, tested)

Each spawn gets its own judge, fed the game time and the polled state every frame.

- Cleared if the required state is true on any frame in `[t − 0.35 s, t + 0.15 s]`. The verdict comes as soon as that happens, so a crate shatters the moment both arms go up.
- Hit is decided on the first frame after `t + 0.15 s`.
- `beam` and `crate` with `holdSec > 0` must engage in the window and then hold until `t + holdSec`. A gap longer than 0.3 s counts as a hit. **Assumption:** the contract only spells out the hold rule for beams; crates use the same rule (ask C).
- Orbs: floor mode needs the orb's lane plus either arm. Treadmill mode: lane −1 needs the left arm, +1 the right arm, 0 both.

## Placement (`timeline.ts`, pure, tested)

Speed comes from wave `intensity` (interpolated between waves). Each object sits at `D(wave.t) − D(elapsed)` ahead of the runner, where `D` is the distance travelled. That equals `speed × (wave.t − elapsed)` when speed is constant, and keeps objects and floor moving together when it changes.

## Look ("Neon Arena")

Background `#07090D` with fog. Lime lane lines and gates. Dark obstacles with neon edges, coloured by the move that clears them: sidestep cyan, jump lime, squat amber, arms up magenta, reach violet. Floor markers in the same colour under each object. Hits turn the object red, flash the runner and shake the camera (no shake with `prefers-reduced-motion`). Bloom uses `UnrealBloomPass`, which ships inside `three`, so there's no extra package. Only colours pushed above 1.0 (`NEON_BOOST`) glow. Turn it off with `BLOOM_ENABLED` in `tuning.ts` for weak laptops.

All numbers are in `tuning.ts`.

## Status

See the bottom of this file (kept up to date per phase).

### Phase 0 + 1 status (Sat ~4:30 AM)

**Works**
- Every contract piece: `createGame` and `createKeyboardInput`, all seven `GameEvent` types, pause/resume, auto-pause on tracking loss, `destroy()`.
- Five obstacle shapes coloured by move, floor markers, open-frame held beams, crate smash, orb collect, bursts on clear, red hit plus runner flash plus camera shake.
- Capsule runner with lane slide and lean, jump arc, crouch, and arms that follow Q, E and W.
- 22 judge and timeline tests plus 7 keyboard tests. `npm run check` passes.
- Full 60 s rounds checked in headless Chrome with a scripted input:
  - Perfect play gives 26 cues, 20 cleared, 6 collected, 0 hits, 1 finished.
  - No moves at all gives 20 hits, no orb events, `trackingLost` pause and resume, 1 finished.
- Runs inside D's `PlayScreen` under React StrictMode (create, destroy, create on the same canvas).

**Not tested (no hardware here)**
- Frame rate on a real GPU, especially next to MediaPipe. If it stutters, set `BLOOM_ENABLED = false` first.
- Real webcam input. Tested only with the keyboard and a scripted input.
- Long-term WebGL memory over many rounds.

**Next (Phase 2)**
- Sound effects and a music loop in `public/game/`.
- Hit vignette; speed lines at peak intensity.
- Low-graphics toggle.
- Tune `SPEED_*` and the cue lead in front of the camera with A.
