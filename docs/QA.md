# QA (fourth helper)

## Needs Greg

Branches are pushed with the PR text in the first commit message (`git log --reverse main..<branch>`).

1. **Decide Q15:** the HUD cue word, the "N COMBO!" banner and the "VS GHOST" chip share the top-centre band and overprint each other. Either the UI moves the cue, or Patrick moves the banner and chip (details below).

## Status (Sat 16:00, `main` at bb17780)

Full keyboard flow at 1366×768, 1920×1080 and 1280×720 with the new game (city/tunnel/bridge zones, beat, PERFECT/GOOD/LATE, 3-2-1 intro), plus a check of every fix in #40 and #41. **No console errors, no horizontal scroll, every round finished and saved.** `npm run check`: 695 tests, none skipped.

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
| Q12 | minor | Landing QR below the fold at 1366/1280 | `src/ui` | open (use `?kiosk=1`) |
| Q13 | minor | One NaN row would block the offline queue | Greg | **fixed** (test runs and passes) |
| Q14 | visible | "Cross your arms to resume" is small, grey, and shown to keyboard players | `src/ui` | **open** |
| Q15 | visible | HUD cue word overprints the "N COMBO!" banner and the VS GHOST chip | `src/ui` or Patrick | **open**, needs a decision |
| Q16 | minor | Local store leaderboard lists every round, not each player's best | Greg | **open** |
| A1 | visible | Results: "RAISE BOTH ARMS TO PLAY AGAIN" was 20 px | `src/ui` | **fixed** (code; camera-only screen) |
| A2 | visible | Tutorial hint was 20 px grey | Greg | **fixed**, verified |
| A3 | minor | Tracking-lost subtext 16 px; "Camera starting…" 14 px | `src/ui` | half fixed: "Camera starting…" open |
| perf 1 | — | Fetch the game chunk on the select screen | Greg | **done**, verified |

**How tested:** Chrome 157 headless driven over the DevTools protocol (a script, no packages), `npm run dev`, `?store=local`, real key events; scripted perfect rounds for timing-dependent screens. Screenshots in [docs/qa/](qa/).

**Not tested here:** anything with a camera (none on this machine; no webcam by rule): calibration at 1.5 m, pose play, the X gesture itself, R, the hands-free replay. Supabase (no `.env.local` here, always the local store). Real GPU frame rate. Sound and music.

## Open findings

### Q14. The pause screen's "Cross your arms to resume"
- **Steps:** any size → start a round with the **keyboard** → Esc.
- **Expected:** the gesture hint only for camera players, readable from the mark (1.5 m).
- **Saw:** "Cross your arms to resume" for a keyboard player, at 20 px in muted grey (`text-body text-text-muted`, `GameHud.tsx:296`) ([paused-1366.jpg](qa/paused-1366.jpg)). A camera player who just paused with the X has to read it from 1.5 m.
- **Owner:** `src/ui/screens/GameHud.tsx`. **Fix:** show it only when `cameraSlot` is set, as `font-display-italic text-display-sm text-text` (48 px, white).

### Q15. The cue word, the milestone banner and the ghost chip overlap
- **Steps:** `/?demo=1&store=local`, play the demo level cleanly (a ghost from an earlier run adds the chip). At streak 5 (about 0:30 left), 10 (about 0:22) and 20 (about 0:07) the game shows "N COMBO!" for 1.3 s.
- **Expected:** the banner readable.
- **Saw:** each milestone came while a cue was showing. At 1920×1080 "SIDESTEP" sits on "5 COMBO!" and "REACH" on "10 COMBO!"; at 1366×768 "SIDESTEP" covers "5 COMBO!" and the "EVEN VS GHOST" chip completely ([1366](qa/q15-cue-over-banner-1366.jpg), [1920 at 5](qa/q15-cue-over-banner-1920.jpg), [1920 at 10](qa/q15-cue-over-banner-10-1920.jpg)). "20 COMBO!" stays readable at 1920 (the cue sits just above it). Unchanged by #41.
- **Cause:** the cue is in the top band (`hud-cue`, `top-[124px]`, `GameHud.tsx:238`), where the game draws its banner (`BANNER_POS` y 3.3) and race chip (`RACE_POS` y 6.2, `src/game/tuning.ts`).
- **Owner:** `src/ui` or Patrick; needs one decision. **Fix options (untested):** move the banner and chip lower, between the cue band and the horizon; or move the cue to one side of the top band (e.g. under the score) so the centre stays free for the game's labels.

### Q16. Local store leaderboard shows the same player twice
- **Steps:** `?store=local`, play two rounds with one guest → Leaderboard (or `?kiosk=1`).
- **Saw:** "Sam" at #1 (4,750) and #2 (1,750). The Supabase `leaderboard` view keeps each user's best only (CONTRACTS.md), so only the offline path differs.
- **Owner:** Greg (`src/data/local.ts` `getLeaderboard`). **Fix:** keep the best session per display name before sorting.

### Q12, A3 (minor)
- **Q12:** the landing "Play on your laptop" QR starts at y 748 (below the fold at 720, at the edge at 768) ([landing-1366.jpg](qa/landing-1366.jpg)). Use `?kiosk=1` for the QR at the table.
- **A3:** calibration "Camera starting…" is still a 14 px muted eyebrow (`CalibrationScreen.tsx:117`) while the player walks to the mark. Fix: `font-display-italic text-display-sm text-text`.

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
| 16:00 | Verify #41 on bb17780 (`q-qa-2`) | Q1, Q3, Q4, Q5, Q7, Q11, A1 fixed; A3 half; Q12, Q14, Q15, Q16 open |
