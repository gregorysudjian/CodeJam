# src/ui: Neon Arena UI (owner: D)

First designed in the Lovable project "Neon Arena Fitness" and ported here; it has been edited
here since, so this folder is the current version. The menus are a dark neon arcade look.

## What is here

| Folder | Contents |
| --- | --- |
| `theme.css` | Every design token (`@theme`), font imports, glass, glow, grain, grid and keyframes. Imported by `src/index.css`. |
| `components/ui/` | shadcn primitives (button, input, skeleton, switch). |
| `kit/` | Design system: `Screen` (with a measured, full-bleed `footer` slot), `ScreenFooter` (standard Back · Primary bar), `NavBar` (PLAY, PROGRESS, LEADERBOARD and the player chip), `CoachBanner` (one-line coach's pick), `Backdrop`, `MontrealSkyline`, `GlassPanel`, `GameButton`, `SectionTitle`, `StatTile`, `AnimatedNumber`, `MoveChip`, `MoveFigure` (a pose per move, plus `stand` and `pause`, forearms crossed in an X; mirror view: `reachLeft` raises the screen-left arm; data in `figurePoses.ts`), `BustOutline`, `ProgressRing`, `SegmentedControl`, `ToggleRow`, `TextField`, `KeyHint`, `EmptyState`, `useHotkey`, `useNow`, `round.ts` (round constants and tiers) and `tokens.ts` (move/workout labels, colours, icons). |
| `screens/` | Pure presentational screens: props in, callbacks out. No fetching, no global state. |
| `lib/` | `cn()` (tailwind-merge taught our type-scale tokens) and `format.ts`. |

Imports allowed here: react, motion/react, lucide-react, recharts, radix, cva, clsx,
tailwind-merge, `@/contracts`, `@/ui/**`. Never import modules (`@/pose`, `@/game`, `@/data`…):
only `src/app/` wires screens to modules.

## Screens and how src/app wires them

| Screen | Key props | Wiring notes |
| --- | --- | --- |
| `LandingScreen` | `appName`, `onPlayAsGuest`, `onSignUp?`, `checkUsername?`, `returning?`, `onContinue?`, `onLeaderboard?`, `topScores?`, `qrSlot?`, `publicUrl?`, `busy?` | `qrSlot` = `<QRCodeSVG value={publicUrl} />` from `qrcode.react` (already a dependency). `topScores` = first 3 of `store.getLeaderboard`. |
| `ProfileScreen` | `initial?`, `onSubmit(p: ProfileInput)`, `onBack`, `nav?`, `checkUsername?` | `ProfileInput = Omit<Profile,'id'>`; pass straight to `store.saveProfile`. Skip (S) submits the defaults. |
| `WorkoutSelectScreen` | `workouts`, `coachPick?`, `initial?`, `settingsSlot?`, `onStart(config)`, `onBack`, `nav?` | `workouts = Object.values(WORKOUTS)`. A round is always every level: `onStart` gets `durationSec: 180` and the tier row's `difficulty` (0 / 0.5 / 1); `initial.difficulty` snaps to the nearest tier (default Regular), `initial.seed` is carried through. The coach's pick (banner PLAY, C) is played as a whole round on the tier it shows (`asRound`). Round constants and tiers: `kit/round.ts` (6 levels, 3 lives, 180 s; `tierOf`, `asRound`). `settingsSlot` renders last in the settings row: pass a `ToggleRow` labelled "Low graphics" (style it like Low impact: `className="min-h-14 border-0 bg-transparent p-0 shadow-none backdrop-blur-none [&_label>span:first-child]:text-[22px]"`; `:first-child` keeps a `description` at caption size) that writes `localStorage game.gfx`. |
| `CalibrationScreen` | `status`, `mode`, `videoSlot?`, `skeletonSlot?`, `onCancel`, `onUseKeyboard?` | `videoSlot`: a small component that appends `pose.video` into a div via ref (already mirrored by A). `skeletonSlot`: a canvas the app redraws with `pose.drawSkeleton(ctx)` in its own rAF. |
| `GameHud` | `stats`, `elapsedSec`, `durationSec`, `mode`, `cue?`, `lastEvent?`, `paused?`, `trackingLost?`, `pauseReason?`, `resuming?`, `lives?`, `stage?`, `cameraSlot?`, `onPause`, `onResume`, `onQuit?` | Overlay on the game canvas. Re-render it from a ~10 Hz interval reading `tracker.getLive()` and `game.getElapsedSec()`, never per frame. `cue` from the latest `'cue'` GameEvent (`move = wave.spawns[0].requires`, count `inSec` down). `lastEvent` from cleared/collected/hit events with an increasing `id`. `lives = { left, total }` (hearts, top centre; `left` from the `lifeLost` event, a lost heart cracks and fades) and `stage = { index, total }` ("LEVEL 2/6", from the `stage` event and `level.stages.length`). `pauseReason` from the `paused` event: `otherPerson` shows "Someone else is in the frame"; Esc can't resume it or `trackingLost`. `resuming` is true from `resuming` to `resumed`: it hides the pause messages while the game draws 3-2-1. |
| `ResultsScreen` | `summary`, `advice` (null while loading), `isPersonalBest?`, `rank?`, `handsFree?`, `onPlayAgain`, `onStartNext(config)`, `onDashboard`, `onLeaderboard?`, `nav?` | Render immediately with `advice={null}`, then set it when `store.getCoachAdvice` resolves. |
| `DashboardScreen` | `profile`, `sessions` (newest first), `coachPick?`, `now?`, `onPlay`, `onPlayCoachPick?(config)`, `onLeaderboard`, `onEditProfile?`, `nav?` | `sessions = await store.listSessions(50)`. All week/streak maths is in `dashboardStats.ts` (tested). |
| `LeaderboardScreen` | `entries`, `workout`, `mode`, `onChangeFilter(workout, mode, durationSec)`, `durationSec?`, `currentName?`, `loading?`, `kiosk?`, `qrSlot?`, `onBack`, `onPlay?`, `nav?`, `friends?` | Refetch `store.getLeaderboard(workout, mode, durationSec, 20)` on `onChangeFilter`. One board per workout and mode: every round is all 6 levels, so there is no round-length filter; `durationSec` (default 180) is only handed back to `onChangeFilter`. Legs + treadmill is switched to Full body before the callback. `kiosk` is the attract screen for the demo table between players. |

## Layout conventions (cleanup pass)

- One primary action per screen, bottom-right; back/cancel is a ghost button bottom-left
  (`ScreenFooter`). Key caps are shown only for ENTER, ESC and Calibration's K; the other hotkeys
  still work without a visible cap.
- Game HUD: a race progress bar (runner marker → finish flag) is derived from
  `elapsedSec / durationSec`, so `PlayScreen` must pass the duration that is actually being played
  (`level.config.durationSec`). Reach cues read "REACH" for both arms.
  The live rep ticker was removed (reps are on Results).
- Results headline: from `summary.levelReached` / `summary.outOfLives` ("OUT OF LIVES · LEVEL 3",
  "ALL 6 LEVELS CLEARED"; neither = "ROUND COMPLETE"). `onStartNext` gets the coach's pick as a whole round on the tier it shows (`asRound`).
- Screenshots of the screens are in `docs/submission/`.

## Hotkeys: avoid double handling

Screens bind their own keys with `useHotkey` (ignored while typing in a field):

- Landing: Enter, Esc · Profile: Enter, Esc, S · Workout select: Enter, Esc, C, 1–4
- Calibration: **Esc**, **K** · Game HUD: **Esc** (pause/resume) · Results: Enter, N
- Dashboard: Enter, L, C · Leaderboard: Enter, Esc

`src/app` also listens for **K** (switch input), **R** (recalibrate, during play) and **D**
(debug overlay) globally. To avoid double handling it leaves Esc to the HUD on the play screen
and skips its K on the calibration screen.
