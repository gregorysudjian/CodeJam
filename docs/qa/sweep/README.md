# QA sweep

Replays the whole keyboard flow at 1366×768, 1920×1080 and 1280×720 in parallel and checks it. About 3 minutes. Use it after every merge to `main`.

```bash
npm run dev                                   # in one terminal
node docs/qa/sweep/sweep.mjs                  # in another; exit 0 = all checks passed
node docs/qa/sweep/sweep.mjs http://localhost:5173/ ./my-out   # base URL and output folder
```

Needs Node 22+ (built-in WebSocket) and Chrome (`CHROME=/path/to/chrome` to override). No packages. Must be the dev server: the autoplayer imports the level generator from `/src/workout/index.ts`.

**What it does, per size** (headless Chrome, fresh profile, `?demo=1&store=local`, camera permission denied):
`?kiosk=1` → landing → Play as guest → profile ("Sweep") → select → START → tutorial → Esc → a scripted **perfect** demo round (`auto.js` syncs to the HUD cue and presses each key 0.08 s before the object arrives) with shots in the city, tunnel, bridge and finale → results → Play again → Esc → END ROUND → dashboard → leaderboard → 90 S filter → `?kiosk=1` → landing again.

**Checks (35 per size):** opening the kiosk first saves no player (Q17), each screen appears, no horizontal scroll on any shot, the select screen fits, the demo preselects Full body · floor · 45 s, the perfect round scores 4,750 with a RULES coach card, a keyboard pause shows no X-gesture hint (Q14), END ROUND saves nothing, the board title carries the round length, an empty 90 s board keeps its filters and Back, the kiosk shows the 45 s board, the returning player is offered, and **no console errors or warnings**.

**Output:** PNGs per size and `summary.json` in the output folder (default: the system temp folder, printed at the end).

**Not covered:** the camera (calibration, pose moves, the X gesture), Supabase, sound, treadmill and the other workouts.

Files: `sweep.mjs` (the flow and checks), `cdp.mjs` (a small DevTools-protocol driver), `auto.js` (the in-page autoplayer).
