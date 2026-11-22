// snake_case SQL rows <-> camelCase contract types. Only src/data/ knows the column names.
import type {
  CoachAdvice,
  FitnessLevel,
  Goal,
  LeaderboardEntry,
  MoveType,
  PlayMode,
  Profile,
  SavedSession,
  WorkoutId,
} from '@/contracts';
import { nameOrGuest, shownName } from './names';

export interface ProfileRow {
  id: string;
  display_name: string;
  goal: Goal;
  level: FitnessLevel;
  weight_kg: number | string | null;
  weekly_goal_min: number;
}

export interface SessionRow {
  id: string;
  user_id: string;
  workout: WorkoutId;
  mode: PlayMode;
  duration_sec: number;
  active_sec: number | string;
  difficulty: number | string | null;
  seed: number | null;
  score: number;
  best_streak: number;
  cleared: number;
  hit: number;
  accuracy: number | string;
  kcal: number | string;
  reps: Partial<Record<MoveType, number>>;
  missed: Partial<Record<MoveType, number>>;
  created_at: string;
}

export interface LeaderboardRow {
  display_name: string;
  workout: WorkoutId;
  mode: PlayMode;
  score: number;
  created_at: string;
  duration_sec: number;
}

const MOVES: MoveType[] = ['sidestep', 'jump', 'squat', 'armsUp', 'reachLeft', 'reachRight'];

/** Postgres numeric can arrive as a string; jsonb maps may miss moves. */
const num = (v: number | string | null | undefined, fallback = 0) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};

function fullMoves(
  m: Partial<Record<MoveType, number>> | null | undefined,
): Record<MoveType, number> {
  const out = {} as Record<MoveType, number>;
  for (const k of MOVES) out[k] = num(m?.[k]);
  return out;
}

export function profileFromRow(r: ProfileRow): Profile {
  const weight = r.weight_kg === null ? undefined : num(r.weight_kg);
  return {
    id: r.id,
    displayName: shownName(r.display_name),
    goal: r.goal,
    level: r.level,
    ...(weight === undefined ? {} : { weightKg: weight }),
    weeklyGoalMin: r.weekly_goal_min,
  };
}

/** Only the fields that were patched, so an update never overwrites what it did not mean to. */
export function profilePatchToRow(patch: Partial<Omit<Profile, 'id'>>): Partial<ProfileRow> {
  const row: Partial<ProfileRow> = {};
  if (patch.displayName !== undefined) row.display_name = nameOrGuest(patch.displayName);
  if (patch.goal !== undefined) row.goal = patch.goal;
  if (patch.level !== undefined) row.level = patch.level;
  if ('weightKg' in patch) row.weight_kg = patch.weightKg ?? null;
  if (patch.weeklyGoalMin !== undefined) row.weekly_goal_min = patch.weeklyGoalMin;
  return row;
}

export function sessionToRow(s: SavedSession, userId: string): SessionRow {
  const c = s.config;
  return {
    id: s.id,
    user_id: userId,
    workout: c.workout,
    mode: c.mode,
    duration_sec: Math.round(c.durationSec),
    // num(): a non-finite value would become null in JSON and the NOT NULL column would reject the
    // whole queued upsert (docs/QA.md Q13), so it is sent as 0.
    active_sec: Math.round(num(s.activeSec) * 10) / 10,
    difficulty: c.difficulty ?? null,
    seed: c.seed ?? null,
    score: Math.max(0, Math.round(num(s.score))),
    best_streak: Math.round(num(s.bestStreak)),
    cleared: Math.round(num(s.cleared)),
    hit: Math.round(num(s.hit)),
    accuracy: Math.min(1, Math.max(0, num(s.accuracy))),
    kcal: Math.max(0, Math.round(num(s.kcal) * 10) / 10),
    reps: s.reps,
    missed: s.missed,
    created_at: new Date(s.at).toISOString(),
  };
}

/** `streak` and `multiplier` are end-of-round live values the table does not keep. */
export function sessionFromRow(r: SessionRow): SavedSession {
  return {
    id: r.id,
    at: Date.parse(r.created_at),
    synced: true,
    config: {
      workout: r.workout,
      mode: r.mode,
      durationSec: r.duration_sec,
      ...(r.difficulty === null ? {} : { difficulty: num(r.difficulty) }),
      ...(r.seed === null ? {} : { seed: r.seed }),
    },
    score: r.score,
    streak: 0,
    multiplier: 1,
    reps: fullMoves(r.reps),
    kcal: num(r.kcal),
    bestStreak: r.best_streak,
    cleared: r.cleared,
    hit: r.hit,
    accuracy: num(r.accuracy),
    missed: fullMoves(r.missed),
    activeSec: num(r.active_sec),
  };
}

export function leaderboardFromRow(r: LeaderboardRow): LeaderboardEntry {
  return {
    // Cleaned on the way out too: the board is on a projector, and a name may have been written
    // before cleaning existed, or straight to the REST API (docs/LIVE.md, names).
    displayName: shownName(r.display_name),
    score: r.score,
    workout: r.workout,
    mode: r.mode,
    durationSec: r.duration_sec,
    at: Date.parse(r.created_at),
  };
}

/** Trust nothing that comes back from the network: accept a CoachAdvice only if well formed. */
export function isCoachAdvice(v: unknown): v is CoachAdvice {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  const next = a.next as Record<string, unknown> | undefined;
  return (
    typeof a.recap === 'string' &&
    typeof a.tip === 'string' &&
    typeof a.reason === 'string' &&
    (a.source === 'ai' || a.source === 'rules') &&
    !!next &&
    ['legs', 'arms', 'shoulders', 'fullBody'].includes(next.workout as string) &&
    (next.mode === 'floor' || next.mode === 'treadmill') &&
    typeof next.durationSec === 'number'
  );
}
