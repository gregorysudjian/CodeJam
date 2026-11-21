# Instructions for AI coding tools

Read this before any task. It applies to Claude Code, Codex, Cursor and Gemini alike.

## Project

A full-stack webcam fitness app for the CodeJam 16 hackathon. Hard code freeze is Sunday 12:00 PM Montreal time.

- **Game:** the player's body controls a 3-lane runner: sidestep to change lane, jump over hurdles, squat under beams, raise both arms to smash crates, raise one arm to grab orbs. The chosen workout (legs, arms, shoulders, full body) decides the mix of moves.
- **Backend:** Supabase Auth and Postgres store profiles and workout sessions. A serverless endpoint asks Claude for a recap and a recommended next session.
- **Progress:** dashboard, leaderboard, coach card.

Docs:

- Full plan: `docs/PLAN.md`
- Interfaces, database schema, endpoint, collision rules, detection thresholds: `docs/CONTRACTS.md`
- Pitch and judge Q&A: `docs/DEMO.md`

## Stack

Vite, React, TypeScript (strict), Tailwind, shadcn/ui, Recharts, plain Three.js, `@mediapipe/tasks-vision`, Supabase (`@supabase/supabase-js`), Vercel serverless functions, Claude API, Vitest. Chrome only.

## Folder ownership

| Folder | Owner | Contents |
| --- | --- | --- |
| `src/pose/` | A | Camera, MediaPipe, calibration, move detection |
| `src/game/`, `src/input/` | B | Three.js runner, keyboard input, game audio |
| `src/workout/` | C | Level generation, scoring, stats |
| `src/data/`, `supabase/`, `api/` | C | Data store (Supabase and local), SQL migrations, server endpoint |
| `src/app/`, `src/ui/` | D | Screens, HUD, dashboard, wiring |
| `src/contracts/` and all config | D only | Shared types and project setup |

## Rules

1. Edit only the folders the human tells you they own. If a task seems to need a change elsewhere, stop and say so.
2. Never edit `src/contracts/index.ts`, `package.json`, the lockfile, `.env.example` or config files. Describe the change you need and let the human ask the integrator.
3. Modules import types from `src/contracts` and never from each other. Only `src/app/` imports the modules.
4. Do not add npm packages or environment variables without asking.
5. Pose tracking runs on the device. Never send video or landmarks to a server.
6. Keep the game loop out of React. No React state updates per frame.
7. Every outside dependency keeps its stand-in working: keyboard for the camera, local store for Supabase, rule-based coach for Claude. `saveSession` and `getCoachAdvice` never reject.
8. Secrets: never write a key into code, tests or docs. The Claude key is read only in `api/` from `process.env.ANTHROPIC_API_KEY`. Nothing secret gets a `VITE_` prefix.
9. Database changes are new numbered files in `supabase/migrations/`. Every table has row-level security.
10. Every tunable number lives in a `tuning.ts` in its module, not inline.
11. Load the pose model and WASM from `public/`, never from a CDN.
12. Prefer the simplest thing that works. There is one day. Do not add abstractions, options or features that the task did not ask for.
13. Run `npm run check` before reporting a task as done, and report honestly what you could not test (anything that needs a webcam, the database or the deployed endpoint).

## Commands

```bash
npm install
npm run dev      # dev server
npm run check    # typecheck, lint, test, build
npm run preview  # serve the production build locally (used for the demo)
```

Add `?dev=pose` for the pose debug page and `?store=local` to run without the backend.
