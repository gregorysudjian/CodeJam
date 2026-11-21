// Every tunable number for src/workout (AGENTS.md rule 10).
import type { SessionConfig } from '@/contracts';

/** Level timing (docs/CONTRACTS.md, "Level rules"). */
export const FIRST_WAVE_SEC = 4;
export const WAVE_GAP_SEC = 2.2;
export const END_MARGIN_SEC = 1;
export const DEFAULT_DIFFICULTY = 0.5;

/** Scoring (docs/CONTRACTS.md, "Scoring"). */
export const POINTS_CLEARED = 100;
export const POINTS_ORB = 50;
/** Streak thresholds for multipliers 2, 3 and 4. */
export const MULTIPLIER_STREAKS = [5, 10, 20] as const;

/** Calories: MET × 3.5 × kg / 200 × minutes. Check against the Compendium before quoting. */
export const DEFAULT_WEIGHT_KG = 70;
export const MET_FLOOR = { legs: 8, fullBody: 8, arms: 6, shoulders: 6 } as const;
export const MET_TREADMILL = 9;

/**
 * Demo preset (docs/DEMO.md, "The demo level"): the same 45-second Full body level every time.
 * The seed was picked by searching for one that shows every move at least twice, opens and
 * closes on easy waves (the round ends on a streak) and never puts a hurdle right after a beam.
 * src/workout/demo.test.ts checks it; if the generator changes, re-run the search there.
 */
export const DEMO_SEED = 189;
export const DEMO_CONFIG: SessionConfig = {
  workout: 'fullBody',
  mode: 'floor',
  durationSec: 45,
  difficulty: 0.5,
  seed: DEMO_SEED,
};
