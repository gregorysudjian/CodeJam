# QA sweep

Replays the whole keyboard flow at 1366×768, 1920×1080 and 1280×720 in parallel and checks it. About 4 minutes (the demo round is 180 s). Use it after every merge to `main`.

```bash
npm run dev                                   # in one terminal
node docs/qa/sweep/sweep.mjs                  # in another; exit 0 = all checks passed
node docs/qa/sweep/sweep.mjs http://localhost:5173/ ./my-out   # base URL and output folder
SIZES=1093x614@1.25,911x512@1.5 node docs/qa/sweep/sweep.mjs     # display scaling / browser zoom (CSS size @ scale)
REDUCED_MOTION=1 node docs/qa/sweep/sweep.mjs                    # prefers-reduced-motion: reduce
PORT_BASE=9420 node docs/qa/sweep/sweep.mjs                      # DevTools ports, to run two sweeps side by side
```

With `REDUCED_MOTION`, the motion library's own notice ("You have Reduced Motion enabled") is expected and ignored. Shots of landing, select, dashboard, leaderboard and kiosk wait for the fade-in and the podium count-up. Run at most about 4 browsers at once: more and the autoplayer misses cues (the score check fails).

Needs Node 22+ (built-in WebSocket) and Chrome (`CHROME=/path/to/chrome` to override). No packages. Must be the dev server: the autoplayer imports the level generator from `/src/workout/index.ts`.

**What it does, per size** (headless Chrome, fresh profile, `?demo=1&store=local`, camera permission denied):
`?kiosk=1` → landing → sign-up card (username "Sweep", level Regular, START; without the card: Play as guest → profile) → select → START → tutorial → Esc → a scripted **perfect** 180 s demo round (6 levels) (`auto.js` syncs to the HUD cue and presses each key 0.08 s before the object arrives) with shots in the city, tunnel, bridge and finale → results → Play again → Esc → END ROUND → dashboard → leaderboard → empty Arms board → `?kiosk=1` → landing again (Continue as Sweep) → New player → Play as guest → profile.

**Checks (about 50 per size):** opening the kiosk first saves no player (Q17), each screen appears, no horizontal scroll on any shot, **WCAG AA text contrast on every non-game screen**, the select screen fits, the demo preselects Full body · floor · Regular, the perfect round scores 24,800 and reads ALL 6 LEVELS CLEARED with a RULES coach card, a keyboard pause shows no X-gesture hint (Q14), END ROUND saves nothing, the board and the kiosk are one per workout and mode (no round length), an empty Arms board keeps its filters and Back, the returning player is offered, the guest path still reaches the profile screen, and **no console errors or warnings**.

**Contrast check** (`b.contrast()` in `cdp.mjs`): every visible text run is compared with the pixels behind it, taken from a second screenshot with all text made transparent, so glass, gradients, photos and video count. A run fails under 4.5:1 (3:1 for large text: 24 px, or 18.66 px bold), at the 10th percentile of its pixels so film grain doesn't count but a bright patch does. aria-hidden and disabled text are skipped (WCAG exempts inactive controls). The failing check lists the worst four runs.

**Output:** PNGs per size and `summary.json` in the output folder (default: the system temp folder, printed at the end).

**Not covered:** the camera (calibration, pose moves, the X gesture), Supabase, sound, treadmill and the other workouts.

Files: `sweep.mjs` (the flow and checks), `cdp.mjs` (a small DevTools-protocol driver), `auto.js` (the in-page autoplayer).
