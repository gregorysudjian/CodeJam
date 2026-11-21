# src/game — the runner (owner B)

`createGame(canvas, level, input): Game` from `index.ts`. Plain Three.js. Its own `requestAnimationFrame` loop; nothing is pushed into React per frame.

| File | Job |
| --- | --- |
| `index.ts` | The loop: polls input once per frame, steps the core, draws the view, plays sounds, steps the graphics quality |
| `quality.ts` | The graphics quality ladder (tested) |
| `timing.ts` | Timing probe for tuning the latency leads, `?debug=timing`, per round and combined (tested) |
| `glyph.ts` | The move icons, painted for both views |
| `ghost.ts`, `ghostStore.ts`, `ghostRace.ts` | Ghost runner: recording, replay, ranking, on-device storage, live race (tested) |
| `core.ts` | The rules, with no drawing: clock, cues, judging, pause, finish (tested) |
| `judge.ts`, `timeline.ts` | One object's collision verdict; distance and speed (tested) |
| `view3d.ts` + `scene.ts`, `obstacles.ts`, `player.ts` | The Three.js picture |
| `view2d.ts` | Canvas 2D fallback, used automatically when WebGL cannot start |
| `audio.ts` | Synthesised sound effects |

**Graphics quality** (`quality.ts`). Measured on the demo level: about 100 draw calls, 8k triangles and 0.4 ms of JavaScript per frame. So the cost is pixel fill (canvas size × bloom passes), not geometry or code. The ladder steps down one level per 3 s window under 45 fps:
- Level 1: pixel ratio 1, bloom kept. That's 4× fewer pixels on a Retina screen, and measured 5 → 32 fps in software rendering.
- Level 2: no bloom, no skyline.

Below 20 fps it steps after 0.5 s instead of a full window, so a slow laptop never plays its first seconds in slow motion. On a 1× screen it skips straight to level 2.

A frame longer than 0.25 s (a hidden tab, a hitch) counts as 0.25 s, so switching to the slides and back never lowers the graphics. A GPU that really draws 2 frames a second still steps down at once.

**No shader stalls mid-round:** every shader is compiled on the first frame, about 4 s before the first object arrives. That covers objects that only show later (speed lines at streak 10, the finish arch, the end banner) and both render paths, so a step down to level 2 doesn't recompile every material at once on a laptop that is already struggling.

**URL switches** (also localStorage `game.gfx` / `game.muted` / `game.ghost`): `?gfx=high|medium|low` fixes the level (0, 1, 2), `?gfx=2d` forces the fallback, `?mute=1`, `?ghost=off|reset`, `?debug=timing`. Without a switch the ladder is automatic.

**Keyboard and the page:** while a round runs the game sets `<body data-game="running">` (cleared on pause, finish and `destroy()`). `src/input` only consumes its keys then, so the rest of the app keeps normal keyboard behaviour.

**Failure handling:** if WebGL can't start, the 2D view takes over, with the same move icons (tested in a Chrome with the GPU disabled). If drawing throws mid-round, the game logs it and keeps running without drawing, so events, the HUD and the results still work.

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

## Ghost runner (`ghost.ts`, `ghostStore.ts`)

