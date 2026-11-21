import { describe, expect, it } from 'vitest';
import type { Lane, Level, ObstacleKind, PlayMode, SessionConfig, WorkoutId } from '@/contracts';
import { effortAt, generateLevel, mixFor, completeConfig } from './level';
import * as T from './tuning';

const WORKOUT_IDS: WorkoutId[] = ['legs', 'arms', 'shoulders', 'fullBody'];
const MODES: PlayMode[] = ['floor', 'treadmill'];
const DIFFICULTIES = [0, 0.5, 1];
const DURATIONS = [45, 90, 180];
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);
const EPS = 1e-9;
// The contract's numbers, written out so a retune in tuning.ts cannot quietly break them.
const CONTRACT = { firstWave: 4, warmupGap: 1.8, minGap: 1.1, beamToHurdle: 1.5 };

/** Every combination, legs on treadmill included (the UI disables it, the generator still copes). */
function* allLevels(): Generator<Level> {
  for (const workout of WORKOUT_IDS)
    for (const mode of MODES)
      for (const difficulty of DIFFICULTIES)
        for (const lowImpact of [false, true])
          for (const durationSec of DURATIONS)
            for (const seed of SEEDS)
              yield generateLevel({ workout, mode, durationSec, difficulty, lowImpact, seed });
}
const holdOf = (w: Level['waves'][number]): number =>
  Math.max(0, ...w.spawns.map((s) => s.holdSec ?? 0));
const label = (l: Level): string => JSON.stringify(l.config);

describe('fairness rules (CONTRACTS.md "Level rules"), every workout × mode × difficulty × duration × 40 seeds', () => {
  it('first wave at 4 s or later, sorted, inside the round with time to judge the last one', () => {
    for (const level of allLevels()) {
      const { waves, config } = level;
      expect(waves.length, label(level)).toBeGreaterThan(0);
      expect(waves[0]!.t, label(level)).toBeGreaterThanOrEqual(CONTRACT.firstWave);
      for (let i = 1; i < waves.length; i++) expect(waves[i]!.t).toBeGreaterThan(waves[i - 1]!.t);
      const last = waves[waves.length - 1]!;
      expect(last.t + holdOf(last) + T.END_MARGIN_SEC, label(level)).toBeLessThanOrEqual(
        config.durationSec + EPS,
      );
    }
  });

  it('gaps: 1.8 s in the warm-up, never under 1.1 s, measured from the end of a hold', () => {
    for (const level of allLevels()) {
      const { waves, config } = level;
      for (let i = 1; i < waves.length; i++) {
        const prev = waves[i - 1]!;
        const gap = waves[i]!.t - (prev.t + holdOf(prev));
        expect(gap, label(level)).toBeGreaterThanOrEqual(CONTRACT.minGap - EPS);
        if (waves[i]!.t < T.WARMUP_END * config.durationSec) {
          expect(gap, label(level)).toBeGreaterThanOrEqual(CONTRACT.warmupGap - EPS);
        }
      }
    }
  });

  it('at least 1.5 s from the end of a beam to any following hurdle', () => {
    for (const level of allLevels()) {
      let beamEnd = -Infinity;
      for (const w of level.waves) {
        if (w.spawns.some((s) => s.kind === 'hurdle')) {
          expect(w.t - beamEnd, label(level)).toBeGreaterThanOrEqual(CONTRACT.beamToHurdle - EPS);
        }
        if (w.spawns.some((s) => s.kind === 'beam')) beamEnd = w.t + holdOf(w);
      }
    }
  });

  it('a block always leaves exactly one free lane, at most one lane from the last free lane', () => {
    for (const level of allLevels()) {
      let lastFree: Lane = 0; // the player starts in the centre
      let orbLanes: Lane[] = [];
      for (const w of level.waves) {
        for (const s of w.spawns) {
          if (s.kind === 'orb') orbLanes.push(s.lanes[0]!);
          if (s.kind !== 'block') continue;
          const free = ([-1, 0, 1] as Lane[]).filter((l) => !s.lanes.includes(l));
          expect(free, label(level)).toHaveLength(1);
          expect(Math.abs(free[0]! - lastFree), label(level)).toBeLessThanOrEqual(1);
          // Stricter than the contract: also reachable from any floor orb the player chased.
          if (level.config.mode === 'floor') {
            for (const o of orbLanes)
              expect(Math.abs(free[0]! - o), label(level)).toBeLessThanOrEqual(1);
          }
          lastFree = free[0]!;
          orbLanes = [];
        }
      }
    }
  });

  it('treadmill has only crates and orbs; low impact has no hurdles', () => {
    for (const level of allLevels()) {
      const kinds = new Set(level.waves.flatMap((w) => w.spawns.map((s) => s.kind)));
      if (level.config.mode === 'treadmill') {
        for (const k of kinds) expect(['crate', 'orb'], label(level)).toContain(k);
      }
      if (level.config.lowImpact) expect(kinds.has('hurdle'), label(level)).toBe(false);
    }
  });

  it('spawns are well formed: lanes, the move that clears them, holds only on beams and crates', () => {
    const expected: Record<Exclude<ObstacleKind, 'orb'>, string> = {
      block: 'sidestep',
      hurdle: 'jump',
      beam: 'squat',
      crate: 'armsUp',
    };
    for (const level of allLevels()) {
      for (const w of level.waves) {
        expect(w.intensity).toBeGreaterThanOrEqual(0);
        expect(w.intensity).toBeLessThanOrEqual(1);
        expect(w.spawns.length).toBeGreaterThan(0);
        for (const s of w.spawns) {
          if (s.kind === 'orb') {
            expect(s.lanes).toHaveLength(1);
            const lane = s.lanes[0]!;
            if (lane === -1) expect(s.requires).toBe('reachLeft');
            if (lane === 1) expect(s.requires).toBe('reachRight');
            if (lane === 0 && level.config.mode === 'treadmill') expect(s.requires).toBe('armsUp');
          } else {
            expect(s.requires).toBe(expected[s.kind]);
            if (s.kind !== 'block') expect(s.lanes).toEqual([-1, 0, 1]);
          }
          if (s.holdSec !== undefined) {
            expect(['beam', 'crate']).toContain(s.kind);
            expect(s.holdSec).toBeGreaterThanOrEqual(T.HOLD_MIN_SEC);
            expect(s.holdSec).toBeLessThanOrEqual(T.HOLD_MAX_SEC.atD1);
            expect(w.t).toBeGreaterThanOrEqual(T.WARMUP_END * level.config.durationSec); // no holds in warm-up
          }
        }
      }
    }
  });
});

