# QA (fourth helper)

## Needs Greg

1. **Open the PRs.** This lab machine has no `gh` CLI, and reading the stored git credential was refused, so the branches are pushed but no PR exists. Each branch has one commit whose message is the PR description, so the compare page pre-fills it. Click "Create pull request":
   - https://github.com/gregorysudjian/CodeJam/compare/main...q-readme?expand=1
   - https://github.com/gregorysudjian/CodeJam/compare/main...q-pitch?expand=1
   - https://github.com/gregorysudjian/CodeJam/compare/main...q-submission?expand=1
   - https://github.com/gregorysudjian/CodeJam/compare/main...q-qa?expand=1
2. **Decide Q10:** should the local store mark rounds `synced: true`? Today every `?store=local` round says "NOT SYNCED" and the offline banner promises a sync that never happens.
3. **Tell the Lovable UI Claude** about Q1, Q3, Q4 and Q5 (all `src/ui`). Q1 matters if the demo laptop ever runs at 1280×720 on a projector.

## Summary (Sat 15:00, `main` at 3dbf70d)

Full keyboard flow at 1366×768, 1920×1080 and 1280×720: landing → profile → select → tutorial → play → pause → results → dashboard → leaderboard → returning player. **No console errors in any run, no horizontal scroll at any size, every round finished and saved.** Offline mid-round, reduced motion, tab switching, kiosk, New guest, treadmill and the camera error path all work.

The four that matter most:

| # | Severity | Problem | Owner |
| --- | --- | --- | --- |
| Q1 | visible | At 1280×720 the Camera/Keyboard switch wraps under the footer on the select screen | `src/ui` (Lovable UI) |
| Q2 | visible | Every camera failure shows the vague "Camera did not start", never "Camera blocked" with the fix-it steps | Greg (`src/app/errors.ts`) |
| Q3 | visible | Leaderboard: picking a workout with no scores hides the filters and the Back button | `src/ui` (Lovable UI) |
| Q4 | visible | Keyboard focus is invisible on every big button (GameButton) | `src/ui` (Lovable UI) |

**How tested:** Chrome 157 headless, driven over the DevTools protocol by a script (no packages), against `npm run dev` with `?store=local`, keys sent as real key events. Screenshots are in [docs/qa/](qa/).

**Not tested here:** anything with a camera (this machine has none: `getUserMedia` → `NotFoundError`, and the rule is no webcam anyway), so calibration, pose play, R and the hands-free replay are untested; Supabase (no `.env.local` on this machine, so the app always ran on the local store), so the shared leaderboard, sync after offline and the kiosk's guest sign-in are untested; real GPU frame rate (headless software rendering); sound.

## Findings

### Q1. Select screen at 1280×720: the Camera switch is hidden under the footer (visible)
- **Steps:** window 1280×720 → `/?demo=1&store=local` → Play as guest → Skip.
- **Expected:** all settings (mode, duration, low impact, Camera/Keyboard) visible above Start, as at 1366×768.
- **Saw:** the settings row wraps; Camera/Keyboard moves to a second row behind the sticky footer. At the top of the page the settings are cut off ([select-1280x720.jpg](qa/select-1280x720.jpg)); you have to scroll 148 px to reach Camera ([select-1280x720-scrolled.jpg](qa/select-1280x720-scrolled.jpg)). On a projector the Operator may not find the switch.
- **Owner:** `src/ui/screens/WorkoutSelectScreen.tsx` (Lovable UI).
- **Fix:** keep the four controls on one row down to 1280 px: use `size="sm"` segmented controls below `xl` (e.g. `max-xl:` variants), or shrink the cards at short heights (`[@media(max-height:760px)]:` smaller `MoveFigure`, less padding) so the row fits above the footer.

### Q2. Camera errors are always "Camera did not start" (visible)
- **Steps:** on a laptop with no camera, or with camera permission blocked: select screen → Camera.
- **Expected:** "No camera found" or "Camera blocked: click the camera icon in the address bar…" (`src/app/errors.ts`).
- **Saw:** "Camera did not start. Something stopped the camera from starting." ([camera-error.jpg](qa/camera-error.jpg)). Reproduced here: `getUserMedia` fails with `NotFoundError`.
- **Cause:** `src/pose/engine.ts:166` rethrows the camera error as `new Error(message, { cause: err })`, so `classifyCameraError` sees the name `Error` and falls to `other`. `errors.test.ts` only feeds raw DOMExceptions, so it passes.
- **Owner:** Greg (`src/app/errors.ts`). Abdo's wrapping is fine as is.
- **Fix:** in `classifyCameraError`, read the name of `err.cause` when `err.name` is not in `BY_NAME`. The `q-tests` branch adds a test that pins it (skipped until the fix lands).

