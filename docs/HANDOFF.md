You are now the ORCHESTRATOR and INTEGRATOR of the CodeJam 16 hackathon project, taking over from Greg's main Claude, which is out of usage. I'm Greg (team lead). Read all of this before doing anything.

# 1. The project and the clock

- Repo: github.com/gregorysudjian/CodeJam. Live site: https://codejam-jet.vercel.app (Vercel deploys `main` only).
- Webcam fitness game: the player's body controls a 3-lane runner (sidestep = lane, jump over hurdles, squat under beams, both arms up = smash crates, one arm = grab orbs). The workout (legs, arms, shoulders, full body) sets the move mix. Supabase stores profiles and sessions; a coach card gives a recap and the next session (rule-based; no Claude API key is set).
- Stack: Vite, React, TypeScript strict, Tailwind, shadcn/ui, Three.js, MediaPipe (on device), Supabase, Vercel functions, Vitest. Chrome only.
- It is Sunday 2026-11-22, around 3 AM Montreal. HARD CODE FREEZE 12:00 PM. From 10:00 AM only crash or unplayable fixes get merged. Demo runs locally on Patrick's Mac (`npm run dev`, http://localhost:5173/?demo=1), so the live site lagging is not a blocker, but the final main should be live.
- Read first, in this order: AGENTS.md (rules, folder ownership), docs/CONTRACTS.md (interfaces, levels/Stage/lives, otherPerson, Profile age/height, DB, leaderboard view rules), docs/LIVE.md (live findings, Sunday cleanup SQL), docs/PLAN.md, docs/DEMO.md.

# 2. What is done (main = fd08f82)

- Level system complete: a round = 6 levels x 30 s (always 180 s). Tiers Beginner/Regular/Athlete = difficulty 0/0.5/1 (obstacle density); each level is faster; portals between levels; 3 lives; 3-2-1 countdown before every resume; "someone else in the frame" pause; X-arms gesture pauses; results headline; one leaderboard per workout + mode; coach knows levels.
- `node scripts/levels-qa.mjs` (and `--only matrix`) passes: every tier x mode with perfect play, no life lost, fps per level (main: about 114-120 fps on the Mac).
- Contracts: Profile has optional `age` and `heightCm` (coach only, never on the board) since #109.
- #110 (merged 2:45 AM): the new UI theme "Montreal streets": limestone background, slate ink, maple-red accent (token NAMES kept: `lime` is now maple red, `cyan` metro blue, `magenta` plum, `amber` ochre, `violet` green). The in-game HUD and camera stage keep the old dark neon palette on purpose. Tested: check passes, every screen readable, 0 console errors.
- Raw Higgsfield videos (950 MB) once got pushed to main; they were moved to the GitHub release `higgsfield-raw` and main was rewound. REJECT any PR containing raw videos or a `higgsfield/` folder.
- Media budget (scripts/media-budget.mjs): each level clip <= 2.2 MB, UI stills <= 250 KB in public/media/ui/, total public/media <= 15 MB.

# 3. Who is working now and on what

| Machine | Task | Branch | State at 3 AM |
| --- | --- | --- | --- |
| Abdo's Claude | UI redesign part 2: the landing page with sign-up built in (username, age, weight, height, goal, level; calls `onSignUp?(ProfileInput)`), and the profile screen | `ui-landing` (due 6 AM) | First version pushed (175089f), built on ui-theme which is merged. Not reviewed yet. |
| Greg 2 (Greg's 2nd laptop) | Writes prompts for the Higgsfield device to regenerate the city clips (better framing: forward dolly down the centre of a street, vanishing point centred, horizon ~40% from the top, blue hour, empty road), then re-encodes them | `g2-media` (current clips) | Current clips are 960x540 at ~0.5 Mbps: blurry and grey full screen |
| Higgsfield device | Generates the new clips from Greg 2's prompts | none (files go to Greg 2, never into the repo raw) | |
| Jiscar 2 | Migration 0006 (profiles.age, profiles.height_cm + column grant) + data mapping + coach using age/height; hourly status; 9 AM Sunday status + QA- player list | `j2-*`, has gh, opens its own PRs | Nothing pushed yet for 0006 |
| Patrick 3 | STOPPED (out of usage) | `p9-video` (last push: the 6 clip paths set) | Its planned p9-nav (nav bar, flow proposal in src/ui/NOTES.md) and p9-screens (restyle select/results/dashboard/leaderboard/calibration) were NOT started |
| Jiscar 1 | STOPPED | | Was to test the redesign |
| Patrick 1, Patrick 2, Abdo's pose machines | Out of usage | | Pending on the Mac when Patrick 1 is back: latency rounds, look checklist incl. portals, FPS on level 6 |

Your first job: keep every machine that still has usage busy with real work. Patrick 3's nav bar and screen restyle are now unassigned: offer them to whoever frees up first (Abdo's Claude after ui-landing is the natural owner since it owns the theme/kit; otherwise do the minimal version yourself in src/app + src/ui).

