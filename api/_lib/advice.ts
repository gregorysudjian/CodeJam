// Pure helpers for /api/coach: prompt, output schema, and validation of the model's answer.
// The `_lib` folder is not deployed as a function by Vercel.
import type { CoachAdvice, PlayMode, WorkoutId } from '../../src/contracts/index.js';

// A short JSON recap needs no deep reasoning: the fast, low-cost model, thinking off.
export const COACH_MODEL = 'claude-haiku-5-5';
export const COACH_MAX_TOKENS = 2000;
export const COACH_TIMEOUT_MS = 7000; // the client gives up at 8 s and uses the rule-based coach
export const RECAP_MAX = 300;
export const TIP_MAX = 180;
export const REASON_MAX = 180;
export const HISTORY_LIMIT = 10;
/** At most one coach call per user per this many seconds (claim_coach_slot, migration 0002). */
export const COACH_MIN_INTERVAL_SEC = 10;

const WORKOUTS: WorkoutId[] = ['legs', 'arms', 'shoulders', 'fullBody'];
/** Difficulty is a tier (CONTRACTS.md): 0 beginner, 0.5 regular, 1 athlete. */
export const TIERS = [0, 0.5, 1];
/** A round is every level in a row: 6 levels of 30 s. */
export const ROUND_SEC = 180;

/** The tier nearest to `d` (halves round up); anything that is not a number → regular. */
export function snapTier(d: unknown): number {
  const x = typeof d === 'number' && Number.isFinite(d) ? d : 0.5;
  return TIERS.reduce((best, t) => (Math.abs(t - x) <= Math.abs(best - x) ? t : best));
}

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

export const SYSTEM_PROMPT = `You are the coach inside a webcam fitness game. The player sidesteps, jumps, squats and raises their arms to clear obstacles. A round is 6 levels of 30 seconds, each faster than the last, and the player has 3 lives.

Write a short recap of the round they just played, one concrete tip, and recommend their next session.

Reading the data:
- accuracy is a fraction from 0 to 1: always say it as a whole percentage (0.82 -> "82%").
- Move names in the data are internal; say them in plain words: sidestep -> "sidesteps", jump -> "jumps", squat -> "squats", armsUp -> "arms-up smashes", reachLeft -> "left reaches", reachRight -> "right reaches". Workouts: legs, arms, shoulders, fullBody -> "full body". Modes: floor, treadmill.
- difficulty is the tier: 0 Beginner, 0.5 Regular, 1 Athlete. Say the tier name, never the number.
- missedByMove counts the misses per move; cleared counts obstacles passed; hit counts LIVES LOST (the player has 3: hit 0 = no life lost, hit 3 = the round ended out of lives).
- The player's name may carry a test suffix like "QA-Sam-x1y2": call them by the plain first part ("Sam").

Choosing next.difficulty (do this exactly):
1. Start from the latest round's tier.
2. Latest accuracy above 85%: one tier up (Athlete stays Athlete). Below 60%: one tier down (Beginner stays Beginner). Otherwise: same tier.
3. In "reason", describe the result in words ("one step easier", "same tier", "time for the next tier"); say "step up" only if the tier really goes up.

Rules:
- Talk like an encouraging human coach, not a report. Never mention fields, thresholds, rules, fractions or how you decide.
- General fitness encouragement only. No medical, injury, diet or weight-loss advice, and never comment on the player's body.
- Every number you mention must come from the data provided. Do not invent statistics. Use at most two numbers in the recap.
- Plain, friendly, upbeat language. Use the player's name once. No emoji.
- recap: at most two short sentences about the round just played (the one marked "latest"): one thing that went well, then the one thing to work on.
- tip: one concrete, physical cue for the move they missed most (what to do with their body and when), or for keeping a clean round going if they missed nothing.
- next: pick the workout that balances their recent history, with the tier chosen above. durationSec is always 180. In treadmill mode never pick "legs".
- reason: one short, motivating sentence on why that next session, in plain words (for example "you've earned the Athlete tier" or "let's give your shoulders a rest").`;

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
        durationSec: { type: 'integer', enum: [ROUND_SEC] },
        difficulty: { type: 'number', enum: TIERS },
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
    difficulty: snapTier(n(s.difficulty)),
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

  // A round is always every level; the difficulty is always one of the three tiers.
  return {
    recap,
    tip,
    next: { workout, mode, durationSec: ROUND_SEC, difficulty: snapTier(next.difficulty) },
    reason,
    source: 'ai',
  };
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