describe('config', () => {
  it('fills difficulty, lowImpact and a seed in the Postgres int range', () => {
    const base: SessionConfig = { workout: 'arms', mode: 'floor', durationSec: 45 };
    for (let i = 0; i < 50; i++) {
      const { config } = generateLevel(base);
      expect(config.difficulty).toBe(T.DEFAULT_DIFFICULTY);
      expect(config.lowImpact).toBe(false);
      expect(Number.isInteger(config.seed)).toBe(true);
      expect(config.seed).toBeGreaterThanOrEqual(0);
      expect(config.seed).toBeLessThan(2 ** 31);
    }
  });

  it('keeps what was given and replaces an invalid seed', () => {
    const c = completeConfig({
      workout: 'legs',
      mode: 'floor',
      durationSec: 90,
      difficulty: 0.8,
      lowImpact: true,
      seed: 42,
    });
    expect(c).toEqual({
      workout: 'legs',
      mode: 'floor',
      durationSec: 90,
      difficulty: 0.8,
      lowImpact: true,
      seed: 42,
    });
    for (const bad of [-1, 1.5, 2 ** 31, Number.NaN]) {
      const s = completeConfig({ workout: 'legs', mode: 'floor', durationSec: 90, seed: bad }).seed;
      expect(Number.isInteger(s) && s >= 0 && s < 2 ** 31).toBe(true);
    }
  });

  it('same seed, same level; different seed, different level', () => {
    const c: SessionConfig = { workout: 'fullBody', mode: 'floor', durationSec: 90, seed: 123 };
    expect(generateLevel(c)).toEqual(generateLevel(c));
    expect(generateLevel({ ...c, seed: 124 }).waves).not.toEqual(generateLevel(c).waves);
  });

  it('a seed missing from the input is recorded, and replaying it gives the same level', () => {
    const first = generateLevel({ workout: 'shoulders', mode: 'treadmill', durationSec: 90 });
    expect(generateLevel(first.config)).toEqual(first);
  });
});

