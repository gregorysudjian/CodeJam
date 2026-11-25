import type {
  Lane,
  Level,
  MoveType,
  ObstacleKind,
  SessionConfig,
  Spawn,
  Stage,
  Wave,
} from '@/contracts';
import * as T from './tuning';

/**
 * Level generator. Pure and seeded: the same complete config always gives the same level.
 *
 * Shape of a round: T.LEVELS levels of T.LEVEL_SEC in a row (level.stages). The tier
 * (difficulty) sets the gap between waves; the level sets the intensity, which the game maps to
 * speed, flat within a level and higher in every level. No wave comes within
 * T.PORTAL_BREATHER_SEC of a level boundary (the portal), and level 1 is the warm-up: longer
 * gaps, no holds, no combos. The kind of each wave is drawn from the workout's mix, then the
 * fairness rules in CONTRACTS.md are enforced by construction (and checked in level.test.ts).
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

/** Wave intensity of level index (1-based) at tier d: flat within a level, rising per level. */
export function levelIntensity(index: number, d: number): number {
  const b = T.TIER_SPEED_BASE;
  const base =
    d <= 0.5 ? lerp(b.beginner, b.regular, d / 0.5) : lerp(b.regular, b.athlete, (d - 0.5) / 0.5);
  return round2(clamp01(base + (index - 1) * T.LEVEL_SPEED_STEP));
}

/** The level (1-based) round time 	 falls in. */
export function levelAt(t: number): number {
  return Math.min(T.LEVELS, Math.max(1, Math.floor(t / T.LEVEL_SEC) + 1));
}

/** The round's levels, back to back (CONTRACTS.md Stage). */
export function stagesFor(durationSec: number): Stage[] {
  const n = Math.max(1, Math.ceil(durationSec / T.LEVEL_SEC));
  return Array.from({ length: n }, (_, i) => ({
    index: i + 1,
    startSec: i * T.LEVEL_SEC,
    endSec: Math.min(durationSec, (i + 1) * T.LEVEL_SEC),
  }));
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
    durationSec: T.ROUND_SEC, // every level in a row, whatever was picked
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

  const gap = lerp(T.TIER_GAP.atD0, T.TIER_GAP.atD1, d); // the tier sets the density
  const holdMax = lerp(T.HOLD_MAX_SEC.atD0, T.HOLD_MAX_SEC.atD1, d);
  const comboChance = lerp(T.COMBO_CHANCE.atD0, T.COMBO_CHANCE.atD1, d);
  const stages = stagesFor(dur);

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

  // No holds in level 1, the warm-up.
  const holdFor = (kind: 'beam' | 'crate', warmup: boolean): number => {
    if (warmup || rand() >= T.HOLD_CHANCE[workout][kind]) return 0;
    return Math.round(lerp(T.HOLD_MIN_SEC, holdMax, rand()) * 10) / 10;
  };
  /** Moved past a portal if the wave (with its hold) would come within the breather of one. */
  const clearOfPortals = (t: number, hold: number): number => {
    for (const s of stages) {
      if (s.index === 1) continue;
      const b = s.startSec;
      if (t + hold > b - T.PORTAL_BREATHER_SEC && t < b + T.PORTAL_BREATHER_SEC)
        t = b + T.PORTAL_BREATHER_SEC;
    }
    return t;
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
    const inLevel1 = !first && prevEnd < T.LEVEL_SEC;
    let t = first
      ? T.FIRST_WAVE_SEC
      : prevEnd + gap + (inLevel1 ? T.LEVEL1_EXTRA_GAP_SEC : 0) + rand() * T.GAP_JITTER_SEC;
    const warmup = t < T.LEVEL_SEC; // level 1

    // Kind: from the mix, re-rolled once if it would be the third in a row.
    let kind = drawKind();
    if (recent.length >= 2 && recent.every((k) => k === kind)) kind = drawKind();

    if (!first) {
      t = Math.max(t, prevEnd + (prevHadHold ? T.MIN_GAP_AFTER_HOLD_SEC : T.MIN_GAP_SEC));
      if (t < T.LEVEL_SEC) t = Math.max(t, prevEnd + T.MIN_GAP_WARMUP_SEC);
    }
    if (kind === 'hurdle') t = Math.max(t, lastBeamEnd + T.MIN_GAP_BEAM_TO_HURDLE_SEC);
    if (kind === 'beam') t = Math.max(t, lastBeamEnd + T.MIN_GAP_SQUAT_TO_SQUAT_SEC);

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
      if (kind === 'beam' || kind === 'crate') hold = holdFor(kind, warmup);
      const spawn: Spawn = { kind, lanes: [...LANES], requires: REQUIRES[kind] };
      if (hold > 0) spawn.holdSec = hold;
      spawns.push(spawn);
    }
    // The portal: nothing arrives within the breather of a level boundary.
    t = round2(clearOfPortals(t, hold));

    // Every object is judged before the round ends.
    if (t + hold + T.END_MARGIN_SEC > dur) break;

    waves.push({ t, intensity: levelIntensity(levelAt(t), d), spawns });
    prevEnd = t + hold;
    prevHadHold = hold > 0;
    if (kind === 'beam') lastBeamEnd = prevEnd;
    recent.push(kind);
    if (recent.length > 2) recent.shift();
  }

  return { config: full, waves, stages };
}
