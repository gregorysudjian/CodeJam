# src/ui — Neon Arena UI (owner: D, branch greg-2)

Designed in the Lovable project "Neon Arena Fitness" and synced to
`gregorysudjian/neon-arena-fitness`. Everything in this folder is copied verbatim from that
repo's `src/ui/`. Change the design there and re-port; small fixes here are fine, but mention
them so Lovable can pick them up.

## What is here

| Folder | Contents |
| --- | --- |
| `theme.css` | Every design token (`@theme`), font imports, glass, glow, grain, grid and keyframes. Imported by `src/index.css`. |
| `components/ui/` | shadcn primitives (button, card, badge, input, progress, skeleton, slider, switch, tooltip). |
| `kit/` | Design system: `Screen`, `Backdrop`, `GlassPanel`, `GameButton`, `SectionTitle`, `StatTile`, `AnimatedNumber`, `MoveChip`, `MoveFigure`, `BustOutline`, `ProgressRing`, `SegmentedControl`, `ToggleRow`, `TextField`, `KeyHint`, `EmptyState`, `useHotkey`, and `tokens.ts` (move/workout labels, colours, icons). |
| `screens/` | Pure presentational screens: props in, callbacks out. No fetching, no global state. |
| `lib/` | `cn()` (tailwind-merge taught our type-scale tokens) and `format.ts`. |

Imports allowed here: react, motion/react, lucide-react, recharts, radix, cva, clsx,
tailwind-merge, `@/contracts`, `@/ui/**`. Never import modules (`@/pose`, `@/game`, `@/data`…):
only `src/app/` wires screens to modules.

## Screens and how src/app wires them

| Screen | Key props | Wiring notes |
| --- | --- | --- |
| `LandingScreen` | `appName`, `onPlayAsGuest`, `returning?`, `onContinue?`, `onLeaderboard?`, `topScores?`, `qrSlot?`, `publicUrl?` | `qrSlot` = `<QRCodeSVG value={publicUrl} />` from `qrcode.react` (already a dependency). `topScores` = first 3 of `store.getLeaderboard`. |
| `ProfileScreen` | `initial?`, `onSubmit(p: ProfileInput)`, `onBack` | `ProfileInput = Omit<Profile,'id'>`; pass straight to `store.saveProfile`. Skip (S) submits the defaults. |
| `WorkoutSelectScreen` | `workouts`, `coachPick?`, `initial?`, `onStart(config)`, `onBack` | `workouts = Object.values(WORKOUTS)`. `initial` carries difficulty/seed through. |
| `CalibrationScreen` | `status`, `mode`, `videoSlot?`, `skeletonSlot?`, `onCancel`, `onUseKeyboard?` | `videoSlot`: a small component that appends `pose.video` into a div via ref (already mirrored by A). `skeletonSlot`: a canvas the app redraws with `pose.drawSkeleton(ctx)` in its own rAF. |
| `GameHud` | `stats`, `elapsedSec`, `durationSec`, `mode`, `cue?`, `lastEvent?`, `paused?`, `trackingLost?`, `cameraSlot?`, `onPause`, `onResume` | Overlay on the game canvas. Re-render it from a ~10 Hz interval reading `tracker.getLive()` and `game.getElapsedSec()`, never per frame. `cue` from the latest `'cue'` GameEvent (`move = wave.spawns[0].requires`, count `inSec` down). `lastEvent` from cleared/collected/hit events with an increasing `id`. |
| `ResultsScreen` | `summary`, `advice` (null while loading), `isPersonalBest?`, `rank?`, `handsFree?`, `onPlayAgain`, `onStartNext(config)`, `onDashboard`, `onLeaderboard?` | Render immediately with `advice={null}`, then set it when `store.getCoachAdvice` resolves. |
| `DashboardScreen` | `profile`, `sessions` (newest first), `coachPick?`, `now?`, `onPlay`, `onPlayCoachPick?(config)`, `onLeaderboard`, `onEditProfile?` | `sessions = await store.listSessions(50)`. All week/streak maths is in `dashboardStats.ts` (tested). |
| `LeaderboardScreen` | `entries`, `workout`, `mode`, `onChangeFilter(workout, mode)`, `currentName?`, `loading?`, `kiosk?`, `qrSlot?`, `onBack`, `onPlay?` | Refetch `store.getLeaderboard(workout, mode, 20)` on `onChangeFilter`. Legs + treadmill is switched to Full body before the callback. `kiosk` is the attract screen for the demo table between players. |

## Hotkeys: avoid double handling

Screens bind their own keys with `useHotkey` (ignored while typing in a field):

- Landing: Enter · Profile: Enter, Esc, S · Workout select: Enter, Esc, C, 1–4
- Calibration: **Esc**, **K** · Game HUD: **Esc** (pause/resume) · Results: Enter, N
- Dashboard: Enter, L, C · Leaderboard: Enter, Esc

`src/app` currently also handles **Esc** (pause) and **K** (switch input) globally. Pick one
owner, or the action fires twice: skip the global Esc while the HUD is mounted and the global K
while Calibration is mounted (or remove those two from the screens). R and D stay global.

## Not verified on this branch

`npm install` / `npm run check` could not run in the porting environment (no network). In
Lovable, the same code passes a strict typecheck with this repo's flags (`verbatimModuleSyntax`,
`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`), builds, passes its tests, and
passes this repo's exact ESLint config with 0 errors and 7 `react-refresh/only-export-components`
warnings (helpers exported next to components; warnings don't fail `check`). On porting, the
three `*.test.ts` files here got explicit `vitest` imports because this repo has no test
globals. Run `npm run check` after pulling to confirm.
