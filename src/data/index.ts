// Owner: C. STUB — createStore() always returns the localStorage store for now.
// The real version returns the Supabase store unless ?store=local or the env vars are missing.
// The local store stays as the permanent offline fallback.
import type {
  CoachAdvice,
  DataStore,
  LeaderboardEntry,
  Profile,
  SavedSession,
  SessionSummary,
  WorkoutId,
} from '@/contracts';

const PROFILE_KEY = 'codejam.profile';
const SESSIONS_KEY = 'codejam.sessions';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: keep going, the round is still shown on screen.
  }
}

function defaultProfile(displayName?: string): Profile {
  return {
    id: crypto.randomUUID(),
    displayName: displayName || `Guest-${Math.floor(1000 + Math.random() * 9000)}`,
    goal: 'getMoving',
    level: 'beginner',
    weeklyGoalMin: 60,
  };
}

export function ruleBasedAdvice(profile: Profile | null, sessions: SavedSession[]): CoachAdvice {
  const latest = sessions[0];
  const ids: WorkoutId[] = ['legs', 'arms', 'shoulders', 'fullBody'];
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const counts = ids.map(
    (id) => sessions.filter((s) => s.at > weekAgo && s.config.workout === id).length,
  );
  const workout = ids[counts.indexOf(Math.min(...counts))];
  const accuracy = latest?.accuracy ?? 0.7;
  const base = latest?.config.difficulty ?? 0.5;
  const difficulty = Math.max(
    0,
    Math.min(1, base + (accuracy > 0.85 ? 0.1 : accuracy < 0.6 ? -0.1 : 0)),
  );
  const name = profile?.displayName ?? 'there';
  return {
    recap: latest
      ? `Nice work, ${name}: ${latest.score} points with ${Math.round(latest.accuracy * 100)}% accuracy. Your best streak was ${latest.bestStreak}.`
      : `Welcome, ${name}. Play a round and your coach will build on it.`,
    tip: 'Move early: start each move as soon as you see the cue.',
    next: { workout, mode: latest?.config.mode ?? 'floor', durationSec: 90, difficulty },
    reason: `You have played ${WORKOUTS_LABEL[workout]} the least this week.`,
    source: 'rules',
  };
}

const WORKOUTS_LABEL: Record<WorkoutId, string> = {
  legs: 'Legs',
  arms: 'Arms',
  shoulders: 'Shoulders',
  fullBody: 'Full body',
};

export function createStore(): DataStore {
  const sessions = () => read<SavedSession[]>(SESSIONS_KEY, []);
  return {
    kind: 'local',
    async signInGuest(displayName) {
      const existing = read<Profile | null>(PROFILE_KEY, null);
      if (existing) return existing;
      const p = defaultProfile(displayName);
      write(PROFILE_KEY, p);
      return p;
    },
    async getProfile() {
      return read<Profile | null>(PROFILE_KEY, null);
    },
    async saveProfile(patch) {
      const p = { ...(read<Profile | null>(PROFILE_KEY, null) ?? defaultProfile()), ...patch };
      write(PROFILE_KEY, p);
      return p;
    },
    async saveSession(summary: SessionSummary) {
      const saved: SavedSession = {
        ...summary,
        id: crypto.randomUUID(),
        at: Date.now(),
        synced: false,
      };
      write(SESSIONS_KEY, [saved, ...sessions()].slice(0, 200));
      return saved;
    },
    async listSessions(limit = 50) {
      return sessions().slice(0, limit);
    },
    async getLeaderboard(workout, mode, limit = 10) {
      const name = read<Profile | null>(PROFILE_KEY, null)?.displayName ?? 'You';
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
      return ruleBasedAdvice(read<Profile | null>(PROFILE_KEY, null), sessions());
    },
  };
}
