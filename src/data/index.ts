// Owner: backend (Greg). The app's one DataStore (docs/CONTRACTS.md, "Data and backend").
//
// createStore() returns the Supabase store, or the local store when the URL has ?store=local or
// the Supabase env vars are missing. If guest sign-in fails (offline, rate limit), it switches to
// the local store for the rest of the visit, so a round can always be played and saved.
import type { DataStore } from '@/contracts';
import { createLocalStore, memoryStorage } from './local';
import { createSupabaseStore } from './supabase';

export { ruleBasedAdvice } from './coach';

export function createStore(): DataStore {
  const local = createLocalStore();
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const forceLocal =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('store') === 'local';
  if (forceLocal || !url || !key) return local;

  // ?kiosk=1 (the leaderboard screen for the demo table) signs in its own throwaway guest kept in
  // memory, so it never replaces the player saved for the game in this browser.
  const kiosk =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('kiosk') === '1';
  const remote = kiosk
    ? createSupabaseStore(url, key, memoryStorage(), {
        authStorage: memoryStorage(),
        sessionName: 'kiosk',
      })
    : createSupabaseStore(url, key);
  // If the kiosk's sign-in fails, its local fallback stays in memory too: a saved "Leaderboard"
  // player would be offered to the next person who opens the game (QA Q17).
  const fallback = kiosk ? createLocalStore(memoryStorage()) : local;
  let active: DataStore = remote;

  return {
    get kind() {
      return active.kind;
    },
    async signInGuest(displayName) {
      if (active === remote) {
        try {
          return await remote.signInGuest(displayName);
        } catch (err) {
          console.warn('Guest sign-in failed; using the local store for this visit.', err);
          active = fallback;
        }
      }
      return fallback.signInGuest(displayName);
    },
    getProfile: () => active.getProfile(),
    saveProfile: (patch) => active.saveProfile(patch),
    saveSession: (summary) => active.saveSession(summary),
    listSessions: (limit) => active.listSessions(limit),
    getLeaderboard: (workout, mode, durationSec, limit) =>
      active.getLeaderboard(workout, mode, durationSec, limit),
    getCoachAdvice: (session) => active.getCoachAdvice(session),
    // Forget the guest in both stores and give Supabase another chance for the next player
    // (the switch to the local store only lasts for one guest).
    async signOut() {
      await Promise.all([remote.signOut(), fallback.signOut()]);
      active = remote;
    },
  };
}
