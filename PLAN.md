# Build plan: webcam fitness app (CodeJam 16)

Revised Saturday around 1:45 AM. Code freeze is Sunday 12:00 PM. All times are Montreal time.

Companion docs: [CONTRACTS.md](CONTRACTS.md) (shared interfaces, database schema, detection rules) and [DEMO.md](DEMO.md) (pitch, demo, judge Q&A).

## 0. Assumptions to settle in the first 5 minutes

- **Names and skills were left as placeholders**, so the plan uses roles A to D. Assign them with the "best fit" column in section 3.
- **The fifth Claude account was unclear.** The plan treats it as existing with about 20% left and keeps it in reserve. If it does not exist, the API credits take its place.
- **No treadmill at the venue.** Treadmill mode is demoed by jogging on the spot close to the laptop.
- **You do the 2-hour Phase 0 tonight, then sleep.** If you sleep first, use the variant under the timeline in section 6.

## 1. The recommendation in short

Build a full-stack web application with four parts:

1. **The game.** A 3-lane runner in Three.js, controlled by MediaPipe pose tracking, where the level is generated from the workout you pick.
2. **Accounts and a database.** Supabase Auth and Postgres store profiles and every workout session.
3. **A progress side.** A dashboard with history, weekly active minutes against a goal, reps per move and a day streak, plus a global leaderboard.
4. **An AI coach.** A server endpoint sends your recent sessions to Claude and returns a recap and a recommended next session, which the level generator then builds.

The game alone is a fun demo. The health case for the judges is the loop around it: play, see what you did, get told what to do next, come back tomorrow.

Four decisions keep this safe to build in one day:

1. **Pose tracking runs on the player's device, the backend does everything else.** Sending video to a server would add lag that makes the game unplayable and would mean uploading video of people's bodies. The backend owns identity, history, leaderboard and coaching.
2. **Walking skeleton first.** By the end of Phase 0, `main` has every module wired together with stubs. Each later phase replaces a stub behind a fixed interface, so merges stay small and `main` is always demoable.
3. **Every outside dependency has a local stand-in behind the same interface.** Keyboard for the camera, a local store for the database, a rule-based recap for the AI coach. The team builds without waiting on each other, and the demo survives bad wifi.
4. **Guest first, timed rounds, no game over.** A judge plays within 10 seconds with no sign-up wall, always gets a full 45-second round, and always reaches the results screen.

## 2. Tech stack and architecture

| Layer | Choice | Why |
| --- | --- | --- |
| App shell | Vite + React + TypeScript (strict) | Fast setup, and it is what Lovable generates, so its screens paste in |
| UI | Tailwind + shadcn/ui, Recharts for the dashboard | Same reason; no hand-rolled components |
| Game | Plain Three.js inside one `createGame()` function | The game loop stays out of React; AI tools write Three.js well |
| Pose | `@mediapipe/tasks-vision` Pose Landmarker (lite model, GPU delegate) | 33 body landmarks at 30+ FPS on the device, nothing to train |
| Auth and database | Supabase: anonymous sign-in, Postgres, row-level security | A real relational database and auth in an hour instead of a day |
| Server code | Vercel serverless functions in `api/` (TypeScript) | Deployed by `git push` with the frontend; keeps the Claude key off the client |
| AI | Claude API, a small fast model, called only from `api/` | Cheap, quick, and you already have credits |
| Tests | Vitest, for workout logic and server validation | Pure functions, cheap to test |
| Hosting | Vercel, plus `npm run preview` on the demo laptop | Public link for voters, local copy for the demo |

Put the model file and the MediaPipe WASM files in `public/` so nothing loads from a CDN during the demo. Use Chrome only.

