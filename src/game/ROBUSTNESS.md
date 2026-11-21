# Expo robustness

Patrick’s Windows QA station, Saturday 21 November. App baseline `7be4281`, keyboard fix `b7e66d6`. The preview uses the local store and denies camera permission. Measurements below come from a fresh Chrome profile. Run the browser scripts from the repo root with Node 22 or later. They reuse Greg’s package-free CDP driver.

## Verified changes

- Holding W and tapping Q previously emitted both `armsUp` and `reachLeft`. Holding Q then pressing E emitted a right reach while the input state showed both arms raised. The keyboard now reports the newly raised pose once. Releasing an overlapping key preserves the remaining hold. The three chord regressions failed on the original code twice, including a deliberate revert. The fixed input suite passed five consecutive runs.
- The keyboard adapter releases W and Down on blur or a hidden document, handles keyup during pause, ignores repeat after focus returns, and resets held keys across 20 stop/start cycles. Tests exercise the adapter’s actual event listeners.
- Every workout, mode, duration (45/90/180), impact setting, and difficulty in tenths passed seeds 0 through 199. That is 105,600 levels per run. The sweep checks the end margin, recovery after holds and squats, and a reachable lane through each wave, including block/orb combinations. SHA-256 pins both complete serialized demo levels, including lanes and intensity. Both test files passed five times.

## Timing finding for laptop 1

At a steady 15 frame callbacks per second, 180 game seconds take 240 seconds. At 10 callbacks per second they take 360 seconds. At 20 they take 180 seconds. Reproduce with `node src/game/robust/slow-clock.mjs`. It feeds fixed timestamps to the real game core and counts finished events. Five runs produced the same numbers.

The core caps **every** frame at 50 ms. A steady 66.7 ms interval therefore loses 16.7 ms on every frame. This only matters on a station whose frame delivery stays slow after the quality ladder steps down. The demo Mac needs its own measurements. The game owner can preserve the existing handling of long interruptions while admitting typical slow frame intervals with this change.

```diff
--- a/src/game/tuning.ts
+++ b/src/game/tuning.ts
@@ -80,6 +80,7 @@ export const STREAK_TIERS = [5, 10, 20] as const; // fever tiers, same steps as

 /* ── Loop ── */
 export const MAX_DT_SEC = 0.05; // clamp: a stall or background tab never skips a window
+export const CLOCK_STALL_SEC = 0.15; // longer gaps count as one short step
 export const MAX_PIXEL_RATIO = 2;
 // Quality ladder (quality.ts): in auto mode, a round that runs under QUALITY_MIN_FPS over a
 // QUALITY_WINDOW_SEC window (after QUALITY_SKIP_SEC of start-up) steps down one level.
--- a/src/game/core.ts
+++ b/src/game/core.ts
@@ -152,7 +152,8 @@ export function createCore(level: Level, hooks: CoreHooks = {}, leads?: T.Leads)
       }
       if (pauseReason) return;

-      elapsed = Math.min(durationSec, elapsed + Math.min(Math.max(0, realDtSec), T.MAX_DT_SEC));
+      const dt = realDtSec > T.CLOCK_STALL_SEC ? T.MAX_DT_SEC : Math.max(0, realDtSec);
+      elapsed = Math.min(durationSec, elapsed + dt);
       while (nextCue < waves.length && arrivesAt(waves[nextCue]!) - elapsed <= T.CUE_LEAD_SEC) {
         const wave = waves[nextCue++]!;
         hooks.cue?.(wave);
```

With `drift.mjs --slow` delivering every fourth animation tick on the same station, the HUD interval from 2:50 to 0:10 took **213.301 s** of wall time and **213.301 s** of audio time. A temporary production build with the clock diff above took **159.999 s** of wall time and **160.000 s** of audio time over the same 160 game seconds. Both rounds finished and saved. Time is sampled at displayed whole seconds, with the HUD polling every 100 ms. These are clock measurements, not a listening test. Only the temporary build used the proposed clock change.

## Paused reps for laptop 1

