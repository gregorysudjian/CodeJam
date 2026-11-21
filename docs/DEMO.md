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
| 0:35 to 1:30 | Player, Operator, Presenter | Live round. `?demo=1` has already selected Full body, and the Operator has set the switch to Camera. The Operator clicks Start. The Player stands on the tape mark and holds still for about 1.5 s to calibrate, and the 45-second demo level starts at once (there is no "raise both arms to start"). The Presenter names each move as it comes: sidestep, grab the orb (one arm), smash the crate (both arms), jump, squat and hold. If a ghost was rehearsed on this URL with the camera: "The see-through runner is our best rehearsal; the chip at the top says whether we're ahead." |
| 1:30 to 1:55 | Presenter | The loop around the game. Results: score and grade, accuracy, best streak, reps per move, calories labelled as an estimate. Coach card (its badge says RULES): a recap from the numbers, one tip for the move missed most, and a recommended next session. Dashboard: active minutes this week against the weekly goal, and the day streak. Leaderboard: best score per workout and mode. |
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
| 0:00 to 0:15 | Presenter | Hook and the one-sentence description from the main script |
| 0:15 to 1:05 | Player and Presenter | The 45-second seeded demo round. Calibrate during setup, before the clock starts. Presenter names the moves |
| 1:05 to 1:35 | Presenter | Results, coach card, leaderboard: one line each. Skip the dashboard. Player keeps arms down (both arms up replays) |
| 1:35 to 1:50 | Presenter | How it works in one line: tracking on the laptop, video never leaves it, and a coach that reads your history and recommends your next session |
| 1:50 to 2:00 | Presenter | Close on the QR code: "Scan it and play on your own laptop." |

No architecture slide in this version. Rehearse it with a timer at least twice.

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
MediaPipe's Pose Landmarker (lite model, on the GPU) finds 33 body landmarks in every webcam frame, in the browser. Calibration takes 1.5 s of standing still and records hip position, shoulder width and torso length. Every move is a fraction of those: a squat is the hips dropping 0.3 torso lengths, a lane change is the hips moving 0.55 shoulder widths. So it adapts to height and distance.

**What did you build this weekend, and what is a library?**
The pose model is pre-trained by Google, and Supabase hosts the database and sign-in. Everything else is ours: calibration, move detection, the game, the latency compensation, the ghost runner, the level generator, scoring, the schema and security rules, the coach (rules and endpoint) and the UI.

**What is in your backend, and why does the tracking not run there?**
Postgres with row-level security for profiles and sessions, anonymous sign-in, a leaderboard view that exposes only name and score, and a serverless coach endpoint. The endpoint checks the player's token, reads their history under the same row-level security, limits each player to one call per 10 s, and asks Claude for structured JSON. No Claude key is configured for the demo, so the card shows our rule-based coach; adding the key switches the endpoint on. Tracking stays on the device on purpose: a round trip to a server would add lag you can feel in a game, and it would mean uploading video of people exercising.

**Where is the AI?**
On screen today: the pose model, and a rule-based coach (the card's badge says RULES). The Claude path is built and tested up to the API call (token check, rate limit, answer validation), but has not answered with a real key. Say this plainly rather than let a judge find the RULES badge.

**Is the coach giving medical advice?**
No. The card says "General fitness encouragement, not medical advice." The rule-based coach uses only the player's own numbers (accuracy, missed moves, workouts this week) and fixed tips. The Claude prompt is limited to general encouragement with no medical, diet or body comments, its answer is validated on the server, and any failure falls back to the rules.

**How is this different from Ring Fit, Just Dance or Kinect games?**
No hardware and no install: any laptop with a webcam. The level is generated from the workout you pick, so the game is built around training goals. You race a ghost of your best run. And it has a treadmill mode for people who already run.

**Webcams are laggy. How is it fair?**
We measured the lag on recorded clips: about 0.06 s for a jump up to about 0.3 s for squats and arms, plus about 0.1 s for the camera and model. With the camera, each obstacle is drawn early by its move's lag, so reacting when you see it lands inside the judging window (0.35 s before to 0.15 s after). The keyboard gets no lead.

**What happens if the wifi drops?**
The round is played and saved on the laptop. Sessions that can't reach the server wait in a local queue and sync later, and the coach falls back to the rules. `?store=local` runs with no backend at all.

**Is it a real workout? How do you get the calorie number?**
We count actual reps per move. Calories are an estimate from a standard MET formula and are labelled as an estimate. Give the measured numbers here: reps in a 90-second Legs round, and heart rate before and after if someone has a smartwatch.

**What about privacy?**
The video is processed on the device and never uploaded. The server stores only numbers: reps, scores, durations. Each user can read only their own sessions, and the leaderboard shows a name and a score.

**Can someone fake a leaderboard score?**
Today, yes, a determined person could, because the score is computed on the device. Say so, and say the fix: recompute the score on the server from the seeded level and the event log.

**Can you cheat by waving instead of squatting?**
Thresholds are relative to the calibrated body, so a squat needs real hip depth. It is not a form checker yet; squat depth scoring is on the roadmap.

**Is it safe? What about people who cannot jump?**
There is a low-impact toggle that removes hurdles (so no jumps), every round starts with an easier warm-up, and treadmill mode is upper body only. Treadmill mode calibrates on the shoulders at 1 to 1.5 m, so it fits a small space.

**What happens with several people in the frame, or bad lighting?**
MediaPipe is set to find one body, for frame rate. A picker for several bodies (largest, nearest the player's last position, ignoring bodies of a very different size) is built and tested on recorded clips but not switched on. When the player is lost, the game pauses with "Step back into the frame", resumes when they return, and after 3 s offers the keyboard. Be honest about the limits you measured.

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
