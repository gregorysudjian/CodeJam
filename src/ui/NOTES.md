# src/ui notes (Jiscar 1)

Read this first if you pick up `src/ui` in a new conversation.

## Sat 23:00: state

Everything up to the accessibility pass is merged (main 181e9db). Greg's levels/lives queue
(contracts #89–#91) is one branch per item, pushed, waiting for Greg's Claude to merge.
**Merge order: `j1-tier` before `j1-board` and `j1-results`, then `j1-results-fit`** (they use `kit/round.ts`). Every
pair test-merges cleanly; all five together pass `npm run check` and the sweep at six sizes.

| Branch | What a player sees | Wiring for `src/app` |
| --- | --- | --- |
| `j1-figure-mirror` | `reachLeft` raises the screen-left arm (it was mirrored wrong); new `pause` pose (forearms in an X) | Move check X step: `<MoveFigure pose="pause" />` |
| `j1-tier` | Select: BEGINNER / REGULAR / ATHLETE row instead of 45/90/180 S; "6 LEVELS · 3 LIVES"; coach's pick shows its tier | None: `onStart` always gets `durationSec: 180` and difficulty 0 / 0.5 / 1 |
| `j1-board` | Leaderboard and kiosk: no round-length chips, title "FULL BODY · FLOOR" | Store: one board per workout + mode; `durationSec` prop now optional |
| `j1-hud` | Hearts and "LEVEL 2/6" pill at the top; "Someone else is in the frame" pause | `lives`, `stage`, `pauseReason`, `resuming` (README table) |
| `j1-results` | "OUT OF LIVES · LEVEL 3" / "ALL 6 LEVELS CLEARED" headline; tier instead of seconds | None: reads `summary.levelReached` / `outOfLives` |
| `j1-results-fit` | Results fits one screen at 125 % (1093×614, 1024×576), also while the coach loads (on `j1-results`) | None |

`kit/round.ts` (on `j1-tier`): `ROUND_LEVELS` 6, `ROUND_SEC` 180, `ROUND_LIVES` 3, tiers,
`tierOf` (snaps the rule coach's tenths), `asRound` (plays a coach pick as 180 s on its tier).
Every "PLAY" of a coach pick goes through `asRound`.

**Sun: all of the above is merged** (#97, #105; main 093fb43). `DEMO_CONFIG` is 180 s and the coach snaps`ntiers (#92). `docs/qa/sweep/sweep.mjs` (`j1-sweep`) checks the 180 s demo: 24,800 and ALL 6 LEVELS`nCLEARED, shots off the 30 s portals, 36 checks per size, about 4 minutes.`n`n**Known:** at 150 % the results columns stack and scroll (by design); a long AI recap can still push the coach panel past the footer at 125 %.

**Freeze:** from 10:00 Sunday only crash or unplayable fixes, nothing after 11:30.

## How I check (Windows, no webcam)

- Node: portable 26.13.1 in `%LOCALAPPDATA%\Programs\nodejs-dl` (not on PATH; prepend it).
- `node docs/qa/sweep/sweep.mjs` and `SIZES=1093x614@1.25,1024x576@1.25,911x512@1.5,853x480@1.5`.
- Props the app doesn't pass yet: import the screen from the dev server inside the page
  (`await import('/src/ui/screens/GameHud.tsx')`, React from `/node_modules/.vite/deps/`) and
  render it over a live round. Write props to a JSON file: PowerShell 5.1 strips quotes from
  arguments.
- Fake camera: Chrome `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
- Vite sometimes serves a stale module after a branch switch: touch the files.
- Kit files are double-quoted and hand-aligned: don't run prettier on them (it rewrites the whole
  file); screens are prettier-formatted.
- Commit messages: write them with the Write tool, not `Set-Content` (PowerShell 5.1 adds a BOM).
