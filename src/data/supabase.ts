// Supabase store: anonymous guest sign-in, profiles, sessions, leaderboard, AI coach.
// saveSession and getCoachAdvice never reject (AGENTS.md rule 7): sessions that cannot reach the
// server wait in a local queue and are retried; the coach falls back to the rules.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  CoachAdvice,
  DataStore,
  LeaderboardEntry,
  Profile,
  SavedSession,
  SessionSummary,
} from '@/contracts';
import { ruleBasedAdvice } from './coach';
import { browserStorage, guestName, readJson, writeJson, type KeyValue } from './local';
import {
  isCoachAdvice,
  leaderboardFromRow,
  profileFromRow,
  profilePatchToRow,
  sessionFromRow,
  sessionToRow,
  type LeaderboardRow,
  type ProfileRow,
  type SessionRow,
} from './mapping';
import {
  COACH_CLIENT_TIMEOUT_MS,
  DEFAULT_WEEKLY_GOAL_MIN,
  SIGNOUT_FLUSH_TIMEOUT_MS,
  SUPABASE_TIMEOUT_MS,
} from './tuning';

const KEYS = {
  queue: 'codejam.sb.queue', // sessions not yet on the server
  sessions: 'codejam.sb.sessions', // last list fetched, for offline
  profile: 'codejam.sb.profile',
  board: (w: string, m: string) => `codejam.sb.board.${w}.${m}`,
};