```
ON THE DEVICE
  Webcam ───► pose/  ──┐
  Keyboard ─► input/ ──┴─► InputSource ─► game/ ◄─ Level ◄─ workout/ generateLevel(config)
                                            │ GameEvent                    ▲ SessionConfig
                                            ▼                              │
                          workout/ SessionTracker ─► SessionSummary ─► app/ + ui/
                                                                           │ DataStore
  ─────────────────────────────────────────────────────────────────────────┼──────────
BACKEND                                                                    ▼
                               data/  Supabase store (local store as offline fallback)
                                 │                                │
                 Supabase Auth + Postgres                 api/coach (Vercel function)
                 profiles, sessions, leaderboard            reads history, calls Claude,
                                                            returns CoachAdvice
```

### Product flow

Landing → play as guest (name, goal, fitness level, optional weight; skippable) → pick a workout or tap "Coach's pick" → calibrate → play → results with coach card → dashboard and leaderboard.

### Game design

- Three lanes, the character runs forward on its own. A round lasts 45 s (demo), 90 s or 180 s.
- Five things come at you, each tied to one move:

| Object | Looks like | Move that clears it |
| --- | --- | --- |
| `block` | Wall filling one or two lanes | Step sideways into a free lane |
| `hurdle` | Low bar across the track | Jump |
| `beam` | Overhead bar across the track | Squat |
| `crate` | Breakable wall across the track | Raise both arms (overhead press) |
| `orb` | Floating collectible | Raise an arm in that lane (bonus points, no penalty if missed) |

- The workout sets the mix. Starting weights, to tune by playing:

| Workout | block | hurdle | beam | crate | orb | Flavour |
| --- | --- | --- | --- | --- | --- | --- |
| Legs | 25% | 30% | 35% | 5% | 5% | Squat holds under long beams |
| Arms | 15% | 5% | 5% | 35% | 40% | Fast alternating left and right reaches |
| Shoulders | 10% | 5% | 5% | 45% | 35% | Arms held overhead through long gates |
| Full body | 20% | 20% | 20% | 20% | 20% | Combos of two moves |

- Each round has a curve: warm-up, build, peak, cool-down. A `difficulty` value from 0 to 1 scales how dense it gets, and the coach sets it from your history.
- **Treadmill mode** uses only the upper body: reach left, reach right, both arms up. It calibrates on the shoulders, so it also works 1 to 1.5 m from the laptop. The Legs card is disabled there because running is the leg work.
- Every object is announced at least 2 seconds ahead with a colour, an icon and a word ("SQUAT"). Body input is slower than a keypress, so hit windows are generous (see CONTRACTS.md).

### What the backend does

- **Auth:** anonymous sign-in creates a real user the moment someone taps "Play as guest". Linking an email later is a stretch goal.
- **Database:** `profiles` and `sessions` tables with row-level security, so a user can only read and write their own rows. A `leaderboard` view exposes only name, workout and score.
- **`POST /api/coach`:** verifies the user's token, loads their profile and last ten sessions, asks Claude for a short recap, one tip and a recommended next session as JSON, validates the answer, and returns it. If anything fails or takes more than 8 seconds, the client uses a rule-based recap instead.

## 3. Roles and ownership

One person owns each folder. Nobody edits another person's folder.

| Role | Owns | Best fit |
| --- | --- | --- |
| **A, Vision** | `src/pose/`, `public/models/`, `public/mediapipe/` | Comfortable with math, signals or computer vision |
| **B, Game** | `src/game/`, `src/input/`, `public/game/` | Graphics or game experience, strongest JavaScript |
| **C, Backend and workout logic** | `src/workout/`, `src/data/`, `supabase/`, `api/` | Has built an API or used SQL; careful and test-minded |
| **D, UI and integrator** | `src/app/`, `src/ui/`, `public/ui/`, and all shared files | Frontend or design sense, the most organised person |

C has the widest scope, so C runs two AI agents at once: Codex on the workout logic and Claude on the backend (section 8). If C is behind at a merge, A or B takes over workout balancing.

D is the merge captain and the only person who edits shared files: `src/contracts/index.ts`, `package.json`, the lockfile, config files, `index.html`, `.env.example`, `AGENTS.md`.

