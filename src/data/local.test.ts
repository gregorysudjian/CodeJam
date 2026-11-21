import { describe, expect, it } from 'vitest';
import type { MoveType, SessionSummary } from '@/contracts';
import { createLocalStore, type KeyValue } from './local';

function memory(): KeyValue {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

const reps: Record<MoveType, number> = {
  sidestep: 0,
  jump: 0,
  squat: 0,
  armsUp: 0,
  reachLeft: 0,
  reachRight: 0,
};
const summary = (
  score: number,
  workout: SessionSummary['config']['workout'] = 'fullBody',
): SessionSummary => ({
  config: { workout, mode: 'floor', durationSec: 45 },
  score,
  streak: 0,
  multiplier: 1,
  reps,
  kcal: 4,
  bestStreak: 3,
  cleared: 5,
  hit: 1,
  accuracy: 0.83,
  missed: reps,
  activeSec: 45,
});

describe('local store', () => {
  it('creates a guest with the contract defaults and reuses it', async () => {
    const store = createLocalStore(memory());
    const a = await store.signInGuest();
    expect(a.displayName).toMatch(/^Guest-\d{4}$/);
    expect(a).toMatchObject({ goal: 'getMoving', level: 'beginner', weeklyGoalMin: 60 });
    const b = await store.signInGuest('Other');
    expect(b.id).toBe(a.id);
  });

  it('saves sessions newest first and builds the leaderboard', async () => {
    const store = createLocalStore(memory());
    await store.signInGuest('Greg');
    await store.saveSession(summary(500));
    await store.saveSession(summary(900));
    await store.saveSession(summary(700, 'arms'));
    const list = await store.listSessions();
    expect(list.map((s) => s.score)).toEqual([700, 900, 500]);
    expect(list.every((s) => s.synced === false)).toBe(true);
    const board = await store.getLeaderboard('fullBody', 'floor');
    expect(board.map((r) => [r.displayName, r.score])).toEqual([
      ['Greg', 900],
      ['Greg', 500],
    ]);
  });

  it('signOut forgets the player, so the next sign-in is a new guest with no history', async () => {
    const store = createLocalStore(memory());
    const first = await store.signInGuest('First');
    await store.saveSession(summary(800));
    await store.signOut();
    expect(await store.getProfile()).toBeNull();
    expect(await store.listSessions()).toEqual([]);
    const second = await store.signInGuest('Second');
    expect(second.id).not.toBe(first.id);
    expect(second.displayName).toBe('Second');
  });

  it('works with storage blocked entirely', async () => {
    const store = createLocalStore(null);
    await expect(store.signInGuest()).resolves.toBeTruthy();
    await expect(store.saveSession(summary(1))).resolves.toMatchObject({ score: 1 });
    await expect(store.getCoachAdvice((await store.listSessions())[0])).resolves.toMatchObject({
      source: 'rules',
    });
  });
});
