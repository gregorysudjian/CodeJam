# Devpost submission: Neon Arena

Copy each section into the matching Devpost field. Everything here is checked against the code; the few things we could not verify are marked.

## Tagline

A workout you play with your whole body, using only your laptop's webcam. The video never leaves the laptop.

## Inspiration

Home workouts are free and need no equipment, and most people still stop doing them because they are boring. Motion games fix the boredom but need a console, a camera bar or a ring. We wanted the motion-game feeling with only what everyone already has: a laptop and its webcam, in a browser tab.

## What it does

You pick what to train (Legs, Arms, Shoulders or Full body) and a 3-lane neon runner is generated for that workout. Standing about 1.5 m from the laptop, you play it with your body:

| Move | In the game |
| --- | --- |
| Sidestep | Change lane to dodge a block |
| Jump | Clear a hurdle |
| Squat, and hold it | Duck under a beam |
| Both arms up | Smash a crate |
| One arm up | Grab an orb |

- **Calibration** takes 1.5 s of standing still with head to knees in view. Before your first round, "Try each move" walks through every move the round will use. Each round opens with a camera fly-in and 3-2-1.
- **Feel:** the track runs through a neon city, a tunnel and a bridge to a synthesised beat that speeds up from 118 to 138 BPM and adds layers as your streak grows. Every clear is graded PERFECT, GOOD or LATE.
- **Hands-free:** cross your forearms in an X for 1 s to pause or resume; raise both arms on the results screen to play again.
- **Low impact** removes hurdles. **Treadmill mode** uses only crates and orbs (upper body), calibrated on the shoulders at 1 to 1.5 m, for people who run.
- **Ghost runner:** when you replay a level, a see-through runner replays your best run beside you, and a chip shows whether you are ahead.
- **After each round:** score, grade, accuracy, best streak, reps per move, calories (labelled as an estimate), and a coach card with a recap, one tip for the move you missed most, and a recommended next session you can start with one click.
- **Progress:** a dashboard with active minutes this week against your goal, a day streak and reps by move, and a leaderboard per workout, mode and round length. `?kiosk=1` turns a second screen into a live leaderboard with a QR code to play.
- **No account needed:** you play as an anonymous guest and can pick a display name.
- **No camera?** Every move has a keyboard key, and `K` switches between camera and keyboard mid-round without restarting it.

## How we built it

Three people, four modules, one shared TypeScript contract file (`src/contracts/index.ts`) frozen at kickoff. Modules never import each other; only the app wires them together. Every outside dependency has a stand-in behind the same interface (keyboard for the camera, browser storage for Supabase, a rule-based coach for Claude), so each person could build and test alone from hour one.

- **Pose tracking (on device).** MediaPipe Pose Landmarker (lite model, GPU) runs in the browser on every webcam frame; the model and WASM are served from our own site, not a CDN. Calibration records hip position, shoulder width (W) and torso length (T), and every threshold is a fraction of those: a squat is the hips 0.3 T below standing height, a lane change is the hips 0.55 W off centre, a jump is the hips rising 0.15 T at more than 1 T per second. Baselines drift only while the player stands still, so stepping closer or further re-adapts. Each decision and its evidence is written down in `src/pose/DECISIONS.md` (38 entries).
- **The game.** Plain Three.js with its own loop outside React (React only re-renders the HUD 10 times a second). Each object is judged over a window, from 0.35 s before it arrives to 0.15 s after.
- **Latency compensation.** We measured how late our detector sees each move on recorded clips: jump 57 to 78 ms, sidestep 209 to 271 ms, arms 235 to 306 ms, squat 281 to 286 ms, plus about 0.1 s for the camera and model. With the camera, each obstacle is drawn early by its move's lead (0.1 s for jumps, 0.25 s for sidesteps, 0.3 s for squats and arms), so reacting on sight lands inside the judging window. Judging itself is unchanged. A test fails if anyone lowers a lead below what the clips need.
- **Levels.** A seeded generator (same seed, same level) shapes each round into warm-up, build, peak and cool-down, and enforces fairness rules: the first object at 4 s or later, at least 1.1 s between waves, 1.5 s between a beam and a hurdle, and a block always leaves a free lane at most one lane from the last one. They are tested on every workout × mode × difficulty × length × 40 seeds.
- **Ghost runner.** The game records five states (lane, airborne, ducking, each arm) at 20 Hz of game time, about 1 KB per 45 s level, in browser storage. A 64-bit fingerprint of the level makes sure a ghost only replays on the identical level. The live "vs ghost" score comes from judging the recording with a shadow copy of the game rules. Camera and keyboard ghosts are kept apart, because a keyboard run has no lag and would be unbeatable.
- **Graphics that adapt.** The game steps down its own quality (pixel ratio, then bloom) when it runs under 45 FPS, and falls back to a Canvas 2D view if WebGL cannot start.
- **Backend.** Supabase anonymous sign-in and Postgres. Row-level security on every table: a player can read and insert only their own sessions, with no update or delete. A `leaderboard` view exposes only name, workout, mode, score and date. Check constraints keep stored values in sane ranges.
- **Offline.** If the network drops, the round is still played and saved. Sessions wait in a local queue and sync later, reads time out quickly and fall back to cache, and the coach falls back to the rules. `?store=local` runs with no backend at all.
- **Coach endpoint.** A Vercel serverless function checks the player's token, reads their history through a Supabase client that carries that token (so row-level security applies on the server too and no service key is needed), and allows at most one call per player every 10 s with an atomic Postgres function. It asks Claude for JSON matching a schema, with a 7 s timeout and no retries, and validates the answer before returning it. **For the demo no Claude key is configured**, so the coach card shows the rule-based coach (it says RULES). It recommends the workout you played least this week, raises difficulty by 0.1 above 85% accuracy and lowers it below 60%, and aims the tip at your most-missed move.
- **Quality.** 699 automated tests (Vitest). A mutation sweep set each of the 23 detection thresholds to an extreme value, and every one breaks at least one test.

