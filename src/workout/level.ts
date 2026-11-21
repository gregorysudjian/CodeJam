import type { Lane, Level, MoveType, ObstacleKind, SessionConfig, Spawn, Wave } from '@/contracts';
import * as T from './tuning';

/**
 * Level generator. Pure and seeded: the same complete config always gives the same level.
 *
 * Shape of a round: effort follows T.CURVE (warm-up, build, peak, cool-down). Effort and
 * difficulty set the gap between waves; effort also sets intensity, which the game maps
 * to speed. The kind of each wave is drawn from the workout's mix, then the fairness rules
 * in CONTRACTS.md are enforced by construction (and checked in level.test.ts).
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const round2 = (x: number): number => Math.round(x * 100) / 100;
const LANES: readonly Lane[] = [-1, 0, 1];

/** Effort (0 to 1) at fraction `u` of the round, linear between the T.CURVE points. */
export function effortAt(u: number): number {
  const pts = T.CURVE;
  if (u <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const [u1, e1] = pts[i]!;
    if (u <= u1) {
      const [u0, e0] = pts[i - 1]!;
      return lerp(e0, e1, (u - u0) / (u1 - u0));
    }
  }
  return pts[pts.length - 1]![1];
}

/** Fills difficulty, lowImpact and seed (CONTRACTS.md). */
export function completeConfig(config: SessionConfig): Required<SessionConfig> {
  const seed =
    config.seed !== undefined &&
    Number.isInteger(config.seed) &&
    config.seed >= 0 &&
    config.seed < T.SEED_RANGE
      ? config.seed
      : Math.floor(Math.random() * T.SEED_RANGE);
  return {
    workout: config.workout,
    mode: config.mode,
    durationSec: config.durationSec,
    difficulty: clamp01(config.difficulty ?? T.DEFAULT_DIFFICULTY),
    lowImpact: config.lowImpact ?? false,
    seed,
  };
}

/**
 * The mix for this config: treadmill keeps only crates and orbs. Low impact drops hurdles and
 * gives their share to the gentle moves (T.LOW_IMPACT_SHARE), not to squats and presses.
 */
export function mixFor(config: Required<SessionConfig>): [ObstacleKind, number][] {
  const allowed: ObstacleKind[] =
    config.mode === 'treadmill' ? ['crate', 'orb'] : ['block', 'hurdle', 'beam', 'crate', 'orb'];
  const mix = { ...T.MIX[config.workout] };
  if (config.lowImpact && allowed.includes('hurdle')) {
    for (const [kind, part] of Object.entries(T.LOW_IMPACT_SHARE) as [ObstacleKind, number][])
      mix[kind] += mix.hurdle * part;
    mix.hurdle = 0;
  }
  const entries = allowed
    .filter((k) => !(config.lowImpact && k === 'hurdle'))
    .map((k): [ObstacleKind, number] => [k, mix[k]]);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  return entries.map(([k, w]) => [k, total > 0 ? w / total : 1 / entries.length]);
}

const REQUIRES: Record<Exclude<ObstacleKind, 'orb'>, MoveType> = {
  block: 'sidestep',
  hurdle: 'jump',
  beam: 'squat',
  crate: 'armsUp',
};

