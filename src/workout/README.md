# src/workout — levels and scoring (owner: Patrick, who also owns the game)

Exports from `index.ts`: `generateLevel`, `createSessionTracker`, `WORKOUTS` (all from the contract), plus `DEMO_CONFIG` and `DEMO_SEED` for the demo round. All numbers live in `tuning.ts`.

## generateLevel(config) — `level.ts`

Pure and seeded (mulberry32): the same complete config always gives the same level. It fills `difficulty` (0.5), `lowImpact` (false) and `seed` (random integer 0 to 2^31 − 1 when missing or invalid), and returns them in `level.config`.

1. **Curve.** Effort runs through warm-up (first 20 %), build (to 50 %), peak (to 85 %) and cool-down (`CURVE`). Effort sets the gap to the next wave and the wave's `intensity`, which the game turns into speed.
2. **Difficulty** (0 to 1) tightens the gaps, lengthens holds, adds combos, and scales intensity from 70 % to 100 % of the curve.
3. **Mix.** Each wave's kind is drawn from the PLAN.md table for the workout. A third wave of the same kind in a row is re-rolled once. Treadmill keeps only crates and orbs. `lowImpact` drops hurdles and gives their share to the gentle moves, half to sidestep blocks and half to reach orbs (`LOW_IMPACT_SHARE`), so squats stay as frequent as in the normal level. Spread over every kind, the low-impact demo had 5 squats instead of 3, three of them within 6 s.
4. **Flavour.**
   - Legs: half the beams are held squats.
   - Shoulders: half the crates are held presses.
   - Full body: blocks can carry an orb in the free lane (step and reach).
   - Treadmill orbs alternate left and right.
   - No holds or combos during the warm-up, and no holds in the cool-down (the last 15 %): the round eases off and ends on moves a first-time player clears. The same random numbers are drawn either way, so a level without a cool-down hold is unchanged. Levels that had one keep everything before the cool-down; some gain a final wave that now fits.
5. **Fairness**, enforced while building and tested on every workout × mode × difficulty × low impact × 45/90/180 s × 40 seeds:
   - The first wave comes at 4 s.
   - Gaps are at least 1.8 s in the warm-up and never under 1.1 s, measured from the **end** of the previous hold. After a hold the gap is at least 1.3 s.
   - At least 1.5 s from the end of a beam to any later hurdle.
   - A block leaves exactly one free lane, at most one lane from the last free lane. Stricter than the contract: it's also at most one lane from any floor orb since then, so a player who chased an orb is never two lanes away.
   - The last object finishes 1 s before the round ends, so every object is judged before `finished`.
   - Orb labels: floor uses `reachLeft` on lane −1 and `reachRight` otherwise (either arm works on the floor). Treadmill uses the arm the lane needs (−1 left, +1 right, 0 `armsUp`).

**Demo round:** open the app with `?demo=1` (for example `https://codejam-jet.vercel.app/?demo=1`) and every round is the demo level, whatever card is picked: Full body, floor, 45 s, seed 41492 (`DEMO_CONFIG`). No app change is needed; `generateLevel` reads the flag. The "Low impact" toggle still applies: same seed, no hurdles, for judges. Seed 41492 passes `demo.test.ts`:
- every move at least twice, also in the low-impact version;
- three easy waves at each end, none of them held;
- no hurdle right after a beam;
- the low-impact version, which judges play cold, has no holds and at most one squat more than the normal one (4 against 3). The normal demo level did not change with the low-impact and cool-down rules.

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

## Leaderboard fairness: longer rounds always win (proposal for D)

The board (`public.leaderboard`, `supabase/migrations/0001_init.sql`) keeps each player's best score per **workout and mode**, whatever the duration, difficulty or low impact. Judges play 45 s.

**Measured:** every level replayed through the real scorer (`createSessionTracker`), difficulty 0.5, 20 seeds each. "Perfect" clears everything; "typical" succeeds on each object with 80 % chance (seeded).

| Workout, mode | 45 s perfect / typical | 90 s perfect / typical | 180 s perfect / typical |
| --- | --- | --- | --- |
| Full body, floor | 5,033 / 2,570 | 13,785 / 6,065 | 30,790 / 10,695 |
| Legs, floor | 4,653 / 2,390 | 13,280 / 5,330 | 30,528 / 10,060 |
| Arms, floor | 4,300 / 2,548 | 11,925 / 5,505 | 27,043 / 10,750 |
| Shoulders, floor | 3,675 / 2,110 | 10,603 / 5,240 | 25,060 / 9,655 |
| Full body, treadmill | 3,698 / 2,168 | 10,705 / 5,228 | 24,688 / 9,635 |
| Arms, treadmill | 3,780 / 2,250 | 10,830 / 5,455 | 24,910 / 10,260 |
| Shoulders, treadmill | 3,353 / 2,200 | 9,923 / 4,748 | 22,973 / 9,058 |

