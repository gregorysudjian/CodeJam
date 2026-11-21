# Webcam fitness app (CodeJam 16)

A workout you play with your body in front of a laptop webcam. Pick what to train (legs, arms, shoulders or full body), then sidestep, jump, squat and raise your arms to get through an obstacle course built from that workout. Every session is saved to your profile, a dashboard tracks your week, a leaderboard ranks scores, and an AI coach recommends your next session. A treadmill mode uses upper-body moves only.

It is a full-stack web application: a React and Three.js client with on-device pose tracking, Supabase Auth and Postgres, and a serverless endpoint that calls Claude.

This repository currently holds the build plan. The code is written during the hackathon by following it.

## Start here

| Doc | What it covers |
| --- | --- |
| [docs/PLAN.md](docs/PLAN.md) | Tech stack and architecture, phases with four parallel tasks each, hour-by-hour timeline, Git strategy, AI tool allocation, must-haves and stretch goals, risks |
| [docs/CONTRACTS.md](docs/CONTRACTS.md) | The TypeScript interfaces to freeze at kickoff, database schema, server endpoint, collision and level rules, detection starting values |
| [docs/DEMO.md](docs/DEMO.md) | Pitch script, demo fallbacks, station checklist, likely judge questions |
| [AGENTS.md](AGENTS.md) | Shared instructions that every AI coding tool reads |

## Team

Three people. Role C from the plan (backend and workout logic) is split between Patrick and Greg.

| Person | Role | Folders |
| --- | --- | --- |
| Abdo | A, Vision | `src/pose/` |
| Patrick | B, Game, plus workout logic | `src/game/`, `src/input/`, `src/workout/` |
| Greg | D, UI and integrator, plus backend | `src/app/`, `src/ui/`, `src/data/`, `supabase/`, `api/`, shared files |

Live: https://codejam-jet.vercel.app (deploys from `main`).

## Running locally

Available once Phase 0 of the plan is done:

```bash
cp .env.example .env.local   # then fill in the Supabase values from the group chat
npm install
npm run dev
```

Open the printed URL in Chrome and allow camera access. The AI coach endpoint (`api/`) runs only on Vercel or under `vercel dev`; locally the rule-based coach answers instead. Add `?dev=pose` for the pose debug page, or `?store=local` to run without the backend.