Pick one **demo laptop** at kickoff (best GPU and webcam) and test every merge on it.

## 4. Must-have, should-have, stretch

**Must-have (the MVP, done by Saturday 6:30 PM at the end of Phase 2)**

1. Webcam pose tracking with a calibration step
2. Four moves detected: sidestep, jump, squat, both arms up
3. The 3-lane runner with `block`, `hurdle`, `beam`, `crate`, and on-screen cues
4. Workout selection (four workouts) that changes the mix, with difficulty that ramps
5. Timed round with score and streak
6. Results screen: reps per move, estimated calories, score
7. Guest profile, and every session saved to Postgres
8. Progress dashboard built from saved sessions
9. Global leaderboard
10. Coach card on the results screen (rule-based at minimum)
11. Fallbacks: keyboard input, local store when offline

**Should-have (Phases 2 and 3)**

- Coach powered by Claude through `/api/coach`, with "Play coach's pick"
- Treadmill mode
- Hands-free start and replay (raise both arms)
- Sound effects and music
- Camera preview with skeleton in the corner
- Auto-pause when the player leaves the frame
- Low-impact toggle (no jumps)

**Stretch, in order of value for effort.** Take one only if everything above is merged.

1. Challenge link: share a URL that replays the same seeded level with your score to beat
2. "I'm holding weights" toggle that scales the calorie estimate and labels reps as weighted
3. Link an email to a guest account so history follows the user to another device
4. Installable app (web app manifest and icons)
5. Avatar whose arms and crouch mirror the player
6. Extra moves: punch (arms), lateral raise (shoulders), high knees
7. Two players side by side

**Cut order if you are behind:** stretch, treadmill mode, music, orbs, hands-free start, Claude coach (keep the rule-based one). Never cut calibration, cues, the results screen, saved sessions, the dashboard or the two fallbacks.

## 5. Phases

Each phase has four tasks in separate folders, built against the contracts with mocks, so no task waits on another. Each phase ends with a merge, a test on the demo laptop, and a git tag.

### Phase 0: walking skeleton (2 h, Sat 2:00 to 4:00 AM)

**Together, 30 minutes, one screen, D drives:**

1. Scaffold Vite + React + TypeScript, add Tailwind and shadcn/ui, install `three`, `@types/three`, `@mediapipe/tasks-vision`, `@supabase/supabase-js`, `recharts`, `vitest`, Prettier. Add `.gitattributes` with `* text=auto eol=lf`.
2. Paste the code from CONTRACTS.md into `src/contracts/index.ts`. Read it together, take 10 minutes of objections, then freeze it.
3. Commit a stub `index.ts` in each module folder that satisfies the contract, so everything compiles from the first minute.
4. Create the Supabase project and the Vercel project. Commit `.env.example`; share the real values in the group chat and keep them in `.env.local`, which is git-ignored.
5. Add `npm run check` (typecheck, lint, test, build). Push to `main`. Everyone clones and runs `npm run dev`.
6. Assign roles, pick the demo laptop, pick a name (2 minutes, not 20).

**Then in parallel, 60 minutes:**

| Who | Task | Output |
| --- | --- | --- |
| A | Pose spike on a dev page (`?dev=pose`): webcam, Pose Landmarker loaded from `public/`, skeleton drawn, FPS counter | Skeleton at 25+ FPS on the demo laptop |
| B | `createKeyboardInput()` and a minimal `createGame()`: three lanes, moving ground, a box that follows the input, boxes spawned from `level.waves`, a `finished` event | Box game playable with arrow keys |
| C | `generateLevel()` stub, `createSessionTracker()` stub, `WORKOUTS` metadata, and `createLocalStore()`: the full `DataStore` on `localStorage`, which is both today's stub and the permanent offline fallback. Enable anonymous sign-in in Supabase | Level, tracker and store usable by B and D |
| D | Screen flow `landing → profile → select → calibrate → play → results → dashboard` with placeholder screens, game screen that calls `generateLevel` and `createGame`, results that call `store.saveSession`, Vercel deploy. Start the Lovable design in the background | Click-through app on a public URL |

