// Every tunable number for level generation and scoring lives here.
import type { ObstacleKind, SessionConfig, WorkoutId } from '@/contracts';

/* ── Defaults (CONTRACTS.md: generateLevel fills these) ── */
export const DEFAULT_DIFFICULTY = 0.5;
export const SEED_RANGE = 2 ** 31; // seeds are integers 0 to 2^31 - 1 (Postgres int)

/* ── Mix: share of each object per workout (PLAN.md "Game design") ── */
export const MIX: Record<WorkoutId, Record<ObstacleKind, number>> = {
  legs: { block: 0.25, hurdle: 0.3, beam: 0.35, crate: 0.05, orb: 0.05 },
  arms: { block: 0.15, hurdle: 0.05, beam: 0.05, crate: 0.35, orb: 0.4 },
  shoulders: { block: 0.1, hurdle: 0.05, beam: 0.05, crate: 0.45, orb: 0.35 },
  fullBody: { block: 0.2, hurdle: 0.2, beam: 0.2, crate: 0.2, orb: 0.2 },
};

/* ── Round curve: warm-up, build, peak, cool-down ── */
export const WARMUP_END = 0.2; // fraction of the round
export const BUILD_END = 0.5;
export const PEAK_END = 0.85;
/** Effort (0 to 1) over the round, as [fraction of round, effort] points. */
export const CURVE: readonly (readonly [number, number])[] = [
  [0, 0.15],
  [WARMUP_END, 0.35],
  [BUILD_END, 0.8],
  [0.7, 1],
  [PEAK_END, 1],
  [1, 0.3],
];
/** Intensity (speed) at difficulty 0 is the curve times this; at difficulty 1, the curve itself. */
export const INTENSITY_AT_EASIEST = 0.7;

/* ── Spacing (CONTRACTS.md "Level rules") ── */
export const FIRST_WAVE_SEC = 4; // never earlier
export const MIN_GAP_WARMUP_SEC = 1.8; // between waves during the warm-up
export const MIN_GAP_SEC = 1.1; // never less, even at peak
export const MIN_GAP_BEAM_TO_HURDLE_SEC = 1.5; // stand up before jumping
export const MIN_GAP_AFTER_HOLD_SEC = 1.3; // a breather after a held beam or crate
// Gap at effort 0 and at effort 1, each at difficulty 0 and 1. Gaps are measured from the
// end of the previous wave (its t plus any hold) to the next wave's t.
export const GAP_EASY = { atD0: 2.6, atD1: 2.0 };
export const GAP_HARD = { atD0: 1.7, atD1: MIN_GAP_SEC };
export const GAP_JITTER_SEC = 0.3;
export const END_MARGIN_SEC = 1.0; // every object is judged before the round ends

/* ── Flavour ── */
export const HOLD_CHANCE: Record<WorkoutId, { beam: number; crate: number }> = {
  legs: { beam: 0.5, crate: 0.1 }, // squat holds under long beams
  arms: { beam: 0.1, crate: 0.15 },
  shoulders: { beam: 0.1, crate: 0.5 }, // arms held overhead through long gates
  fullBody: { beam: 0.2, crate: 0.2 },
};
export const HOLD_MIN_SEC = 1.0;
export const HOLD_MAX_SEC = { atD0: 1.6, atD1: 3.0 };
export const COMBO_CHANCE = { atD0: 0.15, atD1: 0.45 }; // full body: a block with an orb in the free lane
export const ALTERNATE_REACH_CHANCE = 0.8; // treadmill orbs switch arm, for fast left-right reaches

/* ── The demo round (docs/DEMO.md): the same level every time, so the Player can practise it ── */
/**
 * The app preselects DEMO_CONFIG with ?demo=1; its low-impact toggle plays the same seed
 * without hurdles. Seed 41492 was searched against both test files: every move at least
 * twice (low-impact too), three easy waves at each end, no hurdle right after a beam
 * (demo.test.ts), and all five objects in the first five waves with a held squat and a
 * block-and-orb combo (level.test.ts). If the generator changes, search again.
 */
export const DEMO_SEED = 41492;
export const DEMO_CONFIG: SessionConfig = {
  workout: 'fullBody',
  mode: 'floor',
  durationSec: 45,
  difficulty: 0.5,
  seed: DEMO_SEED,
};

/* ── Scoring (CONTRACTS.md "Scoring") ── */
export const POINTS_CLEARED = 100;
export const POINTS_ORB = 50;
/** [minimum streak, multiplier], highest first. */
export const MULTIPLIERS: readonly (readonly [number, number])[] = [
  [20, 4],
  [10, 3],
  [5, 2],
  [0, 1],
];
export const DEFAULT_WEIGHT_KG = 70;
export const MET: Record<WorkoutId, number> = { legs: 8, fullBody: 8, arms: 6, shoulders: 6 };
export const MET_TREADMILL = 9;
