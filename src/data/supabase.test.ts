import { describe, expect, it, vi } from 'vitest';
import type { LeaderboardEntry, MoveType, SavedSession } from '@/contracts';
import type { KeyValue } from './local';
import { createSupabaseStore } from './supabase';
import { SIGNOUT_FLUSH_TIMEOUT_MS, SUPABASE_TIMEOUT_MS } from './tuning';

const URL = 'https://test.supabase.co';
const AUTH_KEY = 'sb-test-auth-token'; // supabase-js storage key for this URL

function memory(): KeyValue & { dump(): Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

/** A signed-in guest whose token is still valid, so no network is needed to read it. */
function signedInStorage() {
  const auth = memory();
  auth.setItem(
    AUTH_KEY,
    JSON.stringify({
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        aud: 'authenticated',
        role: 'authenticated',
      },
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
const queued: SavedSession = {
  id: '00000000-0000-4000-8000-0000000000aa',
  at: Date.now(),
  synced: false,
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

function storeWith(fetchImpl: typeof fetch) {
  const kv = memory();
  kv.setItem('codejam.sb.queue', JSON.stringify([queued]));
  kv.setItem('codejam.sb.profile', JSON.stringify({ id: 'x', displayName: 'Leaving' }));
  const auth = signedInStorage();
  const store = createSupabaseStore(URL, 'anon', kv, { fetch: fetchImpl, authStorage: auth });
  return { store, kv, auth };
}

describe('supabase store signInGuest', () => {
  it('shares one sign-in between concurrent calls (double click, StrictMode)', async () => {
    const userId = '00000000-0000-4000-8000-0000000000bb';
    let signups = 0;
    const fakeServer = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/auth/v1/signup')) {
        signups++;
        return Response.json({
          access_token: 'tok',
          refresh_token: 'ref',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: userId, aud: 'authenticated', role: 'authenticated', is_anonymous: true },
        });
      }
      if (url.includes('/rest/v1/profiles') && method === 'GET') return Response.json([]);
      if (url.includes('/rest/v1/profiles') && method === 'POST') {
        return Response.json(
          {
            id: userId,
            display_name: 'Kiosk',
            goal: 'getMoving',
            level: 'beginner',
            weight_kg: null,
            weekly_goal_min: 60,
          },
          { status: 201 },
        );
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    const store = createSupabaseStore(URL, 'anon', memory(), {
      fetch: fakeServer,
      authStorage: memory(),
    });

    const [a, b] = await Promise.all([store.signInGuest('Kiosk'), store.signInGuest('Kiosk')]);

    expect(signups).toBe(1);
    expect(a.id).toBe(userId);
    expect(b.id).toBe(userId);
  });
});

describe('supabase store signOut', () => {
  it('does not hang on bad wifi: gives up on the queue after the cap and still signs out', async () => {
    const neverAnswers = (() => new Promise<Response>(() => {})) as typeof fetch;
    const { store, kv, auth } = storeWith(neverAnswers);

    const t0 = Date.now();
    await store.signOut();
    const ms = Date.now() - t0;

    expect(ms).toBeGreaterThanOrEqual(SIGNOUT_FLUSH_TIMEOUT_MS - 50);
    expect(ms).toBeLessThan(SIGNOUT_FLUSH_TIMEOUT_MS + 1000);
    expect(kv.dump()).toEqual({}); // profile, cached sessions and queue forgotten
    expect(auth.getItem(AUTH_KEY)).toBeNull(); // the guest is signed out
  }, 10_000);

  it('on good wifi sends the queued round first, without waiting for the cap', async () => {
    const sent: string[] = [];
    const answers = (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(`${init?.method ?? 'GET'} ${String(input)}`);
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    const { store, kv } = storeWith(answers);

    const t0 = Date.now();
    await store.signOut();

    expect(Date.now() - t0).toBeLessThan(SIGNOUT_FLUSH_TIMEOUT_MS);
    expect(sent.some((r) => r.startsWith('POST') && r.includes('/rest/v1/sessions'))).toBe(true);
    expect(kv.dump()).toEqual({});
  });
});

// The venue wifi drops out or hangs: every call must still answer, from the queue and the caches.
describe('supabase store offline', () => {
  const offline = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
  const summary = { ...queued, id: undefined, at: undefined, synced: undefined };

  it('saveSession keeps the round in the queue, and listSessions still shows it', async () => {
    const { store, kv } = storeWith(offline);

    const saved = await store.saveSession(summary);

    expect(saved.synced).toBe(false);
    const ids = JSON.parse(kv.getItem('codejam.sb.queue') ?? '[]').map((s: SavedSession) => s.id);
    expect(ids).toEqual([queued.id, saved.id]);
    const list = await store.listSessions();
    expect(list.map((s) => s.id)).toEqual([saved.id, queued.id]); // newest first
  });

  it('saveSession gives up on a hanging network after the timeout instead of waiting forever', async () => {
    const neverAnswers = (() => new Promise<Response>(() => {})) as typeof fetch;
    const { store } = storeWith(neverAnswers);

    const t0 = Date.now();
    const saved = await store.saveSession(summary);

    expect(saved.synced).toBe(false);
    expect(Date.now() - t0).toBeLessThan(SUPABASE_TIMEOUT_MS + 1000);
  }, 10_000);

  it('getCoachAdvice falls back to the rules when /api/coach cannot be reached', async () => {
    const { store } = storeWith(offline);
    vi.stubGlobal('fetch', offline); // the coach call uses the page's fetch
    try {
      const advice = await store.getCoachAdvice({ ...queued, synced: true });
      expect(advice.source).toBe('rules');
      expect(advice.recap.length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('getLeaderboard answers from the last board it fetched', async () => {
    const { store, kv } = storeWith(offline);
    const cached: LeaderboardEntry[] = [
      { displayName: 'Ana', score: 900, workout: 'fullBody', mode: 'floor', at: 1 },
    ];
    kv.setItem('codejam.sb.board.fullBody.floor', JSON.stringify(cached));

    expect(await store.getLeaderboard('fullBody', 'floor')).toEqual(cached);
    expect(await store.getLeaderboard('legs', 'floor')).toEqual([]);
  });
});
