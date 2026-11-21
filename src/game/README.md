# src/game — the runner (owner B)

`createGame(canvas, level, input): Game` from `index.ts`. Plain Three.js. Its own `requestAnimationFrame` loop; nothing is pushed into React per frame.

| File | Job |
| --- | --- |
| `index.ts` | The loop: polls input once per frame, steps the core, draws the view, plays sounds, steps the graphics quality |
| `quality.ts` | The graphics quality ladder (tested) |
| `timing.ts` | Timing probe for tuning the latency leads, `?debug=timing` (tested) |
| `core.ts` | The rules, with no drawing: clock, cues, judging, pause, finish (tested) |
| `judge.ts`, `timeline.ts` | One object's collision verdict; distance and speed (tested) |
| `view3d.ts` + `scene.ts`, `obstacles.ts`, `player.ts` | The Three.js picture |
| `view2d.ts` | Canvas 2D fallback, used automatically when WebGL cannot start |
| `audio.ts` | Synthesised sound effects |

**Graphics quality** (`quality.ts`). Measured on the demo level: about 100 draw calls, 8k triangles and 0.4 ms of JavaScript per frame. So the cost is pixel fill (canvas size × bloom passes), not geometry or code. The ladder steps down one level per 3 s window under 45 fps:
- Level 1: pixel ratio 1, bloom kept. That's 4× fewer pixels on a Retina screen, and measured 5 → 32 fps in software rendering.
- Level 2: no bloom, no skyline.

Below 20 fps it steps after 0.5 s instead of a full window, so a slow laptop never plays its first seconds in slow motion. On a 1× screen it skips straight to level 2.

**URL switches** (also localStorage `game.gfx` / `game.muted`): `?gfx=high|medium|low` fixes the level (0, 1, 2), `?gfx=2d` forces the fallback, `?mute=1`. Without a switch the ladder is automatic.

**Keyboard and the page:** while a round runs the game sets `<body data-game="running">` (cleared on pause, finish and `destroy()`). `src/input` only consumes its keys then, so the rest of the app keeps normal keyboard behaviour.

**Failure handling:** if WebGL can't start, the 2D view takes over (tested in a Chrome with the GPU disabled). If drawing throws mid-round, the game logs it and keeps running without drawing, so events, the HUD and the results still work.

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

## Ghost runner (in progress)

Race your best run: during a round the game records the player's moves (lane, airborne, ducking, arms) at 20 Hz of game time. When the same level is played again, a translucent ghost replays the best run beside the player.

**Ghost status:** (a) `ghost.ts` done (encoding, recorder, playback, level fingerprint, ranking, parsing; tested). (b) `ghostStore.ts` done (localStorage, 10 most recent levels, corrupt or blocked storage tolerated; tested). (c) recording and saving at the finish done (checked in the browser: a perfect round saved a 1,032-character ghost, an idle round lost to it and did not replace it). Next: (d) 3D ghost, (e) end banner, (f) 2D ghost, (g) docs.

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

## Latency compensation (`VISUAL_LEAD_SEC`, tested in `latency.test.ts`)

Webcam input reaches the game after the move. Measured on A's recorded clips (`src/pose/fixtures` on `abdo-1`), from the first movement in the raw landmarks to his detector's state change:

| Move | Measured lag |
| --- | --- |
| Jump | 57–78 ms |
| Squat | 281–286 ms (the hips must drop 0.3 torso lengths) |
| Arms | 235–306 ms |
| Sidestep | 209–271 ms |

Camera capture and the model add about 0.1 s on top. A player who squats exactly when a beam reaches the runner would be seen near `t + 0.39`, outside the contract window `[t − 0.35, t + 0.15]`. So with pose input each object is drawn ahead of the judging clock by its move's lead (lag − 0.15 + 0.05 margin):

| Move | Lead |
| --- | --- |
| Jump | 0.1 s |
| Sidestep | 0.25 s |
| Squat, arms up, reaches | 0.3 s |

Reacting on sight then lands inside the window for every kind, and players who anticipate still clear. The leads differ by far less than the 1.1 s minimum wave gap, so objects never swap order. The floor and the FINISH arch use no lead, so the runner crosses the line as the clock hits 0:00.

Judging, events and the contract are unchanged; only where objects are drawn moves. Keyboard input has no lag and gets no lead. The HUD countdown (`cue.inSec`) runs to the visual arrival too, so following the ring and following the picture agree.

**Tuning with the camera (`?debug=timing`, `timing.ts`).** Play a round with pose input and the browser console open. At the end the game prints one row per move:
- when the move was first seen relative to its judging time (median, negative = early);
- the share inside the judging window;
- the current lead, and the lead that would put the median in the middle of the window.

