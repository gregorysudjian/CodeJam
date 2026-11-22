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
import { cleanNamePatch, nameOrGuest } from './names';
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
  READ_CACHE_AFTER_MS,
  SAVE_WAIT_MS,
  SIGNOUT_FLUSH_TIMEOUT_MS,
  SUPABASE_TIMEOUT_MS,
} from './tuning';

const KEYS = {
  queue: 'codejam.sb.queue', // sessions not yet on the server
  sessions: 'codejam.sb.sessions', // last list fetched, for offline
  profile: 'codejam.sb.profile',
  board: (w: string, m: string, d: number) => `codejam.sb.board.${w}.${m}.${d}`,
};

/**
 * Postgres errors that mean "this row will never be accepted" (a check constraint, a bad value),
 * as opposed to the network, auth or the server being down, which are worth retrying.
 */
function isRowRejected(code: string | undefined): boolean {
  return code === '23514' || code === '23502' || (code?.startsWith('22') ?? false);
}

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
  /**
   * authStorage: where the guest session lives (default localStorage; the kiosk uses memory so it
   * never touches the game tab's player). fetch: a stand-in for tests only.
   */
  options?: { fetch?: typeof fetch; authStorage?: KeyValue; sessionName?: string },
): DataStore {
  // Where supabase-js keeps the guest's session: its default key is sb-<project ref>-auth-token.
  const authStorage = options?.authStorage ?? browserStorage();
  // A different sessionName gives a separate key, and with it a separate cross-tab channel, so a
  // kiosk tab never touches the game tab's player.
  const authStorageKey = `sb-${new URL(url).hostname.split('.')[0]}-${options?.sessionName ?? 'auth'}-token`;
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: !options?.fetch,
      storageKey: authStorageKey,
      ...(options?.authStorage ? { storage: options.authStorage } : {}),
    },
    // postgrest-js retries a failed read 3 times (1 + 2 + 4 s), so offline every read would hang
    // until SUPABASE_TIMEOUT_MS. This store has its own offline path (timeout, queue, caches): fail
    // fast and use it.
    db: { retry: false },
    ...(options?.fetch ? { global: { fetch: options.fetch } } : {}),
  });

  const queue = () => readJson<SavedSession[]>(kv, KEYS.queue, []);
  const cachedSessions = () => readJson<SavedSession[]>(kv, KEYS.sessions, []);
  const cachedProfile = () => readJson<Profile | null>(kv, KEYS.profile, null);

  async function userId(): Promise<string | null> {
    try {
      // With an expired access token, getSession refreshes it over the network, with no timeout of
      // its own: a returning player on dead wifi would wait for minutes. The id does not change on
      // refresh, so the stored one is right; the refresh carries on.
      const { data } = await withTimeout(sb.auth.getSession(), READ_CACHE_AFTER_MS);
      return data.session?.user.id ?? null;
    } catch {
      return storedUserId();
    }
  }
  /** The signed-in guest's id from the stored session, with no network (see userId). */
  function storedUserId(): string | null {
    return (
      readJson<{ user?: { id?: string } } | null>(authStorage, authStorageKey, null)?.user?.id ??
      null
    );
  }

  /**
   * The network's answer if it comes within READ_CACHE_AFTER_MS, else the cached one, so a screen
   * never waits on bad wifi for what this device already knows. The request carries on and
   * refreshes the cache for next time. `fromServer` must not reject.
   */
  function fastOrCached<T>(fromServer: Promise<T>, cached: T | null): Promise<T> {
    if (cached === null) return fromServer;
    return Promise.race([
      fromServer,
      new Promise<T>((resolve) => setTimeout(() => resolve(cached), READ_CACHE_AFTER_MS)),
    ]);
  }

  // Sessions the server refused for good (a check constraint, migration 0004): never resent, and
  // saveSession must not report them as synced.
  const refused = new Set<string>();

  async function upsertSessions(rows: SessionRow[]) {
    const { error } = await withTimeout(
      sb.from('sessions').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }),
    );
    return error;
  }

  /** Push queued sessions; anything that still fails stays queued. Never throws. */
  async function sendQueue(): Promise<void> {
    try {
      const pending = queue();
      if (pending.length === 0) return;
      const uid = await userId();
      if (!uid) return;
      const sent = new Set<string>();
      const error = await upsertSessions(pending.map((s) => sessionToRow(s, uid)));
      if (!error) {
        for (const s of pending) sent.add(s.id);
      } else if (isRowRejected(error.code)) {
        // One bad row fails the whole batch, so it would block every later round in the queue
        // forever. Send them one by one and drop only the rows the server refuses.
        for (const s of pending) {
          const e = await upsertSessions([sessionToRow(s, uid)]);
          if (!e) sent.add(s.id);
          else if (isRowRejected(e.code)) {
            console.warn('The server refused a session; it is dropped.', e.message);
            refused.add(s.id);
            sent.add(s.id);
          }
        }
      } else {
        console.warn('Session sync failed; it stays queued.', error.message);
        return;
      }
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

  async function doSignIn(displayName?: string): Promise<Profile> {
    let uid = await userId();
    let isNew = false;
    if (!uid) {
      const { data, error } = await withTimeout(sb.auth.signInAnonymously());
      if (error || !data.user) throw error ?? new Error('anonymous sign-in failed');
      uid = data.user.id;
      isNew = true;
    }
    // Skip a round trip each when the answer is known: a user created a moment ago has no profile
    // yet, and a cached profile for this user was written only after the server returned the row.
    const cached = cachedProfile();
    let profile = isNew ? null : cached?.id === uid ? cached : await fetchProfile(uid);
    if (!profile) {
      const { data, error } = await withTimeout(
        sb
          .from('profiles')
          .insert({ id: uid, display_name: nameOrGuest(displayName) })
          .select('*')
          .single<ProfileRow>(),
      );
      if (error) throw error;
      profile = profileFromRow(data);
    }
    writeJson(kv, KEYS.profile, profile);
    if (isNew) writeJson(kv, KEYS.sessions, mergeQueued([])); // a new guest has no rounds yet
    void flush();
    return profile;
  }
  let signingIn: Promise<Profile> | null = null;

  const store: DataStore = {
    kind: 'supabase',

    // Throws if sign-in fails; createStore() then switches to the local store.
    // Concurrent calls (a double click, React StrictMode running an effect twice) share one sign-in:
    // two parallel anonymous sign-ins would each replace the other's session, and the loser's
    // profile insert would then fail row-level security.
    signInGuest(displayName) {
      signingIn ??= doSignIn(displayName).finally(() => (signingIn = null));
      return signingIn;
    },

    async getProfile() {
      const uid = await userId();
      if (!uid) return null;
      const cached = cachedProfile();
      const fromServer = fetchProfile(uid).then(
        (p) => {
          if (p) writeJson(kv, KEYS.profile, p);
          return p;
        },
        () => cachedProfile(),
      );
      // A returning player on bad wifi: "Continue as …" shows at once instead of after 5 s.
      return fastOrCached(fromServer, cached?.id === uid ? cached : null);
    },

    async saveProfile(rawPatch) {
      const patch = cleanNamePatch(rawPatch);
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
      // On bad wifi the coach card waits for this: give the send a moment, then answer as queued.
      // The send carries on, and anything still queued goes on the next save, list or 'online'.
      await Promise.race([flush(), new Promise((r) => setTimeout(r, SAVE_WAIT_MS))]);
      const synced = !refused.has(saved.id) && !queue().some((s) => s.id === saved.id);
      const result = { ...saved, synced };
      writeJson(kv, KEYS.sessions, mergeQueued([result, ...cachedSessions()]));
      return result;
    },

    async listSessions(limit = 50) {
      const fromCache = () => mergeQueued(cachedSessions()).slice(0, limit);
      const fromServer = (async () => {
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
          return fromCache();
        }
      })();
      // A guest plays on one device, so every round of theirs is already in the cache: on bad wifi
      // the dashboard showed "No rounds yet" for 10 s right after a round (flush, then select).
      // An empty list counts once stored: a guest created on this device starts with none.
      const known = readJson<SavedSession[] | null>(kv, KEYS.sessions, null) !== null;
      return fastOrCached(fromServer, known || queue().length > 0 ? fromCache() : null);
    },

    async getLeaderboard(workout, mode, durationSec, limit = 10) {
      const key = KEYS.board(workout, mode, durationSec);
      try {
        // The leaderboard is for signed-in players only (CONTRACTS.md); before sign-in, use the cache.
        if (!(await userId())) return readJson<LeaderboardEntry[]>(kv, key, []);
        const { data, error } = await withTimeout(
          sb
            .from('leaderboard')
            .select('*')
            .eq('workout', workout)
            .eq('mode', mode)
            .eq('duration_sec', durationSec)
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