function withTimeout<T>(p: PromiseLike<T>, ms = SUPABASE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(p).then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export function createSupabaseStore(
  url: string,
  anonKey: string,
  kv: KeyValue | null = browserStorage(),
  /** Test hooks only: a stand-in fetch and auth storage. The app never passes these. */
  testing?: { fetch?: typeof fetch; authStorage?: KeyValue },
): DataStore {
  // Where supabase-js keeps the guest's session: its default key is sb-<project ref>-auth-token.
  const authStorage = testing?.authStorage ?? browserStorage();
  const authStorageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: !testing,
      storageKey: authStorageKey,
      ...(testing?.authStorage ? { storage: testing.authStorage } : {}),
    },
    ...(testing?.fetch ? { global: { fetch: testing.fetch } } : {}),
  });

  const queue = () => readJson<SavedSession[]>(kv, KEYS.queue, []);
  const cachedSessions = () => readJson<SavedSession[]>(kv, KEYS.sessions, []);
  const cachedProfile = () => readJson<Profile | null>(kv, KEYS.profile, null);

  async function userId(): Promise<string | null> {
    const { data } = await sb.auth.getSession();
    return data.session?.user.id ?? null;
  }

  /** Push queued sessions; anything that still fails stays queued. Never throws. */
  async function sendQueue(): Promise<void> {
    try {
      const pending = queue();
      if (pending.length === 0) return;
      const uid = await userId();
      if (!uid) return;
      const { error } = await withTimeout(
        sb.from('sessions').upsert(
          pending.map((s) => sessionToRow(s, uid)),
          { onConflict: 'id', ignoreDuplicates: true },
        ),
      );
      if (error) {
        console.warn('Session sync failed; it stays queued.', error.message);
        return;
      }
      const sent = new Set(pending.map((s) => s.id));
      writeJson(
        kv,
        KEYS.queue,
        queue().filter((s) => !sent.has(s.id)),
      );
    } catch {
      // Still offline; try again on the next save, list or 'online' event.
    }
  }
  // One flush at a time. The marker is cleared in .finally(), which always runs after this
  // assignment (clearing it inside sendQueue would run first when the queue is empty and leave
  // the marker stuck, so no later flush would ever send anything).
  let flushing: Promise<void> | null = null;
  function flush(): Promise<void> {
    if (!flushing) flushing = sendQueue().finally(() => (flushing = null));
    return flushing;
  }
  if (typeof window !== 'undefined') window.addEventListener('online', () => void flush());

  async function fetchProfile(uid: string): Promise<Profile | null> {
    const { data, error } = await withTimeout(
      sb.from('profiles').select('*').eq('id', uid).maybeSingle<ProfileRow>(),
    );
    if (error) throw error;
    return data ? profileFromRow(data) : null;
  }

  /** Sessions the server has, plus any still queued, newest first. */
  function mergeQueued(list: SavedSession[]): SavedSession[] {
    const ids = new Set(list.map((s) => s.id));
    return [...queue().filter((s) => !ids.has(s.id)), ...list].sort((a, b) => b.at - a.at);
  }

  const store: DataStore = {
    kind: 'supabase',

    // Throws if sign-in fails; createStore() then switches to the local store.
    async signInGuest(displayName) {
      let uid = await userId();
      if (!uid) {
        const { data, error } = await withTimeout(sb.auth.signInAnonymously());
        if (error || !data.user) throw error ?? new Error('anonymous sign-in failed');
        uid = data.user.id;
      }
      let profile = await fetchProfile(uid);
      if (!profile) {
        const { data, error } = await withTimeout(
          sb
            .from('profiles')
            .insert({ id: uid, display_name: displayName?.trim().slice(0, 40) || guestName() })
            .select('*')
            .single<ProfileRow>(),
        );
        if (error) throw error;
        profile = profileFromRow(data);
      }
      writeJson(kv, KEYS.profile, profile);
      void flush();
      return profile;
    },

    async getProfile() {
      try {
        const uid = await userId();
        if (!uid) return null;
        const p = await fetchProfile(uid);
        if (p) writeJson(kv, KEYS.profile, p);
        return p;
      } catch {
        return cachedProfile();
      }
    },

    async saveProfile(patch) {
      const uid = await userId();
      const base: Profile = cachedProfile() ?? {
        id: uid ?? 'offline',
        displayName: guestName(),
        goal: 'getMoving',
        level: 'beginner',
        weeklyGoalMin: DEFAULT_WEEKLY_GOAL_MIN,
      };
      const fallback: Profile = { ...base, ...patch };
      if (!uid) return fallback;
      try {
        const { data, error } = await withTimeout(
          sb
            .from('profiles')
            .update(profilePatchToRow(patch))
            .eq('id', uid)
            .select('*')
            .single<ProfileRow>(),
        );
        if (error) throw error;
        const p = profileFromRow(data);
        writeJson(kv, KEYS.profile, p);
        return p;
      } catch {
        writeJson(kv, KEYS.profile, fallback);
        return fallback;
      }
    },

    async saveSession(summary: SessionSummary) {
      const saved: SavedSession = {
        ...summary,
        id: crypto.randomUUID(),
        at: Date.now(),
        synced: false,
      };
      writeJson(kv, KEYS.queue, [...queue(), saved]);
      await flush();
      const synced = !queue().some((s) => s.id === saved.id);
      const result = { ...saved, synced };
      writeJson(kv, KEYS.sessions, mergeQueued([result, ...cachedSessions()]));
      return result;
    },

    async listSessions(limit = 50) {
      await flush();
      try {
        const { data, error } = await withTimeout(
          sb
            .from('sessions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit)
            .returns<SessionRow[]>(),
        );
        if (error) throw error;
        const list = mergeQueued(data.map(sessionFromRow)).slice(0, limit);
        writeJson(kv, KEYS.sessions, list);
        return list;
      } catch {
        return mergeQueued(cachedSessions()).slice(0, limit);
      }
    },

    async getLeaderboard(workout, mode, limit = 10) {
      const key = KEYS.board(workout, mode);
      try {
        // The leaderboard is for signed-in players only (CONTRACTS.md); before sign-in, use the cache.
        if (!(await userId())) return readJson<LeaderboardEntry[]>(kv, key, []);
        const { data, error } = await withTimeout(
          sb
            .from('leaderboard')
            .select('*')
            .eq('workout', workout)
            .eq('mode', mode)
            .order('score', { ascending: false })
            .limit(limit)
            .returns<LeaderboardRow[]>(),
        );
        if (error) throw error;
        const rows = data.map(leaderboardFromRow);
        writeJson(kv, key, rows);
        return rows;
      } catch {
        return readJson<LeaderboardEntry[]>(kv, key, []);
      }
    },

    async getCoachAdvice(session: SavedSession): Promise<CoachAdvice> {
      const rules = () => {
        const others = cachedSessions().filter((s) => s.id !== session.id);
        return ruleBasedAdvice(cachedProfile(), [session, ...others]);
      };
      // The server can only coach sessions it has.
      if (!session.synced) return rules();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), COACH_CLIENT_TIMEOUT_MS);
      try {
        const { data } = await sb.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return rules();
        const res = await fetch('/api/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId: session.id }),
          signal: controller.signal,
        });
        if (!res.ok) return rules();
        const advice: unknown = await res.json();
        return isCoachAdvice(advice) ? advice : rules();
      } catch {
        return rules();
      } finally {
        clearTimeout(timer);
      }
    },

    // Never rejects. Sends queued sessions first (they belong to the guest who is leaving), then
    // signs out locally, which needs no network, and forgets everything cached for that guest.
    async signOut() {
      // On bad wifi the flush can hang; never make "New guest" wait more than a moment for it.
      // Sessions that did not make it are dropped with the guest (they cannot move to the next one).
      await Promise.race([flush(), new Promise((r) => setTimeout(r, SIGNOUT_FLUSH_TIMEOUT_MS))]);
      // Not sb.auth.signOut(): even with scope 'local' it calls the server's logout endpoint with
      // no timeout and holds the auth lock meanwhile, so on bad wifi "New guest" (and the next
      // sign-in, waiting on that lock) could hang for minutes. Removing the stored session signs
      // the guest out on this device with no network; anonymous guests lose nothing by skipping
      // the server-side logout. getSession() reads this storage, so the next signInGuest() starts
      // a new user.
      for (const [storage, key] of [
        [authStorage, authStorageKey],
        [kv, KEYS.profile],
        [kv, KEYS.sessions],
        [kv, KEYS.queue],
      ] as const) {
        try {
          storage?.removeItem(key);
        } catch {
          // Storage blocked.
        }
      }
    },
  };
  return store;
}
