import { describe, expect, it } from 'vitest';
import type { MoveType, SavedSession } from '@/contracts';
import {
  isCoachAdvice,
  profileFromRow,
  profilePatchToRow,
  sessionFromRow,
  sessionToRow,
  type SessionRow,
} from './mapping';

const reps: Record<MoveType, number> = {
  sidestep: 4,
  jump: 3,
  squat: 2,
  armsUp: 1,
  reachLeft: 0,
  reachRight: 5,
};

const saved: SavedSession = {
  id: '545492f1-8558-4fe4-8a11-4c1876de460b',
  at: Date.parse('2026-11-21T08:00:00.000Z'),
  synced: false,
  config: { workout: 'legs', mode: 'floor', durationSec: 90, difficulty: 0.6, seed: 123456 },
  score: 1500.4,
  streak: 3,
  multiplier: 1,
  reps,
  kcal: 9.87,
  bestStreak: 11,
  cleared: 14,
  hit: 2,
  accuracy: 0.875,
  missed: { ...reps, jump: 2 },
  activeSec: 88.26,
};

describe('session mapping', () => {
  it('round-trips the stored fields', () => {
    const row = sessionToRow(saved, 'user-1') as SessionRow;
    expect(row.user_id).toBe('user-1');
    expect(row.score).toBe(1500); // int column
    expect(row.created_at).toBe('2026-11-21T08:00:00.000Z');
    const back = sessionFromRow(row);
    expect(back).toMatchObject({
      id: saved.id,
      at: saved.at,
      synced: true,
      config: saved.config,
      bestStreak: 11,
      accuracy: 0.875,
      reps,
    });
    expect(back.kcal).toBeCloseTo(9.9);
    expect(back.activeSec).toBeCloseTo(88.3);
  });

  it('accepts numeric columns as strings and fills missing moves with 0', () => {
    const row = {
      ...sessionToRow(saved, 'u'),
      accuracy: '0.5',
      kcal: '3.2',
      active_sec: '45',
      difficulty: null,
      seed: null,
      reps: { jump: 2 },
    } as SessionRow;
    const s = sessionFromRow(row);
    expect(s.accuracy).toBe(0.5);
    expect(s.kcal).toBe(3.2);
    expect(s.config).not.toHaveProperty('difficulty');
    expect(s.config).not.toHaveProperty('seed');
    expect(s.reps).toEqual({
      ...Object.fromEntries(Object.keys(reps).map((k) => [k, 0])),
      jump: 2,
    });
  });

  it('clamps out-of-range values the database would reject', () => {
    const row = sessionToRow({ ...saved, score: -5, accuracy: 1.2, kcal: -1 }, 'u');
    expect(row.score).toBe(0);
    expect(row.accuracy).toBe(1);
    expect(row.kcal).toBe(0);
  });
});

describe('profile mapping', () => {
  it('maps a row, dropping a null weight', () => {
    const p = profileFromRow({
      id: 'u',
      display_name: 'Guest-1234',
      goal: 'getMoving',
      level: 'beginner',
      weight_kg: null,
      weekly_goal_min: 60,
    });
    expect(p).toEqual({
      id: 'u',
      displayName: 'Guest-1234',
      goal: 'getMoving',
      level: 'beginner',
      weeklyGoalMin: 60,
    });
  });

  it('patches only the given fields', () => {
    expect(profilePatchToRow({ displayName: '  Greg  ' })).toEqual({ display_name: 'Greg' });
    expect(profilePatchToRow({ weightKg: undefined })).toEqual({ weight_kg: null });
    expect(profilePatchToRow({})).toEqual({});
  });
});

describe('isCoachAdvice', () => {
  const good = {
    recap: 'r',
    tip: 't',
    reason: 'why',
    source: 'ai',
    next: { workout: 'arms', mode: 'floor', durationSec: 90, difficulty: 0.5 },
  };
  it('accepts a well-formed answer', () => expect(isCoachAdvice(good)).toBe(true));
  it('rejects junk', () => {
    expect(isCoachAdvice(null)).toBe(false);
    expect(isCoachAdvice({ error: 'coach not configured' })).toBe(false);
    expect(isCoachAdvice({ ...good, next: { ...good.next, workout: 'yoga' } })).toBe(false);
    expect(isCoachAdvice({ ...good, source: 'gpt' })).toBe(false);
  });
});
