// Boundaries of the "Try each move" helpers beyond tutorial.test.ts (added by QA).
import { describe, expect, it } from 'vitest';
import type { MoveType } from '@/contracts';
import { moveHint, tutorialMoves } from './tutorial';

const ALL: MoveType[] = ['sidestep', 'jump', 'squat', 'armsUp', 'reachLeft', 'reachRight'];

describe('tutorialMoves: boundaries', () => {
  it('treats a missing lowImpact as off', () => {
    expect(tutorialMoves({ mode: 'floor' })).toEqual(ALL);
  });

  it('ignores lowImpact on the treadmill (upper body either way)', () => {
    expect(tutorialMoves({ mode: 'treadmill', lowImpact: true })).toEqual(
      tutorialMoves({ mode: 'treadmill', lowImpact: false }),
    );
  });

  it('never repeats a move and only uses known moves', () => {
    for (const mode of ['floor', 'treadmill'] as const) {
      for (const lowImpact of [false, true]) {
        const moves = tutorialMoves({ mode, lowImpact });
        expect(new Set(moves).size).toBe(moves.length);
        for (const m of moves) expect(ALL).toContain(m);
      }
    }
  });

  it('low impact on the floor still teaches the squat (only hurdles are removed)', () => {
    expect(tutorialMoves({ mode: 'floor', lowImpact: true })).toContain('squat');
  });
});

describe('moveHint: every move, both inputs', () => {
  it('names a key for keyboard players and never for camera players', () => {
    for (const move of ALL) {
      const kb = moveHint(move, 'keyboard');
      const body = moveHint(move, 'pose');
      expect(body.length).toBeGreaterThan(0);
      expect(kb.startsWith(body)).toBe(true);
      expect(kb.length).toBeGreaterThan(body.length);
      expect(body).not.toMatch(/hold [A-Z↓]|←|→|↑|Space/);
    }
  });

  it('matches the keyboard mapping in CONTRACTS.md', () => {
    expect(moveHint('armsUp', 'keyboard')).toMatch(/W/);
    expect(moveHint('reachLeft', 'keyboard')).toMatch(/Q/);
    expect(moveHint('reachRight', 'keyboard')).toMatch(/E/);
    expect(moveHint('jump', 'keyboard')).toMatch(/Space/);
    expect(moveHint('squat', 'keyboard')).toMatch(/↓/);
  });
});
