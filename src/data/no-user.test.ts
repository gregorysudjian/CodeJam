import { describe, expect, it } from 'vitest';
import type { KeyValue } from './local';
import { createSupabaseStore } from './supabase';

function memory(): KeyValue {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('supabase store before sign-in (a fresh landing)', () => {
  it('listSessions answers from the cache without asking the server (no 401 in the console)', async () => {
    const requests: string[] = [];
    const fakeFetch = (async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return new Response('{}', { status: 401 });
    }) as typeof fetch;
    const store = createSupabaseStore('https://test.supabase.co', 'anon', memory(), {
      fetch: fakeFetch,
      authStorage: memory(), // nobody signed in
    });
    expect(await store.listSessions()).toEqual([]);
    expect(requests.filter((u) => u.includes('/rest/v1/sessions'))).toEqual([]);
  });
});
