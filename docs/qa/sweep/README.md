# QA sweep

Replays the whole keyboard flow at 1366×768, 1920×1080 and 1280×720 in parallel and checks it. About 10 minutes (a 180 s demo round, then four short rounds for the nav bar). Use it after every merge to `main`.

```bash
npm run dev                                   # in one terminal
node docs/qa/sweep/sweep.mjs                  # in another; exit 0 = all checks passed
node docs/qa/sweep/sweep.mjs http://localhost:5173/ ./my-out   # base URL and output folder
SIZES=1093x614@1.25,911x512@1.5 node docs/qa/sweep/sweep.mjs     # display scaling / browser zoom (CSS size @ scale)
REDUCED_MOTION=1 node docs/qa/sweep/sweep.mjs                    # prefers-reduced-motion: reduce
PORT_BASE=9420 node docs/qa/sweep/sweep.mjs                      # DevTools ports, to run two sweeps side by side
```

With `REDUCED_MOTION`, the motion library's own notice ("You have Reduced Motion enabled") is expected and ignored. Shots of landing, select, dashboard, leaderboard and kiosk wait for the fade-in and the podium count-up. Run at most about 4 browsers at once. The autoplayer times its keys by the wall clock while the game advances at most 50 ms per frame, so slow frames (125/150 % scaling, a loaded machine) make it drift: a score a few hundred short of 24,800 with ALL 6 LEVELS CLEARED is that drift, not a game bug. Check the `perf` lines.

Needs Node 22+ (built-in WebSocket) and Chrome (`CHROME=/path/to/chrome` to override). No packages. Must be the dev server: the autoplayer imports the level generator from `/src/workout/index.ts`.

**What it does, per size** (headless Chrome, fresh profile, `?demo=1&store=local`, camera permission denied):
`?kiosk=1` → landing → sign-up card (username "Sweep", level Regular, START; without the card: Play as guest → profile) → select → START → tutorial → Esc → a scripted **perfect** 180 s demo round (6 levels) (`auto.js` syncs to the HUD cue and presses each key 0.08 s before the object arrives) with shots in the city, tunnel, bridge and finale → results → Play again → Esc → END ROUND → dashboard → leaderboard → empty Arms board → `?kiosk=1` → landing again → Continue as Sweep → **nav bar tour** (when select has the NavBar: PLAY, PROGRESS, LEADERBOARD and the player chip from select, then from results after an idle round lost in about 30 s, one round per item; each must land on its screen and get back to select) → landing → New player → Play as guest → profile (first-time setup: no nav bar). The leaderboard step also opens the **FRIENDS** tab (local store: "Friends need the internet"), and the nav tour checks that the profile opened from the player chip keeps the nav bar.

**Calibration** runs in a second browser per size with Chrome's fake camera (a test pattern, never a real webcam; no person, so it stays on "Get in position"): sign-up → Camera on select → START → calibration (shot `18-calibration`, fits, AA) → Esc back to select → START → K → tutorial. Not in the main browser: with a camera present the app switches the whole flow to pose input. MediaPipe's own "OpenGL error checking is disabled" notice is ignored.

**Checks (about 80 per size):** opening the kiosk first saves no player (Q17), each screen appears, no horizontal scroll on any shot, **WCAG AA text contrast on every non-game screen**, the select screen fits, the demo preselects Full body · floor · Regular, the perfect round scores 24,800 and reads ALL 6 LEVELS CLEARED with a RULES coach card, a keyboard pause shows no X-gesture hint (Q14), END ROUND saves nothing, the board and the kiosk are one per workout and mode (no round length), an empty Arms board keeps its filters and Back, the returning player is offered, the guest path still reaches the profile screen, each nav item lands on its screen from select and from results, and **no console errors or warnings**.

**HUD over the city clips:** in the demo round, for each of the 6 levels, the HUD just after the portal (+1 s), on the first move cue after it, and on the first cue from mid-level (+15 s), shots `hud-L<n>-*`. Every HUD text (cue, countdown digit, score, timer, level, FINISH, popups) must pass AA, and the hearts 3:1 (`.hud-heart`), against the clip at that moment. The cue's glow is not counted (shadows are removed for the measurement). Each sample decodes a screenshot in the page, which slows the game for a moment: at 125/150 % that is enough to make the wall-clock autoplayer miss, so `HUD_AA=0` skips the samples when you need the perfect score there. The clips that loaded during the round are listed in a `perf` line.

**Stutter (info, never fails):** at each game shot, 2 s of frame times, printed as `perf` lines (fps, worst frame, frames over 50 ms) and kept in `summary.json`. Headless Chrome on the test machine, not the demo laptop.

**Contrast check** (`b.contrast()` in `cdp.mjs`): every visible text run is compared with the pixels behind it, taken from a second screenshot with all text made transparent, so glass, gradients, photos and video count. A run fails under 4.5:1 (3:1 for large text: 24 px, or 18.66 px bold), at the 10th percentile of its pixels so film grain doesn't count but a bright patch does. Text fields count too (the typed value, or the placeholder when empty). Skipped: aria-hidden and disabled text (WCAG exempts inactive controls) and text covered by something else (the pause overlay over the HUD). The failing check lists the worst four runs.

**Output:** PNGs per size and `summary.json` in the output folder (default: the system temp folder, printed at the end).

**Not covered:** a real person on camera (calibration passing, pose moves, the X gesture), Supabase (so the friends board itself), sound, treadmill and the other workouts.

Files: `sweep.mjs` (the flow and checks), `cdp.mjs` (a small DevTools-protocol driver), `auto.js` (the in-page autoplayer).
