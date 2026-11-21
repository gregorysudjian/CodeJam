// Edge cases for src/data/mapping.ts beyond mapping.test.ts (added by QA).
import { describe, expect, it } from 'vitest';
import type { MoveType, SavedSession } from '@/contracts';
import {
  isCoachAdvice,
  leaderboardFromRow,
  profileFromRow,
  profilePatchToRow,
  sessionFromRow,
  sessionToRow,
  type SessionRow,
} from './mapping';

const zero = (): Record<MoveType, number> => ({
  sidestep: 0,
  jump: 0,
  squat: 0,
  armsUp: 0,
  reachLeft: 0,
  reachRight: 0,
});

const saved: SavedSession = {
  id: '545492f1-8558-4fe4-8a11-4c1876de460b',
  at: Date.parse('2026-11-21T08:00:00.000Z'),
  synced: false,
  config: { workout: 'arms', mode: 'treadmill', durationSec: 45 },
  score: 700,
  streak: 0,
  multiplier: 1,
  reps: zero(),
  kcal: 8,
  bestStreak: 4,
  cleared: 2,
  hit: 7,
  accuracy: 0.22,
  missed: zero(),
  activeSec: 45,
};

describe('sessionToRow: edge cases', () => {
  it('stores a missing difficulty and seed as null, not undefined', () => {
    const row = sessionToRow(saved, 'u');
    expect(row.difficulty).toBeNull();
    expect(row.seed).toBeNull();
  });

  it('keeps difficulty 0 and seed 0 (falsy but valid)', () => {
    const row = sessionToRow(
      { ...saved, config: { ...saved.config, difficulty: 0, seed: 0 } },
      'u',
    );
    expect(row.difficulty).toBe(0);
    expect(row.seed).toBe(0);
  });

  it('rounds a fractional duration to the int column', () => {
    expect(
      sessionToRow({ ...saved, config: { ...saved.config, durationSec: 44.6 } }, 'u'),
    ).toMatchObject({ duration_sec: 45 });
  });

  it('keeps accuracy exactly at the 0 and 1 bounds', () => {
    expect(sessionToRow({ ...saved, accuracy: 0 }, 'u').accuracy).toBe(0);
    expect(sessionToRow({ ...saved, accuracy: 1 }, 'u').accuracy).toBe(1);
  });

  // docs/QA.md Q13 (fixed): a NaN would become null in JSON and the NOT NULL column would reject
  // the whole queued upsert (one call for every pending round), so sessionToRow sends 0.
  it('never sends NaN to the not-null numeric columns', () => {
    const row = sessionToRow(
      { ...saved, score: NaN, accuracy: NaN, kcal: NaN, activeSec: NaN },
      'u',
    );
    for (const v of [row.score, row.accuracy, row.kcal, row.active_sec]) {
      expect(Number.isFinite(Number(v))).toBe(true);
    }
  });
});

describe('sessionFromRow: edge cases', () => {
  it('fills reps and missed when the jsonb column is null', () => {
    const row = {
      ...sessionToRow(saved, 'u'),
      reps: null,
      missed: null,
    } as unknown as SessionRow;
    const s = sessionFromRow(row);
    expect(s.reps).toEqual(zero());
    expect(s.missed).toEqual(zero());
  });

  it('reads unparseable numeric strings as 0 instead of NaN', () => {
    const row = { ...sessionToRow(saved, 'u'), accuracy: 'abc', kcal: '' } as SessionRow;
    const s = sessionFromRow(row);
    expect(s.accuracy).toBe(0);
    expect(s.kcal).toBe(0);
  });

  it('keeps a difficulty of 0 from the database', () => {
    const row = { ...sessionToRow(saved, 'u'), difficulty: '0' } as SessionRow;
    expect(sessionFromRow(row).config.difficulty).toBe(0);
  });
});

describe('profile mapping: edge cases', () => {
  it('reads a numeric weight that arrives as a string', () => {
    const p = profileFromRow({
      id: 'u',
      display_name: 'A',
      goal: 'cardio',
      level: 'athlete',
      weight_kg: '72.5',
      weekly_goal_min: 90,
    });
    expect(p.weightKg).toBe(72.5);
  });

  it('caps a display name at the 40 characters the database allows, after trimming', () => {
    const row = profilePatchToRow({ displayName: `  ${'x'.repeat(50)}  ` });
    expect(row.display_name).toHaveLength(40);
  });

  it('passes every patched field and nothing else', () => {
    expect(
      profilePatchToRow({
        goal: 'buildStrength',
        level: 'regular',
        weeklyGoalMin: 120,
        weightKg: 80,
      }),
    ).toEqual({ goal: 'buildStrength', level: 'regular', weekly_goal_min: 120, weight_kg: 80 });
  });
});

describe('leaderboardFromRow', () => {
  it('maps the five public columns and parses the date', () => {
    expect(
      leaderboardFromRow({
        display_name: 'Guest-1234',
        workout: 'fullBody',
        mode: 'floor',
        score: 4750,
        created_at: '2026-11-21T08:00:00.000Z',
      }),
    ).toEqual({
      displayName: 'Guest-1234',
      workout: 'fullBody',
      mode: 'floor',
      score: 4750,
      at: Date.parse('2026-11-21T08:00:00.000Z'),
    });
  });
});

describe('isCoachAdvice: edge cases', () => {
  const good = {
    recap: 'r',
    tip: 't',
    reason: 'why',
    source: 'rules',
    next: { workout: 'shoulders', mode: 'treadmill', durationSec: 45 },
  };
  it('accepts an answer without difficulty (it is optional in SessionConfig)', () => {
    expect(isCoachAdvice(good)).toBe(true);
  });
  it('rejects a missing or malformed next session', () => {
    expect(isCoachAdvice({ ...good, next: undefined })).toBe(false);
    expect(isCoachAdvice({ ...good, next: [] })).toBe(false);
    expect(isCoachAdvice({ ...good, next: { ...good.next, mode: 'outdoor' } })).toBe(false);
    expect(isCoachAdvice({ ...good, next: { ...good.next, durationSec: '45' } })).toBe(false);
  });
  it('rejects non-string text fields', () => {
    expect(isCoachAdvice({ ...good, recap: 42 })).toBe(false);
    expect(isCoachAdvice({ ...good, tip: null })).toBe(false);
    expect(isCoachAdvice({ ...good, reason: undefined })).toBe(false);
  });
  it('rejects primitives and arrays', () => {
    for (const v of [undefined, 0, 'advice', true, []]) expect(isCoachAdvice(v)).toBe(false);
  });
});
