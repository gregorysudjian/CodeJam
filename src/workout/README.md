# src/workout — levels and scoring (owner: Patrick, who also owns the game)

Exports from `index.ts`: `generateLevel`, `createSessionTracker`, `WORKOUTS` (all from the contract), plus `DEMO_CONFIG` and `DEMO_SEED` for the demo round. All numbers live in `tuning.ts`.

## generateLevel(config) — `level.ts`

Pure and seeded (mulberry32): the same complete config always gives the same level. It fills `difficulty` (0.5), `lowImpact` (false) and `seed` (random integer 0 to 2^31 − 1 when missing or invalid), and returns them in `level.config`.

1. **Curve.** Effort runs through warm-up (first 20 %), build (to 50 %), peak (to 85 %) and cool-down (`CURVE`). Effort sets the gap to the next wave and the wave's `intensity`, which the game turns into speed.
2. **Difficulty** (0 to 1) tightens the gaps, lengthens holds, adds combos, and scales intensity from 70 % to 100 % of the curve.
3. **Mix.** Each wave's kind is drawn from the PLAN.md table for the workout. A third wave of the same kind in a row is re-rolled once. Treadmill keeps only crates and orbs, and `lowImpact` drops hurdles. The weights are renormalised after either.
4. **Flavour.**
   - Legs: half the beams are held squats.
   - Shoulders: half the crates are held presses.
   - Full body: blocks can carry an orb in the free lane (step and reach).
   - Treadmill orbs alternate left and right.
   - No holds or combos during the warm-up.
5. **Fairness**, enforced while building and tested on every workout × mode × difficulty × low impact × 45/90/180 s × 40 seeds:
   - The first wave comes at 4 s.
   - Gaps are at least 1.8 s in the warm-up and never under 1.1 s, measured from the **end** of the previous hold. After a hold the gap is at least 1.3 s.
   - At least 1.5 s from the end of a beam to any later hurdle.
   - A block leaves exactly one free lane, at most one lane from the last free lane. Stricter than the contract: it's also at most one lane from any floor orb since then, so a player who chased an orb is never two lanes away.
   - The last object finishes 1 s before the round ends, so every object is judged before `finished`.
   - Orb labels: floor uses `reachLeft` on lane −1 and `reachRight` otherwise (either arm works on the floor). Treadmill uses the arm the lane needs (−1 left, +1 right, 0 `armsUp`).

**Demo round:** open the app with `?demo=1` (for example `https://codejam-jet.vercel.app/?demo=1`) and every round is the demo level, whatever card is picked: Full body, floor, 45 s, seed 41492 (`DEMO_CONFIG`). No app change is needed; `generateLevel` reads the flag. The "Low impact" toggle still applies: same seed, no hurdles, for judges. Seed 41492 passes `demo.test.ts`:
- every move at least twice, also in the low-impact version;
- three easy waves at each end;
- no hurdle right after a beam.

It also passes `level.test.ts`: all five objects in the first five waves, a held squat and a combo. It opens block, orb, crate, hurdle, held beam and closes on two crates. A tuning change that alters the demo fails CI, so it has to be done on purpose, and the Player should rehearse again after it.

## createSessionTracker(config, opts) — `tracker.ts`

Scoring per CONTRACTS.md:
- A clear is worth 100 and an orb 50, times the multiplier of the streak before it (1, 2 from streak 5, 3 from 10, 4 from 20). Both extend the streak.
- A hit resets the streak and counts in `missed` under the move it required.
- A missed orb fires no event, so it changes nothing.
- `accuracy = cleared / (cleared + hit)`. Orbs are not part of it, and it is 0 with nothing judged.
- Reps come from move events.
- Calories are an estimate: MET 8 for legs and full body, 6 for arms and shoulders, 9 on the treadmill, with 70 kg assumed when no weight is given.
- Change from the stub: live calories now count only running time, from the first game event, without pauses. `finish(activeSec)` uses the app's number as before. The optional `opts.now` exists for tests.

## Settled: crates with `holdSec`

A crate with `holdSec` is judged like a held beam: both arms must go up inside `[t − 0.35, t + 0.15]`, then stay up until `t + holdSec`. A drop longer than 0.3 s is a hit. The game smashes the crate front on contact and shows magenta rails for the hold. Proposed wording for the crate row in the CONTRACTS.md collision table: "both arms up (for the whole `holdSec` if set, with 0.3 s of grace)".

## Status
- **Works:** generator and tracker, with 32 tests (fairness checks mutation-tested: weakening any rule makes them fail).
- **Not tested:** whether the gaps and speeds feel right for a body in front of a webcam. Tune `GAP_*`, `HOLD_*` and the game's `SPEED_*` with Abdo at the camera.