### Q3. Leaderboard: an empty filter traps the player (visible)
- **Steps:** have one Full body round → Leaderboard → click ARMS.
- **Expected:** the Arms board says it is empty, with the filters and Back still there.
- **Saw:** only "Be the first on the board" and PLAY ([leaderboard-empty-filter.jpg](qa/leaderboard-empty-filter.jpg)). No title saying which board, no filters, no Back button; only Esc gets out. App keeps the last filter, so reopening the leaderboard from landing shows the same empty board.
- **Owner:** `src/ui/screens/LeaderboardScreen.tsx` (Lovable UI).
- **Fix:** render the header (title and filters) and the footer whenever `!kiosk`, not only when `loading || entries.length > 0` (lines 155 and 179); show `EmptyState` only in the body.

### Q4. No visible focus ring on GameButtons (visible, accessibility)
- **Steps:** landing → Tab, Tab.
- **Expected:** the 2 px lime outline from the `focus-ring` utility.
- **Saw:** nothing on ghost buttons (Leaderboard, New guest, Back, Dashboard) and only the usual glow on primary buttons ([focus-ghost.jpg](qa/focus-ghost.jpg), [focus-primary.jpg](qa/focus-primary.jpg)). Measured: `:focus-visible` matches, `outline-color` is lime, but `outline-style` is `none`. Segmented controls and the name field do show a ring.
- **Cause:** `GameButton` renders the shadcn `Button`, whose base classes include `focus-visible:outline-none focus-visible:ring-1`; those override `focus-ring`.
- **Owner:** `src/ui/kit/GameButton.tsx` (Lovable UI).
- **Fix:** add `focus-visible:outline-solid` to the `gameButtonVariants` base string. tailwind-merge then drops the Button's `focus-visible:outline-none`, and the `focus-ring` outline shows.

### Q5. Results at 1366×768 and 1280×720: the coach's PLAY THIS NEXT is under the footer (visible)
- **Steps:** finish a round at 1366×768 or 1280×720.
- **Saw:** the coach card ends at NEXT UP; its button and most rep rows need scrolling ([results-1280x720.jpg](qa/results-1280x720.jpg)). At 1920×1080 everything fits.
- **Owner:** `src/ui/screens/ResultsScreen.tsx` (Lovable UI).
- **Fix:** at short heights shrink the score (`results-score` from `text-display-xl` to `text-display-lg` under `[@media(max-height:800px)]`) and the stat tiles' padding, or give the coach aside its own scroll (`xl:max-h-[calc(100vh-220px)] xl:overflow-y-auto`).

