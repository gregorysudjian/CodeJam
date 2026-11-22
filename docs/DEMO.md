# Demo and pitch plan

Target length: 2 minutes 40 seconds for the judges. Shorter talk means more Q&A, and Q&A is where a judge plays. Popular Vote has its own 2-minute version (see Popular Vote below).

## Roles

| Role | Job |
| --- | --- |
| Presenter | Speaks the whole pitch. One voice. |
| Player | Plays the live round. Has practised the 45-second demo level at least ten times. |
| Operator | Stands at the laptop. Starts the round, knows the panic keys, never speaks. |
| Tech lead for Q&A | Answers "how does it work" questions. Usually A or B. |

## Script

| Time | Who | What |
| --- | --- | --- |
| 0:00 to 0:20 | Presenter | Hook. "Who here has skipped a workout this week?" Then one line on the problem: working out at home is boring, so people stop. |
| 0:20 to 0:35 | Presenter | What it is, in one sentence: "It's a workout you play with your whole body, using only your laptop's webcam, with a coach that recommends your next session from how you did." |
| 0:35 to 1:30 | Player, Operator, Presenter | Live round. `?demo=1` has already selected Full body, and the switch shows Camera (preselected when the laptop has a camera; the Operator checks it). The Operator clicks Start. The Player stands on the tape mark (about 1.5 m) and holds still for about 1.5 s to calibrate; the round then opens with a 3 s camera fly-in and 3-2-1, GO (there is no "raise both arms to start"). The Presenter fills the countdown: "It just measured the player, so every move is judged against their own body." The Presenter names each move as it comes: sidestep, grab the orb (one arm), smash the crate (both arms), jump, squat and hold. If a ghost was rehearsed on this URL with the camera: "The see-through runner is our best rehearsal; the chip at the bottom right says whether we're ahead." Point once at a PERFECT label and at the tunnel and bridge as the track changes. **Timing:** START to results measured at 50 s (keyboard); calibration adds 2 to 4 s with the camera, so START at 0:35 gives results at about 1:28. |
| 1:30 to 1:55 | Presenter | The loop around the game. Results: score and grade, accuracy, best streak, reps per move, calories labelled as an estimate. Coach card (its badge says RULES): a recap from the numbers, one tip for the move missed most, and a recommended next session. Dashboard: active minutes this week against the weekly goal, and the day streak. Leaderboard: best score per workout, mode and round length, so a judge's 45 s round is never up against a 3-minute one. |
| 1:55 to 2:25 | Presenter | How it works: "Tracking runs in the browser, and the video never leaves the laptop. Every threshold is a fraction of your own body, measured at calibration. Webcam moves arrive late, so the game draws obstacles early by each move's measured lag. Sessions live in Postgres, and each player can read only their own rows. The coach reads your history and recommends the next session. Today that's our rule-based coach; the server endpoint is built to hand this to Claude, rate-limited, and switches on when a key is added. And treadmill mode gives runners upper-body moves." |
| 2:25 to 2:40 | Presenter | Close and invite: "The high score today is ____. Who wants to beat it?" |

**Things the script must not do with `?demo=1`:**
- Don't click "Play this next" to show the coach's pick: with `?demo=1` every round is the demo level, so it plays Full body 45 s again, whatever the card says. Describe the pick instead.
- The Player keeps their arms down on the results screen. With the camera, both arms up (after 1.5 s) starts the next round.

A second hook option is a statistic. The World Health Organization reported in 2024 that about 31% of adults do not get enough physical activity. Check the number and the source before putting it on a slide.

Slides: three at most (title, one architecture picture, close). The app is the presentation.

Before the pitch, the Player's account should already hold a few real sessions from Saturday, so the dashboard and the coach have history to show.

## The demo level

- Use the 45-second preset with a fixed `seed`, so the round is the same every time and the Player knows it.
- It should show each move at least twice, end on a streak, and avoid the hardest combos.
- For a judge's turn, use the same preset with the low-impact toggle offered up front.
- Open the app with `?demo=1`: every round is the fixed 45 s demo level (seed 41492), and the select screen preselects it.
- A round opens with a 3 s camera fly-in and 3-2-1 before GO: allow about 50 s from Start to results.

