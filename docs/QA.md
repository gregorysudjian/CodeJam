# QA (fourth helper)

## Needs Greg

1. **Open the PRs.** This lab machine has no `gh` CLI, and reading the stored git credential was refused, so the branches are pushed but no PR exists. Each branch has one commit whose message is the PR description, so the compare page pre-fills it. Click "Create pull request":
   - https://github.com/gregorysudjian/CodeJam/compare/main...q-readme?expand=1
   - https://github.com/gregorysudjian/CodeJam/compare/main...q-pitch?expand=1
   - https://github.com/gregorysudjian/CodeJam/compare/main...q-submission?expand=1
   - https://github.com/gregorysudjian/CodeJam/compare/main...q-qa?expand=1
   - https://github.com/gregorysudjian/CodeJam/compare/main...q-a11y?expand=1 (stacked on `q-qa`)
   - https://github.com/gregorysudjian/CodeJam/compare/main...q-perf?expand=1 (stacked on `q-a11y`; **merging only this one brings all three QA.md commits**)
   - https://github.com/gregorysudjian/CodeJam/compare/main...q-tests?expand=1 (new test files only)
   Branches that got a second commit (merging `main`, updates) won't pre-fill the description: the PR text is the **first** commit's message on each branch (`git log --reverse main..<branch>`).
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
- **Cause:** `src/pose/engine.ts` (line 178 on `main` at 4e7db85) rethrows the camera error as `new Error(message, { cause: err })`, so `classifyCameraError` sees the name `Error` and falls to `other`. `errors.test.ts` only feeds raw DOMExceptions, so it passes.
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

## Accessibility and reading from 2 m (report only)

**Yardstick.** A 14" laptop at 1366 px wide has about 0.23 mm per CSS pixel (a MacBook at default scaling about 0.2 mm). At 2 m, comfortable reading needs a cap height of about 8 mm (distance ÷ 250), which is a **48 px** font; about **32 px** is the floor for a short word. Sizes and contrast below were measured in Chrome at 1366×768 (computed font size; contrast against the element's own background, blended down to the page colour).

| What the standing player reads | Size | Contrast | Verdict |
| --- | --- | --- | --- |
| HUD score | 112 px | 16.9 | pass |
| HUD timer | 72 px | 18.6 | pass |
| HUD cue word / countdown | 160 px / 48 px | 8.4 on its glow | pass for size; covers the obstacle (Q6) |
| "+100" / "MISS" feedback | 48 px | n/a (over the 3D scene) | pass |
| Streak, multiplier | 32 px | 16.9 | borderline, acceptable |
| Calibration status message | 48 px, 72 px from 1024 px wide | high (white on dark band) | pass (read from code) |
| "Step back" / "Step closer" | 48 px | amber on dark | pass (read from code) |
| "STEP BACK INTO THE FRAME" | 112 px | amber | pass (read from code) |
| Tutorial move name | 48 px | 11 | borderline: A2 |
| **Tutorial instruction ("Step to the side")** | **20 px, muted** | 6.5 | **fail: A2** |
| **Results "RAISE BOTH ARMS TO PLAY AGAIN"** | **20 px** | lime on dark | **fail: A1** |
| Results score / stat values | 128 px / 48 px | 16.9 / 6.0 to 10.3 | pass |
| Coach card text | 20 px | 17.3 | fine for the presenter at the laptop; not for a standing player |

**Contrast:** every measured text passes WCAG AA (lowest visible: 6.0, muted captions on glass panels). Not measurable: text drawn over the moving 3D scene (the cue word and feedback). In screenshots the lime cue word sits on lime-lit gates (Q6).

**Focus:** order is logical on every screen; the pause overlay keeps focus on RESUME; the camera dialog is a modal `alertdialog` with focus inside. Big buttons show no focus ring (Q4).

**Labels:** every control on landing, profile (with "More options"), select, play, dashboard and leaderboard has an accessible name (icon buttons use `aria-label`; the Low impact switch uses `<label for>`). Charts carry an `aria-label` with their numbers.

**Reduced motion:** `theme.css:935` stops every CSS animation under `prefers-reduced-motion`; measured 0 running animations on landing, tutorial, play and results (5 normally). Components read `useReducedMotion` for the HUD shake and results bars, and the game drops camera shake and the hold pulse (`src/game/README.md`); the in-game part was not checked visually.

