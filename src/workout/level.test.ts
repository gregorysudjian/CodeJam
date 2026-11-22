import { describe, expect, it } from 'vitest';
import type { Lane, Level, ObstacleKind, PlayMode, SessionConfig, WorkoutId } from '@/contracts';
import { generateLevel, levelAt, levelIntensity, mixFor, completeConfig } from './level';
import * as T from './tuning';

const WORKOUT_IDS: WorkoutId[] = ['legs', 'arms', 'shoulders', 'fullBody'];
const MODES: PlayMode[] = ['floor', 'treadmill'];
const DIFFICULTIES = [0, 0.5, 1];
/** The coach (src/data/coach.ts) recommends any difficulty in steps of 0.1: these are swept too. */
const COACH_STEPS = [0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9];
// Every round is the six levels (180 s), whatever length was picked: the sweep plays that one.
const DURATIONS = [T.ROUND_SEC];
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);
const EPS = 1e-9;
// The contract's numbers, written out so a retune in tuning.ts cannot quietly break them.
const CONTRACT = { firstWave: 4, warmupGap: 1.8, minGap: 1.1, beamToHurdle: 1.5 };

/**
 * Every combination, legs on treadmill included (the UI disables it, the generator still copes).
 * Generated once for the whole file: 2,880 levels. Each rule below collects its violations and
 * makes one assertion, so the sweep stays fast on slow laptops (thousands of single `expect`
 * calls took up to a minute there) and a failure lists every offending level at once.
 */
let cache: Level[] | null = null;
function allLevels(): Level[] {
  cache ??= WORKOUT_IDS.flatMap((workout) =>
    MODES.flatMap((mode) =>
      [...DIFFICULTIES, ...COACH_STEPS].flatMap((difficulty) =>
        [false, true].flatMap((lowImpact) =>
          DURATIONS.flatMap((durationSec) =>
            (DIFFICULTIES.includes(difficulty) ? SEEDS : SEEDS.slice(0, 8)).map((seed) =>
              generateLevel({ workout, mode, durationSec, difficulty, lowImpact, seed }),
            ),
          ),
        ),
      ),
    ),
  );
  return cache;
}
const holdOf = (w: Level['waves'][number]): number =>
  Math.max(0, ...w.spawns.map((s) => s.holdSec ?? 0));
const label = (l: Level): string => JSON.stringify(l.config);
/** Generous per-test timeout for the sweep; it takes well under a second on a fast laptop. */
const SWEEP_TIMEOUT_MS = 30_000;