export function generateLevel(config: SessionConfig): Level {
  const full = completeConfig(config);
  const { durationSec: dur, difficulty: d, mode, workout } = full;
  const rand = mulberry32(full.seed);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(rand() * xs.length)]!;
  const mix = mixFor(full);
  const drawKind = (): ObstacleKind => {
    let r = rand();
    for (const [k, w] of mix) {
      if ((r -= w) < 0) return k;
    }
    return mix[mix.length - 1]![0];
  };

  const gapEasy = lerp(T.GAP_EASY.atD0, T.GAP_EASY.atD1, d);
  const gapHard = lerp(T.GAP_HARD.atD0, T.GAP_HARD.atD1, d);
  const holdMax = lerp(T.HOLD_MAX_SEC.atD0, T.HOLD_MAX_SEC.atD1, d);
  const comboChance = lerp(T.COMBO_CHANCE.atD0, T.COMBO_CHANCE.atD1, d);
  const intensityScale = lerp(T.INTENSITY_AT_EASIEST, 1, d);

  const waves: Wave[] = [];
  let prevEnd = -Infinity; // previous wave's t plus its hold
  let prevHadHold = false;
  let lastBeamEnd = -Infinity;
  const recent: ObstacleKind[] = [];
  // Lane fairness: the last block's free lane, and every lane the player may be standing in
  // since then (an orb may or may not have pulled them over).
  let anchor: Lane = 0;
  let maybe: Lane[] = [0];
  let lastReach: Lane = 1;

  const reachableLanes = (): Lane[] =>
    LANES.filter((l) => maybe.every((p) => Math.abs(l - p) <= 1));

  // Holds belong to the build and the peak: none in the warm-up, and none in the cool-down,
  // which eases off and ends the round on something a first-time player clears. The same random
  // numbers are drawn either way, so a level without a cool-down hold is exactly as it was.
  const holdFor = (kind: 'beam' | 'crate', warmup: boolean, t: number): number => {
    if (warmup || rand() >= T.HOLD_CHANCE[workout][kind]) return 0;
    const sec = Math.round(lerp(T.HOLD_MIN_SEC, holdMax, rand()) * 10) / 10;
    return t >= T.PEAK_END * dur ? 0 : sec;
  };

  const orbSpawn = (lane: Lane): Spawn => ({
    kind: 'orb',
    lanes: [lane],
    // Floor: either arm works, the label follows the side. Treadmill: lane picks the arm.
    requires:
      lane === -1
        ? 'reachLeft'
        : lane === 1
          ? 'reachRight'
          : mode === 'treadmill'
            ? 'armsUp'
            : 'reachRight',
  });

  for (;;) {
    const first = waves.length === 0;
    const effortBefore = first ? 0 : effortAt(prevEnd / dur);
    let t = first
      ? T.FIRST_WAVE_SEC
      : prevEnd + lerp(gapEasy, gapHard, effortBefore) + rand() * T.GAP_JITTER_SEC;
    const warmup = t < T.WARMUP_END * dur;

    // Kind: from the mix, re-rolled once if it would be the third in a row.
    let kind = drawKind();
    if (recent.length >= 2 && recent.every((k) => k === kind)) kind = drawKind();

    // Spacing rules.
    if (!first) {
      t = Math.max(t, prevEnd + (prevHadHold ? T.MIN_GAP_AFTER_HOLD_SEC : T.MIN_GAP_SEC));
      if (t < T.WARMUP_END * dur) t = Math.max(t, prevEnd + T.MIN_GAP_WARMUP_SEC);
    }
    if (kind === 'hurdle') t = Math.max(t, lastBeamEnd + T.MIN_GAP_BEAM_TO_HURDLE_SEC);
    t = round2(t);

    // Spawns.
    const spawns: Spawn[] = [];
    let hold = 0;
    if (kind === 'block') {
      const options = reachableLanes();
      const moves = options.filter((l) => l !== anchor);
      const free = pick(moves.length > 0 ? moves : options);
      spawns.push({ kind, lanes: LANES.filter((l) => l !== free), requires: REQUIRES.block });
      anchor = free;
      maybe = [free];
      if (workout === 'fullBody' && mode === 'floor' && !warmup && rand() < comboChance) {
        spawns.push(orbSpawn(free)); // combo: step into the free lane and reach
      }
    } else if (kind === 'orb') {
      let lane: Lane;
      if (mode === 'treadmill') {
        lane = rand() < T.ALTERNATE_REACH_CHANCE ? (-lastReach as Lane) : pick(LANES);
        if (lane !== 0) lastReach = lane;
      } else {
        lane = pick(reachableLanes());
        if (!maybe.includes(lane)) maybe = [...maybe, lane];
      }
      spawns.push(orbSpawn(lane));
    } else {
      if (kind === 'beam' || kind === 'crate') hold = holdFor(kind, warmup, t);
      const spawn: Spawn = { kind, lanes: [...LANES], requires: REQUIRES[kind] };
      if (hold > 0) spawn.holdSec = hold;
      spawns.push(spawn);
    }

    // Every object is judged before the round ends.
    if (t + hold + T.END_MARGIN_SEC > dur) break;

    waves.push({ t, intensity: round2(clamp01(effortAt(t / dur) * intensityScale)), spawns });
    prevEnd = t + hold;
    prevHadHold = hold > 0;
    if (kind === 'beam') lastBeamEnd = prevEnd;
    recent.push(kind);
    if (recent.length > 2) recent.shift();
  }

  return { config: full, waves };
}
