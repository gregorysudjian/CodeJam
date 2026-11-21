import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataStore, LeaderboardEntry, MoveType, SessionSummary } from '@/contracts';
import { withFallback } from './fallback';
import { createLocalStore, memoryStorage } from './local';

const zero: Record<MoveType, number> = {
  sidestep: 0,
  jump: 0,
  squat: 0,
  armsUp: 0,
  reachLeft: 0,
  reachRight: 0,
};
const round: SessionSummary = {
  config: { workout: 'fullBody', mode: 'floor', durationSec: 45 },
  score: 500,
  streak: 0,
  multiplier: 1,
  reps: zero,
  kcal: 4,
  bestStreak: 3,
  cleared: 5,
  hit: 1,
  accuracy: 0.8,
  missed: zero,
  activeSec: 45,
};
const realBoard: LeaderboardEntry[] = [
  { displayName: 'Ana', score: 1800, workout: 'fullBody', mode: 'floor', durationSec: 45, at: 1 },
  { displayName: 'Bo', score: 1650, workout: 'fullBody', mode: 'floor', durationSec: 45, at: 2 },
];

/** Supabase refusing the anonymous sign-in (rate limit), but still serving the public board. */
function rateLimitedRemote(): DataStore {
  const fail = () => Promise.reject(new Error('should not be called after the fallback'));
  return {
    kind: 'supabase',
    signInGuest: () => Promise.reject(new Error('Request rate limit reached')),
    getProfile: () => Promise.resolve(null),
    saveProfile: fail,
    saveSession: fail,
    listSessions: fail,
    getLeaderboard: () => Promise.resolve(realBoard),
    getCoachAdvice: fail,
    signOut: () => Promise.resolve(),
  };
}

describe('withFallback: anonymous sign-in refused (venue wifi rate limit)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('plays and saves on the local store, which never rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = withFallback(rateLimitedRemote(), createLocalStore(memoryStorage()));

    const p = await store.signInGuest('QA-x');
    expect(p.displayName).toBe('QA-x');
    expect(store.kind).toBe('local');
    const saved = await store.saveSession(round);
    expect(saved.score).toBe(500);
    expect((await store.listSessions()).map((s) => s.id)).toEqual([saved.id]);
  });

  it('still shows the real leaderboard, not a board of one ("#1 on the leaderboard")', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = withFallback(rateLimitedRemote(), createLocalStore(memoryStorage()));
    await store.signInGuest('QA-x');
    await store.saveSession(round);

    const board = await store.getLeaderboard('fullBody', 'floor', 45);

    expect(board.map((e) => e.displayName)).toEqual(['Ana', 'Bo']);
  });

  it('gives Supabase another chance for the next guest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = withFallback(rateLimitedRemote(), createLocalStore(memoryStorage()));
    await store.signInGuest();
    await store.signOut();
    expect(store.kind).toBe('supabase');
  });
});