### A1. Results: the hands-free prompt is unreadable from 2 m (visible)
A camera player stands 2 m away on the results screen, and the only instruction is "RAISE BOTH ARMS TO PLAY AGAIN" at 20 px with a 55 px figure. **Owner:** `src/ui/screens/ResultsScreen.tsx:85-86` (Lovable UI). **Fix:** `text-[20px]` → `text-display-sm` (48 px), `MoveFigure size={55}` → `size={96}`.

### A2. Tutorial: the instruction is 20 px and muted (visible)
"Try each move" is played from the mark, but the hint ("Step to the side", "Raise both arms") is `text-body text-text-muted` (20 px, grey) and the move name 48 px. **Owner:** Greg (`src/app/TryMoves.tsx:74-78`). **Fix:** hint `text-body text-text-muted` → `font-display-italic text-display-sm text-text` (48 px, white); move name `text-display-sm` → `text-display-md` (72 px); counter `text-sm` → `text-title`.

### A3. Smaller ones (minor)
- Tracking lost: "The round is paused until we can see you." is 16 px muted under a 112 px title. **Owner:** `src/ui/screens/GameHud.tsx:287`. **Fix:** `text-caption text-text-muted` → `text-title text-text`.
- Calibration: "Camera starting…" is a 14 px muted eyebrow while the player is already walking back. **Owner:** `src/ui/screens/CalibrationScreen.tsx:117`. **Fix:** `eyebrow … text-text-muted` → `font-display-italic text-display-sm text-text`.
- The pause screen's key hints (K, R, D) are 16 px; fine, the Operator reads them at the laptop.

## Found by the new tests (`q-tests`)

### Q13. One bad row would block the whole offline queue (minor, latent)
`sessionToRow` (`src/data/mapping.ts`) passes `NaN` straight through; JSON turns it into `null`, which the NOT NULL columns reject. `sendQueue` (`src/data/supabase.ts:96`) upserts every pending round in one call, so a single rejected row would keep all queued rounds off the server for good. Today's tracker never produces `NaN`, so nothing breaks now. **Owner:** Greg (`src/data/mapping.ts`). **Fix:** run `score`, `accuracy`, `kcal`, `active_sec` through the existing `num()` helper (non-finite → 0) before clamping. The pinning test is `it.skip` in `src/data/mapping-edges.test.ts`.

Q2 is pinned the same way in `src/app/errors-edges.test.ts`. Both skipped tests fail when unskipped, as expected.

## Performance (report only)

Production build of `main` at 82b3622, served by `vite preview`, measured in Chrome 157 over the DevTools protocol with the cache off, at 1366×768.

**Lighthouse scores were not run.** Lighthouse isn't in the project and I may not add packages; the DevTools panel needs a person. Anyone with Chrome: open the live URL → DevTools → Lighthouse → Desktop → Analyze (2 minutes), for the landing page and the select screen. The numbers below are the same metrics, measured directly.

**Bundle (`npm run build`):**

| Chunk | Size | Gzip | Loads |
| --- | --- | --- | --- |
| `index` (app, React, Supabase) | 295 KB | 94 KB | landing |
| `resultsRules` (shared UI: Motion, kit) | 245 KB | 82 KB | landing |
| `index.css` | 99 KB | 17 KB | landing |
| `PlayScreen` (Three.js, game) | 629 KB | 163 KB | on Start |
| `DashboardScreen` (Recharts) | 428 KB | 122 KB | on Dashboard |
| `vision_bundle` (MediaPipe JS) | 154 KB | 45 KB | on Camera |
| `pose` | 21 KB | 9 KB | on Camera |
| Fonts | 31 files, 537 KB | | 2 on landing (71 KB), 1 more on select |
| `public/mediapipe/wasm/vision_wasm_internal.wasm` | 14.3 MB | 4.1 MB | after the camera is granted |
| `public/models/pose_landmarker_lite.task` | 5.6 MB | 4.8 MB | after the camera is granted |

Vite warns that `PlayScreen` is over 500 KB; it is lazy, so that is fine.

**Load times** (landing: transfer 280 KB, no long tasks, layout shift 0):

