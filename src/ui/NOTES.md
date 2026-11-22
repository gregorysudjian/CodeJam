# src/ui notes (Jiscar 1)

Read this first if you pick up `src/ui` in a new conversation.

## Sat 19:35: state

One branch per item, each cut from `main`, pushed, waiting for Greg's Claude to merge.
They all test-merge cleanly with each other (`git merge-tree`).

| Branch | Commit | What a judge sees |
| --- | --- | --- |
| `j1-q19` | 8c646a8 | Select screen fits at 125–150 % scaling: START and Camera/Keyboard in view |
| `j1-q20` | 6be6797 | Leaderboard podium and kiosk QR above the fold at 125–150 % |
| `j1-copy` | 0a6d3d3 | QA copy rows C5, C6, C7, C10 |
| `j1-q12` | 1c35d83 | Landing QR in the hero, 112 px, dark on light, above the fold (the old one was cropped) |
| `j1-dashboard` | d0430f3 | Everything under YOUR WEEK is this week; chart Mon–Sun like the dots (built on `j1-copy`) |
| `j1-camera` | 495dc62 | Calibration fits one screen; the full instruction shows (was 1,346 px tall at 1280×720) |
| `j1-device` | c912ded | Key caps hidden on touch screens (phone → leaderboard) |

Merged earlier: results fit at 1280×720 / 1366×768 (Q5), footer pinned to the bottom, MISS outline.

**A judge will notice:** results, calibration and landing are each one screen at the demo
sizes; the landing QR scans; the dashboard's numbers agree with each other.

**Polish nobody will see:** height variants `short` (≤ 900 px), `tight` (≤ 640, 125 %) and
`cramped` (≤ 520, 150 %) in theme.css; key caps hidden on phones.

**Not tested here:** a real person calibrating (fake camera only), Supabase boards with many
players (checked with a 12-entry harness), the AI coach's longer recap, sound.

**Next:** accessibility pass (visible focus and tab order on every screen, reduced motion,
4.5:1 body contrast: `text-dim` #5b6475 on the background is below it, used for labels like
OPEN SPOT and the board's column heads); then re-sweep after Greg merges the batch.
Freeze: from 10:00 Sunday only crash or unplayable fixes, nothing after 11:30.

## How I check (Windows, no webcam)

- Node: portable 26.13.1 in `%LOCALAPPDATA%\Programs\nodejs-dl` (not on PATH; prepend it).
- `node docs/qa/sweep/sweep.mjs` and `SIZES=1093x614@1.25,1024x576@1.25,911x512@1.5,853x480@1.5`.
- A local screen harness, `preview-local/` (untracked, in `.git/info/exclude`), renders the
  leaderboard with N fake entries and the HUD with a fake camera. Tailwind skips git-ignored
  files, so harness-only styles must be inline.
- Fake camera: Chrome `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
- Vite sometimes serves a stale module after a branch switch: touch the file.