In the judge script, pause at 0:01, tap W three times, resume and finish. The saved summary has three `armsUp` reps. All three presses happened on the pause screen. The input still needs to process releases there. The tracker receives both pause reasons and can ignore newly emitted moves until resume. This proposed change also covers camera input and preserves the existing treatment of warm-up moves.

```diff
--- a/src/workout/tracker.ts
+++ b/src/workout/tracker.ts
@@ -50,6 +50,7 @@ export function createSessionTracker(
   // Live calories count time between the first event and now, minus pauses.
   let runningSince: number | null = null;
   let activeMs = 0;
+  let countMoves = true;
   const activeSecNow = (): number =>
     (activeMs + (runningSince === null ? 0 : now() - runningSince)) / 1000;

@@ -81,18 +82,21 @@ export function createSessionTracker(
           break;
         case 'paused':
         case 'finished':
+          countMoves = false;
           if (runningSince !== null) {
             activeMs += now() - runningSince;
             runningSince = null;
           }
           break;
         case 'resumed':
+          countMoves = true;
+          break;
         case 'cue':
           break;
       }
     },
     handleMove(e: MoveEvent) {
-      reps[e.type] += 1;
+      if (countMoves) reps[e.type] += 1;
     },
     getLive: () => live(activeSecNow()),
     finish(activeSec: number): SessionSummary {
```

A tracker-only replay also compared the proposed pause diff in memory: one W press before pause, three during, one after resume. Both user pause and tracking-loss pause counted five on the baseline and two with the diff.

## Thirty consecutive demo rounds

One guest played 30 full rounds in one tab. Every Play again added one local session. Each summary had a score of 300 and accuracy of 3/16. Round 1 established the ghost for replay. All 30 result screens had 14 window listeners and zero open audio contexts after the two-second audio tail. A second CDP connection queried live browser objects on results for rounds 16?30; it found zero retained game canvases and zero WebGL2 contexts on each sample. That extra inspection can trigger garbage collection and affects comparison of heap readings across round 16.

GPU counts are sampled during play after the same seven keys. Heap is the page?s used JS heap after explicit GC on results. FPS is relative to round 2, the first replay with a ghost. The final column is the interval to the return of the first Three.js render call (including offscreen passes), starting at tutorial skip for round 1 and Play again for replays. It excludes display scanout. The checked-in probe refines the endpoint to the first render to the canvas framebuffer. This station also ran other browser checks during the soak.

