# Demo and pitch plan

**For the final build: `main` b27c6a6 (PRs #121 to #126), Sunday 10 AM.** The menus are the dark neon arcade look, all six levels run inside the Montreal clips, and the runner is the neon robot. The clock times were written on the rehearsal build and have not been re-timed with the camera on the final one (see "Check before the pitch" below).

The demo is one full round: **six levels of 30 s, 3 minutes of play**, through three Montreal streets. The pitch is spoken over the round, so the judges see the game the whole time. With sign-up before it and results after it, the run lasts about 4 minutes 15 seconds. Popular Vote has its own 2-minute cut (see Popular Vote below).

## Roles

| Role | Job |
| --- | --- |
| Presenter | Speaks the whole pitch. One voice. |
| Player | Plays the live round. Has practised the demo round at least five times, X pause included. |
| Operator | Stands at the laptop. Types the sign-up, clicks START, knows the panic keys, never speaks. |
| Tech lead for Q&A | Answers "how does it work" questions. Usually A or B. |

## Script

Clock times from the Presenter's first word. The round starts at 0:30 and runs 3 minutes of game time; the X pause adds about 15 s.

| Time | Who | What is on screen | What to say or do |
| --- | --- | --- | --- |
| 0:00 to 0:15 | Presenter | Landing: "Run Montréal with your body", the sign-up card, today's top 3 | Hook: "Who here has skipped a workout this week?" Then in one sentence: "It's a workout you play with your whole body, through Montreal, using only your laptop's webcam, with a coach that picks your next session." |
| 0:15 to 0:30 | Operator, Presenter | **Sign-up on the landing.** The Operator types the Player's username, clicks REGULAR under Fitness level (the card starts on Beginner, and the select screen would then say Beginner; with `?demo=1` the round is the Regular demo round either way) and clicks START. Select screen: Full body · floor · Regular preselected by `?demo=1`, CAMERA on, "6 LEVELS · 3 LIVES". The Operator clicks START; a first round shows "Try each move": the Operator presses Esc | "A username and you're in. No email, no password, and the video never leaves this laptop." |
| 0:30 to 0:36 | Player | Calibration (the Player still on the mark, about 2 s), then the 3 s fly-in and 3-2-1, GO | "It just measured the player, so every move is judged against their own body." |
| 0:36 to 1:06 | Presenter | **Level 1, Old Montreal:** Rue Saint-Paul, cobblestones. The warm-up: wider gaps, no holds | Name each move as it comes: sidestep, grab the orb (one arm), smash the crate (both arms), jump, squat and hold. |
| 1:06 to 1:36 | Presenter | Portal, "LEVEL 2". **Jacques Cartier Bridge**, on the deck. Hearts at the top | Point at the hearts: "Three lives. Hit an obstacle and you lose one; lose all three and the round is over. Every level is a little faster." |
| 1:36 to 2:06 | Presenter | Portal, "LEVEL 3". **The Old Port at blue hour**, the Clock Tower | "These are real Montreal streets, and the runner runs inside them: we line up each clip's road with the track, and the clip's speed follows the game." |
| about 2:07 | Player | Right after the "LEVEL 4" portal (the first 2 s of a level are always empty): the Player crosses their forearms in an X at chest height for 1 s. PAUSED, "Cross your arms to resume" | "Pausing without touching the laptop." Then, while paused, the privacy line: "Tracking runs in the browser. The video and the body landmarks never leave this laptop; the server only gets the score." The Player crosses again: 3-2-1, play resumes. |
| 2:25 to 3:55 | Presenter | Levels 4 to 6: the old town, the bridge and the Old Port again, each faster. Level 6 is the fastest | One line per level, then let the music play. Level 4: "Webcams are late, so each obstacle is drawn early by its move's measured lag." Level 5: "Sessions live in Postgres; each player reads only their own rows." Level 6: say nothing, let it finish. |
| 3:55 to 4:10 | Presenter | Results: ALL 6 LEVELS CLEARED (or OUT OF LIVES · LEVEL n), score, accuracy, best streak, reps per move, calories as an estimate, the coach card | "Every rep is counted. The coach reads the round and the week and picks the next session." The Player keeps arms down. |
| 4:10 to 4:20 | Operator, Presenter | LEADERBOARD in the nav bar → FRIENDS → the Operator adds a teammate's username → their best appears next to the Player's | "Add a friend by username and you're racing their best." |
| 4:20 to 4:25 | Presenter | Leaderboard (EVERYONE) | Close and invite: "The high score today is ____. Who wants to beat it?" |

**Things the run must not do with `?demo=1`:**
- Don't click "Play this next" to show the coach's pick: with `?demo=1` every round is the demo round, whatever the card says. Describe the pick instead.
- The Player keeps their arms down on the results screen. With the camera, both arms up (after 1.5 s) starts the next round.
- Don't do the X pause in the middle of a level: objects keep coming until the X holds for 1 s. Do it in the empty first 2 s after a portal.

**If the Player loses all three lives:** the round ends with OUT OF LIVES · LEVEL n and goes to results. Don't restart. The Presenter says "That's the lives" and goes on with results, coach and leaderboard; the run is just shorter.

A second hook option is a statistic. The World Health Organization reported in 2024 that about 31% of adults do not get enough physical activity. Check the number and the source before putting it on a slide.

Slides: three at most (title, one architecture picture, close). The app is the presentation, and with a 3-minute round there is little time for slides.

Before the pitch, add the teammates' usernames as the Player's friends, so the FRIENDS board isn't empty if the live add fails.

### Check before the pitch

On the final build (`src/game/backdrop.ts`): levels 1 and 4 are Old Montreal, 2 and 5 the Jacques Cartier Bridge, 3 and 6 the Old Port. The runner is the neon robot on every level. A scripted perfect keyboard round still scores 24,800.

- [ ] Time START → results with the camera (expected about 3:05: 180 s of play, 3 s intro, about 2 s of calibration) and the whole run with a stopwatch, twice.
- [ ] The clip and the realistic obstacles show on every level, at 60 FPS on the demo laptop (D shows FPS).
- [ ] The coach badge: RULES, or the Claude coach if a key was added. Fix the Q&A answers below to match.

## The demo level

- Open the app with `?demo=1`: every round is the demo round, whatever card is picked. Full body, floor, six levels (180 s), seed 11475. The select screen preselects it.
- A perfect run scores 24,800 (79 cleared, about 29 kcal). It shows every move at least twice; level 1 is the warm-up (wider gaps, no holds, no combos), and three easy waves open and close the round.
- Low impact is the same seed without hurdles (no jumps). Offer it to judges up front.
- Each level is 30 s, a little faster than the one before. No object comes within 2 s of a level boundary: that's the portal and "LEVEL n".
- Three lives. A hit on a block, hurdle, beam or crate costs one; a missed orb doesn't. After a lost life there is 1.5 s of grace, so one held beam is one mistake. The hearts are top centre.

**Ghost runner.** Players race their best run of the same round. Ghosts live in the browser, so:
- **One ghost per origin.** Rehearse on the exact URL the demo uses (`http://localhost:5173/?demo=1` on the demo laptop), or there is no ghost.
- **Low impact is a different round** (same seed, no hurdles) with its own ghost.
- **One ghost per input.** Rehearse with the camera. A round where the Operator pressed K is never stored, and neither is an out-of-lives round.

## Fallback ladder

Decide these in advance so nobody improvises in front of judges.

1. Detection misbehaves: Operator presses `R` to recalibrate. Presenter keeps talking.
   To pause without touching the laptop, the Player crosses their forearms in an X at chest height for 1 s; the same X resumes.
2. Still bad: Operator presses `K`. The Player keeps moving while the Operator plays on the keyboard. Say so openly if asked.
3. The city clips don't show (the old neon city instead): the game fell back on its own (a clip failed to load, or Low graphics under 45 FPS). Keep going; it's the same round with the same rules.
4. The backend is down or there is no network: reload with `?store=local` (same localhost URL). Sign-up, the round, results and the rule-based coach all work offline; the local store has no friends (FRIENDS shows NO FRIENDS YET; with the network down it says "Friends need the internet"), so skip that beat.
5. The app will not load: play the backup video and narrate over it.
6. The laptop dies: the second laptop already has the build open.

## Station checklist (Sunday, before judging)

- Demo laptop on power, brightness at maximum, notifications off, sleep disabled
- **Demo laptop: Patrick's Mac** (best FPS; the camera tuning was done on it). Chrome only, zoom 100 %. `git pull` on `main`, `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (never committed), `npm run dev`, open `http://localhost:5173/?demo=1`. No deploy needed, so the Vercel limit can't block it
- One full demo round played on the Mac after the pull: all six levels show their clip, FPS steady (D)
- Operator: on the select screen, after clicking a control with the mouse, Enter re-presses that control instead of starting. Click START (or press Enter only after Tab moves focus away)
- The Player's username ready (unused, or it says "Username taken"); the teammates' usernames written down for the FRIENDS beat
- Camera permission granted on `localhost:5173`; a camera rehearsal round of the demo round there (also low impact), so the ghost is there
- The Vercel URL is only for the QR code and people playing on their own devices; check it shows the latest `main`
- Supabase anonymous sign-in rate limit raised (Auth → Rate Limits), and a fresh sign-up tested on the venue wifi
- Laptop about 1 m high with the screen tilted back, facing a wall rather than the crowd
- Tape mark on the floor about 1.5 m away (calibration needs head to knees, not the feet; closer than about 1.2 m it says step back); 1.5 m clear around it; no cables on the floor. Spectators to the sides, never behind the Player
- External screen or speaker connected if available, volume tested
- Leaderboard filled with the team's real rounds; test rows deleted
- Wifi checked at the station; `?store=local` tested as the offline path
- Backup video on the desktop; second laptop ready
- QR code to the public URL printed or shown on a phone

## Popular Vote

Per the opening slides, Popular Vote is a 2-minute demo, then the audience ranks the finalists. It is not a queue at your table. A full round is 3 minutes, so it can't finish inside 2:00. **Proposal, for Greg to decide:** show the first three levels (all three places), then end the round.

### 2-minute script (proposal)

| Time | Who | What |
| --- | --- | --- |
| 0:00 to 0:10 | Presenter | Hook and the one-sentence description. The Player is already on the mark; the Operator has already chosen "Continue as" the Player and is on the select screen, Camera on |
| 0:10 to 1:45 | Operator, Player, Presenter | Operator clicks START at 0:10. Calibration, 3-2-1, then levels 1 to 3: Old Montreal, the Jacques Cartier Bridge, the Old Port. Presenter names the moves, then the hearts at level 2 |
| 1:45 to 1:50 | Player, Operator | Right after the "LEVEL 4" portal the Player crosses their arms: PAUSED. The Operator clicks END ROUND (it saves nothing) |
| 1:50 to 2:00 | Presenter | Close on the QR code: "Tracking stays on the laptop. Scan it and run Montreal on your own." |

No results or coach in this version: the round is cut before results. Rehearse it with a timer at least twice.

### Check the stage

- Ask the organisers: is there a stage or a table, how far can the player stand from the laptop (1.5 m plus 1.5 m clear is the plan), and how long is setup between finalists
- Lighting: stage lights behind or above the player can break tracking. Test at the real spot if you are allowed to
- Projector: plug in the HDMI during a test round and check the frame rate and that Chrome stays full screen
- Wifi on stage: Supabase (sign-up, saving, leaderboard, friends) needs it; without it, use `?store=local`
- Not enough room: demo the Arms workout or treadmill mode at 1 to 1.5 m. Keyboard (`K`) stays the last resort; say so openly if used

### If there is also an expo table

- Let people play, and keep the leaderboard (`?kiosk=1`) on a second screen between players
- Put the QR code where people can scan it. Everyone on the venue wifi shares one IP, so the raised anonymous sign-in limit matters here
- Keep one teammate at the table to reset the round and explain the floor mark. A 3-minute round is long for a queue: Low impact or losing the lives ends it sooner
- Record a 10-second clip of someone playing for the submission page

## Likely judge questions

**How does the tracking work?**
MediaPipe's Pose Landmarker (lite model, on the GPU with a CPU fallback) finds 33 body landmarks in every webcam frame, in the browser. Calibration takes 1.5 s of standing still and records hip position, shoulder width and torso length. Every move is a fraction of those: a squat is the hips dropping 0.3 torso lengths, a lane change is the hips moving 0.55 shoulder widths. So it adapts to height and distance.

**What did you build this weekend, and what is a library?**
The pose model is pre-trained by Google, and Supabase hosts the database and sign-in. The Montreal clips were generated with Higgsfield (an AI video tool) from prompts of those streets. Everything else is ours: calibration, move detection, the game, fitting each clip to the track, the latency compensation, the ghost runner, the level generator, lives and scoring, the schema and security rules, friends, the coach (rules and endpoint) and the UI.

**Are those real videos of Montreal?**
They're 30 s generated clips (1280×720, no sound) of real places: Rue Saint-Paul in Old Montreal, the deck of the Jacques Cartier Bridge, and the Old Port at blue hour with the Clock Tower. We measured where each clip's road vanishes and where its curbs are, and line that up with the 3D track; the clip plays at the game's speed. If a clip can't load, or the laptop drops to Low graphics, the level shows our built-in neon scenery instead and the round is unchanged.

**What is in your backend, and why does the tracking not run there?**
Postgres with row-level security for profiles, sessions and friends, anonymous sign-in with a username, a leaderboard view that exposes only each player's best (name, score, date) per workout and mode, and a serverless coach endpoint. The endpoint checks the player's token, reads their history under the same row-level security, limits each player to one call per 10 s, and asks Claude for structured JSON. No Claude key is configured for the demo, so the card shows our rule-based coach; adding the key switches the endpoint on. Tracking stays on the device on purpose: a round trip to a server would add lag you can feel in a game, and it would mean uploading video of people exercising.

**How do friends work?**
Add someone by their username and the FRIENDS tab shows their best scores next to yours. It's one-way ("you see their scores"), so nobody can put themselves on your board, and only names and scores are shared, as on the public leaderboard. It needs the network; the local store says "Friends need the internet".

**Does anything leave the laptop?**
The video and the body landmarks never do: tracking runs in the browser, and the model and its WASM are served by our own app. The server gets only the round's numbers (score, reps, accuracy) and the profile the player typed. Honest detail if pressed: Google's MediaPipe library sends anonymous usage metrics (library version, inference counts and timings). We decoded those payloads: no images, frames or landmarks (`src/pose/ROBUSTNESS.md`).

**Where is the AI?**
On screen today: the pose model, the generated Montreal clips, and a rule-based coach (the card's badge says RULES). The Claude path is built and tested up to the API call (token check, rate limit, answer validation), but has not answered with a real key. Say this plainly rather than let a judge find the RULES badge.

**Is the coach giving medical advice?**
No. The card says "General fitness encouragement, not medical advice." The rule-based coach uses only the player's own numbers (accuracy, missed moves, workouts this week) and fixed tips. The Claude prompt is limited to general encouragement with no medical, diet or body comments, its answer is validated on the server, and any failure falls back to the rules.

**How is this different from Ring Fit, Just Dance or Kinect games?**
No hardware and no install: any laptop with a webcam. The level is generated from the workout you pick, so the game is built around training goals. You race a ghost of your best run and your friends' scores. And it has a treadmill mode for people who already run.

**Webcams are laggy. How is it fair?**
We measured the lag on recorded clips: about 0.06 s for a jump up to about 0.3 s for squats and arms, plus about 0.1 s for the camera and model. With the camera, each obstacle is drawn early by its move's lag (0.1 s for a jump, 0.25 s for a sidestep, 0.3 s for squats and arms), so reacting when you see it lands inside the judging window (0.35 s before to 0.15 s after). Only the drawing moves; the rules don't. The keyboard gets no lead. A test fails if anyone lowers a lead below what the recorded clips need.

**What do PERFECT, GOOD and LATE mean?**
When the game first saw your move, relative to the object's arrival. With the camera, PERFECT is from 0.12 s early to 0.125 s late (the band is shifted for the camera's lag); earlier is GOOD, later is LATE. It's feedback only: a GOOD or LATE clear scores the same as a PERFECT.

**What are the lives for?**
So a round can be lost, which makes it a game and not a video to copy. Three per round. A hit on a block, hurdle, beam or crate costs one; a missed orb never does. For 1.5 s after a lost life no other can go, so a held beam or a block with an orb is one mistake. With none left the round ends, and results say OUT OF LIVES and the level reached.

**How does the ghost runner work?**
During a round the game records five states 20 times a second: lane, in the air, squatting, each arm. That's a few KB per round, kept in the browser. When you play the identical round again (a fingerprint of every wave), a see-through runner replays your best run, and the "+2 VS GHOST" chip comes from judging the recording with the same rules, live. Camera and keyboard ghosts are kept apart, because a keyboard run has no lag and would be unbeatable.

**How do I pause without touching the laptop?**
Cross your forearms in an X between your chest and chin and hold it for 1 s; the same X resumes. We chose an X because the pose model can't see a fist. It never fires mid-move (not while jumping, squatting or with an arm up). Tuned on Abdo's real clips at about 1.4 m: his X gives 2/2 pauses, with zero false pauses in 1,440 noisy replays of every recorded clip, and he saw it pause and resume a round live in the app (`src/pose/DECISIONS.md` 42). Rehearse it on the demo laptop. Switching tabs also pauses.

**Why only 1.5 m? Don't you need my feet?**
No: detection uses the hips and shoulders, never the feet. Calibration asks for head to knees plus a little room to squat and jump, which works out to about 1.5 m; too close and it says "step back a little". Earlier, asking for the feet made players stand so far back they couldn't read the screen. Abdo's real clips at about 1.4 m: 4/4 sidesteps, 4/4 jumps, 2/2 squats and 3/3 presses, tracking never lost, because while you squat the shoulders are enough to keep tracking even if the hips leave the frame.

**Is the leaderboard fair?**
Every round is the same six levels and 180 s, so scores compare like with like, on one board per workout and mode. Low impact (about 5 % lower, no hurdles) and the fitness level you picked share that board; say so if asked.

**What happens if the wifi drops?**
The round is played and saved on the laptop. Sessions that can't reach the server wait in a local queue and sync later, and the coach falls back to the rules. `?store=local` runs with no backend at all.

**Is it a real workout? How do you get the calorie number?**
We count actual reps per move. Calories are an estimate, labelled as one on screen: MET × 3.5 × weight ÷ 200 × active minutes, with MET 8 for Legs and Full body, 6 for Arms and Shoulders, 9 on the treadmill, and 70 kg if no weight is given. A perfect demo round (Full body, 3 minutes) is about 29 kcal. The MET values are our choice and have not been checked against the Compendium of Physical Activities; say so if asked. If a teammate has a smartwatch, show heart rate before and after a round.

**What about privacy?**
The video and body landmarks are processed on the device and never uploaded; the model itself is served from our site, not a CDN. The server stores numbers per round (reps, score, accuracy, duration, estimated calories) and the profile the player typed (username, goal, level, optional age, weight and height). Each user can read only their own rows; other players see only the leaderboard (a name and a best score), and friends see the same. No email, no password.

**Can someone fake a leaderboard score?**
Only within limits. The score is computed on the device, but the database rejects anything above 300 points per second of round (54,000 for a 180 s round; a perfect demo round is 24,800, about 138 a second), and each player can write only their own rows. So a determined person could still post a fake score under the cap. Say so, and say the fix: recompute the score on the server from the seeded level and the event log.

**Can you cheat by waving instead of squatting?**
Thresholds are relative to the calibrated body, so a squat needs real hip depth. It is not a form checker yet; squat depth scoring is on the roadmap.

**Is it safe? What about people who cannot jump?**
There is a low-impact toggle that removes hurdles (so no jumps), level 1 is always a gentle warm-up, three lost lives end the round, and treadmill mode is upper body only. Floor play needs about 1.5 m to the laptop (head to knees in view) and 1.5 m clear around the player; treadmill mode calibrates on the shoulders at 1 to 1.5 m. A player can pause hands-free by crossing their forearms in an X for 1 s.

**What happens with several people in the frame, or bad lighting?**
MediaPipe finds up to two bodies. After calibration the game follows the person nearest the player's last position at the player's size, and never switches to a newcomer. A second person close enough to be in the play area pauses the round with "Someone else is in the frame"; a spectator far behind or at the edge doesn't. When the player is lost, the game pauses with "Step back into the frame" and offers the keyboard after 3 s. Every resume counts down 3-2-1. Limits measured on the demo Mac: someone shoulder to shoulder with the player often makes the model report one body, so the round pauses until they step away; a stranger the player's size standing on the mark while the player is fully out of view is taken as the player.

**How does the difficulty work?**
The fitness level picked at sign-up (Beginner, Regular, Athlete) sets how dense the obstacles are, how long the holds last and how many combos come. Within a round, each of the six levels is faster than the last, and level 1 is a warm-up with no holds or combos. Between rounds, the coach's recommended session moves one tier up after accuracy above 85% and one tier down below 60%. For a player who entered an age of 60 or more, the coach recommends low impact (no hurdles) and says so in one sentence.

**How did you use AI tools?**
Say it plainly: AI assistants helped write code against interfaces the team designed, an AI video tool made the city clips, and the team did the architecture, the tuning in front of the camera and the playtesting.

**What was hardest?**
Have one real story ready. The likely one: a crouch before a jump looks exactly like a quick squat, by depth and by time (Greg's clips: a 0.46 s crouch at 0.55 torso lengths, a 0.51 s squat at 0.64). Only what follows tells them apart, so a short squat is counted once the player stands up, unless a jump follows within 0.35 s. Or making input lag feel fair (above). Or running inside a video: lining up a generated clip's road with a 3D track.

**What is next?**
More exercises, form feedback, server-verified scores, friend challenges, two-player mode, a phone-as-camera option for TVs, and more Montreal neighbourhoods.

**Who is it for, and how would it reach them?**
People who own no equipment and find home workouts boring, and treadmill owners who want something to do while running. It is a link, so sharing it costs nothing.
