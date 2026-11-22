// The rule-based coach with odd histories, beyond coach.test.ts (added by QA).
import { describe, expect, it } from 'vitest';
import type { MoveType, Profile, SavedSession, SessionConfig } from '@/contracts';
import { ruleBasedAdvice } from './coach';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const DAY = 24 * 3600 * 1000;
const WEEK = 7 * DAY;
const zero = (): Record<MoveType, number> => ({
  sidestep: 0,
  jump: 0,
  squat: 0,
  armsUp: 0,
  reachLeft: 0,
  reachRight: 0,
});

function session(
  over: Omit<Partial<SavedSession>, 'config'> & { config?: Partial<SessionConfig> } = {},
): SavedSession {
  const { config, ...rest } = over;
  return {
    id: crypto.randomUUID(),
    at: NOW - 1000,
    synced: true,
    config: { workout: 'fullBody', mode: 'floor', durationSec: 45, difficulty: 0.5, ...config },
    score: 1000,
    streak: 0,
    multiplier: 1,
    reps: zero(),
    kcal: 5,
    bestStreak: 6,
    cleared: 8,
    hit: 2,
    accuracy: 0.8,
    missed: zero(),
    activeSec: 45,
    ...rest,
  };
}

const profile: Profile = {
  id: 'u1',
  displayName: 'Ada',
  goal: 'cardio',
  level: 'regular',
  weeklyGoalMin: 60,
};

const valid = (a: ReturnType<typeof ruleBasedAdvice>) => {
  for (const text of [a.recap, a.tip, a.reason]) {
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/undefined|NaN|null/);
  }
  expect(a.next.durationSec).toBe(180);
  expect([0, 0.5, 1]).toContain(a.next.difficulty);
};

describe('ruleBasedAdvice: accuracy boundaries', () => {
  it('keeps the level at exactly 85% and exactly 60% (strict thresholds)', () => {
    expect(ruleBasedAdvice(profile, [session({ accuracy: 0.85 })], NOW).next.difficulty).toBe(0.5);
    expect(ruleBasedAdvice(profile, [session({ accuracy: 0.6 })], NOW).next.difficulty).toBe(0.5);
  });

  it('snaps an old 0.1-step difficulty to the nearest tier before moving (halves round up)', () => {
    const next = (difficulty: number, accuracy: number) =>
      ruleBasedAdvice(profile, [session({ accuracy, config: { difficulty } })], NOW).next
        .difficulty;
    expect(next(0.7, 0.7)).toBe(0.5); // nearest tier, kept
    expect(next(0.8, 0.7)).toBe(1);
    expect(next(0.25, 0.7)).toBe(0.5); // a half rounds up
    expect(next(0.75, 0.7)).toBe(1);
    expect(next(0.2, 0.7)).toBe(0);
    expect(next(0.3, 0.95)).toBe(1); // regular, one up
    expect(next(0.3, 0.1)).toBe(0); // regular, one down
  });

  it('never leaves the tiers: athlete stays athlete, beginner stays beginner', () => {
    const next = (difficulty: number, accuracy: number) =>
      ruleBasedAdvice(profile, [session({ accuracy, config: { difficulty } })], NOW).next
        .difficulty;
    expect(next(1, 1)).toBe(1);
    expect(next(0, 0)).toBe(0);
  });

  it('starts from regular when the latest round has no difficulty', () => {
    const a = ruleBasedAdvice(
      profile,
      [session({ accuracy: 0.9, config: { difficulty: undefined } })],
      NOW,
    );
    expect(a.next.difficulty).toBe(1);
  });

  it('says which tier is next: moving up, easing back or keeping', () => {
    expect(ruleBasedAdvice(profile, [session({ accuracy: 0.9 })], NOW).reason).toMatch(
      /moving you up to athlete/,
    );
    expect(ruleBasedAdvice(profile, [session({ accuracy: 0.3 })], NOW).reason).toMatch(
      /easing back to beginner/,
    );
    expect(ruleBasedAdvice(profile, [session({ accuracy: 0.7 })], NOW).reason).toMatch(
      /keeping you on regular/,
    );
  });

  it('a round with nothing judged (accuracy 0) eases off and still reads well', () => {
    const a = ruleBasedAdvice(
      profile,
      [session({ accuracy: 0, cleared: 0, hit: 0, score: 0 })],
      NOW,
    );
    expect(a.next.difficulty).toBe(0);
    valid(a);
  });
});

describe('ruleBasedAdvice: odd histories', () => {
  it('counts a session exactly one week old as outside the week', () => {
    const old = session({ at: NOW - WEEK, config: { workout: 'legs' } });
    const latest = session({ config: { workout: 'fullBody' } });
    // Legs at exactly 7 days doesn't count, so legs (0 this week) ties with arms and shoulders.
    expect(ruleBasedAdvice(profile, [latest, old], NOW).next.workout).toBe('legs');
  });

  it('copes with a session dated in the future (clock skew)', () => {
    const a = ruleBasedAdvice(profile, [session({ at: NOW + DAY })], NOW);
    valid(a);
  });

  it('breaks ties between workouts in a fixed order: full body, legs, arms, shoulders', () => {
    expect(ruleBasedAdvice(profile, [], NOW).next.workout).toBe('fullBody');
    const all = (['fullBody', 'legs', 'arms', 'shoulders'] as const).map((workout) =>
      session({ config: { workout } }),
    );
    expect(ruleBasedAdvice(profile, all, NOW).next.workout).toBe('fullBody');
  });

  it('on the treadmill picks among arms, shoulders and full body even if legs was never played', () => {
    const tm = (['fullBody', 'arms'] as const).map((workout) =>
      session({ config: { workout, mode: 'treadmill' } }),
    );
    const a = ruleBasedAdvice(profile, tm, NOW);
    expect(a.next.workout).toBe('shoulders');
    expect(a.next.mode).toBe('treadmill');
  });

  it('a clean round (nothing missed) gets the endurance tip', () => {
    expect(ruleBasedAdvice(profile, [session()], NOW).tip).toMatch(/Clean round/);
  });

  it('a tie on the most-missed move picks the first move in order', () => {
    const missed = { ...zero(), squat: 3, sidestep: 3 };
    const a = ruleBasedAdvice(profile, [session({ missed })], NOW);
    expect(a.tip).toMatch(/Step wide/); // the sidestep tip
  });

  it('works without a profile, and without a display name', () => {
    valid(ruleBasedAdvice(null, [session()], NOW));
    valid(ruleBasedAdvice(null, [], NOW));
  });

  it('handles a long history (200 rounds, the local store cap) and keeps durations valid', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      session({ at: NOW - i * 3600 * 1000, config: { durationSec: [45, 90, 180, 60][i % 4] } }),
    );
    valid(ruleBasedAdvice(profile, many, NOW));
  });
});