| Network | Landing FCP | Landing LCP | Total blocking time | Landing → select | Start → HUD | WASM + model download |
| --- | --- | --- | --- | --- | --- | --- |
| No throttling (localhost) | 0.24 s | 0.86 s | 0 ms | 0.45 s | 0.84 s | 0.2 s |
| Lighthouse desktop (10 Mbps, 40 ms) | 0.47 s | 0.59 s | 0 ms | 0.45 s | 0.78 s | 15.7 s uncompressed |
| Lighthouse mobile (1.6 Mbps, 150 ms) | 1.51 s | 1.79 s | 0 ms | 0.46 s | 1.24 s | 95 s uncompressed |

`vite preview` sends the WASM uncompressed. **The live Vercel site sends both pose files with brotli** (checked with a HEAD request), so a visitor on the live URL downloads about 9 MB, about 7 s at 10 Mbps. The demo on `localhost` is not affected.

**Suggestions:**
1. **Prefetch the game chunk on the select screen** so Start is instant: `import('./PlayScreen')` in an effect when `screen === 'select'` (0.8 to 1.2 s saved per first round). Owner: Greg (`src/app/App.tsx`).
2. **Pose files for visitors on the live URL** (QR code players): about 9 MB on venue wifi before calibration can start. Abdo's optional preload request already covers it: start fetching the model once the landing page has rendered, or at least when Camera is picked rather than after permission. Owner: Abdo (`src/pose/landmarker.ts`) with Greg. The demo laptop doesn't need it.
3. **Cache the pose files for good:** they are served with `max-age=0, must-revalidate`. A `headers` rule in `vercel.json` for `/mediapipe/(.*)` and `/models/(.*)` with `public, max-age=31536000, immutable` saves the revalidation on every visit. Owner: Greg (config). Only safe while the file names change when the files do.
4. Fonts are fine: only the used subsets load (2 files, 71 KB, on landing). Optional: `<link rel="preload">` for `barlow-condensed-latin-800-italic` to bring LCP forward by about 0.2 s. Owner: Greg (`index.html`).

## Requests

_For each owner, from the findings above._

- **Lovable UI (`src/ui`):** Q1, Q3, Q4, Q5, A1 first; then Q6 (already requested), Q7 (button), Q11, Q12, A3.
- **Greg (`src/app`, `src/data`):** Q2 (one-line fix plus my skipped test), A2, Q8, Q9, Q10 (decision), Q13, Q7 (wiring); perf 1, 3, 4.
- **Abdo:** perf 2 (optional preload, already on his list).
- **Patrick:** nothing from this sweep.

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
| 15:08 | 5. Accessibility from 2 m (`q-a11y`, stacked on `q-qa`) | Sizes and contrast measured; 2 visible (A1 hands-free prompt, A2 tutorial hint), labels and reduced motion pass |
| 15:13 | 6. Tests (`q-tests`, from `main` 82b3622) | 6 new files, 61 tests: 59 pass, 2 skipped bugs (Q2, Q13). Check: 625 passed, 2 skipped |
| 15:30 | 7. Performance (`q-perf`, stacked on `q-a11y`) | Landing 280 KB, LCP 0.6 to 1.8 s, no blocking; pose files about 9 MB brotli on the live site. Lighthouse panel not run (needs a person) |
| 15:35 | 8. Loop | `main` moved to 4e7db85 (#33, #36, #38: game feel, X pause gesture, 1.5 m calibration). Q2 still open there. Next: merge `main` into my branches, update README, pitch and submission, re-run the sweep |
| 15:50 | 8. Loop: branches | Merged `main` into `q-readme`, `q-pitch`, `q-submission`, `q-tests` (no conflicts). README, pitch and submission now say 1.5 m, 3-2-1 intro, X pause gesture, zones, beat, PERFECT/GOOD/LATE. `q-tests` on new `main`: 693 passed, 2 skipped |
| 15:55 | 8. Loop: re-sweep on 4e7db85 | Full flow at 1366×768 and 1280×720 with the new game: rounds complete, no console errors. `src/ui` unchanged since the sweep, so Q1, Q3 to Q6, Q11, Q12, A1, A3 still stand; Q2 still in the code (`engine.ts:178`); A2, Q7 to Q10, Q13 unchanged. Q6 seen again: "ARMS UP" covers the crates |
