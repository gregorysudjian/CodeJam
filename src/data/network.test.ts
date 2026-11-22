// Bad venue wifi (docs/LIVE.md, "Bad-network drill"): the network hangs, but this device already
// knows the answer. No screen may wait the full SUPABASE_TIMEOUT_MS for it.
import { describe, expect, it } from 'vitest';
import type { MoveType, Profile, SavedSession } from '@/contracts';
import { memoryStorage, type KeyValue } from './local';
import { createSupabaseStore } from './supabase';
import { READ_CACHE_AFTER_MS, SAVE_WAIT_MS, SUPABASE_TIMEOUT_MS } from './tuning';

const URL = 'https://test.supabase.co';
const AUTH_KEY = 'sb-test-auth-token';
const UID = '00000000-0000-4000-8000-000000000001';
const MARGIN = 400;

function session(expiresInSec: number): KeyValue {
  const auth = memoryStorage();
  auth.setItem(
    AUTH_KEY,
    JSON.stringify({
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + expiresInSec,
      user: { id: UID, aud: 'authenticated', role: 'authenticated' },
    }),
  );
  return auth;
}
const zero: Record<MoveType, number> = {
  sidestep: 0,
  jump: 0,
  squat: 0,
  armsUp: 0,
  reachLeft: 0,
  reachRight: 0,
};
const round: SavedSession = {
  id: '00000000-0000-4000-8000-0000000000aa',
  at: Date.now() - 60_000,
  synced: true,
  config: { workout: 'shoulders', mode: 'treadmill', durationSec: 45 },
  score: 900,
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
const profile: Profile = {
  id: UID,
  displayName: 'Ana',
  goal: 'getMoving',
  level: 'beginner',
  weeklyGoalMin: 60,
};
const hangs = (() => new Promise<Response>(() => {})) as typeof fetch;

/** A returning guest: signed in, with their profile and last round cached on this device. */
function returning(fetchImpl: typeof fetch, expiresInSec = 3600) {
  const kv = memoryStorage();
  kv.setItem('codejam.sb.profile', JSON.stringify(profile));
  kv.setItem('codejam.sb.sessions', JSON.stringify([round]));
  const store = createSupabaseStore(URL, 'anon', kv, {
    fetch: fetchImpl,
    authStorage: session(expiresInSec),
  });
  return { store, kv };
}
async function timed<T>(p: Promise<T>): Promise<[T, number]> {
  const t = Date.now();
  const v = await p;
  return [v, Date.now() - t];
}

describe('bad wifi: answer from this device instead of waiting', () => {
  it('listSessions: the dashboard shows the round just played, not "No rounds yet" for 10 s', async () => {
    const { store } = returning(hangs);
    const [list, ms] = await timed(store.listSessions());
    expect(list.map((s) => s.id)).toEqual([round.id]);
    expect(ms).toBeLessThan(READ_CACHE_AFTER_MS + MARGIN);
  }, 15_000);

  it('saveSession: the coach card no longer waits 5 s; the round is queued, never lost', async () => {
    const { store, kv } = returning(hangs);
    const [saved, ms] = await timed(store.saveSession({ ...round, score: 1000 }));
    expect(saved.synced).toBe(false);
    expect(ms).toBeLessThan(SAVE_WAIT_MS + MARGIN);
    const queued = JSON.parse(kv.getItem('codejam.sb.queue') ?? '[]') as SavedSession[];
    expect(queued.map((s) => s.id)).toEqual([saved.id]);
    // and the dashboard right after shows both rounds at once
    const [list, ms2] = await timed(store.listSessions());
    expect(list.map((s) => s.score)).toEqual([1000, 900]);
    expect(ms2).toBeLessThan(READ_CACHE_AFTER_MS + MARGIN);
  }, 15_000);

  it('getProfile: "Continue as Ana" shows in about a second, not after 5', async () => {
    const { store } = returning(hangs);
    const [p, ms] = await timed(store.getProfile());
    expect(p?.displayName).toBe('Ana');
    expect(ms).toBeLessThan(2 * READ_CACHE_AFTER_MS + MARGIN);
  }, 15_000);

  it('a returning player whose token expired (refresh hangs) is not stuck either', async () => {
    const { store } = returning(hangs, -60);
    const [p, ms] = await timed(store.getProfile());
    expect(p?.displayName).toBe('Ana');
    expect(ms).toBeLessThan(SUPABASE_TIMEOUT_MS);
  }, 15_000);

  it('signInGuest for the returning player needs no round trip (the profile is cached)', async () => {
    const calls: string[] = [];
    const counting = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Promise<Response>(() => {});
    }) as typeof fetch;
    const { store } = returning(counting);
    const [p, ms] = await timed(store.signInGuest());
    expect(p.displayName).toBe('Ana');
    expect(ms).toBeLessThan(READ_CACHE_AFTER_MS + MARGIN);
    expect(calls.filter((u) => u.includes('/rest/v1/profiles'))).toEqual([]);
  }, 15_000);

  it('a returning guest with no rounds yet: "no rounds" is known, so no 5 s wait either', async () => {
    const { store, kv } = returning(hangs);
    kv.setItem('codejam.sb.sessions', '[]');
    const [list, ms] = await timed(store.listSessions());
    expect(list).toEqual([]);
    expect(ms).toBeLessThan(READ_CACHE_AFTER_MS + MARGIN);
  }, 15_000);

  it('on good wifi the server still answers (fresh data, not the cache)', async () => {
    const fresh = { ...round, id: '00000000-0000-4000-8000-0000000000bb', score: 1500 };
    const server = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/rest/v1/sessions'))
        return Response.json([
          {
            id: fresh.id,
            user_id: UID,
            workout: 'shoulders',
            mode: 'treadmill',
            duration_sec: 45,
            active_sec: 45,
            difficulty: null,
            seed: null,
            score: 1500,
            best_streak: 3,
            cleared: 5,
            hit: 1,
            accuracy: 0.8,
            kcal: 4,
            reps: {},
            missed: {},
            created_at: new Date().toISOString(),
          },
        ]);
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    const { store } = returning(server);
    expect((await store.listSessions()).map((s) => s.score)).toEqual([1500]);
  });
});

describe('sign-in makes fewer round trips (2 s each on a slow network)', () => {
  it('a new guest: signup and profile insert only, no profile lookup', async () => {
    const calls: string[] = [];
    const server = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${url.replace(URL, '').split('?')[0]}`);
      if (url.includes('/auth/v1/signup'))
        return Response.json({
          access_token: 'tok',
          refresh_token: 'ref',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: UID, aud: 'authenticated', role: 'authenticated', is_anonymous: true },
        });
      if (url.includes('/rest/v1/profiles') && method === 'POST')
        return Response.json(
          {
            id: UID,
            display_name: 'Ana',
            goal: 'getMoving',
            level: 'beginner',
            weight_kg: null,
            weekly_goal_min: 60,
          },
          { status: 201 },
        );
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    const kv = memoryStorage();
    const store = createSupabaseStore(URL, 'anon', kv, {
      fetch: server,
      authStorage: memoryStorage(),
    });

    await store.signInGuest('Ana');

    expect(calls).toEqual(['POST /auth/v1/signup', 'POST /rest/v1/profiles']);
    expect(kv.getItem('codejam.sb.sessions')).toBe('[]'); // "no rounds yet" is known from now on
  });
});
