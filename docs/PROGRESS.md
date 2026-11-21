# Progress (Greg: D + C)

## Status

_Updated after every PR._

**Live:** https://codejam-jet.vercel.app, deployed from `main`. The real UI, the Supabase backend and the rules coach are live. The game is the 2D placeholder, played with the keyboard, until Patrick's and Abdo's PRs land.

**Merged and live**
- #2 UI (Neon Arena screens) · #3 backend (schema, store with offline queue, coach endpoint) · #4 wiring (all 8 screens on real data)
- #5 `signOut`: "New guest" now starts a new player
- #6 demo preset: **reverted in #7**. `src/workout` is Patrick's, and his `p1-workout` already has the real generator and `?demo=1` (seed 594)

**How it was tested:** `npm run check` on every PR. Click-throughs by keyboard in Chrome against live Supabase, plus `?store=local`. Security rules tested with two anonymous users. Offline save tested with the network cut. `/api/coach` tested on a Vercel preview.

**Not tested yet:** the camera and real body input (`src/pose` is still the stub). A real Claude coach answer (no key, by instruction). Patrick's 3D game on the demo laptop.

**Open problems, ranked by demo risk**
1. Body control isn't on `main` (Abdo's `createPoseInput`), and the 3D game isn't on `main` (Patrick's `p0-game`). No PRs open yet.
2. `signOut` can hang on bad wifi while it waits to send queued sessions (3a, next).
3. No error screens for camera denied, no camera, or offline (3c).
4. An offline save waits up to about 10 s before falling back. The results screen already shows meanwhile, so only the coach card and rank arrive late.

**Requests:** none open (see below).

**Next 3:** signOut 2 s cap on bad wifi (3a) → 1.5 s delay before results so the finish fanfare plays (3b) → error states (3c).

## Log

### #5 signOut: "New guest" creates a new player
- **Contract (approved):** `DataStore.signOut(): Promise<void>` forgets the current guest. In `src/contracts/index.ts` and `docs/CONTRACTS.md`, which are still identical.
- **Supabase store:** sends queued sessions first, then `auth.signOut({ scope: 'local' })` (works offline), then clears the cached profile, sessions and queue. **Local store:** clears the saved player and sessions. **`createStore`** signs out of both and retries Supabase for the next guest.
- **App:** "New guest" (and "Play as guest" when a player is saved) signs out and resets per-player state before the profile step. "Continue as …" keeps the player.
- **Tested:** the new unit test passes (42 total). In Chrome against live Supabase: Alpha → reload → "Continue as Alpha" → New guest → fresh guest name → Beta → reload → "Continue as Beta". The database holds exactly two players. The same flow works with `?store=local`. A fresh player gets the empty leaderboard state ("Be the first on the board") with no console errors.

### #7 Revert of #6 (demo preset) and doc fixes
- #6 put a demo preset into `src/workout`, which is Patrick's folder. It conflicted with his `p1-workout` (`index.ts`, add/add on `tuning.ts`). Reverted. After the revert, `p1-workout` merges cleanly with `main` (checked with `git merge-tree`). His branch provides `?demo=1` without app changes.
- AGENTS.md: Patrick owns `src/game`, `src/input` and `src/workout`; Greg owns `docs/`. CONTRACTS.md: crates follow the hold rule too ("both arms up for the whole `holdSec` if set, with 0.3 s of grace").

## Requests

_For things outside my folders: src/ui (Lovable Claude), src/pose (Abdo), src/game and src/input (Patrick), packages, keys._

- none yet
