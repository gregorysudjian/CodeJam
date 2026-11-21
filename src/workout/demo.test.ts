import { describe, expect, it } from 'vitest';
import type { Level, MoveType, ObstacleKind } from '@/contracts';
import { DEMO_CONFIG, generateLevel } from './index';

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
});
