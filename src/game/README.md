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
| `runnerPose.ts` | The runner's joint angles: run cycle, jump arc and landing squash, squat and slide, lean, arm raises (tested) |
| `world.ts` | The zones the track travels through and their colour blend (tested) |
| `feedback.ts` | Timing grades (PERFECT / GOOD / LATE) and combo milestones (tested) |
| `intro.ts` | The 3-2-1 countdown and the camera fly-in path (tested) |
| `trail.ts` | Trail motes leading into the next free lane or orb (tested) |
| `view2d.ts` | Canvas 2D fallback, used automatically when WebGL cannot start |
| `audio.ts`, `music.ts` | Synthesised sound effects; the synthesised beat (its plan is tested) |

**Graphics quality** (`quality.ts`). The ladder steps down one level per 3 s window under 45 fps:
- Level 1: pixel ratio 1, bloom kept, half the particles. That's 4× fewer pixels on a Retina screen, and measured 5 → 32 fps in software rendering.
- Level 2: no bloom, and none of the extras (towers, far skyline, particles, water glints, tunnel light strips). The track, obstacles, cues, tunnel and bridge structure all stay.

The cost is pixel fill (canvas size × bloom passes), not geometry or code. Measured on the demo level (Sat afternoon, the game-feel PR, Intel UHD 770 in Chrome, dev build): 60 fps at level 0 for the whole round, also with MediaPipe running on a fake camera next to it. The game's JavaScript took 1.9 ms per frame (median; 1.3 ms on main before it). The console prints the round's frame rate at the finish (`[game] frame rate this round: …`, also `window.__gameFps`).

Below 20 fps it steps after 0.5 s instead of a full window, so a slow laptop never plays its first seconds in slow motion. On a 1× screen it skips straight to level 2.

A frame longer than 0.25 s (a hidden tab, a hitch) counts as 0.25 s, so switching to the slides and back never lowers the graphics. A GPU that really draws 2 frames a second still steps down at once.

**No shader stalls mid-round:** every shader is compiled on the first frame, about 4 s before the first object arrives. That covers objects that only show later (speed lines at streak 10, the finish arch, the end banner) and both render paths, so a step down to level 2 doesn't recompile every material at once on a laptop that is already struggling.

**URL switches** (also localStorage `game.gfx` / `game.muted` / `game.ghost` / `game.music` / `game.intro`): `?gfx=high|medium|low` fixes the level (0, 1, 2), `?gfx=2d` forces the fallback, `?mute=1`, `?music=off` (effects only), `?intro=off` (no countdown), `?ghost=off|reset`, `?debug=timing`. Without a switch the ladder is automatic.

**Keyboard and the page:** during the 3-2-1 intro and while a round runs, the game sets `<body data-game="running">` (cleared on pause, finish and `destroy()`; it turns on `INTRO_SEC` before the round clock starts). `src/input` only consumes its keys then, so the rest of the app keeps normal keyboard behaviour.

**Failure handling:** if WebGL can't start, the 2D view takes over, with the same move icons (tested in a Chrome with the GPU disabled). If drawing throws mid-round, the game logs it and keeps running without drawing, so events, the HUD and the results still work.

## Sunday morning, before the judges

On the demo Mac, in `~/CodeJam`, once `main` is final:
1. `git pull`. `git log -1` should show Greg's last merge.
2. `node src/game/e2e/run.mjs --quick` (about 3 minutes; the full set takes about 15 without `--quick`). It plays the demo level, its low-impact version and END ROUND at 0:01 in a Chrome window with a keyboard autopilot, and exits 0 when every check passes (details in "End-to-end rounds" below). It runs its own dev server on port 5174 and a throwaway Chrome profile, so it never touches the ghosts or the saved player on `localhost:5173`. Leave the window alone while it runs.
3. It ends by printing a one-line check for the Player's camera ghosts. Open `http://localhost:5173/?demo=1` in the normal Chrome (start `npm run dev -- --strictPort` first), paste the line in the console: both lines should say `camera ghost`, with the rehearsal's result.
4. From 10 AM: crash or unplayable fixes only.