**Done when:** on `main`, you can click from landing to results and move the box with the keyboard; the finished round shows up in the placeholder dashboard after a reload; the pose page shows a skeleton on the demo laptop; the deploy URL works; `npm run check` passes. Tag `phase-0`.

### Phase 1: core mechanics (3.5 h, Sat 10:00 AM to 1:30 PM)

| Who | Task | Own check before merging |
| --- | --- | --- |
| A | Real detection: `calibrate()` with status messages, landmark smoothing, lane with hysteresis, jump, squat, arms up, `tracking` flag, move events. A debug overlay with live values, thresholds and sliders. All thresholds in one `tuning.ts` | Each move registers 10 out of 10 for A and 8 out of 10 for a teammate of a different height |
| B | Real runner: forward motion, jump arc, crouch, lane slide, the five object types with distinct shapes and colours, collision rules from the contract, all `GameEvent`s, pause and resume | A 60-second round is playable by keyboard and the event log is correct |
| C | **Codex agent:** real `generateLevel()` (seeded random, workout weights, intensity curve, `difficulty`, fairness rules, treadmill subset) and the tracker (score, streak, reps, calories). **Claude agent, at the same time:** SQL schema and row-level security in `supabase/`, and `createSupabaseStore()` with guest sign-in, profile, save and list sessions, leaderboard | Tests pass and each workout's printed timeline looks right. A session saved in one browser appears on the leaderboard in another, and a second user cannot read the first user's sessions |
| D | Real screens, generated in Lovable and ported: landing, guest profile, workout select (four cards, mode toggle, duration), calibration driven by a mocked `CalibrationStatus`, HUD (score, streak, timer, big cue), results | Every screen is reachable with mocked data on the demo laptop |

**Merge 1 (1 h, with lunch in shifts).** D swaps the mock pose input for the real one and the local store for the Supabase store. Both are one-line changes because the screens were built against the interfaces.

**Done when:** a teammate plays a 60-second Full body round with their body, from landing to results, and the session is a row in the Supabase table. Write down what feels wrong; fix it in Phase 2, not during the merge. Tag `phase-1`.

### Phase 2: fun, reliable, and a complete loop (3 h, Sat 2:30 to 5:30 PM)

| Who | Task |
| --- | --- |
| A | Robustness. Test with three or more people, different clothes and distances. Slow baseline adaptation when the player drifts. `tracking: false` when the body is lost. Ignore people in the background. Tell a jump apart from standing up out of a squat. Lock the thresholds. Then the camera preview component with skeleton, and "raise both arms to start" |
| B | Game feel. Colour-coded telegraphing with floor markers, hit flash and shake, clear and collect effects, speed tied to `intensity`, fog and simple scenery, a simple character instead of a box, auto-pause when `tracking` is false. Sound effects and a music loop |
| C | The rule-based coach as a pure function, then `/api/coach` calling Claude and falling back to the rules. Offline queue so `saveSession` never fails. Balance the four workouts, the 45-second demo preset, the low-impact toggle |
| D | Results with the real summary and the coach card. Dashboard: session history, weekly active minutes against the goal, reps per move chart, day streak. Leaderboard screen. Error screens (camera denied, no camera, player lost, offline) |

**Merge 2 (1 h).** Bring in two people from other teams and say nothing while they play.

**Done when:**

- an outsider finishes a round using only the on-screen instructions
- at least 9 of 10 intended moves register, five rounds in a row run without a crash, and the demo laptop holds 30 FPS
- the round appears on the dashboard after a reload and on the leaderboard on a second device
- the coach card shows advice within 8 seconds
- with wifi switched off, a round still completes and is saved locally

This is the MVP. Tag `mvp`.

