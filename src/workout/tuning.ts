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
/**
 * Low impact (no jumps, for judges in street clothes): the hurdles' share goes to the gentle
 * moves, sidestep blocks and reach orbs, in these parts. Spread over every kind, it made squat
 * beams more frequent than in the normal level (the low-impact demo had 5 squats instead of 3).
 */
export const LOW_IMPACT_SHARE: Partial<Record<ObstacleKind, number>> = { block: 0.5, orb: 0.5 };

/* ── Levels: a round is LEVELS levels of LEVEL_SEC, played in a row (CONTRACTS.md Stage) ── */
export const LEVELS = 6;
export const LEVEL_SEC = 30;
export const ROUND_SEC = LEVELS * LEVEL_SEC; // every round's durationSec, whatever was picked
/**
 * The tier (config.difficulty: 0 beginner, 0.5 regular, 1 athlete, lerped in between) sets how
 * many obstacles: the gap between waves. The level sets the speed: wave intensity is
 * TIER_SPEED_BASE + (level - 1) × LEVEL_SPEED_STEP, flat within a level. Beginner level 1 is the
 * old slowest (0.1), regular level 1 a little faster, athlete level 6 exactly the old top (1).
 */
export const TIER_SPEED_BASE = { beginner: 0.1, regular: 0.16, athlete: 0.3 };
export const LEVEL_SPEED_STEP = 0.14;
/** Gap between waves (end of one, with its hold, to the next t), by tier, before jitter. */
export const TIER_GAP = { atD0: 2.3, atD1: 1.35 };
/** Level 1 opens gently: a longer gap, no holds and no combos (it is the warm-up). */
export const LEVEL1_EXTRA_GAP_SEC = 0.5;
export const WARMUP_END = 1 / LEVELS; // fraction of the round: level 1
/** The portal between two levels: no wave (with its hold) within this long of a boundary. */
export const PORTAL_BREATHER_SEC = 2;

/* ── Spacing (CONTRACTS.md "Level rules") ── */
export const FIRST_WAVE_SEC = 4; // never earlier
export const MIN_GAP_WARMUP_SEC = 1.8; // between waves during the warm-up
export const MIN_GAP_SEC = 1.1; // never less, even at peak
export const MIN_GAP_BEAM_TO_HURDLE_SEC = 1.5; // stand up before jumping
// A breath between two squats, from the end of the first (its hold included): back-to-back
// squats at the 1.1 s minimum gap are hard work for an unwarmed player in jeans. Both demo
// levels have none closer than 1.9 s, so they are unchanged (demo.test.ts pins them).
export const MIN_GAP_SQUAT_TO_SQUAT_SEC = 1.8;
export const MIN_GAP_AFTER_HOLD_SEC = 1.3; // a breather after a held beam or crate
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
 * With ?demo=1 in the URL, generateLevel (index.ts) plays DEMO_CONFIG for every round; the
 * app's low-impact toggle still applies (same seed, no hurdles). Like every round it is the six
 * levels (180 s). Seed 11475 was searched against both test files: every move at least twice
 * (low impact too), three easy waves with no hold at each end, no hurdle right after a beam in
 * level 1 (demo.test.ts), and all five objects in the first five waves with a held squat and a
 * block-and-orb combo (level.test.ts). If the generator changes, search again.
 */
export const DEMO_SEED = 11475;
export const DEMO_CONFIG: SessionConfig = {
  workout: 'fullBody',
  mode: 'floor',
  durationSec: ROUND_SEC,
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
