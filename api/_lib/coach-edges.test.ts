// /api/coach status codes not covered by coach.test.ts, with a fake Supabase (added by QA).
// Claude is never called: the key is empty, and a call to anthropic.com fails the test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../coach';

const USER = {
  id: '00000000-0000-4000-8000-0000000000cc',
  aud: 'authenticated',
  role: 'authenticated',
};
const SESSION_ID = '00000000-0000-4000-8000-0000000000dd';

function fakeSupabase(opts: { auth?: 'ok' | 'reject'; sessions?: unknown[] | 'error' } = {}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('anthropic.com')) throw new Error('Claude must not be called in these tests');
    if (url.includes('/auth/v1/user')) {
      return opts.auth === 'reject'
        ? Response.json({ message: 'invalid JWT' }, { status: 401 })
        : Response.json(USER);
    }
    if (url.includes('/rest/v1/rpc/claim_coach_slot')) return Response.json(true);
    if (url.includes('/rest/v1/profiles')) return Response.json([]);
    if (url.includes('/rest/v1/sessions')) {
      return opts.sessions === 'error'
        ? Response.json({ message: 'boom' }, { status: 500 })
        : Response.json(opts.sessions ?? []);
    }
    return new Response(null, { status: 404 });
  });
  return { fetchMock, calls };
}

const request = (init: { auth?: string | null; body?: string } = {}) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = init.auth === undefined ? 'Bearer user-token' : init.auth;
  if (auth !== null) headers.Authorization = auth;
  return new Request('https://app.test/api/coach', {
    method: 'POST',
    headers,
    body: init.body ?? JSON.stringify({ sessionId: SESSION_ID }),
  });
};

const sessionRow = {
  id: SESSION_ID,
  workout: 'fullBody',
  mode: 'floor',
  duration_sec: 45,
  active_sec: 45,
  difficulty: 0.5,
  score: 500,
  best_streak: 3,
  cleared: 5,
  hit: 2,
  accuracy: 0.71,
  kcal: 7,
  reps: {},
  missed: {},
  created_at: '2026-11-21T08:00:00.000Z',
};

describe('POST /api/coach: status codes', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('401 without a bearer token, before any network call', async () => {
    const { fetchMock } = fakeSupabase();
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(request({ auth: null }))).status).toBe(401);
    expect((await POST(request({ auth: 'Basic abc' }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('500 when the server has no Supabase settings', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    const { fetchMock } = fakeSupabase();
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(request())).status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400 for a body that is not JSON or has no uuid sessionId', async () => {
    const { fetchMock } = fakeSupabase();
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(request({ body: 'not json' }))).status).toBe(400);
    expect((await POST(request({ body: JSON.stringify({ sessionId: 'abc' }) }))).status).toBe(400);
    expect((await POST(request({ body: '{}' }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('401 when Supabase rejects the token, and never claims a rate-limit slot', async () => {
    const { fetchMock, calls } = fakeSupabase({ auth: 'reject' });
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(request())).status).toBe(401);
    expect(calls.some((u) => u.includes('claim_coach_slot'))).toBe(false);
  });

  it('502 when the history cannot be loaded', async () => {
    const { fetchMock } = fakeSupabase({ sessions: 'error' });
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(request())).status).toBe(502);
  });

  it('503 "coach not configured" for a real session when no Claude key is set (the demo today)', async () => {
    const { fetchMock, calls } = fakeSupabase({ sessions: [sessionRow] });
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'coach not configured' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(calls.some((u) => u.includes('anthropic.com'))).toBe(false);
  });
});
