# Neon Arena: Devpost draft

## Inspiration

Working out at home is boring, so people stop. Games are not boring, and every laptop already has a camera. We wanted a workout you play with your whole body, with no controller, no install and nothing to buy, set in the city we were building it in.

## What it does

Neon Arena is a 3-lane runner in Chrome, controlled by your body through the webcam. Sidestep to change lane, jump hurdles, squat under beams, raise both arms to smash crates and one arm to grab orbs. You pick a workout (legs, arms, shoulders or full body) and the level is generated for it. A round is six 30-second levels, each faster than the last, inside AI-generated clips of real Montreal streets: Old Montreal, the Jacques Cartier Bridge and the Old Port at blue hour. You have three lives. Cross your arms in an X to pause, hands-free.

After each round: your score, reps per move, estimated calories and a coach card with a recap, a tip for the move you missed most and a recommended next session. A dashboard tracks your week, and a friends leaderboard puts your best next to theirs. Treadmill mode uses upper-body moves only; low impact removes the jumps.

## How we built it

React, TypeScript and Vite for the app; plain Three.js for the game, on its own loop outside React. MediaPipe's Pose Landmarker runs in the browser, so the video never leaves the laptop. Supabase provides sign-in and Postgres with row-level security; a Vercel function is the coach endpoint, built to ask Claude for structured advice. Three people worked in separate folders joined by one shared contract file, and every outside dependency has a stand-in: keyboard for the camera, browser storage for the database, rules for Claude.

## Challenges we ran into

- **Webcam lag.** A move reaches the game 0.1 to 0.3 s late. We measured each move's lag on recorded clips and draw obstacles that much early, so reacting on sight lands inside the judging window.
- **A crouch before a jump looks exactly like a short squat.** Only what comes next tells them apart, so a short squat counts once you stand up, unless a jump follows within 0.35 s.
- **Different bodies, different distances.** A 1.5 s calibration measures your hips, shoulders and torso, and every threshold is a fraction of those.
- **Cheating.** We probed our own live backend and found anyone could post 999,999 from DevTools. Database checks now refuse impossible scores.

## Accomplishments that we're proud of

It works with real bodies in a real room, from 1.5 m away, with no setup beyond a tape mark. The video stays on the laptop. And if anything fails, the game still runs offline on the keyboard.

## What we learned

Measure before tuning: our recorded clips settled arguments that intuition couldn't. And a stand-in for every dependency let three people build in parallel and demo with confidence.

## What's next

Form feedback (squat depth), server-verified scores, friend challenges, a two-player mode, a phone as the camera for TVs, and turning on the Claude coach.

**Try it:** https://codejam-jet.vercel.app (Chrome on a laptop with a webcam)