**Race your best run.** During a round the game records the player's moves (lane, airborne, ducking, left and right arm) at 20 Hz of game time. When the same level is played again, a see-through ghost runner replays the best recorded run beside the player:
- **Look:** light cyan glass, cyan hands, visor and ground ring (never the player's lime).
- **Same lane:** it wraps the player as a shell.
- **Different moves:** it separates visibly, sidestepping, jumping, squatting or raising its arms on its own.

At the finish a banner says GHOST SAVED (first run of a level), GHOST BEATEN, GHOST WINS or TIE. The app's 1.5 s celebration keeps it on screen.

**Live race:** while racing, a chip at the top centre shows the player's lead in cleared + collected: "+2 VS GHOST" in lime, "−1 VS GHOST" in magenta, "EVEN VS GHOST" in cyan. It works because `ghostRace.ts` judges the ghost's recorded moves with a shadow copy of the game rules, synced to the round's game time. Re-judging a recording reproduces the ghost's real result.

**For the demo:** the presenter plays the demo level (`?demo=1`) once on the demo laptop. Every judge after that races the presenter's ghost. A judge who beats it becomes the new ghost.

- **Ranking:** cleared + collected, then fewer hits. The game counts these itself. A tie keeps the stored ghost.
- **Per input:** camera and keyboard ghosts are kept apart (the input at the start of the round). A keyboard run has no webcam lag, so as a ghost it would be unbeatable for people playing with their body. A round that switches input with K mid-round is never stored; its banner still compares it with the ghost it raced.
- **Level identity:** a ghost only replays on the identical level. A 64-bit fingerprint covers duration, mode and every wave (time, kinds, lanes, holds), so a new seed or a changed generator never shows a wrong ghost.
- **Storage:** browser localStorage on this device, `game.ghost.<fingerprint>`, about 1 KB per 45 s level (one base64 character per sample). The 10 most recent levels are kept. Private mode, a full quota or corrupt data mean no ghost, never a crash.
- **Privacy:** only those five game states. No video, no landmarks, nothing sent anywhere (AGENTS.md rule 5).
- **Switches:** `?ghost=off` (or localStorage `game.ghost = off`) turns it off. `?ghost=reset` clears every stored ghost once per page load.
- **Judging:** the ghost never affects it. It is drawn from the recording only, and full scripted rounds give the same event counts with or without it.
- **Console:** one line at the finish, for example `[game] ghost: lost. This run 3 cleared, 13 hits; ghost 23 cleared, 0 hits`.

**How it was checked:**
- 19 unit tests:
  - all 48 poses round-trip through one character;
  - sampling by game time with slow frames;
  - playback clamping;
  - fingerprint stability and sensitivity;
  - ranking;
  - parsing of corrupt data;
  - store cap, tie, blocked or full storage, clear.
- In the browser, two rounds in one context: perfect play saved a 1,032-character ghost, then an idle round showed the ghost sidestepping (4.0 s), pressing (8.3 s), jumping (10.5 s) and squatting (13.0 s) while the player stood, and ended on GHOST WINS. The same in the 2D fallback.

In the real app (main + `p1-workout` + `p2-game`, keyboard): a rehearsal round saved a ghost, the next round showed it beside the player with "+4 VS GHOST", ended on GHOST BEATEN and stored the better run.

**Ghost status:** done: (a)–(g), three review loops, and the live race. Measured on the demo level with the ghost and race on: judging unchanged (16/7/0, TIE against a perfect ghost), draw calls avg 91 → 103, JavaScript median 0.2 → 0.3 ms per frame. Not tested: a real webcam, a real GPU.

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

**Switching input mid-round (K).** The leads change by up to 0.3 s at a switch. They follow at 0.5 s of lead per second (`createLeadBlend` in `timeline.ts`, tested), so objects on screen slow down or speed up for at most 0.6 s instead of jumping up to 6 m.

**Tuning with the camera (`?debug=timing`, `timing.ts`).** Play a round with pose input and the browser console open. At the end the game prints one row per move:
- when the move was first seen relative to its judging time (median, negative = early);
- the share inside the judging window;
- the current lead, and the lead that would put the median in the middle of the window;
- `lagSec` (median + lead): the whole webcam lag, if the player moved as the object reached the runner.

Objects the player did not have to move for are skipped (already standing in the free lane). From the second round on (no page reload in between, "play again" is fine), a second table combines every round of this page load with the same input. Rounds where K was pressed are left out. The demo level has only 2 to 5 of each move, so copy the combined table's `suggestedLeadSec` into `VISUAL_LEAD_SEC.pose` after two or three rounds. The same reports are in `window.__gameTiming` (last round) and `window.__gameTimingAll` (combined). `latency.test.ts` checks the leads against the lags measured on A's clips. If you lower a lead below what those need, it fails: put the session's `lagSec` values in its `DETECTOR_LAG_SEC` and set its `CAMERA_SEC` to 0. Scripted check: a no-lag player who moves 0.3 s early reads -0.27 s, 100 % in the window, and gets leads 0.17 s lower, as expected.

## Placement (`timeline.ts`, pure, tested)

Speed comes from wave `intensity` (interpolated between waves). Each object sits at `D(wave.t) − D(elapsed)` ahead of the runner, where `D` is the distance travelled. That equals `speed × (wave.t − elapsed)` when speed is constant, and keeps objects and floor moving together when it changes.

## Look ("Neon Arena")

Background `#07090D` with fog. Lime lane lines and gates. Dark obstacles with neon edges, coloured by the move that clears them: sidestep cyan, jump lime, squat amber, arms up magenta, reach violet. Floor markers in the same colour under each object. Hits turn the object red, flash the runner and shake the camera (no shake with `prefers-reduced-motion`). Bloom uses `UnrealBloomPass`, which ships inside `three`, so there's no extra package. Only colours pushed above 1.0 (`NEON_BOOST`) glow. Turn it off with `BLOOM_ENABLED` in `tuning.ts` for weak laptops.

All numbers are in `tuning.ts`.

## Status

Newest first.

### Review pass (Sat midday)
A fresh read of every file in `src/game`, `src/input` and `src/workout`. Found and fixed, each proven by a test that fails without the fix or by a measurement in Chrome:
- **A hidden tab lowered the graphics for the rest of the round.** `requestAnimationFrame` stops in a hidden tab, so the first frame back spans the whole absence. The governor read it as about 2 fps and dropped straight to level 2. In Chrome, one 2 s freeze at 60 fps did exactly that; now it changes nothing.
- **K mid-round could store an unbeatable ghost.** A round started on the camera and finished on the keyboard was saved as a camera ghost. Checked over three rounds: the switched round beat the ghost but was not stored.
- **Shaders compiled mid-round.** Programs compiled mid-round went from 4 to 0; a forced step to level 2 compiled 9, now 0 (worst frame 47 → 25 ms). The first frame got heavier (about 1 s in software GL, before any object arrives).
- **K slid every object on screen by up to 6 m.** The drawn leads now follow a switch at a limited rate (see Latency compensation).
- Also: the race chip and the end banner share one drawing function, plus small tidying in `view3d.ts`.

Then, smaller additions:
- The race chip pops when the lead over the ghost changes.
- The 2D fallback shows the same move icons as 3D.
- `?debug=timing` adds a combined table over all rounds and a `lagSec` column, for the camera session with A.

Rechecked after Greg's PRs #13 and #20 (the select screen's camera/keyboard switch): `npm run check` on main + `p1-workout` + `p2-game` (209 tests pass). Also rechecked: treadmill rounds (perfect 9 crates + 10 orbs, 0 hits, in 3D and 2D). In the real app, a demo round driven by keyboard on the game's own clock scored 4,750, 100 %, best streak 23, every move inside its window (timing probe), no console errors. The ghost worked across two rounds (above). Not tested: a real GPU and a real webcam.

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
2. Optional: a low-graphics toggle on the select screen that writes localStorage `game.gfx` = `low` or `high`. The `settingsSlot` from PR #13 was meant for it; it now holds the camera/keyboard switch (#20).
3. ~~HUD cue words: show "REACH" for both reach moves~~: done (`hudCueLabel`, PR #13).
4. ~~Docs: AGENTS.md ownership and the CONTRACTS.md crate row~~: done.
5. ~~Show the finish~~: done (`FINISH_DELAY_MS`). Was: show the finish: in `PlayScreen`, wait about 1.5 s after `finished` before calling `onFinish`. The game shows a finish arch, the world coasts to a stop and the runner raises both arms, but today the results screen replaces it at once. The fanfare already rings out after `destroy()`.
6. ~~A pause overlay with text~~: done in `GameHud`.
7. The HUD cue word ("SIDESTEP" with its countdown ring) sits in the middle of the screen, exactly where the announced obstacle approaches. It covers the obstacle and the game's free-lane chevron for those 2 seconds. Move it to the top band (between score and timer) or make it much more transparent. Screenshot: the game at 2 s into the demo level. Still open on Sat midday: in the real app "SQUAT" covers the incoming beam.
8. Demo prep (`docs/DEMO.md`), for the ghost:
   - **Ghosts are stored per browser origin.** The Vercel tab and the localhost backup tab each need their own rehearsal round, or the backup has no ghost.
   - **The low-impact toggle makes a different level.** It is the same seed without hurdles, so it has its own ghost. Rehearse it once too if judges will get it.
   - **One ghost per input.** Rehearse with the camera, since judges play with their body. A round where the Operator pressed K is never stored.

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