## End-to-end rounds (`e2e/`)

`node src/game/e2e/run.mjs` plays real rounds in Chrome and checks how each ends. It needs Node 22+ and Chrome, and no npm package (plain DevTools protocol, like `docs/qa/sweep/`, which covers the app flow; this covers the game). Options: `--quick`, `--only '<case>'`, `--headless` (frame rates are then not meaningful), `--url http://localhost:5173/` (use a running dev server).

- **Cases:** the demo level (must score 4,750 with 0 hits) and its low-impact version; END ROUND from the pause screen at 0:01 (nothing saved, back on the select screen); every floor workout in low impact and every treadmill workout, perfect (0 hits); standing still; mashing keys; Esc 9 times, then once more (paused, then running); K mid-round to the camera and back.
- **Every case:** the level played matches the pick (workout, mode, 45 s, low impact), the round saves exactly once (END ROUND: never), no console errors. Ghost lines (`[game] ghost: …`) are printed for the demo rounds. Other rounds print their seed. A click, real key, lost focus or hidden tab during a round is printed with its time; when a round fails, that is the first suspect. A protocol call with no reply fails its round after 20 s, and a round after 4 minutes, so the run never hangs.
- **How it plays:** `autopilot.js` does what `core.test.ts`'s perfect player does, with real key events. It reads the level from React's fiber tree (the select screen picks a random seed except on the demo) and starts its clock `INTRO_SEC` after `<body data-game="running">` turns on. So it needs the dev server, not `npm run preview`.
- **The camera** is Chrome's fake device (a test pattern), so the real webcam never turns on; the K case only checks that switching to it and back keeps the round alive.

## Camera session: the next steps