describe('workout character', () => {
  const countKinds = (workout: WorkoutId, mode: PlayMode) => {
    const counts: Record<ObstacleKind, number> = { block: 0, hurdle: 0, beam: 0, crate: 0, orb: 0 };
    let total = 0;
    for (const seed of SEEDS) {
      for (const w of generateLevel({ workout, mode, durationSec: 180, seed }).waves) {
        // Count the wave's main kind; a combo orb rides along with its block.
        counts[w.spawns[0]!.kind]++;
        total++;
      }
    }
    return { counts, total };
  };

  it('follows the mix table within a few points', () => {
    for (const workout of WORKOUT_IDS) {
      for (const mode of MODES) {
        const { counts, total } = countKinds(workout, mode);
        for (const [kind, share] of mixFor(
          completeConfig({ workout, mode, durationSec: 180, seed: 1 }),
        )) {
          expect(counts[kind] / total, `${workout} ${mode} ${kind}`).toBeCloseTo(share, 1);
        }
      }
    }
  });

  it('legs gets long squat holds, shoulders gets long overhead holds', () => {
    const holds = (workout: WorkoutId, kind: ObstacleKind) =>
      SEEDS.flatMap(
        (seed) => generateLevel({ workout, mode: 'floor', durationSec: 90, seed }).waves,
      )
        .flatMap((w) => w.spawns)
        .filter((s) => s.kind === kind);
    const share = (xs: { holdSec?: number }[]) => xs.filter((s) => s.holdSec).length / xs.length;
    expect(share(holds('legs', 'beam'))).toBeGreaterThan(0.3);
    expect(share(holds('shoulders', 'crate'))).toBeGreaterThan(0.3);
  });

  it('full body has combos: a block with an orb in its free lane', () => {
    const combos = SEEDS.flatMap(
      (seed) => generateLevel({ workout: 'fullBody', mode: 'floor', durationSec: 90, seed }).waves,
    ).filter((w) => w.spawns.length === 2);
    expect(combos.length).toBeGreaterThan(10);
    for (const w of combos) {
      const [block, orb] = w.spawns;
      expect(block!.kind).toBe('block');
      expect(orb!.kind).toBe('orb');
      expect(block!.lanes).not.toContain(orb!.lanes[0]);
    }
  });

  it('treadmill arms alternates left and right reaches', () => {
    let switches = 0;
    let pairs = 0;
    for (const seed of SEEDS) {
      const sides = generateLevel({ workout: 'arms', mode: 'treadmill', durationSec: 90, seed })
        .waves.flatMap((w) => w.spawns)
        .filter((s) => s.kind === 'orb' && s.lanes[0] !== 0)
        .map((s) => s.lanes[0]);
      for (let i = 1; i < sides.length; i++, pairs++) if (sides[i] !== sides[i - 1]) switches++;
    }
    expect(switches / pairs).toBeGreaterThan(0.65);
  });
});

describe('round curve and difficulty', () => {
  it('effort rises from warm-up to peak and falls in the cool-down', () => {
    expect(effortAt(0)).toBeLessThan(effortAt(T.WARMUP_END));
    expect(effortAt(T.WARMUP_END)).toBeLessThan(effortAt(T.BUILD_END));
    expect(effortAt(T.PEAK_END)).toBe(1);
    expect(effortAt(1)).toBeLessThan(effortAt(T.PEAK_END));
  });

  it('waves are denser and faster at the peak than in the warm-up', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { waves } = generateLevel({
        workout: 'fullBody',
        mode: 'floor',
        durationSec: 180,
        seed,
      });
      const inPhase = (a: number, b: number) =>
        waves.filter((w) => w.t >= a * 180 && w.t < b * 180);
      const warm = inPhase(0, T.WARMUP_END);
      const peak = inPhase(T.BUILD_END, T.PEAK_END);
      expect(peak.length / (T.PEAK_END - T.BUILD_END)).toBeGreaterThan(warm.length / T.WARMUP_END);
      expect(Math.min(...peak.map((w) => w.intensity))).toBeGreaterThan(
        Math.max(...warm.map((w) => w.intensity)),
      );
    }
  });

  it('higher difficulty means more waves', () => {
    const count = (difficulty: number) =>
      SEEDS.reduce(
        (n, seed) =>
          n +
          generateLevel({ workout: 'fullBody', mode: 'floor', durationSec: 90, difficulty, seed })
            .waves.length,
        0,
      );
    expect(count(1)).toBeGreaterThan(count(0.5));
    expect(count(0.5)).toBeGreaterThan(count(0));
  });
});

describe('demo level', () => {
  const demo = generateLevel(T.DEMO_CONFIG);

  it('is the same every time and lasts 45 s', () => {
    expect(generateLevel(T.DEMO_CONFIG)).toEqual(demo);
    expect(demo.config).toEqual(completeConfig(T.DEMO_CONFIG));
    expect(demo.config).toMatchObject({
      workout: 'fullBody',
      mode: 'floor',
      durationSec: 45,
      seed: T.DEMO_SEED,
    });
  });

  it('introduces all five objects in its first five waves, then a held squat and a combo', () => {
    expect(new Set(demo.waves.slice(0, 5).map((w) => w.spawns[0]!.kind)).size).toBe(5);
    expect(demo.waves.some((w) => w.spawns.some((s) => s.kind === 'beam' && s.holdSec))).toBe(true);
    expect(demo.waves.some((w) => w.spawns.length === 2)).toBe(true);
  });

  it('shows every object at least once, so the presenter can name every move', () => {
    const kinds = new Set(demo.waves.flatMap((w) => w.spawns.map((s) => s.kind)));
    expect([...kinds].sort()).toEqual(['beam', 'block', 'crate', 'hurdle', 'orb']);
  });
});
