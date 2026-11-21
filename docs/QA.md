# QA (fourth helper)

## Needs Greg

Nothing blocking. Branches are pushed with the PR text in the first commit message (`git log --reverse main..<branch>`).

## Status (Sat 15:35, `main` at 5a85969)

Full keyboard flow re-run at 1366×768, 1920×1080 and 1280×720 with the new game (city/tunnel/bridge zones, beat, PERFECT/GOOD/LATE, 3-2-1 intro): landing → profile → select → tutorial → play → pause → results → dashboard → leaderboard → returning player. **No console errors, no horizontal scroll, every round finished and saved.** `npm run check`: 693 tests, none skipped.

| # | Severity | Problem | Owner | Status |
| --- | --- | --- | --- | --- |
| Q1 | visible | 1280×720: Camera/Keyboard switch hidden under the select footer | `src/ui` | open (in progress) |
| Q2 | visible | Every camera failure said "Camera did not start" | Greg | **fixed**, verified |
| Q3 | visible | Leaderboard: an empty filter hides the filters and Back | `src/ui` | open (in progress) |
| Q4 | visible | No visible focus ring on GameButtons | `src/ui` | open (in progress) |
| Q5 | visible | Results at 1366/1280: coach's PLAY THIS NEXT under the footer | `src/ui` | open (in progress) |
| Q6 | visible | HUD cue word covered the obstacle | `src/ui` | **fixed**, verified |
| Q7 | minor | Pause has no way to end the round | `src/ui` + Greg | open (in progress) |
| Q8 | minor | Tab switch resumed with no pause screen | Greg | **fixed**, verified |
| Q9 | minor | Offline banner covered the HUD panels | Greg | **fixed**, verified |
| Q10 | minor | `?store=local` rounds said NOT SYNCED | Greg | **fixed**, verified |
| Q11 | minor | "1 DAYS", "1 rounds" | `src/ui` | open (in progress) |
| Q12 | minor | Landing QR below the fold at 1366/1280 | `src/ui` | open (use `?kiosk=1`) |
| Q13 | minor | One NaN row would block the offline queue | Greg | **fixed** (test now runs and passes) |
| Q14 | visible | "Cross your arms to resume" is small, grey, and shown to keyboard players | `src/ui` | **new** |
| A1 | visible | Results: "RAISE BOTH ARMS TO PLAY AGAIN" is 20 px | `src/ui` | open (in progress) |
| A2 | visible | Tutorial hint was 20 px grey | Greg | **fixed**, verified |
| A3 | minor | Tracking-lost subtext 16 px; "Camera starting…" 14 px | `src/ui` | open (in progress) |
| perf 1 | — | Fetch the game chunk on the select screen | Greg | **done**, verified |

**How tested:** Chrome 157 headless driven over the DevTools protocol (a script, no packages), `npm run dev`, `?store=local`, real key events. Screenshots in [docs/qa/](qa/).

**Not tested here:** anything with a camera (none on this machine; no webcam by rule): calibration at 1.5 m, pose play, the X gesture itself, R, the hands-free replay. Supabase (no `.env.local` here, always the local store). Real GPU frame rate. Sound and music.

## Open findings

### Q1. Select screen at 1280×720: the Camera switch is hidden under the footer
- **Steps:** window 1280×720 → `/?demo=1&store=local` → Play as guest → Skip.
- **Saw:** the settings row wraps and Camera/Keyboard goes behind the sticky footer; the page needs a 148 px scroll ([select-1280x720.jpg](qa/select-1280x720.jpg), [scrolled](qa/select-1280x720-scrolled.jpg)). Re-checked on 5a85969: page still 868 px tall at 720.
- **Fix:** `size="sm"` controls below `xl`, or smaller cards at `max-height: 760px`, so the row fits on one line.

### Q3. Leaderboard: an empty filter traps the player
- **Steps:** one Full body round → Leaderboard → click ARMS.
- **Saw:** only "Be the first on the board" and PLAY: no title, no filters, no Back; only Esc gets out ([leaderboard-empty-filter.jpg](qa/leaderboard-empty-filter.jpg)).
- **Fix:** in `LeaderboardScreen.tsx` render the header and footer whenever `!kiosk`; show `EmptyState` only in the body.

### Q4. No visible focus ring on GameButtons
- **Steps:** landing → Tab, Tab.
- **Saw:** `:focus-visible` matches but `outline-style` is `none`; ghost buttons show nothing ([focus-ghost.jpg](qa/focus-ghost.jpg), [focus-primary.jpg](qa/focus-primary.jpg)). Cause: the shadcn `Button` base has `focus-visible:outline-none`.
- **Fix:** add `focus-visible:outline-solid` to the `gameButtonVariants` base string.

### Q5. Results at 1366×768 and 1280×720: PLAY THIS NEXT is under the footer
- **Steps:** finish a round at either size. **Saw:** the coach card ends at NEXT UP; page 903 px (1366) and 930 px (1280) tall ([results-1280x720.jpg](qa/results-1280x720.jpg)).
- **Fix:** smaller score (`text-display-lg`) under `max-height: 800px`, or let the coach aside scroll on its own.

### Q7. Pause has no way to end the round
- **Steps:** Esc in a round. **Saw:** only RESUME ([paused-1366.jpg](qa/paused-1366.jpg)). **Fix:** an "END ROUND" ghost button wired to an `onQuit` in `App.tsx` that returns to select without saving.

