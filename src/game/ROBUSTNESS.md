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
@@
 export const MAX_DT_SEC = 0.05; // clamp: a stall or background tab never skips a window
+export const CLOCK_STALL_SEC = 0.15; // longer gaps count as one short step
--- a/src/game/core.ts
+++ b/src/game/core.ts
@@
-      elapsed = Math.min(durationSec, elapsed + Math.min(Math.max(0, realDtSec), T.MAX_DT_SEC));
+      const dt = realDtSec > T.CLOCK_STALL_SEC ? T.MAX_DT_SEC : Math.max(0, realDtSec);
+      elapsed = Math.min(durationSec, elapsed + dt);
```

## Browser runs

### Paused reps for laptop 1

In the judge script, pause at 0:01, tap W three times, resume and finish. The saved summary has three `armsUp` reps. All three presses happened on the pause screen. The input still needs to process releases there. The tracker receives both pause reasons and can ignore newly emitted moves until resume. This proposed change also covers camera input and preserves the existing treatment of warm-up moves.

```diff
--- a/src/workout/tracker.ts
+++ b/src/workout/tracker.ts
@@
   let activeMs = 0;
+  let countMoves = true;
@@
         case 'paused':
         case 'finished':
+          countMoves = false;
           if (runningSince !== null) {
@@
         case 'resumed':
+          countMoves = true;
+          break;
         case 'cue':
@@
     handleMove(e: MoveEvent) {
-      reps[e.type] += 1;
+      if (countMoves) reps[e.type] += 1;
     },
```

### Reproduction

Start `npm run dev` for the soak, or `npm run preview -- --port 5183` after a production build. The optional local origin ends in a slash. Each script uses a separate browser profile and debugging port.

| Command | Measurement |
| --- | --- |
| `node src/game/robust/soak.mjs 30` | One tab, natural 45 s demo rounds, real keys and Play again. One JSON record per saved summary. |
| `node src/game/robust/hardware.mjs http://localhost:5183/` | Resize, DPR, fullscreen, forced WebGL loss/restore, 60 s in another tab. Samples pixels from the game canvas after each event, checks pause and the saved round. Use preview to keep a Vite HMR reconnect from reloading the tab. |
| `node src/game/robust/judges.mjs http://localhost:5183/` | Idle play, every movement key every frame, repeated Esc, 20 camera attempts with keyboard fallback, pause at 0:01, and quit at 0:01. Checks the local-store rows and summary values. |
| `node src/game/robust/drift.mjs http://localhost:5183/` | A real 180 s round with music enabled. Samples wall time, the audio clock and scheduled kick timestamps at 2:50 and 0:10. Add `--slow` to deliver animation callbacks every fourth display tick. |

For END ROUND, Greg’s Q7 and the existing browser sweep both require discarding a partial round. The judge script checks the stored row count before and after quitting at 0:01. Pausing at the same time and then resuming produces exactly one saved session.

Not tested here: a real webcam, sound by ear, the demo Mac’s GPU, a physical projector, Supabase and the deployed coach endpoint.
