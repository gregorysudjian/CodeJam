// Edge cases for the coach endpoint's pure helpers, beyond advice.test.ts (added by QA).
import { describe, expect, it } from 'vitest';
import {
  RECAP_MAX,
  TIP_MAX,
  bearerToken,
  buildUserPrompt,
  parseAdvice,
  readSessionId,
  type SessionFacts,
} from './advice';

const answer = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    recap: 'Good round.',
    tip: 'Squat earlier.',
    reason: 'Balance.',
    next: { workout: 'arms', durationSec: 45, difficulty: 0.6 },
    ...over,
  });

describe('parseAdvice: edge cases', () => {
  it('rejects text that is not a JSON object', () => {
    for (const t of ['', 'null', '42', '"advice"', '[]', '```json\n{}\n```', '{"recap":']) {
      expect(parseAdvice(t, 'floor')).toBeNull();
    }
  });

  it('rejects whitespace-only text fields', () => {
    expect(parseAdvice(answer({ recap: '   \n ' }), 'floor')).toBeNull();
    expect(parseAdvice(answer({ tip: '' }), 'floor')).toBeNull();
  });

  it('rejects a missing next session or an unknown workout', () => {
    expect(parseAdvice(answer({ next: undefined }), 'floor')).toBeNull();
    expect(parseAdvice(answer({ next: { workout: 'yoga' } }), 'floor')).toBeNull();
  });

  it('collapses whitespace and cuts long text to the cap, ending with an ellipsis', () => {
    const a = parseAdvice(
      answer({ recap: `Line one.\n\n  ${'x'.repeat(RECAP_MAX * 2)}` }),
      'floor',
    );
    expect(a?.recap).not.toMatch(/\n|\s{2}/);
    expect(a?.recap.length).toBeLessThanOrEqual(RECAP_MAX);
    expect(a?.recap.endsWith('…')).toBe(true);
    const exact = 'y'.repeat(TIP_MAX);
    expect(parseAdvice(answer({ tip: exact }), 'floor')?.tip).toBe(exact);
  });

  it('defaults a bad duration to 90 and a non-numeric difficulty to 0.5', () => {
    const a = parseAdvice(
      answer({ next: { workout: 'legs', durationSec: '45', difficulty: '0.9' } }),
      'floor',
    );
    expect(a?.next).toEqual({ workout: 'legs', mode: 'floor', durationSec: 90, difficulty: 0.5 });
  });

  it('rounds difficulty to one decimal, half up', () => {
    const d = (difficulty: number) =>
      parseAdvice(answer({ next: { workout: 'arms', durationSec: 90, difficulty } }), 'floor')?.next
        .difficulty;
    expect(d(0.25)).toBe(0.3);
    expect(d(0.75)).toBe(0.8);
    expect(d(-0.04)).toBe(0);
  });

  it('keeps legs on the floor, ignores a mode or source in the answer', () => {
    const a = parseAdvice(
      answer({ source: 'rules', next: { workout: 'legs', mode: 'treadmill', durationSec: 180 } }),
      'floor',
    );
    expect(a?.next.workout).toBe('legs');
    expect(a?.next.mode).toBe('floor');
    expect(a?.source).toBe('ai');
  });
});

const row = (over: Partial<SessionFacts> = {}): SessionFacts => ({
  id: 'a',
  workout: 'fullBody',
  mode: 'floor',
  duration_sec: 45,
  active_sec: 45,
  difficulty: 0.5,
  score: 500,
  best_streak: 3,
  cleared: 5,
  hit: 2,
  accuracy: 0.714,
  kcal: 7.4,
  reps: { jump: 2 },
  missed: { jump: 1 },
  created_at: '2026-11-21T08:00:00.000Z',
  ...over,
});

describe('buildUserPrompt: edge cases', () => {
  const parse = (prompt: string) => {
    const [, player, sessions] = prompt.match(
      /Player:\n(.*)\n\nRecent sessions, newest first:\n(.*)$/s,
    )!;
    return { player: JSON.parse(player), sessions: JSON.parse(sessions) };
  };

  it('fills a missing profile with neutral defaults', () => {
    expect(parse(buildUserPrompt(null, [], 'x')).player).toEqual({
      name: 'Player',
      goal: 'getMoving',
      fitnessLevel: 'beginner',
      weeklyGoalMinutes: 60,
    });
  });

  it('reads string numerics, rounds them, and defaults a null difficulty to 0.5', () => {
    const [s] = parse(
      buildUserPrompt(
        null,
        [row({ active_sec: '45', accuracy: '0.714', kcal: '7.6', difficulty: null })],
        'a',
      ),
    ).sessions;
    expect(s).toMatchObject({
      activeMinutes: 0.8,
      accuracy: 0.71,
      estimatedKcal: 8,
      difficulty: 0.5,
    });
  });

  it('turns garbage numerics into 0, never NaN or null', () => {
    const [s] = parse(
      buildUserPrompt(null, [row({ active_sec: 'x', accuracy: '', kcal: 'NaN' })], 'a'),
    ).sessions;
    expect(s.activeMinutes).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.estimatedKcal).toBe(0);
  });

  it('marks only the session with the given id as latest, and none if the id is unknown', () => {
    const list = [row({ id: 'a' }), row({ id: 'b' })];
    expect(
      parse(buildUserPrompt(null, list, 'b')).sessions.map((s: { latest?: boolean }) => !!s.latest),
    ).toEqual([false, true]);
    expect(
      parse(buildUserPrompt(null, list, 'zzz')).sessions.some(
        (s: { latest?: boolean }) => s.latest,
      ),
    ).toBe(false);
  });

  it('sends only the date, not the time of day', () => {
    const [s] = parse(buildUserPrompt(null, [row()], 'a')).sessions;
    expect(s.date).toBe('2026-11-21');
  });
});

describe('request parsing: edge cases', () => {
  it('reads a bearer token case-insensitively and rejects anything else', () => {
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('Bearer    abc')).toBe('abc');
    expect(bearerToken('Bearer ')).toBeNull();
    expect(bearerToken('Bearer a b')).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it('reads a uuid sessionId in any case and nothing else', () => {
    expect(readSessionId({ sessionId: '545492F1-8558-4FE4-8A11-4C1876DE460B' })).not.toBeNull();
    for (const body of [
      null,
      undefined,
      'x',
      42,
      [],
      {},
      { sessionId: 42 },
      { sessionId: ' 545492f1-8558-4fe4-8a11-4c1876de460b' },
    ]) {
      expect(readSessionId(body)).toBeNull();
    }
  });
});
