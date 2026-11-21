import { describe, expect, it } from 'vitest';
import type { GhostResult, GhostRun } from './ghost';
import { createGhostStore, type StorageLike } from './ghostStore';
import { GHOST_MAX_STORED } from './tuning';

/** In-memory localStorage stand-in. `full` makes writes throw, like a full quota. */
function fakeStorage(opts: { full?: boolean } = {}) {
  const map = new Map<string, string>();
  const storage: StorageLike & { map: Map<string, string> } = {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (opts.full) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
  };
  return storage;
}

const result = (cleared: number, collected = 0, hit = 0): GhostResult => ({
  cleared,
  collected,
  hit,
});
const run = (fingerprint: string, res: GhostResult, samples = 'BBCC'): GhostRun => ({
  v: 1,
  fingerprint,
  hz: 20,
  samples,
  result: res,
  savedAt: 1,
});

describe('ghost store', () => {
  it('saves the first run and loads it back', () => {
    const store = createGhostStore(fakeStorage());
    expect(store.load('lv')).toBeNull();
    expect(store.saveIfBetter(run('lv', result(5)))).toBe(true);
    expect(store.load('lv')).toEqual(run('lv', result(5)));
  });

  it('only replaces a stored ghost with a better run', () => {
    const store = createGhostStore(fakeStorage());
    store.saveIfBetter(run('lv', result(5)));
    expect(store.saveIfBetter(run('lv', result(4), 'XXXX'))).toBe(false);
    expect(store.saveIfBetter(run('lv', result(5), 'XXXX'))).toBe(false); // a tie keeps the first
    expect(store.load('lv')?.samples).toBe('BBCC');
    expect(store.saveIfBetter(run('lv', result(6), 'DDDD'))).toBe(true);
    expect(store.load('lv')?.samples).toBe('DDDD');
  });

  it(`keeps only the ${GHOST_MAX_STORED} most recent levels`, () => {
    const s = fakeStorage();
    const store = createGhostStore(s);
    for (let i = 0; i < GHOST_MAX_STORED + 3; i++) store.saveIfBetter(run(`lv${i}`, result(1)));
    expect(store.load('lv0')).toBeNull();
    expect(store.load('lv2')).toBeNull();
    expect(store.load('lv3')).not.toBeNull();
    expect(store.load(`lv${GHOST_MAX_STORED + 2}`)).not.toBeNull();
    const ghostKeys = [...s.map.keys()].filter((k) => k !== 'game.ghost.index');
    expect(ghostKeys).toHaveLength(GHOST_MAX_STORED);
  });

  it('treats corrupt data as no ghost and recovers on the next save', () => {
    const s = fakeStorage();
    s.map.set('game.ghost.lv', '{not json');
    s.map.set('game.ghost.index', '"not a list"');
    const store = createGhostStore(s);
    expect(store.load('lv')).toBeNull();
    expect(store.saveIfBetter(run('lv', result(1)))).toBe(true);
    expect(store.load('lv')).not.toBeNull();
  });

  it('never throws without storage or with a full storage', () => {
    const none = createGhostStore(null);
    expect(none.load('lv')).toBeNull();
    expect(none.saveIfBetter(run('lv', result(1)))).toBe(false);
    expect(() => none.clear()).not.toThrow();

    const full = createGhostStore(fakeStorage({ full: true }));
    expect(full.saveIfBetter(run('lv', result(1)))).toBe(false);
    expect(full.load('lv')).toBeNull();

    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const broken = createGhostStore(throwing);
    expect(broken.load('lv')).toBeNull();
    expect(broken.saveIfBetter(run('lv', result(1)))).toBe(false);
    expect(() => broken.clear()).not.toThrow();
  });

  it('clear removes every ghost, including ones a lost index no longer lists, and nothing else', () => {
    const s = fakeStorage();
    const store = createGhostStore(s);
    store.saveIfBetter(run('a', result(1)));
    store.saveIfBetter(run('b', result(1)));
    s.map.set('game.ghost.orphan', JSON.stringify(run('orphan', result(1))));
    s.map.set('game.gfx', 'low'); // another game setting: must survive
    s.map.set('sb-auth', 'x'); // the app's data: must survive
    store.clear();
    expect([...s.map.keys()].sort()).toEqual(['game.gfx', 'sb-auth']);
  });
});