**Ghost runner.** Players race their best run of the same level. Ghosts live in the browser, so:
- **One ghost per origin.** Ghosts are stored per URL: rehearse on the exact URL the demo uses (`http://localhost:5173/?demo=1` on Patrick's Mac), or there is no ghost.
- **Low impact is a different level** (same seed, no hurdles) with its own ghost. Rehearse it once if judges will get it.
- **One ghost per input.** Rehearse with the camera, since judges play with their body. A round where the Operator pressed K is never stored.

## Fallback ladder

Decide these in advance so nobody improvises in front of judges.

1. Detection misbehaves: Operator presses `R` to recalibrate. Presenter keeps talking.
   To pause without touching the laptop, the Player crosses their forearms in an X at chest height for 1 s; the same X resumes.
2. Still bad: Operator presses `K`. The Player keeps moving while the Operator plays on the keyboard. Say so openly if asked.
3. The backend is down or there is no network: reload with `?store=local` (same localhost URL). The round, results and rule-based coach all work offline.
4. The app will not load: play the backup video and narrate over it.
5. The laptop dies: the second laptop already has the build open.

## Station checklist (Sunday 8:00 AM)

- Demo laptop on power, brightness at maximum, notifications off, sleep disabled
- **Demo laptop: Patrick's Mac** (best FPS; the camera tuning was done on it). Chrome only. `git pull` on `main`, `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (never committed), `npm run dev`, open `http://localhost:5173/?demo=1`. No deploy needed, so the Vercel limit can't block it
- The coach card is the rule-based coach (no Claude key for now)
- Operator: on the select screen, after clicking a control with the mouse, Enter re-presses that control instead of starting. Click START (or press Enter only after Tab moves focus away)
- Camera permission granted on `localhost:5173`; a camera rehearsal round of the demo level there (also low impact), so the ghost is there
- The Vercel URL is only for the QR code and people playing on their own devices; check it shows the latest `main`
- Supabase anonymous sign-in rate limit raised (Auth → Rate Limits), and a fresh guest sign-in tested on the venue wifi
- Laptop about 1 m high with the screen tilted back, facing a wall rather than the crowd
- Tape mark on the floor about 1.5 m away (calibration needs head to knees, not the feet; closer than about 1.2 m it says step back); 1.5 m clear around it; no cables on the floor
- External screen or speaker connected if available, volume tested
- Leaderboard and the Player's dashboard filled with the team's real sessions; test rows deleted
- Wifi checked at the station; `?store=local` tested as the offline path
- Backup video on the desktop; second laptop ready
- QR code to the public URL printed or shown on a phone

## Popular Vote

Per the opening slides, Popular Vote is a 2-minute demo, then the audience ranks the finalists. It is not a queue at your table, so the script must fit 2:00 and the webcam has to work on a stage you have not tested yet.

### 2-minute script

| Time | Who | What |
| --- | --- | --- |
| 0:00 to 0:12 | Presenter | Hook and the one-sentence description from the main script. The Player is already on the mark, Camera selected |
| 0:12 to 1:05 | Operator, Player, Presenter | Operator clicks START at 0:12. Calibration (about 2 s, it happens after START, every round), 3 s fly-in and 3-2-1, the 45 s round, results at about 1:05. Presenter names the moves |
| 1:05 to 1:35 | Presenter | Results, coach card, leaderboard: one line each. Skip the dashboard. Player keeps arms down (both arms up replays) |
| 1:35 to 1:50 | Presenter | How it works in one line: tracking on the laptop, video never leaves it, and a coach that reads your history and recommends your next session |
| 1:50 to 2:00 | Presenter | Close on the QR code: "Scan it and play on your own laptop." |

No architecture slide in this version. Rehearse it with a timer at least twice. Measured on `main` (keyboard, `?demo=1`): START → HUD 0.8 s, then the 3 s intro, results 50.1 s after START (Sat 15:50) and 50.2 s (Sat 16:30, ba46d74), rule-based coach card at once. Not yet timed with the camera.

### Check the stage on Saturday

- Ask the organisers: is there a stage or a table, how far can the player stand from the laptop (1.5 m plus 1.5 m clear is the plan), and how long is setup between finalists
- Lighting: stage lights behind or above the player can break tracking. Test at the real spot if you are allowed to
- Projector: plug in the HDMI during a test round and check the frame rate and that Chrome stays full screen
- Wifi on stage: Supabase (saving, leaderboard) needs it; without it, use `?store=local`
- Not enough room: demo the Arms workout or treadmill mode at 1 to 1.5 m. Keyboard (`K`) stays the last resort; say so openly if used

### If there is also an expo table

- Let people play, and keep the leaderboard on screen between players
- Put the QR code where people can scan it. Everyone on the venue wifi shares one IP, so the raised anonymous sign-in limit matters here
- Keep one teammate at the table to reset the round and explain the floor mark
- Record a 10-second clip of someone playing for the submission page

## Likely judge questions

**How does the tracking work?**
MediaPipe's Pose Landmarker (lite model, on the GPU with a CPU fallback) finds 33 body landmarks in every webcam frame, in the browser. Calibration takes 1.5 s of standing still and records hip position, shoulder width and torso length. Every move is a fraction of those: a squat is the hips dropping 0.3 torso lengths, a lane change is the hips moving 0.55 shoulder widths. So it adapts to height and distance.

**What did you build this weekend, and what is a library?**
The pose model is pre-trained by Google, and Supabase hosts the database and sign-in. Everything else is ours: calibration, move detection, the game, the latency compensation, the ghost runner, the level generator, scoring, the schema and security rules, the coach (rules and endpoint) and the UI.

**What is in your backend, and why does the tracking not run there?**
Postgres with row-level security for profiles and sessions, anonymous sign-in, a leaderboard view that exposes only each player's best (name, score, date) per workout, mode and round length, and a serverless coach endpoint. The endpoint checks the player's token, reads their history under the same row-level security, limits each player to one call per 10 s, and asks Claude for structured JSON. No Claude key is configured for the demo, so the card shows our rule-based coach; adding the key switches the endpoint on. Tracking stays on the device on purpose: a round trip to a server would add lag you can feel in a game, and it would mean uploading video of people exercising.

**Does anything leave the laptop?**
The video and the body landmarks never do: tracking runs in the browser, and the model and its WASM are served by our own app. The server gets only the round's numbers (score, reps, accuracy) and the profile the player typed. Honest detail if pressed: Google's MediaPipe library sends anonymous usage metrics (library version, inference counts and timings). We decoded those payloads: no images, frames or landmarks (`src/pose/ROBUSTNESS.md`).

**Where is the AI?**
On screen today: the pose model, and a rule-based coach (the card's badge says RULES). The Claude path is built and tested up to the API call (token check, rate limit, answer validation), but has not answered with a real key. Say this plainly rather than let a judge find the RULES badge.

**Is the coach giving medical advice?**
No. The card says "General fitness encouragement, not medical advice." The rule-based coach uses only the player's own numbers (accuracy, missed moves, workouts this week) and fixed tips. The Claude prompt is limited to general encouragement with no medical, diet or body comments, its answer is validated on the server, and any failure falls back to the rules.

**How is this different from Ring Fit, Just Dance or Kinect games?**
No hardware and no install: any laptop with a webcam. The level is generated from the workout you pick, so the game is built around training goals. You race a ghost of your best run. And it has a treadmill mode for people who already run.

**Webcams are laggy. How is it fair?**
We measured the lag on recorded clips: about 0.06 s for a jump up to about 0.3 s for squats and arms, plus about 0.1 s for the camera and model. With the camera, each obstacle is drawn early by its move's lag (0.1 s for a jump, 0.25 s for a sidestep, 0.3 s for squats and arms), so reacting when you see it lands inside the judging window (0.35 s before to 0.15 s after). Only the drawing moves; the rules don't. The keyboard gets no lead. A test fails if anyone lowers a lead below what the recorded clips need.

**What do PERFECT, GOOD and LATE mean?**
When the game first saw your move, relative to the object's arrival. With the camera, PERFECT is from 0.12 s early to 0.125 s late (the band is shifted for the camera's lag); earlier is GOOD, later is LATE. It's feedback only: a GOOD or LATE clear scores the same as a PERFECT.

**How does the ghost runner work?**
During a round the game records five states 20 times a second: lane, in the air, squatting, each arm. That's about 1 KB per 45 s level, kept in the browser. When you play the identical level again (a fingerprint of every wave), a see-through runner replays your best run, and the "+2 VS GHOST" chip comes from judging the recording with the same rules, live. Camera and keyboard ghosts are kept apart, because a keyboard run has no lag and would be unbeatable.

**Why the city, tunnel and bridge?**
So a 45 s round feels like a journey: the tunnel starts at 30% of the round, the bridge at 52%, and the last 10 s are the finale. The beat speeds up from 118 to 138 BPM and adds layers at streaks of 5, 10 and 20. On a slow laptop the game drops the scenery extras first (towers, skyline, particles) when it runs under 45 FPS; the track and obstacles always stay.

**How do I pause without touching the laptop?**
Cross your forearms in an X between your chest and chin and hold it for 1 s; the same X resumes. We chose an X because the pose model can't see a fist. It never fires mid-move (not while jumping, squatting or with an arm up). Tuned on Abdo's real clips at about 1.4 m: his X gives 2/2 pauses, with zero false pauses in 1,440 noisy replays of every recorded clip, and he saw it pause and resume a round live in the app (`src/pose/DECISIONS.md` 42, `HANDOFF.md`). Rehearse it on the demo laptop. Switching tabs also pauses.

**Why only 1.5 m? Don't you need my feet?**
No: detection uses the hips and shoulders, never the feet. Calibration asks for head to knees plus a little room to squat and jump, which works out to about 1.5 m; too close and it says "step back a little". Earlier, asking for the feet made players stand so far back they couldn't read the screen. Abdo's real clips at about 1.4 m: 4/4 sidesteps, 4/4 jumps, 2/2 squats and 3/3 presses, tracking never lost, because while you squat the shoulders are enough to keep tracking even if the hips leave the frame.

**Doesn't a longer round always win?**
It would, so there is one board per round length (45, 90, 180 s), and the landing page and kiosk show the 45 s board that judges play. Patrick replayed every level through the real scorer: with perfect play a 180 s round scores about 6× a 45 s one (Full body floor: 5,033 vs 30,790), and even an 80% run at 180 s beats a perfect 45 s run. Points per minute wouldn't fix it either: long rounds reach the ×3 and ×4 streak multipliers, so perfect play rises from about 6,700 to 10,300 points a minute. Low impact still shares a board (about 5% lower; accepted).

**What happens if the wifi drops?**
The round is played and saved on the laptop. Sessions that can't reach the server wait in a local queue and sync later, and the coach falls back to the rules. `?store=local` runs with no backend at all.

**Is it a real workout? How do you get the calorie number?**
We count actual reps per move. Calories are an estimate, labelled as one on screen: MET × 3.5 × weight ÷ 200 × active minutes, with MET 8 for Legs and Full body, 6 for Arms and Shoulders, 9 on the treadmill, and 70 kg if no weight is given. A 45 s Full body round is about 7 kcal. The MET values are our choice and have not been checked against the Compendium of Physical Activities; say so if asked. If a teammate has a smartwatch, show heart rate before and after a round.

**What about privacy?**
The video and body landmarks are processed on the device and never uploaded; the model itself is served from our site, not a CDN. The server stores numbers per round (reps, score, accuracy, duration, estimated calories) and the profile the player typed (name, goal, level, weekly goal, optional weight). Each user can read only their own rows, and other players see only the leaderboard: a name and a best score. Guests are anonymous: no email, no password.

**Can someone fake a leaderboard score?**
Today, yes, a determined person could, because the score is computed on the device. Say so, and say the fix: recompute the score on the server from the seeded level and the event log.

**Can you cheat by waving instead of squatting?**
Thresholds are relative to the calibrated body, so a squat needs real hip depth. It is not a form checker yet; squat depth scoring is on the roadmap.

**Is it safe? What about people who cannot jump?**
There is a low-impact toggle that removes hurdles (so no jumps), every round starts with an easier warm-up, and treadmill mode is upper body only. Floor play needs about 1.5 m to the laptop (head to knees in view) and 1.5 m clear around the player; treadmill mode calibrates on the shoulders at 1 to 1.5 m. A player can pause hands-free by crossing their forearms in an X for 1 s.

**What happens with several people in the frame, or bad lighting?**
MediaPipe finds up to two bodies. After calibration the game follows the person nearest the player's last position at the player's size, and never switches to a newcomer. A second person close enough to be in the play area pauses the round with "Someone else is in the frame"; a spectator far behind or at the edge doesn't. When the player is lost, the game pauses with "Step back into the frame" and offers the keyboard after 3 s. Every resume counts down 3-2-1. Limits measured on the demo Mac: someone shoulder to shoulder with the player often makes the model report one body, so the round pauses until they step away; a stranger the player's size standing on the mark while the player is fully out of view is taken as the player.

**How does the difficulty work?**
Within a round there is a warm-up, a build, a peak and a cool-down; gaps shorten and moves combine as it goes. Between rounds, the coach's recommended session raises difficulty by 0.1 after accuracy above 85% and lowers it by 0.1 below 60%.

**How did you use AI tools?**
Say it plainly: AI assistants helped write code against interfaces the team designed, and the team did the architecture, the tuning in front of the camera and the playtesting.

**What was hardest?**
Have one real story ready. The likely one: a crouch before a jump looks exactly like a quick squat, by depth and by time (Greg's clips: a 0.46 s crouch at 0.55 torso lengths, a 0.51 s squat at 0.64). Only what follows tells them apart, so a short squat is counted once the player stands up, unless a jump follows within 0.35 s. Or making input lag feel fair (above).

**What is next?**
More exercises, form feedback, server-verified scores, friend challenges, two-player mode, a phone-as-camera option for TVs.

**Who is it for, and how would it reach them?**
People who own no equipment and find home workouts boring, and treadmill owners who want something to do while running. It is a link, so sharing it costs nothing.