### Q11, Q12 (minor)
- **Q11:** dashboard says "1 DAYS" and "1 rounds · Best …". Fix: singular for 1.
- **Q12:** at 1366/1280 the landing QR starts at y ≈ 740 ([landing-1366.jpg](qa/landing-1366.jpg)). Use `?kiosk=1` for the QR at the table.

### Q14 (new). The pause screen's "Cross your arms to resume"
- **Steps:** any size → start a round with the **keyboard** → Esc.
- **Expected:** the gesture hint only for camera players, readable from the mark (1.5 m).
- **Saw:** "Cross your arms to resume" for a keyboard player, at 20 px in muted grey (`text-body text-text-muted`, `GameHud.tsx:295`) ([paused-1366.jpg](qa/paused-1366.jpg)). A camera player who just paused with the X reads it from 1.5 m.
- **Owner:** `src/ui/screens/GameHud.tsx`. **Fix:** show it only when `cameraSlot` is set, as `font-display-italic text-display-sm text-text` (48 px, white).

### A1, A3 (reading from the mark)
- **A1:** results "RAISE BOTH ARMS TO PLAY AGAIN" is `text-[20px]` with a 55 px figure (`ResultsScreen.tsx:85-86`). Fix: `text-display-sm`, figure 96.
- **A3:** tracking-lost subtext `text-caption text-text-muted` (`GameHud.tsx:288`) → `text-title text-text`; calibration "Camera starting…" is a 14 px eyebrow (`CalibrationScreen.tsx`) → `text-display-sm`.

## Fixed and verified (on 5a85969)

- **Q2:** no camera → "NO CAMERA FOUND · This computer has no camera we can use…" ([camera-error.jpg](qa/camera-error.jpg)). `classifyCameraError` reads the wrapped `cause`.
- **Q6:** the cue word sits in the top band under the progress bar, clear of the obstacle ([hud-cue-1366.jpg](qa/hud-cue-1366.jpg)).
- **Q8:** another tab for 3 s mid-round → back on PAUSED, clock held at 0:40; Esc resumes (0:39 a second later) ([tab-switch-paused.jpg](qa/tab-switch-paused.jpg)).
- **Q9, Q10:** offline mid-round → banner at the bottom (y 732–768 of 768), text "Offline. Your rounds are saved on this laptop." on the local store ([offline-banner.jpg](qa/offline-banner.jpg)); dashboard shows no NOT SYNCED.
- **Q13:** the `mapping-edges` test runs and passes.
- **A2:** tutorial counter 32 px, move name 72 px, hint 48 px white ([tutorial-1280x720.jpg](qa/tutorial-1280x720.jpg)).
- **perf 1:** 24 game modules (`PlayScreen.tsx`, `src/game/*`) are fetched on the select screen, none on landing.

## Reading from the mark (1.5 m)

At 1.5 m on a 14" laptop (about 0.23 mm per CSS pixel), comfortable reading needs a font of about 36 px; about 24 px is the floor for one short word. Contrast measured earlier passes WCAG AA everywhere (lowest 6.0).

| What the standing player reads | Size | Verdict |
| --- | --- | --- |
| HUD score / timer / cue word | 112 / 72 / 72 px | pass |
| "+100" feedback | 48 px | pass |
| PERFECT/GOOD/LATE, combo | drawn in the 3D scene | not measured; large in screenshots |
| Calibration message, "Step back" | 48–72 px | pass (code; no camera here) |
| Tutorial hint | 48 px white | pass (A2 fixed) |
| Pause "Cross your arms to resume" | 20 px grey | **fail (Q14)** |
| Results "RAISE BOTH ARMS TO PLAY AGAIN" | 20 px | **fail (A1)** |

Labels: every control has an accessible name. Reduced motion: no CSS animation runs; the game drops the fly-in, shake and pops (`src/game/README.md`; not checked visually).

## Performance (`main` 82b3622, production build)

Landing transfers 280 KB (JS 172 KB gzip), FCP 0.24–1.51 s and LCP 0.59–1.79 s from no throttling to Lighthouse's mobile network preset, no long tasks, no layout shift. The game chunk (163 KB gzip) now loads on the select screen. Picking Camera on the live site downloads the WASM and model, about 9 MB with brotli (7 s at 10 Mbps); localhost is instant. Lighthouse scores not run (needs a person in DevTools → Lighthouse).

Open suggestions: preload the pose model on the landing page for live-URL visitors (Abdo, optional); `immutable` caching for `/mediapipe` and `/models` in `vercel.json` (Greg).

## Log

| Time (Sat) | Task | Result |
| --- | --- | --- |
| 14:10 | Setup | Portable Node 26.13.0 (checksum verified), `npm ci`, check green |
| 14:25 | README (`q-readme`) | Rewritten for judges |
| 14:38 | Pitch (`q-pitch`) | Script and Q&A match the app |
| 14:49 | Submission (`q-submission`) | `docs/SUBMISSION.md` |
| 15:02 | QA sweep (`q-qa`) | 12 findings, Q1–Q4 visible |
| 15:08 | Accessibility (`q-a11y`) | A1, A2 visible |
| 15:13 | Tests (`q-tests`) | 6 files, 2 skipped bugs (Q2, Q13) |
| 15:16 | Performance (`q-perf`) | Report; Lighthouse panel needs a person |
| 15:23 | Loop | Branches updated for the game-feel pass; re-sweep on 4e7db85 |
| 15:35 | Re-sweep 5a85969 (`q-qa-2`) | 3 sizes clean; Q2, Q6, Q8, Q9, Q10, Q13, A2, perf 1 verified fixed; new Q14 |
