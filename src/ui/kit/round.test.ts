import { describe, expect, test } from 'vitest';
import { asRound, tierOf } from './round';

describe('tiers', () => {
  test('a difficulty snaps to the nearest tier; missing or broken is regular', () => {
    expect(tierOf(undefined)).toBe('regular');
    expect(tierOf(Number.NaN)).toBe('regular');
    expect(tierOf(0)).toBe('beginner');
    expect(tierOf(0.2)).toBe('beginner');
    expect(tierOf(0.3)).toBe('regular');
    expect(tierOf(0.5)).toBe('regular');
    expect(tierOf(0.7)).toBe('regular');
    expect(tierOf(0.8)).toBe('athlete');
    expect(tierOf(1)).toBe('athlete');
    expect(tierOf(-1)).toBe('beginner');
    expect(tierOf(3)).toBe('athlete');
  });

  test('a coach pick is played as a whole round on the tier it shows', () => {
    expect(
      asRound({ workout: 'legs', mode: 'floor', durationSec: 45, difficulty: 0.6, seed: 7 }),
    ).toEqual({ workout: 'legs', mode: 'floor', durationSec: 180, difficulty: 0.5, seed: 7 });
    expect(asRound({ workout: 'arms', mode: 'treadmill', durationSec: 90 })).toMatchObject({
      durationSec: 180,
      difficulty: 0.5,
    });
  });
});
