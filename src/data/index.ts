// Owner: backend (Greg). The app's one DataStore (docs/CONTRACTS.md, "Data and backend").
//
// createStore() returns the Supabase store, or the local store when the URL has ?store=local or
// the Supabase env vars are missing. If guest sign-in fails (offline, rate limit), it switches to
// the local store for the rest of the visit, so a round can always be played and saved
// (fallback.ts; the leaderboard stays the real one).
import type { DataStore } from '@/contracts';
import { withFallback } from './fallback';
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
  return withFallback(remote, fallback);
}
