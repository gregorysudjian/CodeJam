# HANDOFF — src/pose (role A, Vision)

_Draft, refreshed through the night. The last refresh is the source of truth._

## 1. Context
- CodeJam 16 webcam fitness game: a 3-lane runner played with your body (Vite, React, TS, Three.js,
  MediaPipe pose on device, Supabase, Vercel). Docs: `AGENTS.md`, `docs/PLAN.md`, `docs/CONTRACTS.md`.
- Role A (Vision). Branch `abdo-1`. Never commit, merge, rebase or push to `main`; never force-push.
- A owns only `src/pose/`, `public/models/`, `public/mediapipe/`. Anything else goes in `NEEDS.md`.
- Code freeze Sunday 12:00 PM Montreal time.

## 2. Current state
- See the MORNING REPORT at the top of `README.md`.

## 9. Starter prompt for a new conversation

```
I'm role A (Vision) on our CodeJam 16 project, branch abdo-1. Read AGENTS.md, then
read src/pose/HANDOFF.md first, then continue from the next task.
```
