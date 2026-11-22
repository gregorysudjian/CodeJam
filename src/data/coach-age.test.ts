import { describe, expect, it } from 'vitest';
import type { MoveType, Profile, SavedSession } from '@/contracts';
import { ruleBasedAdvice } from './coach';
import { COACH_LOW_IMPACT_AGE } from './tuning';

// From COACH_LOW_IMPACT_AGE the next session is low impact and `reason` says so kindly; under it
// (or with no age) the advice is exactly as before. The coach never says the age or the weight.
const NOW = Date.parse('2026-11-22T12:00:00Z');
const zero = (): Record<MoveType, number> => ({
  sidestep: 0,
  jump: 0,
  squat: 0,
  armsUp: 0,
  reachLeft: 0,
  reachRight: 0,
});
const round = (accuracy: number): SavedSession => ({
  id: 'r1',
  at: NOW - 1000,
  synced: true,
  config: { workout: 'fullBody', mode: 'floor', durationSec: 180, difficulty: 0.5 },
  score: 1234,
  streak: 0,
  multiplier: 1,
  reps: zero(),
  kcal: 5,
  bestStreak: 9,
  cleared: 18,
  hit: 2,
  accuracy,
  missed: { ...zero(), jump: 2 },
  activeSec: 180,
  levelReached: 6,
});
const player = (age?: number): Profile => ({
  id: 'u1',
  displayName: 'Sam',
  goal: 'cardio',
  level: 'regular',
  weightKg: 82,
  weeklyGoalMin: 60,
  ...(age === undefined ? {} : { age }),
});
const NOTE = 'Low impact: no jumps, same workout.';
// First round, a middling round (same tier), a strong one (tier up), a weak one (tier down).
const HISTORIES: [string, SavedSession[]][] = [
  ['first round', []],
  ['a later round', [round(0.8)]],
  ['after a strong round', [round(0.95)]],
  ['after a weak round', [round(0.4)]],
];

describe('coach: low impact from COACH_LOW_IMPACT_AGE', () => {
  it('is 60', () => expect(COACH_LOW_IMPACT_AGE).toBe(60));

  for (const [label, sessions] of HISTORIES) {
    describe(label, () => {
      const plain = ruleBasedAdvice(player(), sessions, NOW);

      it('changes nothing with no age or under 60', () => {
        expect(plain.next.lowImpact).toBeUndefined();
        expect(plain.reason).not.toContain(NOTE);
        expect(ruleBasedAdvice(player(59), sessions, NOW)).toEqual(plain);
        expect(ruleBasedAdvice(player(10), sessions, NOW)).toEqual(plain);
      });

      for (const age of [60, 75]) {
        it(`at ${age}: low impact, same workout and tier, one added sentence`, () => {
          const a = ruleBasedAdvice(player(age), sessions, NOW);
          expect(a.next).toEqual({ ...plain.next, lowImpact: true });
          expect(a.reason).toBe(`${plain.reason} ${NOTE}`);
          expect(a.recap).toBe(plain.recap);
          expect(a.tip).toBe(plain.tip);
        });

        it(`at ${age}: never mentions the age or the weight`, () => {
          const a = ruleBasedAdvice(player(age), sessions, NOW);
          for (const text of [a.recap, a.tip, a.reason]) {
            expect(text).not.toContain(String(age));
            expect(text).not.toContain('82');
            expect(text).not.toMatch(/\bage\b|\bold\b|years|weight|\bkg\b/i);
          }
        });
      }
    });
  }
});
