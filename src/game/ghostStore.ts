import { isBetter, parseGhost, type GhostRun } from './ghost';
import * as T from './tuning';

/**
 * Where ghosts live: the browser's localStorage, on this device only. Keys are
 * `game.ghost.<fingerprint>`, plus `game.ghost.index` listing the fingerprints, most recent
 * first, so only the last GHOST_MAX_STORED levels are kept. Every access is guarded: private
 * mode, a full storage or corrupt data means no ghost, never a crash.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length?: number;
  key?(index: number): string | null;
}

export interface GhostStore {
  /** The stored ghost for this level, or null (none, unreadable, or for another level). */
  load(fingerprint: string): GhostRun | null;
  /** Stores `run` if it beats the stored one. Returns true when it was written. */
  saveIfBetter(run: GhostRun): boolean;
  /** Removes every stored ghost (`?ghost=reset`). */
  clear(): void;
}

const PREFIX = 'game.ghost.';
const INDEX_KEY = `${PREFIX}index`;

export function createGhostStore(storage: StorageLike | null): GhostStore {
  const readIndex = (): string[] => {
    try {
      const list: unknown = JSON.parse(storage?.getItem(INDEX_KEY) ?? '[]');
      return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };

  const load = (fingerprint: string): GhostRun | null => {
    try {
      return parseGhost(storage?.getItem(PREFIX + fingerprint) ?? null, fingerprint);
    } catch {
      return null;
    }
  };

  return {
    load,
    saveIfBetter(run) {
      if (!storage) return false;
      if (!isBetter(run.result, load(run.fingerprint)?.result)) return false;
      try {
        storage.setItem(PREFIX + run.fingerprint, JSON.stringify(run));
        const index = [run.fingerprint, ...readIndex().filter((f) => f !== run.fingerprint)];
        for (const old of index.slice(T.GHOST_MAX_STORED)) storage.removeItem(PREFIX + old);
        storage.setItem(INDEX_KEY, JSON.stringify(index.slice(0, T.GHOST_MAX_STORED)));
        return true;
      } catch {
        return false; // full or blocked storage: play on without saving
      }
    },
    clear() {
      if (!storage) return;
      try {
        // Every ghost key, also ones a lost index no longer lists.
        const keys = new Set(readIndex().map((f) => PREFIX + f));
        for (let i = 0; i < (storage.length ?? 0); i++) {
          const k = storage.key?.(i);
          if (k?.startsWith(PREFIX)) keys.add(k);
        }
        for (const k of keys) storage.removeItem(k);
        storage.removeItem(INDEX_KEY);
      } catch {
        // nothing more to do
      }
    },
  };
}

/** The browser's localStorage, or null where it is unavailable (some private modes throw). */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
