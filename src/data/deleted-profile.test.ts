// Sunday's cleanup deletes test players' profiles (docs/LIVE.md), not their anonymous logins. A
// browser that played as one of them (the demo laptop, a tester) still has a valid login and a
// cached profile. Its next rounds must still reach the board.
import { describe, expect, it, vi } from 'vitest';
import type { MoveType, Profile, SessionSummary } from '@/contracts';
import { memoryStorage, type KeyValue } from './local';
import { createSupabaseStore } from './supabase';

const URL = 'https://test.supabase.co';
const UID = '00000000-0000-4000-8000-000000000001';
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
const cachedProfile: Profile = {
  id: UID,
  displayName: 'QA-demo',
  goal: 'getMoving',
  level: 'beginner',
  weeklyGoalMin: 60,
};

function login(): KeyValue {
  const auth = memoryStorage();
  auth.setItem(
    'sb-test-auth-token',
    JSON.stringify({
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: UID, aud: 'authenticated', role: 'authenticated' },
    }),
  );
  return auth;
}

/** The live database after the cleanup: no profile row for UID until one is inserted again. */
function afterCleanup() {
  let profileRow: Record<string, unknown> | null = null;
  const sessions: string[] = [];
  const server = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.includes('/rest/v1/profiles') && method === 'GET')
      return Response.json(profileRow ? [profileRow] : []);
    if (url.includes('/rest/v1/profiles') && method === 'POST') {
      const body = JSON.parse(String(init?.body));
      profileRow = {
        goal: 'getMoving',
        level: 'beginner',
        weight_kg: null,
        weekly_goal_min: 60,
        ...(Array.isArray(body) ? body[0] : body),
      };
      return Response.json(profileRow, { status: 201 });
    }
    if (url.includes('/rest/v1/sessions') && method === 'POST') {
      if (!profileRow)
        return Response.json(
          {
            code: '23503',
            message:
              'insert or update on table "sessions" violates foreign key constraint "sessions_user_id_fkey"',
          },
          { status: 409 },
        );
      const rows = JSON.parse(String(init?.body)) as { id: string }[];
      sessions.push(...rows.map((r) => r.id));
      return new Response(null, { status: 201 });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  return { server, sessions, profile: () => profileRow };
}

describe('a cached player whose profile was deleted on the server', () => {
  it('"Play as guest" recreates the profile, and the round reaches the server', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = afterCleanup();
    const kv = memoryStorage();
    kv.setItem('codejam.sb.profile', JSON.stringify(cachedProfile));
    const store = createSupabaseStore(URL, 'anon', kv, { fetch: db.server, authStorage: login() });

    expect(await store.getProfile()).toBeNull(); // the landing offers "Play as guest"
    await store.signInGuest('QA-demo');
    const saved = await store.saveSession(round);

    expect(db.profile()).not.toBeNull();
    expect(saved.synced).toBe(true);
    expect(db.sessions).toEqual([saved.id]);
    vi.restoreAllMocks();
  });

  it('a round queued for a deleted profile heals: the profile is recreated, the queue drains', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = afterCleanup();
    const kv = memoryStorage();
    kv.setItem('codejam.sb.profile', JSON.stringify(cachedProfile));
    // signInGuest trusted the cache (no profile fetch), so only the session insert finds out.
    const store = createSupabaseStore(URL, 'anon', kv, { fetch: db.server, authStorage: login() });

    const saved = await store.saveSession(round);

    expect(saved.synced).toBe(true);
    expect(db.sessions).toEqual([saved.id]);
    expect((db.profile() as { display_name: string }).display_name).toBe('QA-demo');
    expect(JSON.parse(kv.getItem('codejam.sb.queue') ?? '[]')).toEqual([]);
    vi.restoreAllMocks();
  });
});