describe('fairness rules (CONTRACTS.md "Level rules"), every workout × mode × duration × difficulty (0, 0.5, 1 × 40 seeds; every other 0.1 step × 8)', () => {
  it(
    'first wave at 4 s or later, sorted, inside the round with time to judge the last one',
    () => {
      const problems: string[] = [];
      for (const level of allLevels()) {
        const { waves, config } = level;
        if (waves.length === 0) {
          problems.push(`${label(level)}: no waves`);
          continue;
        }
        if (waves[0]!.t < CONTRACT.firstWave)
          problems.push(`${label(level)}: first wave ${waves[0]!.t}`);
        for (let i = 1; i < waves.length; i++) {
          if (!(waves[i]!.t > waves[i - 1]!.t))
            problems.push(`${label(level)}: not sorted at ${i}`);
        }
        const last = waves[waves.length - 1]!;
        if (last.t + holdOf(last) + T.END_MARGIN_SEC > config.durationSec + EPS) {
          problems.push(`${label(level)}: last wave ends too late`);
        }
      }
      expect(problems).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    'gaps: 1.8 s in the warm-up, never under 1.1 s, measured from the end of a hold',
    () => {
      const problems: string[] = [];
      for (const level of allLevels()) {
        const { waves, config } = level;
        for (let i = 1; i < waves.length; i++) {
          const prev = waves[i - 1]!;
          const gap = waves[i]!.t - (prev.t + holdOf(prev));
          if (gap < CONTRACT.minGap - EPS) problems.push(`${label(level)}: gap ${gap} at ${i}`);
          if (waves[i]!.t < T.WARMUP_END * config.durationSec && gap < CONTRACT.warmupGap - EPS) {
            problems.push(`${label(level)}: warm-up gap ${gap} at ${i}`);
          }
        }
      }
      expect(problems).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    'at least 1.5 s from the end of a beam to any following hurdle',
    () => {
      const problems: string[] = [];
      for (const level of allLevels()) {
        let beamEnd = -Infinity;
        for (const w of level.waves) {
          if (
            w.spawns.some((s) => s.kind === 'hurdle') &&
            w.t - beamEnd < CONTRACT.beamToHurdle - EPS
          ) {
            problems.push(`${label(level)}: hurdle ${w.t - beamEnd} s after a beam`);
          }
          if (w.spawns.some((s) => s.kind === 'beam')) beamEnd = w.t + holdOf(w);
        }
      }
      expect(problems).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    'a block always leaves exactly one free lane, at most one lane from the last free lane',
    () => {
      const problems: string[] = [];
      for (const level of allLevels()) {
        let lastFree: Lane = 0; // the player starts in the centre
        let orbLanes: Lane[] = [];
        for (const w of level.waves) {
          for (const s of w.spawns) {
            if (s.kind === 'orb') orbLanes.push(s.lanes[0]!);
            if (s.kind !== 'block') continue;
            const free = ([-1, 0, 1] as Lane[]).filter((l) => !s.lanes.includes(l));
            if (free.length !== 1) {
              problems.push(`${label(level)}: block at ${w.t} leaves ${free.length} free lanes`);
              continue;
            }
            if (Math.abs(free[0]! - lastFree) > 1)
              problems.push(`${label(level)}: free lane jumps at ${w.t}`);
            // Stricter than the contract: also reachable from any floor orb the player chased.
            if (level.config.mode === 'floor' && orbLanes.some((o) => Math.abs(free[0]! - o) > 1)) {
              problems.push(`${label(level)}: free lane two from an orb at ${w.t}`);
            }
            lastFree = free[0]!;
            orbLanes = [];
          }
        }
      }
      expect(problems).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    'a breath between two squats: 1.8 s from the end of one (its hold included) to the next',
    () => {
      const problems: string[] = [];
      for (const level of allLevels()) {
        let lastEnd = -Infinity;
        for (const w of level.waves) {
          if (!w.spawns.some((s) => s.kind === 'beam')) continue;
          if (w.t - lastEnd < T.MIN_GAP_SQUAT_TO_SQUAT_SEC - EPS)
            problems.push(
              `${label(level)} @${w.t}: squat ${(w.t - lastEnd).toFixed(2)} s after the last`,
            );
          lastEnd = w.t + holdOf(w);
        }
      }
      expect(problems).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    'treadmill has only crates and orbs; low impact has no hurdles',
    () => {
      const problems: string[] = [];
      for (const level of allLevels()) {
        for (const s of level.waves.flatMap((w) => w.spawns)) {
          if (level.config.mode === 'treadmill' && s.kind !== 'crate' && s.kind !== 'orb') {
            problems.push(`${label(level)}: ${s.kind} on the treadmill`);
          }
          if (level.config.lowImpact && s.kind === 'hurdle')
            problems.push(`${label(level)}: hurdle in low impact`);
        }
      }
      expect(problems).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    'spawns are well formed: lanes, the move that clears them, holds only on beams and crates and never in the warm-up or the cool-down',
    () => {
      const expected: Record<Exclude<ObstacleKind, 'orb'>, string> = {
        block: 'sidestep',
        hurdle: 'jump',
        beam: 'squat',
        crate: 'armsUp',
      };
      const problems: string[] = [];
      for (const level of allLevels()) {
        const at = (w: Level['waves'][number], what: string) =>
          problems.push(`${label(level)} @${w.t}: ${what}`);
        for (const w of level.waves) {
          if (w.intensity < 0 || w.intensity > 1) at(w, `intensity ${w.intensity}`);
          if (w.spawns.length === 0) at(w, 'no spawns');
          for (const s of w.spawns) {
            if (s.kind === 'orb') {
              const lane = s.lanes[0];
              if (s.lanes.length !== 1) at(w, `orb with ${s.lanes.length} lanes`);
              if (lane === -1 && s.requires !== 'reachLeft')
                at(w, `left orb requires ${s.requires}`);
              if (lane === 1 && s.requires !== 'reachRight')
                at(w, `right orb requires ${s.requires}`);
              if (lane === 0 && level.config.mode === 'treadmill' && s.requires !== 'armsUp') {
                at(w, `centre treadmill orb requires ${s.requires}`);
              }
            } else {
              if (s.requires !== expected[s.kind]) at(w, `${s.kind} requires ${s.requires}`);
              if (s.kind !== 'block' && s.lanes.join() !== '-1,0,1')
                at(w, `${s.kind} lanes ${s.lanes.join()}`);
            }
            if (s.holdSec !== undefined) {
              if (s.kind !== 'beam' && s.kind !== 'crate') at(w, `hold on a ${s.kind}`);
              if (s.holdSec < T.HOLD_MIN_SEC || s.holdSec > T.HOLD_MAX_SEC.atD1)
                at(w, `hold ${s.holdSec}`);
              if (w.t < T.WARMUP_END * level.config.durationSec) at(w, 'hold in the warm-up');
            }
          }
        }
      }
      expect(problems).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );
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
      durationSec: 180, // every round is the six levels, whatever length was picked
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

  it("low impact gives the hurdles' share to sidesteps and reaches, so squats stay as frequent", () => {
    const mix = (lowImpact: boolean, mode: PlayMode = 'floor') =>
      Object.fromEntries(
        mixFor(completeConfig({ workout: 'fullBody', mode, durationSec: 45, lowImpact, seed: 1 })),
      );
    const lowFull = mix(true);
    expect(Object.keys(lowFull).sort()).toEqual(['beam', 'block', 'crate', 'orb']);
    for (const [kind, share] of Object.entries({ block: 0.3, beam: 0.2, crate: 0.2, orb: 0.3 }))
      expect(lowFull[kind], kind).toBeCloseTo(share, 10);
    expect(mix(true, 'treadmill')).toEqual(mix(false, 'treadmill')); // no hurdles there anyway
    // In generated levels too: the squat share stays, blocks and orbs take the hurdles' place.
    const share = (lowImpact: boolean, kind: ObstacleKind) => {
      let n = 0;
      let total = 0;
      for (const seed of SEEDS) {
        const level = generateLevel({
          workout: 'fullBody',
          mode: 'floor',
          durationSec: 180,
          lowImpact,
          seed,
        });
        for (const w of level.waves) {
          total++;
          if (w.spawns[0]!.kind === kind) n++;
        }
      }
      return n / total;
    };
    expect(share(true, 'beam')).toBeCloseTo(share(false, 'beam'), 1);
    expect(share(true, 'block')).toBeGreaterThan(share(false, 'block') + 0.05);
    expect(share(true, 'orb')).toBeGreaterThan(share(false, 'orb') + 0.05);
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

describe('levels and tiers', () => {
  const LEVEL_RULES = 'six levels of 30 s, 180 s in all, whatever round length was picked';
  it(LEVEL_RULES, () => {
    for (const durationSec of [45, 90, 180, 600]) {
      const lv = generateLevel({ workout: 'arms', mode: 'floor', durationSec, seed: 3 });
      expect(lv.config.durationSec).toBe(180);
      expect(lv.stages).toEqual(
        Array.from({ length: 6 }, (_, i) => ({
          index: i + 1,
          startSec: i * 30,
          endSec: i * 30 + 30,
        })),
      );
    }
  });

  it('the portal: no wave, hold included, within 2 s of a level boundary (every level swept)', () => {
    const problems: string[] = [];
    for (const level of allLevels())
      for (const w of level.waves)
        for (const s of level.stages!.slice(1)) {
          const b = s.startSec;
          if (
            w.t + holdOf(w) > b - T.PORTAL_BREATHER_SEC + EPS &&
            w.t < b + T.PORTAL_BREATHER_SEC - EPS
          )
            problems.push(`${label(level)} @${w.t}: within the portal at ${b}`);
        }
    expect(problems).toEqual([]);
  });

  it('speed is flat within a level and higher in every level (every level swept)', () => {
    const problems: string[] = [];
    for (const level of allLevels()) {
      const d = level.config.difficulty!;
      for (const w of level.waves)
        if (w.intensity !== levelIntensity(levelAt(w.t), d))
          problems.push(`${label(level)} @${w.t}: intensity ${w.intensity}`);
    }
    expect(problems).toEqual([]);
    for (const d of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1])
      for (let i = 2; i <= T.LEVELS; i++)
        expect(levelIntensity(i, d)).toBeGreaterThan(levelIntensity(i - 1, d));
  });

  it('beginner level 1 is the old slowest, regular a little faster, athlete level 6 the old top', () => {
    expect(levelIntensity(1, 0)).toBe(0.1);
    expect(levelIntensity(1, 0.5)).toBeGreaterThan(levelIntensity(1, 0));
    expect(levelIntensity(1, 0.5) - levelIntensity(1, 0)).toBeLessThanOrEqual(0.1);
    expect(levelIntensity(6, 1)).toBe(1);
    for (const d of [0, 0.25, 0.5, 0.75, 1]) expect(levelIntensity(6, d)).toBeLessThanOrEqual(1);
  });

  it('level 1 opens gently: no holds, no combos, wider gaps than later levels', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { waves } = generateLevel({
        workout: 'fullBody',
        mode: 'floor',
        durationSec: 180,
        seed,
      });
      const l1 = waves.filter((w) => w.t < T.LEVEL_SEC);
      expect(l1.some((w) => w.spawns.length > 1 || holdOf(w) > 0)).toBe(false);
      const perSec = (ws: typeof waves, sec: number) => ws.length / sec;
      const later = waves.filter((w) => w.t >= 2 * T.LEVEL_SEC && w.t < 3 * T.LEVEL_SEC);
      expect(perSec(l1, T.LEVEL_SEC - T.FIRST_WAVE_SEC)).toBeLessThanOrEqual(
        perSec(later, T.LEVEL_SEC - 2 * T.PORTAL_BREATHER_SEC) + EPS,
      );
    }
  });

  it('a higher tier means more waves (the tier sets density only)', () => {
    const count = (difficulty: number) =>
      SEEDS.reduce(
        (n, seed) =>
          n +
          generateLevel({ workout: 'fullBody', mode: 'floor', durationSec: 180, difficulty, seed })
            .waves.length,
        0,
      );
    expect(count(1)).toBeGreaterThan(count(0.5));
    expect(count(0.5)).toBeGreaterThan(count(0));
  });
});
describe('coach compatibility: every difficulty step the coach can recommend', () => {
  // The coach recommends workout, mode, 45/90/180 s and difficulty 0 to 1 in steps of 0.1
  // (never Legs on the treadmill). Fairness is in the sweep above; here: each step is no easier
  // than the one before, and 1 is clearly harder than 0. Measured minimums (20 seeds): waves a
  // minute +24 %, intensity +0.19, average hold +0.6 s; the bounds sit just under them.
  const STEPS = Array.from({ length: 11 }, (_, k) => k / 10);
  const stats = (workout: WorkoutId, mode: PlayMode, durationSec: number, difficulty: number) => {
    let waves = 0,
      intensity = 0,
      n = 0,
      hold = 0,
      holds = 0;
    for (const seed of SEEDS.slice(0, 20)) {
      const lv = generateLevel({ workout, mode, durationSec, difficulty, seed });
      waves += lv.waves.length;
      for (const w of lv.waves) {
        intensity += w.intensity;
        n++;
        for (const sp of w.spawns) {
          if (!sp.holdSec) continue;
          hold += sp.holdSec;
          holds++;
        }
      }
    }
    return {
      perMin: waves / 20 / (durationSec / 60),
      intensity: intensity / n,
      hold: holds ? hold / holds : 0,
    };
  };

  it('each step is no easier than the last, and difficulty 1 is clearly harder than 0', () => {
    const problems: string[] = [];
    for (const workout of WORKOUT_IDS)
      for (const mode of MODES) {
        if (mode === 'treadmill' && workout === 'legs') continue; // the coach never offers it
        for (const durationSec of DURATIONS) {
          const at = STEPS.map((d) => stats(workout, mode, durationSec, d));
          const name = `${workout} ${mode} ${durationSec} s`;
          at.forEach((s, k) => {
            if (k === 0) return;
            const p = at[k - 1]!;
            if (s.perMin < p.perMin - 0.5) problems.push(`${name}: fewer waves at ${STEPS[k]}`);
            if (s.intensity <= p.intensity) problems.push(`${name}: no faster at ${STEPS[k]}`);
            if (s.hold < p.hold - 0.1) problems.push(`${name}: shorter holds at ${STEPS[k]}`);
          });
          const [easy, hard] = [at[0]!, at[10]!];
          if (hard.perMin < easy.perMin * 1.15) problems.push(`${name}: 1 not much denser than 0`);
          if (hard.intensity < easy.intensity + 0.15)
            problems.push(`${name}: 1 not much faster than 0`);
          if (hard.hold < easy.hold + 0.4) problems.push(`${name}: 1 holds not much longer than 0`);
        }
      }
    expect(problems).toEqual([]);
  });
});

describe('demo level', () => {
  const demo = generateLevel(T.DEMO_CONFIG);

  it('is the same every time and is the six levels (180 s)', () => {
    expect(generateLevel(T.DEMO_CONFIG)).toEqual(demo);
    expect(demo.config).toEqual(completeConfig(T.DEMO_CONFIG));
    expect(demo.config).toMatchObject({
      workout: 'fullBody',
      mode: 'floor',
      durationSec: 180,
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
