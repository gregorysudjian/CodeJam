// Endpoint wiring for /api/coach with a fake Supabase (lives in _lib so Vercel never deploys it).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../coach';

const USER = {
  id: '00000000-0000-4000-8000-0000000000cc',
  aud: 'authenticated',
  role: 'authenticated',
};
const SESSION_ID = '00000000-0000-4000-8000-0000000000dd';

/** Fake Supabase: answers the auth check, the rate-limit claim and the history queries. */
function fakeSupabase(claim: boolean | 'error') {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/auth/v1/user')) return Response.json(USER);
    if (url.includes('/rest/v1/rpc/claim_coach_slot')) {
      return claim === 'error'
        ? Response.json({ message: 'boom' }, { status: 500 })
        : Response.json(claim);
    }
    if (url.includes('/rest/v1/profiles')) return Response.json([]);
    if (url.includes('/rest/v1/sessions')) return Response.json([]);
    if (url.includes('anthropic.com')) throw new Error('Claude must not be called in these tests');
    return new Response(null, { status: 404 });
  });
  return { fetchMock, calls };
}

const request = () =>
  new Request('https://app.test/api/coach', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: SESSION_ID }),
  });

describe('POST /api/coach rate limit', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('answers 429 with Retry-After when the user called less than 10 s ago, before any other work', async () => {
    const { fetchMock, calls } = fakeSupabase(false);
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(request());

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('10');
    expect(calls.some((u) => u.includes('/rest/v1/sessions'))).toBe(false); // no history loaded
    expect(calls.some((u) => u.includes('anthropic.com'))).toBe(false); // no Claude call
  });

  it('fails closed (503) if the rate-limit check itself errors', async () => {
    const { fetchMock, calls } = fakeSupabase('error');
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(request());

    expect(res.status).toBe(503);
    expect(calls.some((u) => u.includes('anthropic.com'))).toBe(false);
  });

  it('goes on to the normal checks when a slot is claimed (here: unknown session, 404)', async () => {
    const { fetchMock, calls } = fakeSupabase(true);
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(request());

    expect(res.status).toBe(404);
    expect(calls.some((u) => u.includes('/rest/v1/rpc/claim_coach_slot'))).toBe(true);
  });
});