| Round | Heap MiB | Geometries / textures / programs | Open audio | Window listeners | Relative FPS | First render ms |
| ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 1 | 29.54 | 41 / 21 / 47 | 0 | 14 | 100.0% | 1053 |
| 2 | 29.87 | 56 / 22 / 49 | 0 | 14 | 100.0% | 442 |
| 3 | 30.22 | 60 / 24 / 49 | 0 | 14 | 100.0% | 138 |
| 4 | 30.42 | 60 / 24 / 49 | 0 | 14 | 100.0% | 129 |
| 5 | 30.52 | 56 / 23 / 49 | 0 | 14 | 100.0% | 147 |
| 6 | 30.62 | 60 / 24 / 49 | 0 | 14 | 100.0% | 119 |
| 7 | 30.67 | 60 / 24 / 49 | 0 | 14 | 100.0% | 146 |
| 8 | 30.72 | 60 / 24 / 49 | 0 | 14 | 100.0% | 123 |
| 9 | 30.78 | 56 / 23 / 49 | 0 | 14 | 100.0% | 148 |
| 10 | 30.81 | 60 / 24 / 49 | 0 | 14 | 100.0% | 126 |
| 11 | 30.85 | 60 / 24 / 49 | 0 | 14 | 100.0% | 118 |
| 12 | 30.86 | 60 / 24 / 49 | 0 | 14 | 100.0% | 127 |
| 13 | 30.86 | 60 / 24 / 49 | 0 | 14 | 100.0% | 126 |
| 14 | 30.88 | 60 / 24 / 49 | 0 | 14 | 100.0% | 128 |
| 15 | 30.91 | 60 / 24 / 49 | 0 | 14 | 100.0% | 178 |
| 16 | 30.26 | 60 / 24 / 49 | 0 | 14 | 100.0% | 129 |
| 17 | 30.27 | 56 / 23 / 49 | 0 | 14 | 100.0% | 161 |
| 18 | 30.30 | 60 / 24 / 49 | 0 | 14 | 100.0% | 145 |
| 19 | 30.29 | 60 / 24 / 49 | 0 | 14 | 99.9% | 185 |
| 20 | 30.29 | 60 / 24 / 49 | 0 | 14 | 97.0% | 144 |
| 21 | 30.28 | 60 / 24 / 49 | 0 | 14 | 98.6% | 156 |
| 22 | 30.27 | 60 / 24 / 49 | 0 | 14 | 100.0% | 142 |
| 23 | 30.27 | 60 / 24 / 49 | 0 | 14 | 100.0% | 127 |
| 24 | 30.26 | 60 / 24 / 49 | 0 | 14 | 100.0% | 128 |
| 25 | 30.26 | 60 / 24 / 49 | 0 | 14 | 100.0% | 136 |
| 26 | 30.28 | 60 / 24 / 49 | 0 | 14 | 100.0% | 126 |
| 27 | 30.26 | 60 / 24 / 49 | 0 | 14 | 100.0% | 130 |
| 28 | 30.25 | 60 / 24 / 49 | 0 | 14 | 100.0% | 125 |
| 29 | 30.28 | 60 / 24 / 49 | 0 | 14 | 100.0% | 134 |
| 30 | 30.25 | 60 / 24 / 49 | 0 | 14 | 100.0% | 124 |

## Browser runs

Five complete judge sweeps each saved three full rounds. Idle play scored 300 at 3/16 accuracy. Tapping all movement keys every animation frame scored 600 at 6/16. Twenty camera attempts per sweep returned to keyboard through the denied-camera dialog. Each last-second pause held the clock, each resume saved once, and all five quits saved zero partial rounds.

Five display sweeps completed the resize, DPR, fullscreen, restore and tab-return sequence and saved a session. The DPR-only change at 1280×720 produced a 2560×1440 buffer at DPR 2 on this station. Each restored or resumed canvas contained multiple colours. Five normal 180 s rounds measured between 159.998 s and 160.094 s of wall time over the 160 s HUD interval. The baseline game and the proposed clock change were also measured with deliberately slow callbacks, as recorded above.

Start `npm run dev` for the soak, or `npm run preview -- --port 5183` after a production build. The optional local origin ends in a slash. Each script uses a separate browser profile and debugging port.

| Command | Measurement |
| --- | --- |
| `node src/game/robust/soak.mjs 30` | One tab, natural 45 s demo rounds, real keys and Play again. One JSON record per saved summary. |
| `node src/game/robust/hardware.mjs http://localhost:5183/` | Resize, DPR, fullscreen, forced WebGL loss/restore, 60 s in another tab. Samples pixels from the game canvas after each event, checks pause and the saved round. Use preview to keep a Vite HMR reconnect from reloading the tab. |
| `node src/game/robust/judges.mjs http://localhost:5183/` | Idle play, every movement key every frame, repeated Esc, 20 camera attempts with keyboard fallback, pause at 0:01, and quit at 0:01. Checks the local-store rows and summary values. |
| `node src/game/robust/drift.mjs http://localhost:5183/` | A real 180 s round with music enabled. Samples wall time, the audio clock and scheduled kick timestamps at 2:50 and 0:10. Add `--slow` to deliver animation callbacks every fourth display tick. |

For END ROUND, Greg’s Q7 and the existing browser sweep both require discarding a partial round. The judge script checks the stored row count before and after quitting at 0:01. Pausing at the same time and then resuming produces exactly one saved session.

Not tested here: a real webcam, sound by ear, the demo Mac’s GPU, a physical projector, Supabase and the deployed coach endpoint.