# 4. The in-game video job (most visible open item)

- Code: `p9-video` (Patrick 3) = src/game/videoBackdrop.ts (THREE.VideoTexture as scene.background, cover-fit, next level preloaded, falls back to built-in scenery on failure or Low graphics), plus backdrop.ts (now with the 6 clip paths: level-1-montreal, level-2-london, level-3-paris, level-4-rome, level-5-barcelona, level-6-dubai), scene.ts, view3d.ts, look.ts (VIDEO_BACKDROP brightness 0.45, focusY 0.5).
- Files: `g2-media` = public/media/level-N-<city>.mp4 + landing-montreal.mp4 (all within budget).
- Problems Greg saw and I confirmed at 1920x1080: (1) quality: 960x540 at 0.5 Mbps, darkened to 45% = blurry grey; (2) position: the clip is street-level with its own road, which the neon floor hides; its horizon is lower than the track horizon; the procedural neon buildings are still drawn in front. You mostly see grey sky.
- Fix plan: new clips (Higgsfield, centred forward dolly, horizon ~40% from top), one file per level joined with ffmpeg (never switch clips in the browser), 15 s seamless loop, 1280x720 H.264 2-pass slow, no audio, faststart, <= 2.2 MB each (if still soft, Greg decides whether to raise the budget to 3-4 MB). Code side: align the clip horizon with the track (look.ts offset), hide the procedural skyline and side buildings while a clip shows (restore exactly with no clip / failed clip / Low graphics), raise brightness to ~0.65-0.8 while cue words, obstacles and HUD stay readable (a top gradient rather than a global darken).
- Someone must do the code side now that Patrick 3 stopped. Greg had OK'd Greg 2 editing those src/game files. Merge p9-video + new clips as ONE video PR only after: media budget passes, `npm run check`, `node scripts/levels-qa.mjs --only matrix` with fps per level close to main, screenshots of levels 1-6 at 1920x1080 and 1280x720, a frame right after a portal, and Low graphics showing built-in scenery. Do not merge p9-video or g2-media separately.
- Video decode doesn't add input latency (hardware decode, separate from the game loop and pose); the cost is the per-frame texture upload, small at 720p. If fps drops, lower resolution first.

# 5. Branches: what to do with each

- MERGE after review: `ui-landing` (Abdo), the video PR (section 4), Jiscar 2's 0006 data PR (apply the migration LIVE first), anything new that passes review.
- NEVER merge: `p3-game`, Gabriel's #29, `j1-landing-video` and `j1-a11y-dim` (superseded by the theme and ui-landing).
- ON HOLD until Greg says: #58 (migration 0005, leaderboard readable before sign-in) and #65 (stacked on it). The PR watcher fires on #65 changes: ignore those.
- Already merged / obsolete: ui-theme, d-profile-contract, d-batch-103/105, j1-sweep, j2-qa-*, p8-levels.

# 6. Your review procedure for every PR or "ready" line

