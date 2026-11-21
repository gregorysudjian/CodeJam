import { describe, expect, it } from 'vitest';
import type { MoveType, SavedSession } from '@/contracts';
import type { KeyValue } from './local';
import { createSupabaseStore } from './supabase';
import { SIGNOUT_FLUSH_TIMEOUT_MS } from './tuning';

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