## Challenges we ran into

- **A crouch before a jump looks like a quick squat.** In our clips a pre-jump crouch (0.46 s, 0.55 T deep) and a real quick squat (0.51 s, 0.64 T) can't be told apart by depth or time. Only what follows separates them, so a short squat is counted when the player stands back up, unless a jump follows within 0.35 s.
- **Webcam lag made the game feel unfair.** A player who squatted exactly when a beam arrived was seen about 0.39 s late, outside the window. We measured the lag per move and moved the drawing, not the rules (above).
- **Pose froze for good on every first round.** The tutorial screen takes the video off the page; Chrome then pauses the video and stops frame callbacks, and nothing restarted them. The pose engine now resumes the video and runs a watchdog when frames stop arriving.
- **Offline reads hung for seconds.** The database client retried failed reads three times (1 + 2 + 4 s), so every offline read waited for our timeout. We turned its retries off; the store has its own offline path, and offline reads now answer in about 20 ms.
- **"New guest" could hang on bad wifi.** Signing out still called the server with no timeout while holding the auth lock. Anonymous guests lose nothing by skipping it, so sign-out now clears the stored session locally.
- **Two sign-ins at once created two users** (React's double effect in development, or a double click), and the loser fell back to local storage. Concurrent calls now share one sign-in.

## Accomplishments that we're proud of

- Body control that adapts to the player's size and distance, tested on two people's recorded clips and 11 synthetic variants of each (taller, shorter, closer, further, jitter, tilt, dropped frames).
- Latency compensation based on measured lag, not guesses.
- Every outside dependency has a fallback: no camera means the keyboard, no network means the local queue, no AI key means the rule-based coach.
- Privacy by design: the video and body landmarks never leave the laptop; the server stores only round numbers and a short profile.

## What we learned

- Agreeing on one contract file at kickoff let three people and their AI assistants work in parallel with almost no merge conflicts.
- Measuring beats tuning by feel: recorded clips turned arguments about thresholds into tests.
- Every outside dependency needs a stand-in from the start. Ours let us play full rounds before the camera code landed, and keep the demo local when we hit Vercel's daily deploy limit.
- AI coding assistants wrote much of the code against interfaces we designed. The architecture, the tuning in front of the camera and the playtesting were ours.

## What's next

- Switch on the Claude coach (the endpoint is built and rate-limited; it needs a key).
- Verify scores on the server by replaying the seeded level against the event log; today a determined player could fake a score.
- Form feedback, such as squat depth.
- Several people in frame (the picker is built and tested, but off for frame rate), then two-player mode.
- More exercises, friend challenges, and a phone as the camera for TVs.

## Built with

TypeScript, React, Vite, Three.js, MediaPipe (`@mediapipe/tasks-vision`, Pose Landmarker), Tailwind CSS, shadcn/ui, Radix UI, Motion, Recharts, Supabase (Auth, Postgres, row-level security), Vercel serverless functions, Claude API (`@anthropic-ai/sdk`), Vitest, Web Audio API.

## 60-second demo video: shot list

Record on the demo laptop at `http://localhost:5173/?demo=1` with real sessions already saved. Use a second phone or camera to film the player for shots 3 and 4, and a screen recording for the rest.

| Time | Shot | Voice-over |
| --- | --- | --- |
| 0:00 to 0:05 | Player standing 1.5 m from a laptop in a normal room | "No console, no camera bar. Just a laptop." |
| 0:05 to 0:12 | Screen: workout select, Full body, the Camera switch | "Pick what to train." |
| 0:12 to 0:17 | Screen: calibration with the skeleton on the preview | "Stand still for a second and it measures you." |
| 0:17 to 0:40 | Split screen: the player and the game, from the 3-2-1. Sidestep, orb, crate, jump, squat-and-hold, a PERFECT grade, the ghost and the "vs ghost" chip | Name each move as it happens. "That ghost is my best run." |
| 0:40 to 0:48 | Screen: results with the coach card | "Reps, accuracy, and a coach that picks your next session." |
| 0:48 to 0:54 | Screen: dashboard, then leaderboard | "Your week, and everyone's best scores." |
| 0:54 to 1:00 | Screen: a title card | "Tracking runs in the browser. The video never leaves your laptop." |

## Screenshots

Real captures at 1920×1080 from `main` (bb17780 and bff0541), in [docs/submission/](submission/), ready to upload. All are from `http://localhost:5173/?demo=1&store=local` (the 45 s demo level) played **with the keyboard** by a script, so no camera preview appears; the ghost is an earlier, weaker run of the same level.

| File | Screen | Shows |
| --- | --- | --- |
| [01-landing](submission/01-landing.jpg) | Landing, first visit | "Your body is the controller", Play as guest, the privacy line |
| [02-select](submission/02-select.jpg) | Workout select | Four workouts, floor/treadmill, 45/90/180 s, Low impact, Camera/Keyboard |
| [03-tutorial](submission/03-tutorial.jpg) | "Try each move" | First of six moves (keyboard hint) |
| [04-zone-city](submission/04-zone-city.jpg) | Play, city | Crate wall, ARMS UP cue, "EVEN VS GHOST" |
| [05-zone-tunnel](submission/05-zone-tunnel.jpg) | Play, tunnel | Silver ghost runner ("YOUR BEST") beside the player, PERFECT, "+4 VS GHOST" chip bottom right |
| [06-zone-bridge](submission/06-zone-bridge.jpg) | Play, bridge | Cable bridge, ghost in another lane, 13 combo, "+7 VS GHOST" |
| [07-zone-finale](submission/07-zone-finale.jpg) | Play, finale | Dusk sky, PERFECT, 21 combo, "+8 VS GHOST" |
| [08-perfect](submission/08-perfect.jpg) | Play, tunnel | PERFECT and +200 right after a clear |
| [09-milestone](submission/09-milestone.jpg) | Play, finale | "20 COMBO!" banner at bottom centre (clear of the REACH cue since #46), PERFECT, +150 ORB |
| [10-results](submission/10-results.jpg) | Results | 4,750 at 100%, grade S, reps per move, coach card (RULES) with NEXT UP |
| [11-dashboard](submission/11-dashboard.jpg) | Dashboard | Weekly ring, day streak, 7-day chart, reps by move, coach's pick |
| [12-leaderboard](submission/12-leaderboard.jpg) | Leaderboard | Podium with filters |
| [13-kiosk](submission/13-kiosk.jpg) | `?kiosk=1` | "Beat 4,750 to take the crown", QR code |

**Retake before submitting if you can:**
- One shot with the **camera**, showing the preview and skeleton in the corner, and `?dev=pose` (landmarks and threshold lines). This machine has no camera.
- The leaderboard and kiosk on the **live site** after the team's real rounds: the local store holds one player, so the podium shows a single name.

Select, results and dashboard were retaken on `main` bb17780 after the UI fixes in #41; the game frames (04–09) on bff0541 after the new scenery colours and icons in #42.
