import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Level, MoveType, ObstacleKind, SessionConfig } from '@/contracts';
import { DEMO_CONFIG, DEMO_SEED, generateLevel } from './index';

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
  kinds.forEach((k, i) => {
    if (k === 'beam' && kinds[i + 1] === 'hurdle')
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
  it('is a fixed 45 s Full body floor level', () => {
    expect(DEMO_CONFIG).toMatchObject({ workout: 'fullBody', mode: 'floor', durationSec: 45 });
    expect(Number.isInteger(DEMO_CONFIG.seed)).toBe(true);
  });

  it('is the same level every time', () => {
    expect(generateLevel(DEMO_CONFIG)).toEqual(generateLevel(DEMO_CONFIG));
  });

  it('shows every move twice, opens and ends easy, no hurdle after a beam', () => {
    expect(demoProblems(generateLevel(DEMO_CONFIG))).toEqual([]);
  });

  it('has a low-impact version for judges with no hurdles that still shows the other moves', () => {
    const level = generateLevel({ ...DEMO_CONFIG, lowImpact: true });
    expect(level.waves.flatMap((w) => w.spawns).some((s) => s.kind === 'hurdle')).toBe(false);
    expect(demoProblems(level)).toEqual([]);
  });

  it('the low-impact version is gentle for judges playing cold: no holds, squats as in the normal one', () => {
    const squats = (lowImpact: boolean) =>
      generateLevel({ ...DEMO_CONFIG, lowImpact })
        .waves.flatMap((w) => w.spawns)
        .filter((s) => s.requires === 'squat');
    expect(squats(true).some((s) => s.holdSec)).toBe(false);
    expect(squats(true).length).toBeLessThanOrEqual(squats(false).length + 1);
  });
});

const DEMO_SIGNATURE =
  '4 block, 6.22 orb, 8.43 crate, 10.57 hurdle, 12.69 beam(1.6), 16.24 block, 18.29 beam(1), 21.25 block+21.25 orb, 22.93 beam, 24.74 orb, 26.44 block, 28.09 orb, 29.66 block, 31.11 hurdle, 32.76 orb, 34.36 crate, 36 hurdle, 37.66 block+37.66 orb, 39.09 orb, 40.85 crate, 42.74 crate';
const DEMO_LOW_SIGNATURE =
  '4 block, 6.22 orb, 8.43 crate, 10.57 block, 12.53 beam, 14.44 beam, 16.55 block, 18.34 orb, 20.11 beam, 22 orb, 23.76 block, 25.47 orb, 27.09 block, 28.59 beam, 30.34 orb, 31.95 crate, 33.46 orb, 34.91 block, 36.39 orb, 38.08 orb, 39.75 crate, 41.36 crate, 43.27 block+43.27 orb';

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
      durationSec: 45,
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