- **180 s scores about 6× more than 45 s** with perfect play. An 80 % run at 180 s still beats a perfect 45 s run by 2×. A judge can never top a board that holds one long round.
- **Points per minute is not a fix:** perfect play earns 6,710 → 9,190 → 10,263 points a minute (Full body, floor), because long rounds reach the ×3 and ×4 streak multipliers that 45 s rarely does.
- **Low impact** scores about 5 % less than normal (no hurdles; more sidesteps and orbs, which are worth half). It is not stored, so it can't be split out today.

**Proposal (D's folders, no scoring change):** rank per duration as well.
- The sessions table already stores `duration_sec`. A new migration recreates the view with `duration_sec` in the `distinct on` and in the select list. `create or replace view` can only add columns at the end, so drop and recreate it; keep it a plain view, never `security_invoker`.
- `LeaderboardEntry` (contract) gains `durationSec`.
- The leaderboard screen filters by it, defaulting to 45 s for the demo.

Saved sessions keep their scores, and nothing in the formula changes. Until then: on the demo laptop, play only 45 s rounds, so the board compares like with like.

## Physical load: what an unwarmed judge in jeans gets

From the generator, 30 seeds per row. "Big moves" are squats, jumps and crates.

| Workout (floor unless noted), difficulty 0.5 → 1 | Squats / min | Jumps / min | Crates / min | Held s / min | Longest hold | Most big moves in 10 s |
| --- | --- | --- | --- | --- | --- | --- |
| Legs | 8.6–9.7 → 9.9–11.2 | 8.6–8.8 → 9.9–10.0 | ~1.5 | 5.5–6.1 → 7.5–8.6 | 2.3 → 3.0 s | 7 → 8 |
| Full body | 5.0–6.1 → 6.0–7.1 | 5.8–6.4 → 6.9–7.5 | ~6 → 7 | 2.4–2.7 → 4.0 | 2.3 → 3.0 s | 7 → 8 |
| Arms | ~1.7 | ~1.7 | 10–11 → 12–13 | 1.4–2.2 → 2.2–3.1 | 2.3 → 3.0 s | 6 → 8 |
| Shoulders | ~1.6 | ~1.5 | 11–12 → 12.5–13.5 | 6.7–6.9 → 8.9–9.4 | 2.3 → 3.0 s | 6 → 7 |
| Treadmill (arms, shoulders, full body) | 0 | 0 | 14–15 → 16–18 | 2.2–8.0 → 3.2–10.8 | 2.3 → 3.0 s | 5 → 7 |

Low impact: no jumps; squats and crates as above. The ranges are over 45, 90 and 180 s.

**Flags:**
- **Legs is the hardest by far:** 6–7 squats and 6–7 jumps in 45 s, up to 8 big moves in a 10 s stretch. The results screen suggests it as "play this next", so a judge may well get it.
- **Squats came back to back.** Pairs at the 1.1 s minimum gap happened up to 10 times in a 180 s Legs round, and a few times in Full body. **Fixed:** `MIN_GAP_SQUAT_TO_SQUAT_SEC` (1.8 s from the end of one squat to the next), a fairness test over every level, and **both demo levels unchanged**. `demo.test.ts` now pins them, so any generator change that alters them fails loudly.
- **Shoulders and the treadmill keep the arms overhead for long:** up to 10 s of holds a minute at difficulty 1. That is their purpose, so it's left as is. For judges, prefer the demo level (Full body, 45 s, low impact on offer).
- **Not changed:** the Legs mix and the hold lengths. Lowering them would change what Legs is; tell me if you want a gentler Legs for judges.

## Settled: crates with `holdSec`

A crate with `holdSec` is judged like a held beam: both arms must go up inside `[t − 0.35, t + 0.15]`, then stay up until `t + holdSec`. A drop longer than 0.3 s is a hit. The game smashes the crate front on contact and shows magenta rails for the hold. Proposed wording for the crate row in the CONTRACTS.md collision table: "both arms up (for the whole `holdSec` if set, with 0.3 s of grace)".

## Status
- **Works:** generator and tracker, with 32 tests (fairness checks mutation-tested: weakening any rule makes them fail).
- **Not tested:** whether the gaps and speeds feel right for a body in front of a webcam. Tune `GAP_*`, `HOLD_*` and the game's `SPEED_*` with Abdo at the camera.