Everything here needs the webcam, the demo laptop and a body; the game prints what you need. Branch `p5-game` (merged as #47; it follows `main`). The results go in one small follow-up PR: push `p5-game`, then tell Greg "ready".

**Set-up.** Patrick's Mac is the demo laptop, and the demo runs on plain `npm run dev` (no coach key, so the coach card is the rule-based one).
- **Folder:** use a clone outside iCloud, e.g. `~/CodeJam`; a branch switch in the iCloud Desktop folder makes "name 2" copies. Its `.env.local` holds the Supabase URL and anon key from D's message (gitignored, never committed), so rounds save and the leaderboard works.
- **Start it:** `npm run dev -- --strictPort`. If port 5173 is taken, Vite would move to 5174 without asking: a different origin, so no ghosts and no saved settings. With `--strictPort` it stops with an error instead.
- **URL:** always exactly `http://localhost:5173`, never `127.0.0.1`. For the session, open `/?demo=1&debug=timing` with the console open and pick Camera on the select screen. **D** shows A's pose overlay with its FPS.

Do the steps in this order: the frame rate changes the webcam lag, and the ghosts belong to one level.

1. **Frame rate.** Play one round with the camera.
   - The console prints `[game] frame rate this round: average … fps, slowest 5% of frames … ms` and any quality step. The overlay shows the pose FPS.
   - If pose drops under about 25 fps while the game runs, fix a lower level on this laptop: in the console on `http://localhost:5173`, `localStorage.setItem('game.gfx', 'medium')`, or `'low'`.
   - Otherwise leave it on automatic: it steps at 3 s if needed, and later rounds start at the level found.
2. **Latency leads.** Play 2–3 rounds, moving when each object reaches the runner.
   - After every camera round the console prints `[game] camera session, paste both lines:`, over all camera rounds of this page load (from the second round, with a combined table). After 2–3 rounds, paste the first after `VISUAL_LEAD_SEC.pose = ` in `src/game/tuning.ts`, the second after `SESSION_LAG_SEC = ` in `src/game/latency.test.ts`. Then `npm run check`.
   - If `latency.test.ts` still fails, a lead is below what its measured lag needs (the suggestion is capped at `TIMING_MAX_LEAD_SEC`): look at that move's `inWindowShare` before raising anything.
3. **Holds and fair attempts.** After each round the console lists every hit and missed orb (`[game] N hits and missed orbs this round, and why:`, also in `window.__gameMisses`). Read it row by row:

   | `cause` | What happened | Who fixes it, and how |
   | --- | --- | --- |
   | `late`, by X s | first seen after the window closed (t + 0.15 s) | Patrick: the move's lead, from the combined table, not from one row. A single late row with the rest in the window is the player. |
   | `early`, by X s | seen only before the window opened (t − 0.35 s) | Patrick: the lead is too high for this move, or the player anticipated. Same rule: the combined table decides. |
   | `not seen` | never seen within 1 s of its time | The player really moved: a request to A under "Requests for A" below. A missed orb where nobody reached is just a miss. |
   | `dropped`, gone at +X s for Y s | held, off for longer than the 0.3 s grace, back before the end | A, if the player stayed down or up (flicker). The player, if they really stood up. |
   | `let go`, X s before the hold ended | the hold ended early and did not come back | The player, if they stood up. A, if they were still down (the state ended early). |
   | `in window` | the probe saw the move in time, yet it was a hit | Patrick: the probe and the judge disagree. Note the row; it is a bug in `judge.ts` or `timing.ts`. |

   The `detail` column gives the times; `at` is the object's judging time in the level, the same in every round of the demo level, so a row that repeats across rounds is the level or the detector, not the player.

   What recorded clips already say, from A's clips replayed through his detector with ±1 % landmark noise and 30 % dropped frames:
   - Held squats and both-arms-up never flickered.
   - At the end of a hold the state stays on after the player starts to rise: 0.3–0.7 s for squats, 0.1–0.5 s for both arms. Held objects now end visually at the judging end, so on top of that, letting go up to 0.3 s early still clears.
   - Greg's clips (a second body): under heavy landmark noise, an overhead press could start a false jump that ended the hold. A fixed it on `main` (`3e696e8`, a higher jump line with both arms up).
   - The tight spot is the start of a squat: about 0.39 s of lag against a 0.3 s lead leaves about 0.06 s of slack. Greg's slowest recorded squat would be about 0.02 s late, so watch for `late` squats. The combined table will probably suggest about 0.35 s.
4. **Three body rounds, normal and low impact.**
   - Note any combo that feels unfair or tiring. The hit report gives its time.
   - In one of them, step about 50 cm closer to the screen mid-round (A's closer-play change, #50). The round should keep playing, without a tracking-lost pause.
   - Low impact already gives the hurdles' share to sidesteps and reaches, and no level has holds in its cool-down (`src/workout/README.md`).
   - `npm run check` keeps `demo.test.ts` honest after any change.
5. **Look and sound, 10 minutes**, on the Mac's own display and speakers at the volume the demo will use, the browser at the size the demo will use. Headless Chrome can't check any of this. Tick each box, and note any "no" with the fix next to it:
   - [ ] **Music against a voice** (3 min). Play a demo round while someone talks from where the presenter will stand, at pitch volume. Can you follow every word? If not, lower `MUSIC_VOLUME` in `look.ts` (0.35 → 0.25), or turn the beat off on this laptop: `localStorage.setItem('game.music', 'off')` (effects stay). Can you still hear the cue beeps and the hit thud over the voice? If not, raise `AUDIO_VOLUME` in `tuning.ts` rather than single effects (`mix.test.ts` pins the effect levels).
   - [ ] **No crackle at full volume.** At the Mac's top volume, reach the 20 combo and the finish (the loudest moments). Any crackle or pumping: lower `AUDIO_VOLUME`, never the limiter.
   - [ ] **First sound in a fresh tab.** Reload, click through, and start a round: the 3-2-1 beeps play. If they don't, click the page once before START.
   - [ ] **PERFECT / GOOD / LATE from the mark** (2 min). From 1.5 m, with the camera, read the word for five clears in a row. Readable? If not, raise `GRADE_WIDTH` in `look.ts` (3.5). Does it match how it felt? If on-time moves mostly say LATE or GOOD, the camera's grade bands are off: note it for `GRADE_BANDS.pose` in `tuning.ts`, with the hit table from step 3.
   - [ ] **The rest from the mark:** the move icons on far objects, the `5 COMBO!` banner (bottom centre), the race chip (bottom right) and `YOUR BEST` under the ghost. Anything you can't read: its size is in `look.ts`.
   - [ ] **The finish on this display** (2 min). Play to 0:00 twice, racing a ghost. The FINISH arch passes, the camera swings smoothly to the celebrating runner, and the verdict (`GHOST BEATEN`, `GHOST WINS`, `TIE`) sits big in the middle, under the score and clock plates and clear of them. The results come after the swing has settled (it takes 1.3 s of the app's 1.5 s). Any stutter in the swing: check the frame rate line in the console. A cut-off banner: note the window size.
   - [ ] **Pause with the X** mid-round: the beat fades out and comes back on resume, no note left ringing.
   - [ ] **Reduce motion** (macOS Settings → Accessibility → Display): if it's on, the game drops the fly-in, the finish swing, shake and flying pieces. Is that what you want on stage?
6. **Ghost rehearsals, right after this session.**
   - A ghost belongs to one exact level, and both demo levels are pinned (`demo.test.ts`). Changing the latency leads, the look or the sound keeps ghosts valid.
   - In the normal Chrome (not a test profile), on exactly `http://localhost:5173/?demo=1` with the camera, play the demo level once in normal and once in low impact. Extra flags like `&debug=timing` don't matter; the origin does.
   - Each round start prints `[game] ghost: racing …` or `none yet …`.

**Send me** the console output (the tables are copyable) if you'd like me to update the numbers and tests.

## How to use it (for D)

```ts
const game = createGame(canvas, level, input); // renders right away, time stands still
const off = game.onEvent((e) => tracker.handleGameEvent(e));
game.start(); // runs the 3 s intro (3, 2, 1, GO), then the round clock starts
// Esc: game.pause() / game.resume()
// unmount: off(); game.destroy();
```

- **`start()` includes a 3 s intro.** The camera flies in from the runner's front to the chase position while 3, 2, 1 count down (with beeps), then GO, and only then does game time start. `getElapsedSec()` stays 0 and no events fire during the intro, so the HUD shows the full time. `pause()` during the intro skips it into a paused round. With reduced motion the camera does not fly; the countdown still shows. `?intro=off` starts at once, as before.

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

## Levels (`level.stages`)

A round is six levels of 30 s (`src/workout`). Speed is flat within a level and eases to the next level's over `LEVEL_SPEED_EASE_SEC` (1 s) from the boundary (`timeline.ts` `levelIntensityAt`; objects and floor still move together). No object comes within 2 s of a boundary: there the runner passes through a **portal**, a white neon ring with a veil in the next level's horizon colour, with a white flash, the milestone shockwave, a chime, and "LEVEL n".

**Backdrops:** `backdrop.ts` is the one place that says which backdrop each level has: 1 city, 2 tunnel, 3 bridge, 4 city at dawn, 5 bridge at night, 6 finale (scenery from `scene.ts`, palette from `look.ts` `ZONE_LOOK`). `world.ts` plans one track segment per level from it, and scenery runs on across levels that share it. For Higgsfield's Montreal cinematics, set a level's `video` there; nothing reads it yet.

**Lives:** see `lifeLost` and `finished` below. **Resume:** see `resuming`.

## Events

| Event | When |
| --- | --- |
| `cue` | Once per wave, when it is `CUE_LEAD_SEC` (2 s) away. `inSec` is the time left. |
| `cleared` / `hit` | Once per spawn, from the judge (below). |
| `collected` | Orb collected. A missed orb fires nothing, as the contract says. |
| `paused` | `reason: 'user'` from `pause()`; `'trackingLost'` as soon as `getState().tracking` is false; `'otherPerson'` while `getState().otherPerson` is true. Also when either happens during the countdown below. |
| `resuming` | `inSec: 3` (`RESUME_COUNTDOWN_SEC`): every resume counts 3-2-1 first, in the canvas, with game time frozen. From `resume()`, or when tracking returns or the other person leaves (a user pause never auto-resumes). `pause()` during it pauses again. |
| `resumed` | When the countdown ends. Never sent if it was interrupted. |
| `stage` | Entering a level (`level.stages`): level 1 on the first frame of the round, then as game time reaches each level's `startSec`, before that frame's cues. The canvas shows "LEVEL n" big in the middle (level 1 once the intro's GO has gone). |
| `lifeLost` | Right after a `hit` on a block, hurdle, beam or crate that cost a life (`LIVES` = 3; a missed orb never costs one). For `LIFE_GRACE_SEC` (1.5 s of game time) after it no other life can go, so a held beam or a block-and-orb is one mistake. The canvas flashes red and the runner flickers through the grace. At `livesLeft: 0` judging and game time stop, the runner stops short and OUT OF LIVES shows. |
| `finished` | Once: `reason: 'complete'` when game time reaches `durationSec` (events from the same frame come first), or `'outOfLives'` `OUT_OF_LIVES_SEC` (1.5 s, real time) after the last life went. An out-of-lives run plays no fanfare and is never stored as a ghost. |

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

**Held beams and crates end where the judge ends them.** The front is drawn early by its lead, but the back end passes the runner at `t + holdSec`, when the hold is decided. Letting go as the object ends is then always in time, and the clear burst comes as the end passes, not 0.3 s later. Drawn early too, a release on sight had only the detector's release lag as slack. Recorded clips put that as low as 0.10 s for both arms (Greg's presses) and 0.32 s for squats; the 0.3 s grace now comes on top.

**Switching input mid-round (K).** The leads change by up to 0.3 s at a switch. They follow at 0.5 s of lead per second (`createLeadBlend` in `timeline.ts`, tested), so objects on screen slow down or speed up for at most 0.6 s instead of jumping up to 6 m.

**Tuning with the camera (`?debug=timing`, `timing.ts`).** Play a round with pose input and the browser console open. At the end the game prints one row per move:
- when the move was first seen relative to its judging time (median, negative = early);
- the share inside the judging window;
- the current lead, and the lead that would put the median in the middle of the window;
- `lagSec` (median + lead): the whole webcam lag, if the player moved as the object reached the runner.

Objects the player did not have to move for are skipped (already standing in the free lane). From the second round on (no page reload in between, "play again" is fine), a second table combines every round of this page load with the same input. Rounds where K was pressed are left out. The demo level has only 2 to 5 of each move, so copy the combined table's `suggestedLeadSec` into `VISUAL_LEAD_SEC.pose` after two or three rounds. The same reports are in `window.__gameTiming` (last round) and `window.__gameTimingAll` (combined). `latency.test.ts` checks the leads against the lags measured on A's clips, or against `SESSION_LAG_SEC` for moves measured in a camera session. The console prints that line next to the leads line, so step 2 is one paste into each file. Scripted check: a no-lag player who moves 0.3 s early reads -0.27 s, 100 % in the window, and gets leads 0.17 s lower, as expected.

## Placement (`timeline.ts`, pure, tested)

Speed comes from wave `intensity` (interpolated between waves). Each object sits at `D(wave.t) − D(elapsed)` ahead of the runner, where `D` is the distance travelled. That equals `speed × (wave.t − elapsed)` when speed is constant, and keeps objects and floor moving together when it changes.

## Look ("Neon Arena")

Background `#07090D` with fog. Lime lane lines and gates. Dark obstacles with neon edges, coloured by the move that clears them: sidestep cyan, jump lime, squat amber, arms up magenta, reach violet. Floor markers in the same colour under each object. Hits turn the object red, flash the runner and shake the camera (no shake with `prefers-reduced-motion`). Bloom uses `UnrealBloomPass`, which ships inside `three`, so there's no extra package. Only colours pushed above 1.0 (`NEON_BOOST`) glow. Turn it off with `BLOOM_ENABLED` in `tuning.ts` for weak laptops.

All numbers are in `tuning.ts`.

## Status

Newest first.

### `p5-game` (Sat evening): camera-session report on top of the game-feel pass
`main` already had the game-feel pass (`p4-game-feel`, #38). This branch adds what `p3-game` had that main lacked, without its duplicate polish:
- **`?debug=timing` hit report:** after each round, every hit and missed orb with a cause (`late` / `early` by X s, `not seen`, `dropped`, `let go`) and the leads line to paste. Main's frame-rate line stays as the frame report.
- **Round start:** a ghost status line (racing, or none yet).
- **Automatic graphics:** they start each round at the level an earlier round reached.
- **Quality ladder:** the first step comes at 3 s, before the first object (2 s window).
- **Fixes:** held objects end visually when the judge ends them, and the view gets this frame's input before the rules (the orb used to fly to the previous frame's hand).
- **Workout:** gentler low impact, and no holds in the cool-down (`src/workout/README.md`).
- **Camera-session step 2 in one paste:** the console prints the leads line for `tuning.ts` and the measured lags for `SESSION_LAG_SEC` in `latency.test.ts` together; step 3 has a checklist (cause, meaning, who fixes it) and a "Requests for A" template.
- **Edge cases pinned as tests (`core.test.ts`):** a hold across a pause, tracking loss or a K switch (the new input has the 0.3 s grace), a paused core never finishes (END ROUND saves nothing), and a round that ends mid-hold gives no verdict.
- **Checked in Chrome on this branch:** a scripted round with one of each failure gets the right cause on every row; rounds unchanged (16/7/0, idle 13 hits, 2D); ghost line; graphics carry-over over three rounds; the held beam ends at the runner as it is cleared.
- **Checked after merging #45 and #46 (Sat ~5 PM, Chrome 157 on the demo Mac, M4 Pro, built-in display at 1512×945):** a scripted perfect keyboard round of the demo level on `?demo=1&store=local&music=off` scored 4,750, 100 %, best streak 23, 0 hits; average 120 fps, slowest 5 % of frames 10 ms, graphics quality 0 throughout; the round saved; no console errors. At 5, 10 and 20 COMBO the banner (bottom centre) and the VS GHOST chip (bottom right) stay clear of the HUD cue. Not checked: the camera, an external screen.
- **Judge edge cases in the browser (Sat ~6 PM, main at #47, same Mac, `?store=local&music=off`, keyboard):** every case ended in a sensible result with no console errors, at 120 fps.

  | Case | Result |
  | --- | --- |
  | Low impact, scripted perfect: Legs, Arms, Shoulders, Full body (floor, random seeds) and the demo level | 0 hits, saved. Low impact is floor only (the select screen ignores it on the treadmill, which has no jumps). |
  | Treadmill, scripted perfect: Arms, Shoulders, Full body | 0 hits, saved |
  | Stands still the whole round (demo level) | 300 points, 19 %, 13 hits and 7 missed orbs, saved; 3 blocks clear by themselves (their free lane is the middle one, where an idle player stands) |
  | Mashes keys (about 30 presses a second) | 2,550 points, 88 %, saved. Only possible on the keyboard; a body can't do it. Not changed: it would be a scoring change. |
  | Esc 9 times at 10 s, then once more | Paused after the 9th, running after the 10th; still 0 hits, saved |
  | K at 15 s (to a camera that sees nobody), K again 4 s later | The round paused for calibration, came back on the keyboard and finished 100 %, saved. Side effect in `src/app`: cancelling the calibration shows "Recalibration failed. Press K for the keyboard." for a few seconds although the player is already on the keyboard. |
  | END ROUND from the pause screen at 0:01 | Back to the select screen, nothing saved |

- **Cold start (production build, `vite preview`, cache cleared, new player each time):** landing 318 KB (228 KB JS), ready in 0.11 s locally and 0.36 s at 10 Mbps. Nothing more loads after the select screen (520 KB in all): the game chunk is fetched there. "START THE ROUND" to the first game frame: 0.39 s, with or without the 10 Mbps limit. A new player's first START shows the 15 s "Try each move" first (`src/app`, Esc skips it; `docs/OPERATOR.md` says so). Camera play adds the pose WASM and model (about 9 MB, measured in `docs/QA.md`); not measured here.

### Game feel pass (`p4-game-feel`, Sat afternoon)
Judging, events and `src/contracts` are unchanged: a scripted perfect run of the demo level still gives 16 cleared, 7 collected, 0 hits, with the camera leads or without.
- **Runner** (`player.ts`, `runnerPose.ts`): a jointed figure with knees, elbows and shoes. It has a run cycle whose cadence follows the speed, a jump arc with a take-off stretch, a tuck and a landing squash, a squat when standing still and a slide when running, a lean into lane changes, and each arm raised with the player's. The ground ring flashes on every detected move, so the player sees the camera caught it. Tests check that the ducking head clears every beam, the jumping feet clear the hurdle and the feet stay planted.
- **World** (`world.ts`, `scene.ts`): the round travels through a neon city (towers with lit windows), a tunnel (walls, ceiling, a neon ring every 5 m, darker fog), a bridge (pylons, fanned cables, white railings, water glints, a far skyline at slow parallax) and, for the last 10 s, the finale (a sunset glow, gold gates). Zones are fixed stretches of track, so a border comes toward the runner like an object; scenery rises out of the ground at a border, and the sky, fog and particle colours blend over 30 m. Backgrounds stay near black and the lane lines stay lime, so obstacles read the same in every zone. Particles stay off the track (a dot over a lane could read as an orb).
- **Timing feedback** (`feedback.ts`): PERFECT, GOOD (early) or LATE beside the runner for each clear and collect, from when the move was first seen (`core` now reports it). The camera's bands are shifted for its lag (see `GRADE_BANDS`). There is a combo counter on the floor behind the runner, and at 5, 10, 20, then every 10 a banner in the sky band, a shockwave from the runner, a lane flash and a field-of-view punch. A cleared object's move icon now disappears, so it no longer covers the runner as it passes.
- **Music** (`music.ts`): a synthesised beat (kick, hats, bass on an Am–F–C–G loop) from 118 to 138 BPM over the round, with claps from streak 5, an arpeggio from 10 and chord stabs from 20. The finale adds everything, a snare fill and 6 BPM. A hit muffles it for a moment and a pause fades it. It is scheduled on the audio clock, never on frame timing.
- **Variety:** three looks per obstacle kind (block: stripe, hazard slats, container ribs; hurdle: bar, laser fence, low wall with chevrons; beam: slab, truss, pipe; crate: 6 crates, 9 cubes, glass panes; orb: faceted orb, crystal in rings, gem). The shape that tells the move, its colour, icon and floor marker never change; the look comes from a hash of the wave time, so a level and its ghost always look the same. Trail motes lead into the next block's free lane or orb lane, and the runner pops them in passing (decoration, never judged). A FINAL STRETCH banner marks the last 10 s.
- **Intro** (`intro.ts`): see "How to use it".
- **Reduced motion:** no fly-in, shake, field-of-view punch, label pops, grade rise, particle sway, mote bob, celebration hop or shockwave expansion.

**How it was checked:** `npm run check`. In Chrome (headless, real Intel UHD 770 GPU), with screenshots of the demo level by a scripted player at each zone, each pose, each grade, both milestones, the finale banner, reduced motion, `?gfx=low` and `?gfx=2d`. Sound on: no console errors (headless, so not listened to). Frame rate: see "Graphics quality" above.

**Not tested:** a real webcam with a person in front of it, the demo laptop, and how the music sounds (balance against the effects: `MUSIC_VOLUME`).

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

### Requests for A (Abdo), from the camera session
None yet. Template for a `not seen`, `dropped` or `let go` row where the player really held the move:
- Move, round and time: e.g. "squat, demo level, `at` 21.40 s, rounds 1 and 3".
- The `cause` and `detail` columns, pasted.
- What the body did (e.g. "deep squat, held until the beam passed") and the pose FPS on the overlay.

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
