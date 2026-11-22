import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Level, MoveType, ObstacleKind, SessionConfig } from '@/contracts';
import { DEMO_CONFIG, DEMO_SEED, generateLevel } from './index';
import { LEVEL_SEC } from './tuning';

const MOVES: MoveType[] = ['sidestep', 'jump', 'squat', 'armsUp', 'reachLeft', 'reachRight'];
const EASY: ObstacleKind[] = ['block', 'crate', 'orb'];
const EASY_EDGE = 3; // waves at the start and the end that must be easy

/** Everything that makes a level a bad demo level (docs/DEMO.md), as readable strings. */
export function demoProblems(level: Level): string[] {
  const problems: string[] = [];
  const spawns = level.waves.flatMap((w) => w.spawns);
  const skip = level.config.lowImpact ? new Set<MoveType>(['jump']) : new Set<MoveType>();
  for (const move of MOVES) {
    if (skip.has(move)) continue;
    const n = spawns.filter((s) => s.requires === move).length;
    if (n < 2) problems.push(`${move} appears ${n}x`);
  }
  const kinds = level.waves.map((w) => w.spawns[0].kind);
  const edges = [...kinds.slice(0, EASY_EDGE), ...kinds.slice(-EASY_EDGE)];
  if (edges.some((k) => !EASY.includes(k))) problems.push('hard wave at the start or end');
  // In level 1, the part a judge playing cold meets first: no hurdle right after a beam. Later
  // the generator's 1.5 s from a beam's end to a hurdle holds (level.test.ts); over six levels
  // nearly every seed has a beam somewhere right before a hurdle.
  const level1 = level.waves.filter((w) => w.t < LEVEL_SEC).map((w) => w.spawns[0].kind);
  level1.forEach((k, i) => {
    if (k === 'beam' && level1[i + 1] === 'hurdle')
      problems.push(`hurdle right after beam at wave ${i}`);
  });
  const waves = level.waves;
  for (const w of [...waves.slice(0, EASY_EDGE), ...waves.slice(-EASY_EDGE)]) {
    if (w.spawns.some((s) => s.holdSec))
      problems.push(`held object at ${w.t} s, near the start or end`);
  }
  return problems;
}

describe('demo preset', () => {
  it('is a fixed Full body floor round of the six levels (180 s)', () => {
    expect(DEMO_CONFIG).toMatchObject({ workout: 'fullBody', mode: 'floor', durationSec: 180 });
    expect(Number.isInteger(DEMO_CONFIG.seed)).toBe(true);
  });

  it('is the same level every time', () => {
    expect(generateLevel(DEMO_CONFIG)).toEqual(generateLevel(DEMO_CONFIG));
  });

  it('shows every move twice, opens and ends easy, no hurdle after a beam in level 1', () => {
    expect(demoProblems(generateLevel(DEMO_CONFIG))).toEqual([]);
  });

  it('has a low-impact version for judges with no hurdles that still shows the other moves', () => {
    const level = generateLevel({ ...DEMO_CONFIG, lowImpact: true });
    expect(level.waves.flatMap((w) => w.spawns).some((s) => s.kind === 'hurdle')).toBe(false);
    expect(demoProblems(level)).toEqual([]);
  });

  it('the low-impact version is gentle for judges playing cold: no held squat in the first two levels, squats as in the normal one', () => {
    const squats = (lowImpact: boolean, beforeSec = Infinity) =>
      generateLevel({ ...DEMO_CONFIG, lowImpact })
        .waves.filter((w) => w.t < beforeSec)
        .flatMap((w) => w.spawns)
        .filter((s) => s.requires === 'squat');
    expect(squats(true, 2 * LEVEL_SEC).some((s) => s.holdSec)).toBe(false);
    expect(squats(true).length).toBeLessThanOrEqual(squats(false).length + 1);
  });
});

