import { describe, expect, it } from 'vitest';
import {
  TIP_MAX,
  bearerToken,
  buildUserPrompt,
  parseAdvice,
  readSessionId,
  type SessionFacts,
} from './advice';

const answer = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    recap: 'Great round, Greg: 900 points.',
    tip: 'Squat a beat earlier.',
    next: { workout: 'arms', durationSec: 90, difficulty: 0.6 },
    reason: 'Arms is your least played workout this week.',
    ...over,
  });

describe('parseAdvice', () => {
  it('accepts a valid answer and tags it as AI', () => {
    expect(parseAdvice(answer(), 'floor')).toEqual({
      recap: 'Great round, Greg: 900 points.',
      tip: 'Squat a beat earlier.',
      next: { workout: 'arms', mode: 'floor', durationSec: 90, difficulty: 0.6 },
      reason: 'Arms is your least played workout this week.',
      source: 'ai',
    });
  });

  it('rejects unusable answers', () => {
    expect(parseAdvice(undefined, 'floor')).toBeNull();
    expect(parseAdvice('not json', 'floor')).toBeNull();
    expect(parseAdvice(answer({ recap: '   ' }), 'floor')).toBeNull();
    expect(
      parseAdvice(answer({ next: { workout: 'yoga', durationSec: 90, difficulty: 0.5 } }), 'floor'),
    ).toBeNull();
  });

  it('clamps difficulty, fixes the duration and keeps the played mode', () => {
    const a = parseAdvice(
      answer({ next: { workout: 'legs', durationSec: 60, difficulty: 3 } }),
      'floor',
    );
    expect(a?.next).toEqual({ workout: 'legs', mode: 'floor', durationSec: 90, difficulty: 1 });
  });

  it('never returns legs in treadmill mode', () => {
    const a = parseAdvice(
      answer({ next: { workout: 'legs', durationSec: 45, difficulty: 0.5 } }),
      'treadmill',
    );
    expect(a?.next.workout).toBe('fullBody');
  });

  it('caps text length', () => {
    const a = parseAdvice(answer({ tip: 'x'.repeat(1000) }), 'floor');
    expect(a!.tip.length).toBeLessThanOrEqual(TIP_MAX);
  });
});

describe('request parsing', () => {
  it('reads a bearer token', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
  it('accepts only a uuid sessionId', () => {
    expect(readSessionId({ sessionId: '545492f1-8558-4fe4-8a11-4c1876de460b' })).toBeTruthy();
    expect(readSessionId({ sessionId: "1'; drop table sessions" })).toBeNull();
    expect(readSessionId(null)).toBeNull();
  });
});

describe('buildUserPrompt', () => {
  const s: SessionFacts = {
    id: 'a',
    workout: 'fullBody',
    mode: 'floor',
    duration_sec: 45,
    active_sec: '45',
    difficulty: null,
    score: 900,
    best_streak: 7,
    cleared: 9,
    hit: 1,
    accuracy: '0.9',
    kcal: '4.4',
    reps: { jump: 3 },
    missed: { squat: 1 },
    created_at: '2026-11-21T08:00:00Z',
  };
  it('marks the latest session and sends no body data', () => {
    const p = buildUserPrompt(
      { display_name: 'Greg', goal: 'cardio', level: 'regular', weekly_goal_min: 60 },
      [s, { ...s, id: 'b' }],
      'a',
    );
    expect(p).toContain('"latest":true');
    expect(p.match(/"latest"/g)).toHaveLength(1);
    expect(p).toContain('"accuracy":0.9');
    expect(p).not.toMatch(/weight/i);
  });
});
