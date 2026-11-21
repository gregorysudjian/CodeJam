# src/ui — Neon Arena UI (owner: D, branch greg-2)

Originally designed in the Lovable project "Neon Arena Fitness". **The token layer has since
been reworked in this repo and is no longer a verbatim copy** — re-porting `theme.css` from
Lovable would undo it. Components and screens are still close to the Lovable originals.

## Design rules

The palette used to be five fully-saturated accents on near-black, each with a 64px glow.
Every one passed WCAG, so the problem was never contrast — it was that nothing receded, so
nothing could lead. Four rules keep that from coming back:

1. **One accent.** Lime is the brand, and it sits *below* primary text in luminance (13.10:1
   vs 16.25:1) so text leads and the accent points. Cyan, magenta, amber and violet are move
   encoding only — one hue per move type, on chips, figures and charts. They never appear in
   chrome. `success` / `warning` / `danger` are separate and functional.
2. **Elevation is a step up the ramp, not a glow.** `bg → surface → bg-raised → hover` with a
   `line` hairline. `glass` is opaque; it is not a blur.
3. **Glow is a state, not a style.** The primary CTA keeps one (it has to be findable from
   across a room) and live scoring feedback keeps one. Selected segments, panels, headings,
   icons and focus rings do not.
4. **Ordinal things descend one ramp.** Podium places and S/A/B/C grades step down through the
   neutrals instead of cycling hues, so rank reads as rank.

`Eyebrow` and `SectionTitle` default to **neutral**. They used to default to lime, which is how
the accent ended up on every screen — don't change that default back.

Two numbers deliberately resist the usual advice: body text is **20px**, not 16px, because this
is read while standing back from a laptop; and the display ramp stays large for the same reason.

Before changing colour, run the contrast check in the PR description's method: every text pair
must clear 4.5:1, every UI boundary 3:1.

## What is here

| Folder | Contents |
| --- | --- |
| `theme.css` | Every design token (`@theme`), font imports, surfaces, type ramps and keyframes. Imported by `src/index.css`. Token *names* are unchanged from the Lovable version, so components did not need editing; their *values* are not. |
| `components/ui/` | shadcn primitives (button, card, badge, input, progress, skeleton, slider, switch, tooltip). |
| `kit/` | Design system: `Screen` (with a measured, full-bleed `footer` slot), `ScreenFooter` (standard Back · Primary bar), `CoachBanner` (one-line coach's pick), `Backdrop`, `GlassPanel`, `GameButton`, `SectionTitle`, `StatTile`, `AnimatedNumber`, `MoveChip`, `MoveFigure`, `BustOutline`, `ProgressRing`, `SegmentedControl`, `ToggleRow`, `TextField`, `KeyHint`, `EmptyState`, `useHotkey`, and `tokens.ts` (move/workout labels, colours, icons). |
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
| `WorkoutSelectScreen` | `workouts`, `coachPick?`, `initial?`, `settingsSlot?`, `onStart(config)`, `onBack` | `workouts = Object.values(WORKOUTS)`. `initial` carries difficulty/seed through. `settingsSlot` renders last in the settings row: pass a `ToggleRow` labelled "Low graphics" (style it like Low impact: `className="min-h-14 border-0 bg-transparent p-0 shadow-none backdrop-blur-none [&_label>span]:text-[22px]"`) that writes `localStorage game.gfx`. |
| `CalibrationScreen` | `status`, `mode`, `videoSlot?`, `skeletonSlot?`, `onCancel`, `onUseKeyboard?` | `videoSlot`: a small component that appends `pose.video` into a div via ref (already mirrored by A). `skeletonSlot`: a canvas the app redraws with `pose.drawSkeleton(ctx)` in its own rAF. |
| `GameHud` | `stats`, `elapsedSec`, `durationSec`, `mode`, `cue?`, `lastEvent?`, `paused?`, `trackingLost?`, `cameraSlot?`, `onPause`, `onResume` | Overlay on the game canvas. Re-render it from a ~10 Hz interval reading `tracker.getLive()` and `game.getElapsedSec()`, never per frame. `cue` from the latest `'cue'` GameEvent (`move = wave.spawns[0].requires`, count `inSec` down). `lastEvent` from cleared/collected/hit events with an increasing `id`. |
| `ResultsScreen` | `summary`, `advice` (null while loading), `isPersonalBest?`, `rank?`, `handsFree?`, `onPlayAgain`, `onStartNext(config)`, `onDashboard`, `onLeaderboard?` | Render immediately with `advice={null}`, then set it when `store.getCoachAdvice` resolves. |
| `DashboardScreen` | `profile`, `sessions` (newest first), `coachPick?`, `now?`, `onPlay`, `onPlayCoachPick?(config)`, `onLeaderboard`, `onEditProfile?` | `sessions = await store.listSessions(50)`. All week/streak maths is in `dashboardStats.ts` (tested). |
| `LeaderboardScreen` | `entries`, `workout`, `mode`, `onChangeFilter(workout, mode)`, `currentName?`, `loading?`, `kiosk?`, `qrSlot?`, `onBack`, `onPlay?` | Refetch `store.getLeaderboard(workout, mode, 20)` on `onChangeFilter`. Legs + treadmill is switched to Full body before the callback. `kiosk` is the attract screen for the demo table between players. |

## Layout conventions (cleanup pass)

- One primary action per screen, bottom-right; back/cancel is a ghost button bottom-left
  (`ScreenFooter`). Key caps are shown only for ENTER, ESC and Calibration's K; the other hotkeys
  still work without a visible cap.
- Game HUD: a race progress bar (runner marker → finish flag) is derived from
  `elapsedSec / durationSec`, so `PlayScreen` must pass the duration that is actually being played
  (`level.config.durationSec`, see docs/AUDIT.md #5). Reach cues read "REACH" for both arms.
  The live rep ticker was removed (reps are on Results).
- Screenshots of every screen are in the Lovable repo under `docs/screens/`.

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
