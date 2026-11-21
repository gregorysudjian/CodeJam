# Progress (Greg: D + C)

## Status

_Updated after every PR._

**Live:** https://codejam-jet.vercel.app, deployed from `main`. The real UI, the Supabase backend and the rules coach are live. The game is the 2D placeholder, played with the keyboard, until Patrick's and Abdo's PRs land.

**Merged and live**
- #2 UI (Neon Arena screens) · #3 backend (schema, store with offline queue, coach endpoint) · #4 wiring (all 8 screens on real data)
- #5 `signOut`: "New guest" now starts a new player
- #6 demo preset: **reverted in #7**. `src/workout` is Patrick's, and his `p1-workout` already has the real generator and `?demo=1` (seed 594)
- #8 `signOut` never hangs on bad wifi: the queue wait is capped at 2 s, and sign-out no longer makes a network call
- #9 Results wait 1.5 s after the game finishes, so Patrick's finish arch and fanfare play (his request #5)

**Testing rule (from Greg):** unit tests first. One scripted round per change, using `?demo=1&store=local` once Patrick's demo is on `main`. Browser testing is time-boxed to 5 minutes.

**How it was tested:** `npm run check` on every PR. Click-throughs by keyboard in Chrome against live Supabase, plus `?store=local`. Security rules tested with two anonymous users. Offline save tested with the network cut. `/api/coach` tested on a Vercel preview.

**Not tested yet:** the camera and real body input (`src/pose` is still the stub). A real Claude coach answer (no key, by instruction). Patrick's 3D game on the demo laptop.

**Open problems, ranked by demo risk**
1. Body control isn't on `main` (Abdo's `createPoseInput`), and the 3D game isn't on `main` (Patrick's `p0-game`). No PRs open yet.
2. No error screens for camera denied, no camera, or offline (3c, after 3b).
3. An offline save waits up to about 10 s before falling back. The results screen already shows meanwhile, so only the coach card and rank arrive late.

**Requests:** none open (see below).

**Next 3:** error states (3c) → kiosk leaderboard (3d) → panic keys check (3e).

## Log

### #5 signOut: "New guest" creates a new player
- **Contract (approved):** `DataStore.signOut(): Promise<void>` forgets the current guest. In `src/contracts/index.ts` and `docs/CONTRACTS.md`, which are still identical.
- **Supabase store:** sends queued sessions first, then `auth.signOut({ scope: 'local' })` (works offline), then clears the cached profile, sessions and queue. **Local store:** clears the saved player and sessions. **`createStore`** signs out of both and retries Supabase for the next guest.
- **App:** "New guest" (and "Play as guest" when a player is saved) signs out and resets per-player state before the profile step. "Continue as …" keeps the player.
- **Tested:** the new unit test passes (42 total). In Chrome against live Supabase: Alpha → reload → "Continue as Alpha" → New guest → fresh guest name → Beta → reload → "Continue as Beta". The database holds exactly two players. The same flow works with `?store=local`. A fresh player gets the empty leaderboard state ("Be the first on the board") with no console errors.

### #7 Revert of #6 (demo preset) and doc fixes
- #6 put a demo preset into `src/workout`, which is Patrick's folder. It conflicted with his `p1-workout` (`index.ts`, add/add on `tuning.ts`). Reverted. After the revert, `p1-workout` merges cleanly with `main` (checked with `git merge-tree`). His branch provides `?demo=1` without app changes.
- AGENTS.md: Patrick owns `src/game`, `src/input` and `src/workout`; Greg owns `docs/`. CONTRACTS.md: crates follow the hold rule too ("both arms up for the whole `holdSec` if set, with 0.3 s of grace").

### #8 signOut on bad wifi (3a)
- The wait for sending queued sessions is capped at `SIGNOUT_FLUSH_TIMEOUT_MS` (2 s, in `src/data/tuning.ts`). Sessions that miss the cap are dropped with the guest, because they can't move to the next player.
- **Found while testing:** `supabase.auth.signOut({ scope: 'local' })` still calls the server's logout endpoint with no timeout and holds the auth lock meanwhile, so on bad wifi "New guest", and the next guest's sign-in waiting on that lock, could hang for minutes. Sign-out now removes the stored session directly (key `sb-<ref>-auth-token`, set explicitly in the client). That needs no network, and anonymous guests lose nothing by skipping the server-side logout.
- **Tested:** `src/data/supabase.test.ts` uses a stand-in fetch that never answers: `signOut` returns in about 2 s and clears the session, profile, cache and queue. With a fetch that answers, it sends the queued round first and doesn't wait for the cap. In Chrome against live Supabase: New guest → profile in about 1 s, and the database held exactly two players. With the network cut: New guest → profile in 0.2 s (local store).

### #9 Finish delay (3b)
- `PlayScreen` takes the summary the moment the game emits `finished` and calls `onFinish` `FINISH_DELAY_MS` later (1.5 s, in the new `src/app/tuning.ts`, which also holds `HUD_POLL_MS`). Delivery happens exactly once, whichever comes first: the timer, or an unmount (for example K swapping the input). Game events after `finished` are ignored, and the HUD's pause and resume do nothing during the fanfare.
- Also removed the deprecated `baseUrl` from both tsconfigs. It was the one error in VS Code's Problems panel; `paths` doesn't need it.
- **Tested:** `npm run check` passes (44 tests) and the Problems panel is empty. One scripted round with `?store=local`: results appeared 2.5 s after the HUD hit 0:00 (the last second plus 1.5 s), Esc during the fanfare showed no pause overlay, and exactly one session was saved. **Not tested in the browser:** K during the fanfare (the unmount delivery path).

## Requests

_For things outside my folders: src/ui (Lovable Claude), src/pose (Abdo), src/game and src/input (Patrick), packages, keys._

- none yet
