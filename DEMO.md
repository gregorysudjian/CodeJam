# Demo and pitch plan

Target length: 2 minutes 40 seconds. Shorter talk means more Q&A, and Q&A is where a judge plays.

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
| 0:20 to 0:35 | Presenter | What it is, in one sentence: "It's a workout you play with your whole body, using only your laptop's webcam, with a coach that builds your next level from how you did." |
| 0:35 to 1:30 | Player and Presenter | Live round. Player picks Full body, raises both arms to start, plays the 45-second demo level. Presenter names each move as it happens: sidestep, jump, squat, press. |
| 1:30 to 1:55 | Presenter | The loop around the game. Results: reps per move, estimated calories, score. Coach card: what went well and the recommended next session. Dashboard: the week so far against the goal. Leaderboard. |
| 1:55 to 2:25 | Presenter | How it works: tracking runs on the laptop and the video never leaves it; sessions are stored in Postgres behind per-user security; a server endpoint asks Claude for the coaching and the level generator builds what it recommends; treadmill mode for runners. |
| 2:25 to 2:40 | Presenter | Close and invite: "The high score today is ____. Who wants to beat it?" |

A second hook option is a statistic. The World Health Organization reported in 2024 that about 31% of adults do not get enough physical activity. Check the number and the source before putting it on a slide.

Slides: three at most (title, one architecture picture, close). The app is the presentation.

Before the pitch, the Player's account should already hold a few real sessions from Saturday, so the dashboard and the coach have history to show.

## The demo level

- Use the 45-second preset with a fixed `seed`, so the round is the same every time and the Player knows it.
- It should show each move at least twice, end on a streak, and avoid the hardest combos.
- For a judge's turn, use the same preset with the low-impact toggle offered up front.

## Fallback ladder

Decide these in advance so nobody improvises in front of judges.

1. Detection misbehaves: Operator presses `R` to recalibrate. Presenter keeps talking.
2. Still bad: Operator presses `K`. The Player keeps moving while the Operator plays on the keyboard. Say so openly if asked.
3. The network or the backend is down: reload with `?store=local`. The round, results and rule-based coach all work offline.
4. The app will not load: play the backup video and narrate over it.
5. The laptop dies: the second laptop already has the build open.

## Station checklist (Sunday 8:00 AM)

- Demo laptop on power, brightness at maximum, notifications off, sleep disabled
- Chrome only, camera permission already granted, the app running from `npm run preview`
- Laptop about 1 m high with the screen tilted back, facing a wall rather than the crowd
- Tape mark on the floor 2.2 m away; 2 m clear around it; no cables on the floor
- External screen or speaker connected if available, volume tested
- Leaderboard and the Player's dashboard filled with the team's real sessions; test rows deleted
- Wifi checked at the station; `?store=local` tested as the offline path
- Backup video on the desktop; second laptop ready
- QR code to the public URL printed or shown on a phone

## Popular Vote

- Let people play. A queue at the table is the best advertisement.
- Keep the leaderboard on screen between players. "Beat the high score" brings people back with friends.
- Put the QR code where a waiting person can scan it, so they can try it on their own laptop.
- Keep one teammate at the table at all times to reset the round and explain the floor mark.
- Record a 10-second clip of someone playing for the submission page.

## Likely judge questions

**How does the tracking work?**
MediaPipe Pose finds 33 body landmarks in every webcam frame, in the browser. We calibrate on the player's standing pose and measure each move as a fraction of their own torso length and shoulder width, so it adapts to height and distance.

**What did you build this weekend, and what is a library?**
The pose model is pre-trained by Google, and Supabase hosts the database and sign-in. Everything else is ours: calibration, move detection, the game, the level generator, scoring, the schema and security rules, the coach endpoint and the UI.

**What is in your backend, and why does the tracking not run there?**
Postgres with per-user row-level security for profiles and sessions, anonymous sign-in, and a server endpoint that turns a user's history into coaching through Claude. Tracking stays on the device on purpose: a round trip to a server would add lag you can feel in a game, and it would mean uploading video of people exercising.

**Is the AI coach giving medical advice?**
No. It is limited to general encouragement and picking the next session from the player's own numbers, its answer is validated on the server, and a rule-based coach takes over if it fails.

**How is this different from Ring Fit, Just Dance or Kinect games?**
No hardware and no install: any laptop with a webcam. The level is generated from the workout you pick, so the game is built around training goals. And it has a treadmill mode for people who already run.

**Is it a real workout? How do you get the calorie number?**
We count actual reps per move. Calories are an estimate from a standard MET formula and are labelled as an estimate. Give the measured numbers here: reps in a 90-second Legs round, and heart rate before and after if someone has a smartwatch.

**What about privacy?**
The video is processed on the device and never uploaded. The server stores only numbers: reps, scores, durations. Each user can read only their own sessions, and the leaderboard shows a name and a score.

**Can someone fake a leaderboard score?**
Today, yes, a determined person could, because the score is computed on the device. Say so, and say the fix: recompute the score on the server from the seeded level and the event log.

**Can you cheat by waving instead of squatting?**
Thresholds are relative to the calibrated body, so a squat needs real hip depth. It is not a form checker yet; squat depth scoring is on the roadmap.

**Is it safe? What about people who cannot jump?**
There is a low-impact toggle that removes jumps, rounds start with a warm-up, and treadmill mode is upper body only. It can be played in a small space.

**What happens with several people in the frame, or bad lighting?**
We track the largest, most central person and pause when the player is lost. Be honest about the limits you measured.

**How does the difficulty work?**
Within a round there is a warm-up, a build, a peak and a cool-down; gaps shorten and moves combine as it goes. Between rounds, the coach raises or lowers the difficulty from your accuracy.

**How did you use AI tools?**
Say it plainly: AI assistants helped write code against interfaces the team designed, and the team did the architecture, the tuning in front of the camera and the playtesting.

**What was hardest?**
Have one real story ready. The likely one is telling a jump apart from standing up out of a squat, or making input lag feel fair.

**What is next?**
More exercises, form feedback, server-verified scores, friend challenges, two-player mode, a phone-as-camera option for TVs.

**Who is it for, and how would it reach them?**
People who own no equipment and find home workouts boring, and treadmill owners who want something to do while running. It is a link, so sharing it costs nothing.
