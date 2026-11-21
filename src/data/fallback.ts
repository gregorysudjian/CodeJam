// The Supabase store with the local store as a stand-in (AGENTS.md rule 7). If guest sign-in
// fails (offline, or the anonymous sign-in rate limit on a busy venue wifi), rounds are played and
// saved locally for the rest of that guest's visit.
//
// The leaderboard is the exception: after a fallback it still reads the real board (readable
// without a guest, migration 0005; otherwise the last cached board). The local store's board holds
// only this player's own rounds, so the results screen said "#1 on the leaderboard" for any score
// (docs/LIVE.md F2).
import type { DataStore } from '@/contracts';

export function withFallback(remote: DataStore, fallback: DataStore): DataStore {
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
      remote.getLeaderboard(workout, mode, durationSec, limit),
    getCoachAdvice: (session) => active.getCoachAdvice(session),
    // Forget the guest in both stores and give Supabase another chance for the next player
    // (the switch to the local store only lasts for one guest).
    async signOut() {
      await Promise.all([remote.signOut(), fallback.signOut()]);
      active = remote;
    },
  };
}