**Go or no-go at 6:30 PM:** if the MVP check fails, Phase 3 becomes "finish the MVP" and the should-haves are cut in the order from section 4.

### Phase 3: differentiators (2.5 h, Sat 7:30 to 10:00 PM)

| Who | Task |
| --- | --- |
| A | Treadmill mode input: upper-body calibration on the shoulders, reach left, reach right, both arms up, working 1 to 1.5 m from the camera. Floor mode must behave exactly as before |
| B | Treadmill mode game: orbs collected by reaching, crates smashed, no hurdles or beams. Performance pass: cap the pixel ratio, reuse geometry, pool objects |
| C | "Coach's pick": the advice's next session becomes a `SessionConfig` the player starts with one tap. Treadmill levels. Harden the endpoint: token check, input and output validation, a per-user rate limit, tests. Stretch item 1 if time allows |
| D | "Coach's pick" button on the select and results screens, a 15-second skippable "try each move" tutorial before the first round, dashboard polish, QR code to the public URL on the landing screen |

**Merge 3 (45 min).**

**Done when:** a treadmill round is playable by jogging on the spot 1.5 m from the laptop; after two rounds the coach recommends a third and one tap starts it; floor mode still passes the Phase 2 checks. Tag `phase-3`.

**Feature freeze at 10:45 PM.** After this, nobody starts anything new.

### Phase 4: polish and hardening (2.25 h, Sat 10:45 PM to 1:00 AM)

| Who | Task |
| --- | --- |
| A | Test in demo conditions: venue lighting, people walking behind the player, different distances. Add panic keys: `K` keyboard input, `R` recalibrate, `D` debug overlay. Write the station setup notes |
| B | Bug fixes, visual polish, a low-graphics toggle |
| C | Security pass: no keys in the repo or the client bundle, row-level security re-tested with two users, spend limit on the product's API key. README (what it is, how to run, architecture, AI tools used, asset credits). Submission text |
| D | Pitch script and at most three slides, UI bug bash, final deploy |

**Merge 4 (45 min).** Full run-through of every workout in both modes, then record the backup video (screen plus player).

**Done when:** ten rounds in a row without a crash; a fresh clone installs and builds; the backup video exists. Tag `v1.0-rc`.

### Phase 5: fix, rehearse, freeze (3.5 h, Sun 8:30 AM to 12:00 PM)

| Who | Task |
| --- | --- |
| A and B | Fresh-eyes playtest, then fix only bugs that crash the app or make it unplayable. A second person reads every fix before it merges |
| C | Final README and submission, verify the GitHub repo, clear test rows from the database, prepare the Q&A cheat sheet from DEMO.md |
| D | Set up the demo station, run three timed rehearsals |

**Done when:** `v1.0` is tagged by 11:30 AM, the submission is in, and three rehearsals came in under 3 minutes.

## 6. Timeline

| Time | What |
| --- | --- |
| **Sat** 2:00 to 2:30 AM | Kickoff together: roles, scaffold, contracts frozen, Supabase and Vercel projects created |
| 2:30 to 3:30 AM | Phase 0 in parallel |
| 3:30 to 4:00 AM | Merge 0, check on demo laptop, tag |
| 4:00 to 9:30 AM | Sleep (5.5 h) |
| 9:30 to 10:00 AM | Breakfast and stand-up. Everyone sends their first Claude message at 9:30 (see section 8) |
| 10:00 AM to 1:30 PM | Phase 1 |
| 1:30 to 2:30 PM | Merge 1, first body playtest, lunch in shifts |
| 2:30 to 5:30 PM | Phase 2 |
| 5:30 to 6:30 PM | Merge 2, outsider playtest, MVP go or no-go |
| 6:30 to 7:30 PM | Dinner away from the screens |
| 7:30 to 10:00 PM | Phase 3 |
| 10:00 to 10:45 PM | Merge 3, playtest, **feature freeze** |
| 10:45 PM to 1:00 AM | Phase 4 |
| **Sun** 1:00 to 1:45 AM | Merge 4, full run-through, backup video, tag `v1.0-rc` |
| 1:45 to 8:00 AM | Sleep (6 h) |
| 8:00 to 8:30 AM | Breakfast, set up the demo station |
| 8:30 to 10:00 AM | Phase 5 fixes, rehearsal 1 |
| 10:00 to 10:30 AM | Merge 5, test the local build and the public URL on the demo laptop |
| 10:30 to 11:15 AM | Rehearsals 2 and 3 with a timer, Q&A drill, README and submission text final |
| 11:15 to 11:30 AM | Fresh clone, install, build, play. Tag `v1.0`. Submit |
| 11:30 AM to 12:00 PM | Buffer. `main` is locked except for a broken-build fix |
| 12:00 PM | Hard freeze |

