import { describe, expect, it } from 'vitest';
import { moveHint, tutorialMoves } from './tutorial';

describe('tutorialMoves', () => {
  it('shows all six moves on the floor', () => {
    expect(tutorialMoves({ mode: 'floor' })).toEqual([
      'sidestep',
      'jump',
      'squat',
      'armsUp',
      'reachLeft',
      'reachRight',
    ]);
  });

  it('skips the jump in low impact', () => {
    expect(tutorialMoves({ mode: 'floor', lowImpact: true })).not.toContain('jump');
    expect(tutorialMoves({ mode: 'floor', lowImpact: true })).toHaveLength(5);
  });

  it('shows only upper-body moves on the treadmill', () => {
    expect(tutorialMoves({ mode: 'treadmill' })).toEqual(['reachLeft', 'reachRight', 'armsUp']);
  });
});

describe('moveHint', () => {
  it('names the key for keyboard players and only the body move for camera players', () => {
    expect(moveHint('squat', 'keyboard')).toBe('Squat down and hold: hold ↓');
    expect(moveHint('squat', 'pose')).toBe('Squat down and hold');
  });
});
