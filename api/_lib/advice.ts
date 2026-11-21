// Pure helpers for /api/coach: prompt, output schema, and validation of the model's answer.
// The `_lib` folder is not deployed as a function by Vercel.
import type { CoachAdvice, PlayMode, WorkoutId } from '../../src/contracts/index.js';

export const COACH_MODEL = 'claude-opus-5-5';
export const COACH_MAX_TOKENS = 2000; // thinking is always on for this model and counts here
export const COACH_TIMEOUT_MS = 7000; // the client gives up at 8 s and uses the rule-based coach
export const RECAP_MAX = 300;
export const TIP_MAX = 180;
export const REASON_MAX = 180;
export const HISTORY_LIMIT = 10;

const WORKOUTS: WorkoutId[] = ['legs', 'arms', 'shoulders', 'fullBody'];
const DURATIONS = [45, 90, 180];

/** Row shapes the endpoint reads (snake_case, as stored). */
export interface ProfileFacts {
  display_name: string;
  goal: string;
  level: string;
  weekly_goal_min: number;
}
export interface SessionFacts {
  id: string;
  workout: WorkoutId;
  mode: PlayMode;
  duration_sec: number;
  active_sec: number | string;
  difficulty: number | string | null;
  score: number;
  best_streak: number;
  cleared: number;
  hit: number;
  accuracy: number | string;
  kcal: number | string;
  reps: Record<string, number>;
  missed: Record<string, number>;
  created_at: string;
}

export const SYSTEM_PROMPT = `You are the coach inside a webcam fitness game. The player sidesteps, jumps, squats and raises their arms to clear obstacles in a short timed round.

Write a short recap of the round they just played, one concrete tip, and recommend their next session.

Rules:
- General fitness encouragement only. No medical, injury, diet or weight-loss advice, and never comment on the player's body.
- Every number you mention must come from the data provided. Do not invent statistics.
- Plain, friendly, upbeat language. Address the player by name. No emoji.
- recap: at most two sentences about the round just played (the one marked "latest").
- tip: one concrete, actionable sentence aimed at the move they missed most, or at keeping a clean round going.
- next: pick the workout that balances their recent history. Raise difficulty by about 0.1 after accuracy above 0.85, lower it by about 0.1 below 0.6, otherwise keep it. In treadmill mode never pick "legs".
- reason: one sentence on why that next session.`;

/** JSON schema for structured output; the server validates the result again anyway. */
export const COACH_SCHEMA = {
  type: 'object',
  properties: {
    recap: { type: 'string' },
    tip: { type: 'string' },
    next: {
      type: 'object',
      properties: {
        workout: { type: 'string', enum: WORKOUTS },
        durationSec: { type: 'integer', enum: DURATIONS },
        difficulty: { type: 'number' },
      },
      required: ['workout', 'durationSec', 'difficulty'],
      additionalProperties: false,
    },
    reason: { type: 'string' },
  },
  required: ['recap', 'tip', 'next', 'reason'],
  additionalProperties: false,
} as const;

const n = (v: number | string | null | undefined) => {
  const x = typeof v === 'string' ? Number(v) : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
};

/** Compact, numbers-only history. No weight or other body data goes to the model. */
export function buildUserPrompt(
  profile: ProfileFacts | null,
  sessions: SessionFacts[],
  latestId: string,
): string {
  const player = {
    name: profile?.display_name ?? 'Player',
    goal: profile?.goal ?? 'getMoving',
    fitnessLevel: profile?.level ?? 'beginner',
    weeklyGoalMinutes: profile?.weekly_goal_min ?? 60,
  };
  const history = sessions.map((s) => ({
    ...(s.id === latestId ? { latest: true } : {}),
    date: s.created_at.slice(0, 10),
    workout: s.workout,
    mode: s.mode,
    durationSec: s.duration_sec,
    activeMinutes: Math.round((n(s.active_sec) ?? 0) / 6) / 10,
    difficulty: n(s.difficulty) ?? 0.5,
    score: s.score,
    accuracy: Math.round((n(s.accuracy) ?? 0) * 100) / 100,
    bestStreak: s.best_streak,
    cleared: s.cleared,
    hit: s.hit,
    reps: s.reps,
    missedByMove: s.missed,
    estimatedKcal: Math.round(n(s.kcal) ?? 0),
  }));
  return `Player:\n${JSON.stringify(player)}\n\nRecent sessions, newest first:\n${JSON.stringify(history)}`;
}

const clean = (v: unknown, max: number) => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
};

/**
 * Validates and normalises the model's JSON. Returns null if it is unusable, so the endpoint
 * answers with an error and the client falls back to the rule-based coach.
 */
export function parseAdvice(text: string | undefined, mode: PlayMode): CoachAdvice | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const next = (a.next ?? {}) as Record<string, unknown>;

  const recap = clean(a.recap, RECAP_MAX);
  const tip = clean(a.tip, TIP_MAX);
  const reason = clean(a.reason, REASON_MAX);
  if (!recap || !tip || !reason) return null;

  let workout = WORKOUTS.includes(next.workout as WorkoutId) ? (next.workout as WorkoutId) : null;
  if (!workout) return null;
  if (mode === 'treadmill' && workout === 'legs') workout = 'fullBody';

  const durationSec = DURATIONS.includes(next.durationSec as number)
    ? (next.durationSec as number)
    : 90;
  const d =
    typeof next.difficulty === 'number' && Number.isFinite(next.difficulty) ? next.difficulty : 0.5;
  const difficulty = Math.round(Math.min(1, Math.max(0, d)) * 10) / 10;

  return { recap, tip, next: { workout, mode, durationSec, difficulty }, reason, source: 'ai' };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readSessionId(body: unknown): string | null {
  const id = (body as { sessionId?: unknown } | null)?.sessionId;
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}

export function bearerToken(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}
