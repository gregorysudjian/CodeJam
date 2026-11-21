# QA (fourth helper)

## Needs Greg

Branches are pushed with the PR text in the first commit message (`git log --reverse main..<branch>`).

No decision is waiting.

## Status (Sat 17:07, `main` at 7be4281)

`docs/qa/sweep/sweep.mjs` on 7be4281: **105 checks passed, 0 failed** (35 per size at 1366×768, 1920×1080, 1280×720): every screen, a scripted perfect demo round (4,750), no console errors, no horizontal scroll. `npm run check`: 762 tests, none skipped. Only Q12 is open, by choice: the kiosk is the QR screen.

| # | Severity | Problem | Owner | Status |
| --- | --- | --- | --- | --- |
| Q1 | visible | 1280×720: Camera/Keyboard switch hidden under the select footer | `src/ui` | **fixed**, verified |
| Q2 | visible | Every camera failure said "Camera did not start" | Greg | **fixed**, verified |
| Q3 | visible | Leaderboard: an empty filter hid the filters and Back | `src/ui` | **fixed**, verified |
| Q4 | visible | No visible focus ring on GameButtons | `src/ui` | **fixed**, verified |
| Q5 | visible | Results at 1366/1280: coach's PLAY THIS NEXT under the footer | `src/ui` | **fixed**, verified (see note) |
| Q6 | visible | HUD cue word covered the obstacle | `src/ui` | **fixed**, verified |
| Q7 | minor | Pause had no way to end the round | `src/ui` + Greg | **fixed**, verified |
| Q8 | minor | Tab switch resumed with no pause screen | Greg | **fixed**, verified |
| Q9 | minor | Offline banner covered the HUD panels | Greg | **fixed**, verified |
| Q10 | minor | `?store=local` rounds said NOT SYNCED | Greg | **fixed**, verified |
| Q11 | minor | "1 DAYS", "1 rounds" | `src/ui` | **fixed**, verified |
| Q12 | minor | Landing QR below the fold at 1366/1280 | `src/ui` | open by choice: use `?kiosk=1` |
| Q13 | minor | One NaN row would block the offline queue | Greg | **fixed** (test runs and passes) |
| Q14 | visible | "Cross your arms to resume" was small, grey, and shown to keyboard players | `src/ui` | **fixed**, verified (keyboard side) |
| Q15 | visible | HUD cue word overprinted the "N COMBO!" banner and the VS GHOST chip | Patrick (#46) | **fixed**, verified |
| Q16 | minor | Local store leaderboard listed every round, not each player's best | Greg | **fixed**, verified |
| Q17 | minor | The kiosk could save a player called "Leaderboard" (two routes) | Greg | **fixed**, verified (both routes) |
| A1 | visible | Results: "RAISE BOTH ARMS TO PLAY AGAIN" was 20 px | `src/ui` | **fixed** (code; camera-only screen) |
| A2 | visible | Tutorial hint was 20 px grey | Greg | **fixed**, verified |
| A3 | minor | Tracking-lost subtext 16 px; "Camera starting…" 14 px | `src/ui` | **fixed** (code; camera-only screen) |
| perf 1 | — | Fetch the game chunk on the select screen | Greg | **done**, verified |

**How tested:** Chrome 157 headless driven over the DevTools protocol (a script, no packages), `npm run dev`, `?store=local`, real key events; scripted perfect rounds for timing-dependent screens. Screenshots in [docs/qa/](qa/).

**Not tested here:** anything with a camera (none on this machine; no webcam by rule): calibration at 1.5 m, pose play, the X gesture itself and its on-screen hint, "Camera starting…", R, the hands-free replay. Supabase (no `.env.local` here; Q17's Supabase route was tested against an unreachable URL, never a real project). Real GPU frame rate. Sound and music.

## Open findings

### Q12 (minor, open by choice)
The landing "Play on your laptop" QR starts at y 748 (below the fold at 720, at the edge at 768) ([landing-1366.jpg](qa/landing-1366.jpg)). The kiosk (`?kiosk=1`) is the QR screen for the table.
## Fixed and verified (on bb17780 unless noted)

- **Q1:** at 1280×720 and 1366×768 the select screen is exactly one screen tall; Camera at y 508–556, START at 607–679 ([select-1280x720.jpg](qa/select-1280x720.jpg)).
- **Q2** (5a85969): no camera → "NO CAMERA FOUND · This computer has no camera we can use…" ([camera-error.jpg](qa/camera-error.jpg)).
- **Q3:** one Full body round → Leaderboard → ARMS: "ARMS · FLOOR" title, filters and BACK stay, "Be the first" in the body ([leaderboard-empty-filter.jpg](qa/leaderboard-empty-filter.jpg)).
- **Q4:** Tab to "Play as guest" → `outline: solid 2px` lime ([focus-primary.jpg](qa/focus-primary.jpg)).
- **Q5:** PLAY THIS NEXT at y 553–625 at both sizes, readable and clickable. Note: at 1280×720 its bottom ~10 px sits under the footer fade ([results-1280x720.jpg](qa/results-1280x720.jpg)); the rep rows still scroll.
- **Q6** (5a85969): the cue sits in the top band, clear of the obstacle ([hud-cue-1366.jpg](qa/hud-cue-1366.jpg)); see Q15 for what it now overlaps.
- **Q7:** pause shows END ROUND ([paused-1366.jpg](qa/paused-1366.jpg)); it returns to the select screen, and that round is not saved (the dashboard counted only the next, full round).
- **Q8** (5a85969): another tab for 3 s mid-round → back on PAUSED, clock held at 0:40; Esc resumes ([tab-switch-paused.jpg](qa/tab-switch-paused.jpg)).
- **Q9, Q10** (5a85969): offline mid-round → banner at the bottom, "Offline. Your rounds are saved on this laptop." on the local store ([offline-banner.jpg](qa/offline-banner.jpg)); no NOT SYNCED.
- **Q11:** dashboard says "1 DAY" and "1 round · Best …".
- **Q13:** the `mapping-edges` test runs and passes.
- **Q15** (231dc4a, #46): at 1366×768 and 1920×1080 the cue stays in the top band, "5/10/20 COMBO!" appears at bottom centre and the "VS GHOST" chip at bottom right; nothing overlaps at any of the three milestones ([1366 at 5](qa/q15-fixed-1366.jpg), [1920 at 10](qa/q15-fixed-1920.jpg)). Old evidence kept: [before, 1366](qa/q15-cue-over-banner-1366.jpg).
- **Q16** (ba46d74): a local profile with three 45 s rounds (best 4,750) shows "Sam" once on the landing top list, the leaderboard and `?kiosk=1`.
- **Q14** (7be4281): a keyboard round → Esc: PAUSED, RESUME, END ROUND and the key hints; no "Cross your arms to resume" ([paused-1366.jpg](qa/paused-1366.jpg)). The camera-side hint (48 px, white, only with `cameraSlot`) is read from code: no camera here.
- **Q17** (7be4281), both routes: (1) fresh browser → `?kiosk=1&store=local` → landing still "PLAY AS GUEST", no `codejam.local.profile` saved. (2) A dev server with an unreachable Supabase URL (`http://127.0.0.1:9`, set only in that process, no real project): the kiosk's sign-in fails ("Guest sign-in failed; using the local store for this visit") → landing still "PLAY AS GUEST", nothing saved. Route 1 is now a sweep check.
- **A3** (7be4281): `CalibrationScreen.tsx` "Camera starting…" is `font-display-italic text-display-sm text-text` (48 px, white). The calibration screen needs a camera, so read from code only.
- **Per-length boards (#45, ba46d74):** at 1920×1080, 1366×768 and 1280×720 the three filter groups (workout, mode, 45/90/180 S) sit on one row with nothing clipped and no horizontal scroll ([leaderboard-1280x720.jpg](qa/leaderboard-1280x720.jpg)); 1280×720 is 722 px tall (a 2 px scroll). 90 S with no rounds keeps the title "FULL BODY · FLOOR · 90 S", the filters and BACK ([leaderboard-empty-filter.jpg](qa/leaderboard-empty-filter.jpg)); Legs is disabled on Treadmill; results said "#1 on the leaderboard" for the 45 s round. `?kiosk=1` shows the 45 s board with no filters at all three sizes, no scroll. Not tested: Supabase (migration 0003 and other players on the board).
- **A1:** `ResultsScreen.tsx` now uses `text-display-sm` (48 px) and a 96 px figure. Only shown with the camera, so read from code.
- **A2** (5a85969): tutorial counter 32 px, move name 72 px, hint 48 px white ([tutorial-1280x720.jpg](qa/tutorial-1280x720.jpg)).
- **A3, first half:** the tracking-lost subtext is `text-title text-text` (32 px, white).
- **perf 1** (5a85969): 24 game modules are fetched on the select screen, none on landing.

## Reading from the mark (1.5 m)

At 1.5 m on a 14" laptop (about 0.23 mm per CSS pixel), comfortable reading needs a font of about 36 px; about 24 px is the floor for one short word. Contrast measured earlier passes WCAG AA everywhere (lowest 6.0).

| What the standing player reads | Size | Verdict |
| --- | --- | --- |
| HUD score / timer / cue word | 112 / 72 / 72 px | pass |
| "+100" feedback | 48 px | pass |
| PERFECT/GOOD/LATE, combo | drawn in the 3D scene | not measured; large in screenshots |
| Calibration message, "Step back" | 48–72 px | pass (code; no camera here) |
| Tutorial hint | 48 px white | pass |
| Tracking lost: title / subtext | 112 / 32 px | pass |
| Results "RAISE BOTH ARMS TO PLAY AGAIN" | 48 px | pass (code) |
| Pause "Cross your arms to resume" | 20 px grey | **fail (Q14)** |

Labels: every control has an accessible name. Reduced motion: no CSS animation runs; the game drops the fly-in, shake and pops (`src/game/README.md`; not checked visually).

## Performance (`main` 82b3622, production build)

Landing transfers 280 KB (JS 172 KB gzip), FCP 0.24–1.51 s and LCP 0.59–1.79 s from no throttling to Lighthouse's mobile network preset, no long tasks, no layout shift. The game chunk (163 KB gzip) now loads on the select screen. Picking Camera on the live site downloads the WASM and model, about 9 MB with brotli (7 s at 10 Mbps); localhost is instant. The game ran at 60 FPS in headless Chrome with a GPU during the screenshot rounds. Lighthouse scores not run (needs a person in DevTools → Lighthouse).

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
| 15:47 | Devpost screenshots (`q-shots`) | 13 captures at 1920×1080 from scripted perfect rounds; found Q15 and Q16 |
| 15:50 | Operator card (`q-operator`), pitch 2 (`q-pitch-2`) | Card from DEMO.md and the app; Q&A for the new features; round timed at 50.1 s START → results |
| 15:55 | Verify #41 on bb17780 (`q-qa-2`) | Q1, Q3, Q4, Q5, Q7, Q11, A1 fixed; A3 half; Q12, Q14, Q15, Q16 open |
| 16:04 | Loop: #42 on bff0541 | New scenery colours and bigger icons; Devpost game frames retaken (`q-shots`); Q15 re-checked, still open; 699 tests |
| 16:25 | Leaderboard per length (`q-board`, ba46d74) | 3 sizes: filters fit on one row, empty 90 s board keeps filters, kiosk shows 45 s; Q16 verified fixed; 12/13 Devpost shots retaken; README/SUBMISSION board wording updated. Not tested: Supabase |
| 16:30 | Judge Q&A (`q-judge`) | Added "Doesn't a longer round always win?"; sceptical pass fixed 5 answers (leaderboard view, X now tried on a real camera, 1.2 m dropped, calories formula, privacy); round re-timed: 50.2 s START → results on ba46d74 |
| 16:36 | Q15 re-check on 231dc4a (#46), Devpost 04–09 (`q-shots-2`) | Q15 fixed at 1366 and 1920; game frames retaken (silver ghost, chip bottom right) |
| 16:37 | Tests (`q-tests-2`) | `src/workout/pitch-claims.test.ts`: perfect demo = 4,750 / 100% / ≈7.35 kcal; 180 s ≈ 5–7× 45 s; Legs floor-only. 5 pass |
| 16:40 | Sweep script (`q-sweep`) | `docs/qa/sweep/`: one command, 3 sizes in parallel, 34 checks each; first run 102/102 passed |
| 16:42 | Operator card (`q-operator-2`) | Camera preselected, X chest-to-chin; found Q17 (local-store kiosk saves a "Leaderboard" player) |
| 17:07 | Re-sweep 7be4281 (`q-docs-sync`) | Sweep 105/105 (new checks: Q14, Q17 route 1); Q14, Q17 (both routes), A3 marked fixed; test count 762, shot dates, ghost chip position and doc links aligned across README, SUBMISSION, OPERATOR, DEMO; kiosk warning removed |