That is about 20 hours of work with two sleeps. Move the meal slots to match the hackathon's own schedule.

**Variant if you sleep first:** Phase 0 runs Sat 9:00 to 11:00 AM, Phase 1 from 11:00 AM to 2:30 PM, Phase 2 from 3:30 to 6:30 PM, Phase 3 from 8:00 to 10:00 PM with treadmill mode dropped if Phase 2 ran long. The feature freeze stays at 10:45 PM and the rest is unchanged.

## 7. Git strategy

**Branches**

- `main` always runs. It changes only at a phase merge, or when D makes a shared-file change.
- One short-lived branch per person per phase, cut from fresh `main`: `p1-pose`, `p1-game`, `p1-backend`, `p1-ui`, then `p2-pose` and so on.
- Commit small and push at least every 45 minutes, so no laptop holds the only copy.

**Avoiding conflicts**

- Folder ownership from section 3 is the main protection. Tell your AI tool which folder it may edit; `AGENTS.md` repeats the rule.
- Shared files go through D. Ask in the group chat, D commits the change to `main` and says "pull main", and everyone runs `git merge origin/main`.
- Need a new npm package or environment variable? Ask D. If the lockfile still conflicts, take `main`'s version and run `npm install` again.
- Database changes are numbered SQL files in `supabase/migrations/`, written only by C and applied only by C.
- Prettier with format-on-save for everyone, so diffs never contain formatting noise.
- A contract change needs all four people to agree, and never happens in the last 30 minutes of a phase.
- **Never commit a key.** `.env.local` is git-ignored from the first commit. The Claude key exists only in Vercel's environment settings.

**The merge at the end of each phase**

Fifteen minutes before the phase ends, everyone runs:

```bash
git add -A && git commit -m "p1(pose): calibration and move detection"
git fetch origin && git merge origin/main
npm install && npm run check
git push -u origin p1-pose
```

Then open four pull requests and merge them one at a time in this order: **C, B, A, D**. D goes last because the app wires the others together. After each merge the next person merges `main` into their branch again and re-runs `npm run check`.

- Use normal merge commits, not squash. The history then shows who wrote what and when, which supports the "written during the hackathon" rule.
- When all four are in, D pulls `main` on the demo laptop and the team runs the phase's "done when" check together.
- If it passes, tag it: `git tag phase-1 && git push --tags`. Then everyone cuts the next branch from `main`.
- If a merge breaks `main` and the fix takes more than 15 minutes, revert that merge and move on. The tags are your rollback points; you can always demo the last one.

## 8. AI tools

### Who uses what

| Role | Primary | Second | If both run out |
| --- | --- | --- | --- |
| A, Vision | Claude account with 40% | Gemini Pro | Reserve Claude account, then API credits |
| B, Game | Claude account with 100% | Codex on ChatGPT account 2 | API credits |
| C, Backend and workout | Codex on ChatGPT account 1 **and** Claude account with 50%, in parallel | Gemini Pro | API credits |
| D, UI | Lovable for screens, Cursor Pro for wiring | Claude account with 25% | ChatGPT account 2 |

