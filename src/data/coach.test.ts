import { describe, expect, it } from 'vitest';
import type { MoveType, Profile, SavedSession, SessionConfig } from '@/contracts';
import { ruleBasedAdvice } from './coach';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const DAY = 24 * 3600 * 1000;
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
  displayName: 'Greg',
  goal: 'cardio',
  level: 'regular',
  weeklyGoalMin: 60,
};

describe('ruleBasedAdvice', () => {
  it('welcomes a player with no sessions and never throws', () => {
    const a = ruleBasedAdvice(null, [], NOW);
    expect(a.source).toBe('rules');
    expect(a.recap).toMatch(/Welcome/);
    expect(a.next).toEqual({
      workout: 'fullBody',
      mode: 'floor',
      durationSec: 90,
      difficulty: 0.5,
    });
  });

  it('raises difficulty by 0.1 above 85% accuracy and lowers it below 60%', () => {
    expect(ruleBasedAdvice(profile, [session({ accuracy: 0.9 })], NOW).next.difficulty).toBe(0.6);
    expect(ruleBasedAdvice(profile, [session({ accuracy: 0.5 })], NOW).next.difficulty).toBe(0.4);
    expect(ruleBasedAdvice(profile, [session({ accuracy: 0.7 })], NOW).next.difficulty).toBe(0.5);
  });

  it('clamps difficulty to 0..1', () => {
    const hard = session({ accuracy: 1, config: { difficulty: 1 } });
    const easy = session({ accuracy: 0, config: { difficulty: 0 } });
    expect(ruleBasedAdvice(profile, [hard], NOW).next.difficulty).toBe(1);
    expect(ruleBasedAdvice(profile, [easy], NOW).next.difficulty).toBe(0);
  });

  it('recommends the workout played least this week, ignoring older sessions', () => {
    const sessions = [
      session({ config: { workout: 'fullBody' } }),
      session({ config: { workout: 'legs' } }),
      session({ config: { workout: 'arms' } }),
      session({ config: { workout: 'shoulders' }, at: NOW - 10 * DAY }), // last week
    ];
    expect(ruleBasedAdvice(profile, sessions, NOW).next.workout).toBe('shoulders');
  });

  it('never recommends legs in treadmill mode', () => {
    const sessions = ['fullBody', 'arms', 'shoulders'].map((w) =>
      session({ config: { workout: w as SessionConfig['workout'], mode: 'treadmill' } }),
    );
    const a = ruleBasedAdvice(profile, sessions, NOW);
    expect(a.next.workout).not.toBe('legs');
    expect(a.next.mode).toBe('treadmill');
  });

  it('aims the tip at the most-missed move and uses numbers from the data', () => {
    const missed = { ...zero(), squat: 3, jump: 1 };
    const a = ruleBasedAdvice(profile, [session({ missed, score: 1234, accuracy: 0.66 })], NOW);
    expect(a.tip).toMatch(/hips/);
    expect(a.recap).toContain('1234');
    expect(a.recap).toContain('66%');
    expect(a.recap).toContain('Greg');
  });

  it('keeps a valid duration and replaces an unknown one with 90 s', () => {
    expect(
      ruleBasedAdvice(profile, [session({ config: { durationSec: 180 } })], NOW).next.durationSec,
    ).toBe(180);
    expect(
      ruleBasedAdvice(profile, [session({ config: { durationSec: 60 } })], NOW).next.durationSec,
    ).toBe(90);
  });
});
