import { describe, expect, it } from 'vitest';
import { createLocalStore, memoryStorage } from './local';
import { leaderboardFromRow, profileFromRow, profilePatchToRow } from './mapping';
import { cleanDisplayName, HIDDEN_NAME, isBlockedName } from './names';
import { createSupabaseStore } from './supabase';

const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe('cleanDisplayName: what reaches the projector', () => {
  it.each([
    ['  Ana   Lopez  ', 'Ana Lopez'], // leading, trailing and inner runs of spaces
    ['two\nlines\tand tab', 'two lines and tab'],
    [' Ana　B ', 'Ana B'], // no-break and ideographic spaces
    ['zero​width‍﻿', 'zerowidth'],
    ['Ana ‮evil', 'Ana evil'], // a right-to-left override showed the text reversed
    ['soft­hyphen', 'softhyphen'],
    ['ＡＮＡ', 'ANA'], // full-width letters
    ['W'.repeat(40), 'W'.repeat(20)],
    ['🔥🔥🔥', '🔥🔥🔥'],
    ['Guest-1234', 'Guest-1234'],
  ])('%j → %j', (raw, want) => {
    expect(cleanDisplayName(raw)).toBe(want);
  });

  it('keeps real names in every script intact', () => {
    for (const name of [
      'Zoë',
      'José',
      'Nguyễn Văn An',
      '李小龙',
      'محمد',
      'नमस्ते',
      'Ἀθηνᾶ',
      'Ólafur',
    ]) {
      expect(cleanDisplayName(name)).toBe(name.normalize('NFKC'));
    }
  });

  it('stops "Zalgo": at most 3 combining marks on a letter', () => {
    const zalgo = 'z' + '̶̷̸'.repeat(12) + 'algo';
    const out = cleanDisplayName(zalgo)!;
    expect(out).toBe('z̶̷̸algo');
  });

  it('never cuts an emoji in half (half an emoji is invalid JSON: the save failed)', () => {
    for (let n = 15; n <= 22; n++) {
      const out = cleanDisplayName('a'.repeat(n) + '😀😀😀')!;
      expect(out).not.toMatch(loneSurrogate);
      expect(Array.from(out).length).toBeLessThanOrEqual(20);
    }
    expect(cleanDisplayName('ok\uD83D')).toBe('ok'); // a lone surrogate already in the input
  });

  it.each(['', '   ', '​​', '....', '‮', '-_-'])(
    'nothing readable in %j: null (the caller uses Guest-NNNN)',
    (raw) => {
      expect(cleanDisplayName(raw)).toBeNull();
    },
  );
});

describe('isBlockedName', () => {
  it.each([
    'fuck',
    'FUCK you',
    'f u c k',
    'fuuuuck',
    'Fück',
    '𝐟𝐮𝐜𝐤', // mathematical bold letters
    'ｆｕｃｋ',
    'n1gg3r',
    'h1tl3r fan',
    'big b1tch',
    'Sh1t',
    '5hit happens',
    'nazi',
    'Nazis',
    'cunt',
    'dick',
    'the cock',
  ])('blocks %j', (name) => {
    expect(isBlockedName(name)).toBe(true);
  });

  it.each([
    'Hancock',
    'Hitchcock',
    'Dickens',
    'Dickson',
    'Nazir',
    'Scunthorpe',
    'Cassandra',
    'Essex',
    'Sussex',
    'Analia',
    'Niger',
    'Pornchai',
    'Slutsky',
    'Matsushita',
    'Grape',
    'Cumberbatch',
    'Spicer',
    'Mitchell',
    'Fukuda',
    'Shitij',
    'Therapist',
    'Ana Lisa',
  ])('lets the real name %j through', (name) => {
    expect(isBlockedName(name)).toBe(false);
    expect(cleanDisplayName(name)).toBe(name);
  });
});

describe('both stores clean the name before saving it', () => {
  it('local store: a blocked name becomes Guest-NNNN, a messy one is cleaned', async () => {
    const store = createLocalStore(memoryStorage());
    expect((await store.signInGuest('f u c k')).displayName).toMatch(/^Guest-\d{4}$/);
    expect((await store.saveProfile({ displayName: ' Ana ‮evil ' })).displayName).toBe('Ana evil');
    expect((await store.getLeaderboard('fullBody', 'floor', 45)).length).toBe(0);
  });

  it('Supabase store: the profile insert and update carry the cleaned name', async () => {
    const sent: { method: string; body: unknown }[] = [];
    const uid = '00000000-0000-4000-8000-0000000000dd';
    const row = (name: string) => ({
      id: uid,
      display_name: name,
      goal: 'getMoving',
      level: 'beginner',
      weight_kg: null,
      weekly_goal_min: 60,
    });
    const server = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/auth/v1/signup'))
        return Response.json({
          access_token: 'tok',
          refresh_token: 'ref',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: uid, aud: 'authenticated', role: 'authenticated', is_anonymous: true },
        });
      if (url.includes('/rest/v1/profiles') && method === 'GET') return Response.json([]);
      if (url.includes('/rest/v1/profiles')) {
        const body = JSON.parse(String(init?.body));
        sent.push({ method, body });
        return Response.json(row(body.display_name), { status: method === 'POST' ? 201 : 200 });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    const store = createSupabaseStore('https://test.supabase.co', 'anon', memoryStorage(), {
      fetch: server,
      authStorage: memoryStorage(),
    });

    await store.signInGuest('Fück​');
    await store.saveProfile({ displayName: 'Ana ‮evil' + '!'.repeat(30) });

    expect((sent[0].body as { display_name: string }).display_name).toMatch(/^Guest-\d{4}$/);
    expect(sent[1]).toEqual({
      method: 'PATCH',
      body: { display_name: 'Ana evil' + '!'.repeat(12) },
    });
  });
});

describe('names read back are cleaned too (stored before this fix, or sent to the REST API)', () => {
  const at = '2026-11-21T20:00:00Z';
  const board = (display_name: string) =>
    leaderboardFromRow({
      display_name,
      workout: 'fullBody',
      mode: 'floor',
      score: 1,
      created_at: at,
      duration_sec: 45,
    }).displayName;

  it('the leaderboard never shows a bidi override, a 40-letter word or a blocked name', () => {
    expect(board('Ana ‮evil text')).toBe('Ana evil text');
    expect(board('W'.repeat(40))).toBe('W'.repeat(20));
    expect(board('fuuuck')).toBe(HIDDEN_NAME);
    expect(board('Hancock')).toBe('Hancock');
  });

  it('the player sees the same cleaned name, so the board still marks their row "YOU"', () => {
    const stored = 'Ana ‮evil text';
    const p = profileFromRow({
      id: 'x',
      display_name: stored,
      goal: 'getMoving',
      level: 'beginner',
      weight_kg: null,
      weekly_goal_min: 60,
    });
    expect(p.displayName).toBe(board(stored));
  });

  it('a profile patch is cleaned before it is sent', () => {
    expect(profilePatchToRow({ displayName: ' a​b ' })).toEqual({ display_name: 'ab' });
  });
});