Reasoning: B writes the most game code, so B gets the full account. C has two workstreams and gets two tools. D's screens come from Lovable, which is unlimited, so D gets the smallest Claude account. A's work is more tuning in front of a webcam than code volume.

### By phase

| Phase | A | B | C | D |
| --- | --- | --- | --- | --- |
| 0 | Claude 40%, light | Claude 100% | Codex for stubs and the local store | Claude 25% for the scaffold, Lovable started |
| 1 | Claude 40%, top model for the detector design | Claude 100% | Codex on workout logic, Claude 50% on schema and store | Lovable, then Cursor to port |
| 2 | Mostly manual tuning, Claude 40% for hard cases | Claude 100% | Claude 50% on `/api/coach`, Codex on balance and the offline queue | Lovable for dashboard and leaderboard, Cursor, Claude 25% for integration bugs |
| 3 | Claude 40% | Claude 100% | Codex on tests and hardening, Claude 50% on coach's pick | Lovable, Claude 25% |
| 4 | Gemini for review, Claude 40% for fixes | Claude 100% | ChatGPT for README and submission text | ChatGPT or Gemini for the pitch |
| 5 | Reserve Claude account or API for hotfixes | Claude 100% | none needed | none needed |

### Planning around the limits

Confirm the exact limit behaviour under Settings → Usage on each account; this plan assumes a 5-hour session that starts with your first message, on top of the weekly cap.

- **Anchor the sessions.** Send the first Claude message at 9:30 AM on Saturday, during stand-up ("read AGENTS.md and CONTRACTS.md and summarise my module"). Sessions then reset near 2:30 PM and 7:30 PM, which are the starts of Phase 2 and Phase 3.
- **The tight window is 7:30 PM to 12:30 AM.** It covers Phase 3 and most of Phase 4. Phase 4 is small fixes by design. Anyone above 70% of their session at 10:00 PM switches to their second tool for Phase 4.
- **Weekly budgets.** The 25% account spends at most 5% per phase. The 40% account at most 8%. The 50% account at most 10%. Each keeps at least 5% for Sunday morning.
- **Post your usage numbers in the group chat at every merge.** That is the moment to rebalance.
- **API credits ($75) are split in two.** $10 powers the in-app coach, on its own key with a spend limit; with a small model and short answers that covers far more calls than a weekend needs. $65 is the emergency coding pool: untouched before Saturday 7:30 PM unless someone is fully blocked, then about $20 for Saturday night, $35 for Sunday morning, $10 spare. Use a mid-tier model for coding on the API; the top model burns credits fast in agent mode.
- **The reserve Claude account stays unused until Sunday**, when a blocked person during bug fixing costs the most.

### Habits that save usage

- One conversation per task. Clear the context when the task changes.
- Use the top model to plan a task and to debug hard problems. Use the mid-tier model to implement.
- Paste only the relevant part of an error, never whole logs.
- Use Gemini for a whole-repo review before a merge, and ChatGPT or Gemini for all writing (pitch, README, Q&A drill).
- At each merge, update the short `README.md` in your module folder (what works, what does not, what is next). When you switch tools, the new tool reads `AGENTS.md` and that file and is up to speed in two minutes.

### Prompt to start any task

```
Read AGENTS.md and docs/CONTRACTS.md. I own <folders> and you may only edit files there.
Task: <paste your row from docs/PLAN.md>
Done when: <paste the check>
Give me a plan in at most 10 bullets and wait for my OK. Then implement in small steps
and run `npm run check` before you say you are done.
```

### Prompt for Lovable (D, during Phase 0)