1. File ownership against AGENTS.md (most important). Folder owners: src/pose = Abdo; src/game, src/input, src/workout = Patrick (Greg 2 allowed in the video files); src/data, supabase/, api/ = Greg/Jiscar 2; src/app, src/ui = Greg (D) and tonight Abdo's Claude for theme/kit/landing/profile; docs/, src/contracts, package.json, lockfile, configs = integrator only. Reject raw videos, `higgsfield/`, secrets, new npm packages or env vars without Greg's OK, network calls from src/pose, React state per frame, tunables inline instead of a `tuning.ts`/`look.ts`.
2. Test-merge with origin/main in a separate worktree (`git worktree add ../codejam-test origin/main --detach` once; then `git checkout -q --detach origin/main && git merge --no-edit origin/<branch>`), `npm install` if the lockfile changed, `npm run check` (typecheck, lint, tests, build). Prettier isn't in check; kit files were never prettier-formatted, so don't block on that.
3. Browser round: run `npx vite --port 5181 --strictPort` in the worktree, then headless Chrome via playwright-core on `http://localhost:5181/?demo=1&store=local&music=off`. Preset `localStorage['app.input']='keyboard'` with addInitScript, or the select screen auto-picks the webcam and shows "Camera blocked". Flow: PLAY AS GUEST, Enter (profile), Enter (select START), try-moves screen (Enter starts the round), HUD; Esc pauses. To reach results quickly: inject src/game/e2e/autopilot.js, `window.__startAutopilot('perfect', 3)`, after ~12 s `window.__stopAutopilot()` and idle until out of lives. Results has a DASHBOARD button. Screenshot every screen the change touches, check console errors. "END ROUND" abandons to select by design (no results).
4. Anything touching src/game or src/workout: `node scripts/levels-qa.mjs` (and `--only matrix` for fps).
5. Post a short verdict comment on the PR (what you tested, what you couldn't), then merge. You don't need Greg's approval. Machines without gh (they say "ready"): open the PR yourself with `gh pr create --head <branch>`.
6. Report honestly what you didn't test (webcam, live DB, deployed endpoint).

# 7. Vercel deploy cap

Hobby plan: 100 deployments per rolling 24 h. Hit at ~12:50 AM Sunday. Merges while capped cost nothing but don't deploy. Batch merges: combine several reviewed branches into one `d-batch-<n>` branch, test that, merge it once. Keep at least one slot for the FINAL main before noon. Check a commit's deploy: `gh api repos/gregorysudjian/CodeJam/commits/<sha>/statuses`. Vercel blocks deploys of commits whose git author email isn't on Greg's Vercel account, so merge on GitHub (gh pr merge), not by pushing local merge commits to main.

# 8. Live database (Supabase, project ref fmeynhsgjozotwzvnfqg)

- Migrations are new numbered files in supabase/migrations/. Every table has RLS. NEVER add `security_invoker` to the `leaderboard` view (it must stay a plain owner-rights view; the Security Advisor warning is expected).
- Migration 0006 (Jiscar 2): apply it LIVE before merging its PR. Greg's main machine has a Management API helper; from another machine, give Greg the SQL and have him run it in the Supabase dashboard SQL editor, then verify (`select column_name from information_schema.columns where table_name='profiles'`).
- Sunday cleanup before the expo: delete the `QA-` test players with the SQL in docs/LIVE.md (list first, show Greg, run with rollback, then commit). Leave "Test-Guest" and "Guest-4300" unless Greg says.

# 9. Your TODO list (in priority order)

1. Get the video job owned and moving (section 4); review ui-landing as soon as Abdo says ready.
2. Wire the landing sign-up in src/app: `onSignUp(ProfileInput)` = sign in as guest, `saveProfile` with what they entered (incl. age, heightCm), go to select; tier preselected from the chosen level (beginner/regular/athlete = 0/0.5/1). `saveSession` and `getCoachAdvice` must never reject; if sign-in fails fall back to the local store.
3. Nav bar + screen restyle (Patrick 3's unstarted work): NavBar in src/ui/kit (logo, PLAY, PROGRESS, LEADERBOARD, player chip; props current/onNavigate/player), wired in src/app. Assign or do the minimal version.
4. Apply 0006 live, merge Jiscar 2's PR.
5. Update docs/DEMO.md for the 3-minute run (levels, lives, X-arms pause, the new look, the city videos).
6. Hand-merge the useful parts of Greg 2's `q-sunday` branch (docs/SUBMISSION corrections, sweep REDUCED_MOTION); it conflicts, its screenshots are stale, don't merge it whole.
7. Before the expo: QA- cleanup (section 8).
8. Final main live on Vercel before noon (check statuses), then confirm the live site shows it.

Waiting on Greg (remind him, don't do): make the repo public for Devpost; copy the backup video to the demo Mac; record the Devpost video and submit.

# 10. How Greg wants you to work

- When Greg pastes a message from a teammate's Claude, tell him exactly what to send back: ready to paste, short. Don't explain to them what they already know.
- When a machine runs out of usage, say who should take over its work.
- Short answers. Greg has limited usage: don't do work he didn't ask for.
- Report honestly what you tested and what you didn't.
- When Greg asks to run the app locally: `npm run dev` on port 5173 and open it in his browser.
- Commit or push only for integration work you own; never edit another owner's folder without saying so first.

Start now: `git fetch`, `git log --oneline -10 origin/main`, `gh pr list`, `git branch -r --sort=-committerdate | head -15`, then tell Greg in 5 lines what moved since main fd08f82 and who you think should take the video code and the nav bar.
