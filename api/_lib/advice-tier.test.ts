import { describe, expect, it } from 'vitest';
import { nextTier } from './advice';

describe('nextTier: the game decides the AI coach tier', () => {
  it('moves one tier up above 85% accuracy, capped at Athlete', () => {
    expect(nextTier({ difficulty: 0, accuracy: 0.9 })).toBe(0.5);
    expect(nextTier({ difficulty: 0.5, accuracy: 0.86 })).toBe(1);
    expect(nextTier({ difficulty: 1, accuracy: 0.97 })).toBe(1);
  });

  it('moves one tier down below 60%, floored at Beginner', () => {
    expect(nextTier({ difficulty: 0.5, accuracy: 0.31 })).toBe(0);
    expect(nextTier({ difficulty: 1, accuracy: 0.59 })).toBe(0.5);
    expect(nextTier({ difficulty: 0, accuracy: 0.48 })).toBe(0);
  });

  it('keeps the tier in between, and reads strings and odd values safely', () => {
    expect(nextTier({ difficulty: 0.5, accuracy: 0.71 })).toBe(0.5);
    expect(nextTier({ difficulty: '1', accuracy: '0.6' })).toBe(1);
    expect(nextTier({ difficulty: null, accuracy: 'x' })).toBe(0.5);
  });
});