```
Design the screens for a webcam fitness app played standing 2 metres from a laptop.
React, TypeScript, Tailwind, shadcn/ui, Recharts. Dark, energetic. In-game screens use
very large type that reads from 2 metres away. Screens: landing with "Play as guest";
a short profile step (name, goal, fitness level, optional weight); workout select with
four cards (Legs, Arms, Shoulders, Full body), a "Coach's pick" card, a Floor / Treadmill
toggle and a duration choice; calibration with a camera frame, a body outline and a
progress ring; in-game HUD overlay with score, streak, timer and a huge cue word; results
with reps per move, calories, score and a coach card; dashboard with weekly active minutes
against a goal, a reps-per-move chart, a day streak and a session list; leaderboard.
All data arrives as props with placeholder values. No routing library. Do not add a
backend, a database or auth; those already exist.
```

Port only the components and Tailwind classes into `src/ui/`. Do not let Lovable's project structure, or a backend it offers to create, replace the repo's.

## 9. Risks and backups

| Risk | Prevention | Backup |
| --- | --- | --- |
| The backend eats the day and the game suffers | A and B never touch it. The MVP bar for the backend is three small tables' worth of work behind one interface | Cut the Claude coach and keep the rule-based one; never cut game polish for backend features |
| Venue wifi or Supabase is down during the demo | `saveSession` queues locally; the dashboard and leaderboard show the last cached data; assets are in `public/` | `?store=local` runs the whole app on the local store; `npm run preview` on localhost; backup video |
| A sign-up wall kills the live demo | Guest sign-in is the default path; the profile step is skippable | Local store needs no sign-in at all |
| A key leaks into a public repo | `.env.local` git-ignored from the first commit; Claude key only in Vercel; separate key with a spend limit for the product | Revoke and rotate the key; it takes two minutes |
| Row-level security is wrong and users see each other's data | C tests with two browsers in Phase 1 and again in Phase 4 | Leaderboard view exposes only name, workout and score |
| The coach is slow, fails, or says something unsuitable | 8-second timeout, strict JSON validation, a prompt limited to general fitness encouragement, a visible "not medical advice" line | Rule-based coach |
| Server functions are awkward to run locally | Test against the Vercel preview deployment of your branch, or use `vercel dev` | Client works without the endpoint |
| Detection is unreliable at the venue (lighting, crowd behind the player) | Test at the station on Sunday 8:00 AM. Face the laptop toward a wall. Tape a mark on the floor at 2.2 m. Track only the largest, most central person | `R` to recalibrate, `D` to adjust thresholds live, `K` for keyboard |
| Jump or squat misfires | Thresholds scale with the calibrated body, hysteresis, cooldowns, generous hit windows | Low-impact toggle removes jumps; widen windows in `tuning.ts` |
| Demo laptop too slow for pose plus 3D | Test on it from Phase 0. Lite model, 640×480 video, capped pixel ratio, no shadows | Low-graphics toggle; run pose at every second frame |
| Merges break `main` | Stubs from Phase 0, frozen contracts, folder ownership, fixed merge order | Revert the merge; demo from the last tag |
| A phase overruns | "Done when" checks and the 6:30 PM go or no-go | Apply the cut order from section 4; the feature freeze does not move |
| AI usage runs out mid-phase | Budgets and anchored sessions from section 8 | Second tool, then reserve account, then API credits, then pair with a teammate |
| Camera blocked by the browser | Chrome only; camera needs `https` or `localhost` | Second laptop ready with the build |
| Not enough floor space at the judging table | Ask organisers about the layout on Saturday | Treadmill mode works at 1 to 1.5 m; bring a USB webcam if anyone has one |
| A judge will not jump (clothing, injury, shyness) | Low-impact toggle and the Arms workout | A teammate plays while the judge watches, then offers a turn |
| Lovable output does not fit the repo | Port components only, never the project | Build the screen with shadcn/ui and Claude |
| Someone gets sick or crashes from no sleep | Two sleeps are in the timeline; module READMEs are kept current | Any teammate can pick up a folder from its README |
| Rule compliance | Write everything this weekend; list AI tools, libraries and assets in the README | Use only CC0 or self-made assets, so nothing is in doubt |
| Someone trips while jumping near a table | Clear 2 m around the floor mark; no cables on the floor | Demo with low-impact mode |
