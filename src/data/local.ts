// localStorage store: `?store=local`, missing Supabase env vars, or a failed guest sign-in.
// Also the shape the Supabase store falls back to for its offline cache.
import type {
  DataStore,
  LeaderboardEntry,
  Profile,
  SavedSession,
  SessionSummary,
} from '@/contracts';
import { ruleBasedAdvice } from './coach';
import { DEFAULT_WEEKLY_GOAL_MIN, LOCAL_MAX_SESSIONS } from './tuning';

/** The subset of the Web Storage API we use; injectable for tests. */
export type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readJson<T>(kv: KeyValue | null, key: string, fallback: T): T {
  try {
    const raw = kv?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(kv: KeyValue | null, key: string, value: unknown): void {
  try {
    kv?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: keep going, the round is still on screen.
  }
}

/** localStorage, or null where it is blocked (private mode, some embeds). */
export function browserStorage(): KeyValue | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** In-memory storage: nothing survives a reload. */
export function memoryStorage(): KeyValue {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

export function guestName(): string {
  return `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
}

const KEYS = { profile: 'codejam.local.profile', sessions: 'codejam.local.sessions' };

export function createLocalStore(kv: KeyValue | null = browserStorage()): DataStore {
  const sessions = () => readJson<SavedSession[]>(kv, KEYS.sessions, []);
  const profile = () => readJson<Profile | null>(kv, KEYS.profile, null);

  const newProfile = (displayName?: string): Profile => ({
    id: crypto.randomUUID(),
    displayName: displayName?.trim() || guestName(),
    goal: 'getMoving',
    level: 'beginner',
    weeklyGoalMin: DEFAULT_WEEKLY_GOAL_MIN,
  });

  return {
    kind: 'local',
    async signInGuest(displayName) {
      const existing = profile();
      if (existing) return existing;
      const p = newProfile(displayName);
      writeJson(kv, KEYS.profile, p);
      return p;
    },
    async getProfile() {
      return profile();
    },
    async saveProfile(patch) {
      const p: Profile = { ...(profile() ?? newProfile()), ...patch };
      writeJson(kv, KEYS.profile, p);
      return p;
    },
    async saveSession(summary: SessionSummary) {
      const saved: SavedSession = {
        ...summary,
        id: crypto.randomUUID(),
        at: Date.now(),
        // Nothing waits in a queue here (CONTRACTS: false only while queued), so no "NOT SYNCED" tag.
        synced: true,
      };
      writeJson(kv, KEYS.sessions, [saved, ...sessions()].slice(0, LOCAL_MAX_SESSIONS));
      return saved;
    },
    async listSessions(limit = 50) {
      return sessions().slice(0, limit);
    },
    async getLeaderboard(workout, mode, limit = 10) {
      const name = profile()?.displayName ?? 'You';
      return sessions()
        .filter((s) => s.config.workout === workout && s.config.mode === mode)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map<LeaderboardEntry>((s) => ({
          displayName: name,
          score: s.score,
          workout,
          mode,
          at: s.at,
        }));
    },
    async getCoachAdvice() {
      return ruleBasedAdvice(profile(), sessions());
    },
    async signOut() {
      try {
        kv?.removeItem(KEYS.profile);
        kv?.removeItem(KEYS.sessions);
      } catch {
        // Storage blocked: nothing was saved, so nothing to forget.
      }
    },
  };
}