const DEMO_SIGNATURE =
  '4 crate, 6.36 block, 8.69 orb, 11.22 hurdle, 13.81 beam, 16.34 block, 18.94 crate, 21.41 hurdle, 23.75 beam, 26.36 orb, 32 beam, 34.02 beam, 35.94 hurdle, 37.92 crate, 39.78 hurdle, 41.86 hurdle, 43.83 beam, 45.87 crate, 47.76 hurdle, 49.65 orb, 51.61 beam(1.4), 54.86 crate, 56.81 orb, 62 hurdle, 63.89 crate(2.1), 67.86 crate, 69.86 orb, 71.93 orb, 73.94 hurdle, 76.01 hurdle, 78.04 orb, 80.16 beam, 82.13 beam, 84.22 crate, 86.07 beam, 92 crate, 93.99 block+93.99 orb, 96.06 beam, 97.94 hurdle, 99.93 crate(1.9), 103.94 beam, 105.81 hurdle, 107.83 orb, 109.93 block, 111.81 orb, 113.85 beam, 115.89 orb, 117.95 beam, 122 block, 124.05 hurdle, 126.12 hurdle, 128.07 beam, 130.04 orb, 131.98 beam, 133.99 block, 136.02 crate, 138.07 beam, 140.06 beam, 142.18 crate, 144.13 beam, 145.98 hurdle, 147.88 block+147.88 orb, 152 hurdle, 154.11 orb, 156.2 hurdle, 158.05 orb, 160.14 beam, 162.11 beam, 164.1 crate, 166.05 crate, 168.01 orb, 170.12 beam, 171.95 orb, 174.07 crate, 176.08 block+176.08 orb, 178.14 crate';
const DEMO_LOW_SIGNATURE =
  '4 crate, 6.36 block, 8.69 orb, 11.22 block, 13.67 crate, 16 crate, 18.6 orb, 21.01 block, 23.62 orb, 26.22 crate, 32 beam, 33.9 beam, 35.88 crate, 37.74 block+37.74 orb, 39.71 beam, 41.65 orb, 43.73 block+43.73 orb, 45.85 beam, 47.85 block+47.85 orb, 49.88 crate, 52 orb, 53.93 block+53.93 orb, 56.01 block, 62 orb, 64.07 orb, 66.08 beam, 68.02 crate, 70.1 orb, 71.99 beam, 73.96 orb, 76.05 block, 78.15 crate, 80.14 block+80.14 orb, 82.21 beam, 84.09 beam, 86.14 block, 92 block, 94.02 orb, 96.12 block, 98 orb, 100.04 beam, 102.08 orb, 104.14 crate, 106.13 block, 108.18 beam, 110.07 beam, 112 orb, 113.94 beam, 115.95 block, 117.98 crate, 122 crate, 123.99 beam, 126.11 crate, 128.06 beam, 129.91 block+129.91 orb, 131.88 block, 133.99 orb, 136.08 beam(2.1), 140.3 orb, 142.39 beam, 144.29 crate, 146.34 beam, 152 crate, 154.12 crate, 156.07 block, 158.19 crate, 160.2 block+160.2 orb, 162.26 orb, 164.28 block, 166.27 block, 168.37 orb, 170.2 block, 172.16 orb, 174.03 orb, 176.12 orb, 178.14 crate';

/** The demo level as a readable signature: "t kind(hold)" per spawn. */
const signature = (level: Level): string =>
  level.waves
    .map((w) =>
      w.spawns.map((s) => `${w.t} ${s.kind}${s.holdSec ? `(${s.holdSec})` : ''}`).join('+'),
    )
    .join(', ');

describe('the demo levels are pinned (the Player rehearses them; ghosts and DEMO.md depend on them)', () => {
  // If a generator change makes these fail, the demo level changed: tell Patrick and Greg
  // (ghosts must be rehearsed again, docs/DEMO.md names the seed), then update the strings.
  it('normal', () => {
    expect(signature(generateLevel(DEMO_CONFIG))).toBe(DEMO_SIGNATURE);
  });
  it('low impact', () => {
    expect(signature(generateLevel({ ...DEMO_CONFIG, lowImpact: true }))).toBe(DEMO_LOW_SIGNATURE);
  });
});

describe('?demo=1', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const pick: SessionConfig = { workout: 'arms', mode: 'treadmill', durationSec: 180 };

  it('without the flag, the picked config is played', () => {
    expect(generateLevel({ ...pick, seed: 7 }).config).toMatchObject({ workout: 'arms', seed: 7 });
  });

  it('with the flag, every round is the demo level, whatever was picked', () => {
    vi.stubGlobal('window', { location: { search: '?demo=1' } });
    const level = generateLevel(pick);
    expect(level).toEqual(generateLevel(DEMO_CONFIG));
    expect(level.config).toMatchObject({
      workout: 'fullBody',
      mode: 'floor',
      durationSec: 180,
      seed: DEMO_SEED,
    });
  });

  it('the low-impact toggle still applies: same seed, no hurdles', () => {
    vi.stubGlobal('window', { location: { search: '?demo=1' } });
    const level = generateLevel({ ...pick, lowImpact: true });
    expect(level.config).toMatchObject({ seed: DEMO_SEED, lowImpact: true });
    expect(level.waves.flatMap((w) => w.spawns).some((s) => s.kind === 'hurdle')).toBe(false);
  });
});
