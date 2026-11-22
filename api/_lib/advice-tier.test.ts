import { describe, expect, it } from 'vitest';
import { nextTier, parseAdvice, planNumbers } from './advice';

describe("planNumbers: today's plan, decided by the game", () => {
  it('rounds by level, calories from the per-round average, share of the weekly goal', () => {
    expect(planNumbers('regular', 60, [{ kcal: 20 }, { kcal: '22' }])).toEqual({
      rounds: 3,
      kcal: 63,
      minutes: 9,
      weeklyShare: 15,
    });
    expect(planNumbers('beginner', 30, [{ kcal: 10 }])).toEqual({
      rounds: 2,
      kcal: 20,
      minutes: 6,
      weeklyShare: 20,
    });
  });
  it('no usable history or goal: no calories, no share', () => {
    expect(planNumbers(undefined, 0, [{ kcal: 'x' }])).toEqual({
      rounds: 2,
      kcal: 0,
      minutes: 6,
      weeklyShare: null,
    });
  });
});

const card = (extra: Record<string, unknown>) =>
  JSON.stringify({
    recap: 'Nice round.',
    tip: 'Squat earlier.',
    next: { workout: 'arms', durationSec: 180, difficulty: 0.5 },
    reason: 'Balance.',
    ...extra,
  });

describe("parseAdvice: today's plan line", () => {
  it('keeps a plan, trimmed and capped', () => {
    expect(parseAdvice(card({ plan: "  Today's plan: 2 x Arms  " }), 'floor')?.plan).toBe(
      "Today's plan: 2 x Arms",
    );
    expect(parseAdvice(card({ plan: 'x'.repeat(400) }), 'floor')!.plan!.length).toBeLessThanOrEqual(
      200,
    );
  });
  it('leaves it out when missing or empty, and the card still stands', () => {
    for (const extra of [{}, { plan: '   ' }, { plan: 42 }]) {
      const a = parseAdvice(card(extra), 'floor');
      expect(a?.recap).toBe('Nice round.');
      expect(a && 'plan' in a).toBe(false);
    }
  });
});

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
