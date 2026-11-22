import { describe, expect, it } from 'vitest';
import { createLocalStore, type KeyValue } from './local';
import { friendBoardFromRow } from './mapping';
import { isNameTaken, withNameSuffix } from './names';
import { createSupabaseStore } from './supabase';
import { NAME_MAX_LENGTH } from './tuning';

const URL = 'https://test.supabase.co';
const UID = '00000000-0000-4000-8000-000000000001';

function memory(): KeyValue {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}
function signedIn(): KeyValue {
  const auth = memory();
  auth.setItem(
    'sb-test-auth-token',
    JSON.stringify({
      access_token: 'test-token',
      refresh_token: 'r',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: UID, aud: 'authenticated', role: 'authenticated' },
    }),
  );
  return auth;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const taken = () =>
  json(
    {
      code: '23505',
      message: 'duplicate key value violates unique constraint "profiles_display_name_unique"',
      details: null,
      hint: null,
    },
    409,
  );
const row = (name: string) => ({
  id: UID,
  display_name: name,
  goal: 'cardio',
  level: 'regular',
  weight_kg: null,
  weekly_goal_min: 60,
});

/** A store whose server answers each request with the next function in `answers`. */
function storeWith(answers: ((url: string, body: string) => Response)[]) {
  const seen: { url: string; body: string }[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? init.body : '';
    seen.push({ url, body });
    const answer = answers.shift();
    if (!answer) throw new Error(`unexpected request ${url}`);
    return answer(url, body);
  }) as typeof fetch;
  const store = createSupabaseStore(URL, 'anon', memory(), {
    fetch: fakeFetch,
    authStorage: signedIn(),
  });
  return { store, seen };
}

describe('names: unique usernames (migration 0007)', () => {
  it('a suffixed name stays within the length limit and keeps the start of the name', () => {
    const long = 'Abcdefghijklmnopqrst'; // 20, the limit
    const s = withNameSuffix(long);
    expect([...s].length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
    expect(s).toMatch(/^Abcdefghijklmno-\d{4}$/);
    expect(withNameSuffix('Alex')).toMatch(/^Alex-\d{4}$/);
  });

  it('only a unique violation on the username counts as taken', () => {
    expect(isNameTaken({ code: '23505', message: 'profiles_display_name_unique' })).toBe(true);
    expect(isNameTaken({ code: '23505', message: 'profiles_pkey' })).toBe(false);
    expect(isNameTaken({ code: '23514', message: 'display_name check' })).toBe(false);
    expect(isNameTaken(null)).toBe(false);
  });
});

describe('supabase store: a taken username never fails a save', () => {
  it('saveProfile retries with a suffix and returns the name actually stored', async () => {
    const { store, seen } = storeWith([
      () => taken(),
      (_u, body) => json(row((JSON.parse(body) as { display_name: string }).display_name)),
    ]);
    const p = await store.saveProfile({ displayName: 'Alex' });
    expect(seen).toHaveLength(2);
    expect(JSON.parse(seen[0]!.body).display_name).toBe('Alex');
    expect(p.displayName).toMatch(/^Alex-\d{4}$/);
  });

  it('saveProfile without a name change sends one request', async () => {
    const { store, seen } = storeWith([() => json(row('Alex'))]);
    await store.saveProfile({ goal: 'cardio' });
    expect(seen).toHaveLength(1);
  });
});

describe('supabase store: friends', () => {
  it('isUsernameTaken asks the server with the cleaned name', async () => {
    const { store, seen } = storeWith([() => json(true), () => json(false)]);
    expect(await store.isUsernameTaken('  Alex ')).toBe(true);
    expect(seen[0]!.url).toContain('/rest/v1/rpc/username_taken');
    expect(JSON.parse(seen[0]!.body)).toEqual({ p_name: 'Alex' });
    expect(await store.isUsernameTaken('Sam')).toBe(false);
  });

  it('isUsernameTaken is null (unknown) for an empty name or a server error', async () => {
    const { store } = storeWith([() => json({ message: 'boom' }, 500)]);
    expect(await store.isUsernameTaken('   ')).toBeNull();
    expect(await store.isUsernameTaken('Alex')).toBeNull();
  });

  it('addFriend maps every server status', async () => {
    const { store } = storeWith([
      () => json([{ status: 'ok', display_name: 'Alex' }]),
      () => json([{ status: 'already', display_name: 'Alex' }]),
      () => json([{ status: 'self', display_name: 'Me' }]),
      () => json([{ status: 'notFound', display_name: null }]),
      () => json([{ status: 'limit', display_name: 'Zed' }]),
      () => json({ message: 'down' }, 503),
    ]);
    expect(await store.addFriend('alex')).toEqual({ ok: true, displayName: 'Alex' });
    expect(await store.addFriend('alex')).toEqual({ ok: false, reason: 'already' });
    expect(await store.addFriend('me')).toEqual({ ok: false, reason: 'self' });
    expect(await store.addFriend('nobody')).toEqual({ ok: false, reason: 'notFound' });
    expect(await store.addFriend('zed')).toEqual({ ok: false, reason: 'limit' });
    expect(await store.addFriend('alex')).toEqual({ ok: false, reason: 'offline' });
  });

  it('addFriend never rejects when the network is down', async () => {
    const { store } = storeWith([
      () => {
        throw new TypeError('Failed to fetch');
      },
    ]);
    await expect(store.addFriend('alex')).resolves.toEqual({ ok: false, reason: 'offline' });
  });

  it('getFriendsBoard maps rows, keeps the server order and marks your own row', async () => {
    const { store, seen } = storeWith([
      () =>
        json([
          { display_name: 'Alex', score: 9000, created_at: '2026-11-22T07:00:00Z', is_me: false },
          { display_name: 'Me', score: 8000, created_at: '2026-11-22T06:00:00Z', is_me: true },
        ]),
    ]);
    const board = await store.getFriendsBoard('fullBody', 'floor', 180);
    expect(JSON.parse(seen[0]!.body)).toMatchObject({
      p_workout: 'fullBody',
      p_mode: 'floor',
      p_duration: 180,
    });
    expect(board.map((e) => [e.displayName, e.score, e.isMe])).toEqual([
      ['Alex', 9000, false],
      ['Me', 8000, true],
    ]);
    expect(board[0]).toMatchObject({ workout: 'fullBody', mode: 'floor', durationSec: 180 });
  });

  it('listFriends and getFriendsBoard are empty on a server error', async () => {
    const { store } = storeWith([() => json({}, 500), () => json({}, 500)]);
    expect(await store.listFriends()).toEqual([]);
    expect(await store.getFriendsBoard('legs', 'floor', 180)).toEqual([]);
  });
});

describe('local store: no friends without the server', () => {
  it('answers unknown, offline and empty', async () => {
    const s = createLocalStore(memory());
    expect(await s.isUsernameTaken('Alex')).toBeNull();
    expect(await s.addFriend('Alex')).toEqual({ ok: false, reason: 'offline' });
    expect(await s.listFriends()).toEqual([]);
    expect(await s.getFriendsBoard('legs', 'floor', 180)).toEqual([]);
  });
});

describe('mapping: friends board row', () => {
  it('cleans the name on the way out', () => {
    const e = friendBoardFromRow(
      { display_name: '‮evil', score: 10, created_at: '2026-11-22T07:00:00Z', is_me: false },
      'arms',
      'treadmill',
      180,
    );
    expect(e.displayName).not.toContain('‮');
  });
});