Objects the player did not have to move for are skipped (already standing in the free lane). Copy `suggestedLeadSec` values that hold over two or three rounds into `VISUAL_LEAD_SEC.pose`. The same report is in `window.__gameTiming`. Scripted check: a no-lag player who moves 0.3 s early reads -0.27 s, 100 % in the window, and gets leads 0.17 s lower, as expected.

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

### Requests for D (Greg), not done because they are outside src/game
1. A "Demo" entry point. `?demo=1` already works without any change (see `src/workout/README.md`).
2. Optional: a low-graphics toggle on the select screen that writes localStorage `game.gfx` = `low` or `high`.
3. HUD cue words: orbs carry `reachLeft` / `reachRight` / `armsUp`, and a floor orb in the centre lane says `reachRight` though either arm works. Show "REACH" for both reach moves.
4. Docs: AGENTS.md ownership (Patrick also owns `src/workout/`); CONTRACTS.md crate row: "both arms up (for the whole `holdSec` if set, with 0.3 s of grace)".
5. Show the finish: in `PlayScreen`, wait about 1.5 s after `finished` before calling `onFinish`. The game shows a finish arch, the world coasts to a stop and the runner raises both arms, but today the results screen replaces it at once. The fanfare already rings out after `destroy()`.
6. ~~A pause overlay with text~~: done in `GameHud`.
7. The HUD cue word ("SIDESTEP" with its countdown ring) sits in the middle of the screen, exactly where the announced obstacle approaches. It covers the obstacle and the game's free-lane chevron for those 2 seconds. Move it to the top band (between score and timer) or make it much more transparent. Screenshot: the game at 2 s into the demo level.

### Checked end to end (local merge of main + p1-game + p1-workout)
- `npm run check`: 78 tests pass.
- Real app with `?store=local&demo=1&gfx=2d`, demo round played by scripted keyboard: score 4200, 100 % accuracy, best streak 21, reps per move and calories correct, rule-based coach card shown, no console errors.
- Same app in 3D: renders, HUD cues show, auto low graphics engaged on the software renderer, no audio autoplay warning after the "Start round" click.

### Game feel (`p2-game`)
Checked with screenshots at each moment and full scripted rounds (perfect: 0 hits; idle: every non-orb a hit), plus the real app by keyboard (100 %, same score as before).
- **Readable from 2 m:** a move icon above every obstacle (arrow up = jump, arrow down = squat, figure with arms up = crate, double chevron over the free lane = sidestep). Blocks paint a guide in the free lane.
- **Hits feel like hits:** red impact ring, the runner flashes and stumbles, crates shatter red, camera shake (none with reduced motion).
- **Orbs fly into the hand** that took them (the raised one on the floor, by lane on the treadmill).
- **Holds give live feedback:** a column of light in the move's colour while a held beam or crate is held, a slow red pulse (1.4 Hz, under the WCAG flash limit; steady with reduced motion) while it is not.
- **Streak rewards:** at 5, 10 and 20 in a row (the multiplier steps) the lane lines pulse, a level-up chime plays, and from 10 speed lines rush past with a small field-of-view kick. A hit resets it.
- **"I saw that" sounds:** quiet confirmations for every detected lane change, jump, squat and arm raise, also before the start. With a webcam this tells the player the camera follows them. Rate-limited against jitter.
- **A real ending:** a checkered FINISH arch sits exactly where the runner is at `durationSec`, then the world coasts to a stop, the runner celebrates, and a fanfare plays.
- **Pause** dims the scene, corrected for bloom's linear-light blending.
- **Robustness:** sprites and off-screen pooled materials are now disposed; the core sorts waves itself; `streak`, `feverTier` and `movesSeen` are unit-tested.

### Phase 2 so far (`p1-game`)
- **Sound** (`audio.ts`): Web Audio synthesis, so no files and no package. Each move has its own pitch for the cue, plus sounds for clear, orb collect, crate smash and hit. Mute with `?mute=1` or localStorage `game.muted = '1'`. Chrome only lets audio start after a click on the page; the app's "Start round" click counts. Headless tests ran silent because nothing was clicked, and the game carried on fine.
- **Low graphics**: no bloom, pixel ratio 1, no skyline. Turns on by itself when a round runs under 45 fps over 3 s (checked: the software renderer at 19 fps switched). `?gfx=low` forces it on, `?gfx=high` keeps full graphics (also localStorage `game.gfx`). D could put a toggle on the select screen that writes `game.gfx`.

**Next (Phase 2)**
- Music loop (optional; sound effects are done).
- Hit vignette; speed lines at peak intensity.
- Tune `SPEED_*` and the cue lead in front of the camera with A.
