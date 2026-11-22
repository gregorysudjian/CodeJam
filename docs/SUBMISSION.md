# Devpost submission: Neon Arena

The form checklist and the screenshots. The text for "About the project" is in [DEVPOST.md](DEVPOST.md). Both match `main` 28725de (PR #121): one round of 6 levels × 30 s inside the Montreal clips, 3 lives, the neon robot runner, sign-up with a unique username, and the friends leaderboard.

## Form checklist

| Devpost field | What to paste or do | Status |
| --- | --- | --- |
| Project name | **Neon Arena** | ready |
| Elevator pitch | the Tagline below (87 characters) | ready |
| About the project | the sections of [DEVPOST.md](DEVPOST.md), Inspiration to What's next, in order (Markdown works) | ready |
| Built with | the comma list under "Built with" | ready |
| Try it out (links) | `https://codejam-jet.vercel.app` and the GitHub repo | **Greg:** the repo is private until you make it public; do that before judging, or leave the GitHub link out |
| Image gallery | the JPGs in `docs/submission/` (table under "Screenshots"); 01, 05, 07 and 10 if only a few | ready; they are 16:9, so check the crop in Devpost's thumbnail preview |
| Video demo | a YouTube or Vimeo link | **Greg:** record and upload (unlisted is fine), then paste the link. Use the script in [DEMO.md](DEMO.md) |
| Team members | Abdo, Patrick, Greg | **Greg:** invite both from the project page; each accepts from their own Devpost account |
| Hackathon questions, prize tracks | whatever the CodeJam 16 form asks | **Greg** |
| Submit | before the Devpost deadline (check it on the hackathon page; the code freeze is Sunday 12:00) | **Greg** |

## Tagline

Run Montréal with your body: a webcam workout game. Your video never leaves the laptop.

## Built with

TypeScript, React, Vite, Three.js, MediaPipe (`@mediapipe/tasks-vision`, Pose Landmarker), Tailwind CSS, shadcn/ui, Radix UI, Motion, Recharts, Supabase (Auth, Postgres, row-level security), Vercel serverless functions, Claude API (`@anthropic-ai/sdk`), Vitest, Web Audio API, Higgsfield (the generated Montreal clips).

The Claude API is in the list because the coach endpoint is built on it. No key is configured on the live site, so the coach card players see is the rule-based coach (its badge says RULES). Say so if asked.

## Screenshots

Captured at 1280×720 on `main` 28725de by the scripted Chrome sweep (`docs/qa/sweep/`), in [docs/submission/](submission/), ready to upload. All are from `http://localhost:5173/?demo=1&store=local`: the fixed demo round, played **with the keyboard** by a script, on the local store. So no camera preview appears, and the boards hold only the script's own player.

| File | Screen | Shows |
| --- | --- | --- |
| [01-landing](submission/01-landing.jpg) | Landing, first visit | "Run Montréal with your body", the sign-up card with a username typed, the privacy line, the QR code |
| [02-select](submission/02-select.jpg) | Workout select | The four workouts, floor or treadmill, tier, Low impact, Camera or Keyboard, "6 LEVELS · 3 LIVES" |
| [03-tutorial](submission/03-tutorial.jpg) | "Try each move" | The first of the seven steps of the walk-through (keyboard hint) |
| [04-level-1](submission/04-level-1.jpg) | Play, level 1 | Old Montreal (Rue Saint-Paul), the neon robot, hearts, the move cue |
| [05-level-3](submission/05-level-3.jpg) | Play, level 3 | The Old Port at blue hour |
| [06-level-6](submission/06-level-6.jpg) | Play, level 6 | The Old Port again, the fastest level |
| [07-results](submission/07-results.jpg) | Results | ALL 6 LEVELS CLEARED, 24,800 at 100%, grade S, reps per move, the coach card (RULES) with NEXT UP |
| [08-dashboard](submission/08-dashboard.jpg) | Dashboard (PROGRESS) | Active minutes against the weekly goal, day streak, rounds, reps and estimated calories this week |
| [09-leaderboard](submission/09-leaderboard.jpg) | Leaderboard, EVERYONE | The Full body · floor podium, with the EVERYONE / FRIENDS, workout and mode filters |
| [10-friends](submission/10-friends.jpg) | Leaderboard, FRIENDS | The FRIENDS tab and the ADD FRIEND card. On the local store there are no friends, and adding one answers "Friends need the internet" |
| [11-kiosk](submission/11-kiosk.jpg) | `?kiosk=1` | The leaderboard-only screen: "Beat 24,800 to take the crown", the QR code |

**Retake before submitting if you can** (none of these can be scripted here):

- One shot with the **camera**, showing the preview and skeleton in the corner. The capture machine has no camera.
- The leaderboard, FRIENDS and kiosk on the **live site** with the team's real rounds and a real friend added. The local store holds one player and no friends.