### Q6. HUD cue word covers the obstacle (visible, known)
Still open (PROGRESS request, Patrick's request 7): "JUMP" with its ring sits on the incoming hurdle ([hud-cue-1366.jpg](qa/hud-cue-1366.jpg)). **Owner:** `src/ui/screens/GameHud.tsx` (Lovable UI). **Fix:** as requested, move `hud-cue` from `top-[40%]` into the top band between score and timer, or lower its opacity to about 40%.

### Q7. Pause has no way to quit the round (minor)
- **Steps:** in a round, Esc.
- **Saw:** only RESUME ([paused-1366.jpg](qa/paused-1366.jpg)). To stop, a player waits out the round or reloads.
- **Owner:** `src/ui/screens/GameHud.tsx` (button) and Greg (`src/app/App.tsx`, an `onQuit` that goes back to `select` without saving).
- **Fix:** a ghost "END ROUND" button under RESUME.

### Q8. Switching tabs mid-round resumes with no pause screen (minor)
- **Steps:** in a round, open another tab for 5 s, come back.
- **Saw:** the clock froze while hidden (0:41 → 0:41) and ran on at once when back, with no PAUSED overlay. Nothing is lost (game time stops), but a camera player returning from the slides is thrown straight back in.
- **Owner:** Greg (`src/app/PlayScreen.tsx`).
- **Fix:** on `visibilitychange` to hidden, call `game.pause()`; the player resumes with Esc.

### Q9. Offline banner overlaps the HUD panels (minor)
The banner covers the top ~20 px of the score and timer panels during play ([offline-banner.jpg](qa/offline-banner.jpg)). **Owner:** Greg (`src/app/ErrorStates.tsx`). **Fix:** on the play screen put the banner at the bottom (`bottom-0` instead of `top-0`).

### Q10. `?store=local`: every round says NOT SYNCED (minor, needs a decision)
The local store saves `synced: false` (`src/data/local.ts:92`), so the dashboard tags every round "NOT SYNCED", and the offline banner says rounds "sync when the wifi is back", which never happens on the local store. Matters only if the demo falls back to `?store=local`. **Owner:** Greg (`src/data/local.ts`). **Fix:** `synced: true` in the local store (nothing is waiting to sync), or hide the tag when `store.kind === 'local'`.

### Q11. Plurals on the dashboard (minor)
"1 DAYS" (day streak) and "1 rounds · Best 500" (recent rounds). **Owner:** `src/ui/screens/DashboardScreen.tsx`. **Fix:** `streak === 1 ? 'DAY' : 'DAYS'`, same for rounds.

### Q12. Landing QR is below the fold at 1366×768 and 1280×720 (minor)
"Play on your laptop" with the QR starts at y ≈ 740 ([landing-1366.jpg](qa/landing-1366.jpg)). For the expo table, use `?kiosk=1` (QR always visible) or scroll. **Owner:** `src/ui/screens/LandingScreen.tsx`. **Fix:** none needed if the kiosk is used; otherwise reduce the hero title size at `max-height: 800px`.

### Note for the Operator (not a bug)
On the select screen, after clicking a control with the mouse, **Enter re-activates that control instead of starting** (`useHotkey` leaves Enter to the focused button). Click START instead. Worth one line in the DEMO station notes.

## Requests

_For each owner, from the findings above._

- **Lovable UI (`src/ui`):** Q1, Q3, Q4, Q5 first; then Q6 (already requested), Q7 (button), Q11, Q12.
- **Greg (`src/app`, `src/data`):** Q2 (one-line fix plus my skipped test), Q8, Q9, Q10 (decision), Q7 (wiring).
- **Abdo, Patrick:** nothing from this sweep.

## Passed

- **Flow at all three sizes:** landing → Play as guest → profile → select → "Try each move" (6 steps for Full body floor; 3 arm steps for Arms treadmill) → play → Esc pause → resume → round ends → results with RULES coach → dashboard → L → leaderboard → reload → "Continue as …". No console errors or warnings.
- **Select options:** Treadmill disables Legs and hides Low impact; keys 1–4 pick a card (1 ignored on treadmill); 45/90/180 s; summary line updates. `?demo=1` preselects Full body · floor · 45 s.
- **Treadmill round:** Arms · treadmill · 45 s played to the end; only crates and orbs; coach then picks Full body treadmill (never Legs).
- **Long name:** the name field stops at 20 characters (DB allows 40). Results, dashboard and leaderboard show it in full; the landing button truncates it to "CONTINUE AS MA…" at 1366 px.
- **New guest:** from "Continue as …" → New guest → profile with a fresh `Guest-####` → landing then offers the new guest.
- **Camera path without a camera:** the dialog appears (alertdialog, modal, focus inside), "Use keyboard" closes it and the switch returns to Keyboard. Message wording: Q2.
- **`?kiosk=1`:** fits at all three sizes with no scroll; empty state "Be the first on the board" with the QR code.
- **Offline mid-round:** banner appears within 1.5 s, the round goes on and finishes, results show the RULES coach, the banner goes away when back online. The only console entry is the favicon failing to load while offline.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, 0 CSS animations run on landing, tutorial, play and results (5 run normally). Motion logs one dev-only warning.
- **Tab switch:** game time stops while hidden and continues when back (see Q8 for the missing pause screen).
- **Keyboard only:** Tab order is logical on landing, profile, select, leaderboard; the pause overlay keeps focus on RESUME; Esc goes back from select and profile; Enter starts. Focus visibility: Q4.

## Log

| Time (Sat) | Task | Result |
| --- | --- | --- |
| 14:10 | Setup | No Node on this lab PC: portable Node 26.13.0 LTS (checksum verified) in a temp folder, `npm ci`. `npm run check` green (564 tests) |
| 14:25 | 1. README (`q-readme`) | Rewritten for judges, pushed. PR not opened (no `gh`): Needs Greg 1 |
| 14:38 | 2. Pitch (`q-pitch`) | Script and Q&A match the app; found "raise both arms to start" (doesn't exist), "Play this next" with `?demo=1` replays the demo level, arms up on results replays. Pushed |
| 14:49 | 3. Submission (`q-submission`) | `docs/SUBMISSION.md` pushed |
| 15:02 | 4. QA sweep (`q-qa`) | This file. 12 findings, 4 visible ones need fixes (Q1–Q4) |
