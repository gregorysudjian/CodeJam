// Rule-based coach: the permanent fallback for /api/coach (docs/CONTRACTS.md, "Server endpoint").
import type {
  CoachAdvice,
  FitnessLevel,
  MoveType,
  Profile,
  SavedSession,
  WorkoutId,
} from '@/contracts';
import {
  ACCURACY_LOWER_BELOW,
  ACCURACY_RAISE_ABOVE,
  COACH_LOW_IMPACT_AGE,
  COACH_ROUND_SEC,
  COACH_STRUGGLE_BELOW_LEVEL,
  COACH_TIERS,
  COACH_WEEK_MS,
  DIFFICULTY_DEFAULT,
  LEVEL_SEC,
} from './tuning';

const TIER_NAMES = ['beginner', 'regular', 'athlete'] as const;
const TIER_OF_LEVEL: Record<FitnessLevel, number> = { beginner: 0, regular: 1, athlete: 2 };

/** Index in COACH_TIERS of the tier nearest to `difficulty` (halves round up; junk → default). */
export function tierIndex(difficulty: number | undefined): number {
  const d =
    typeof difficulty === 'number' && Number.isFinite(difficulty) ? difficulty : DIFFICULTY_DEFAULT;
  let best = 0;
  for (let i = 1; i < COACH_TIERS.length; i++)
    if (Math.abs(COACH_TIERS[i] - d) <= Math.abs(COACH_TIERS[best] - d)) best = i;
  return best;
}

const WORKOUT_NAMES: Record<WorkoutId, string> = {
  legs: 'Legs',
  arms: 'Arms',
  shoulders: 'Shoulders',
  fullBody: 'Full body',
};

const TIPS: Record<MoveType, string> = {
  sidestep:
    'Step wide and early: change lane as soon as the block is announced, not when it arrives.',
  jump: 'Jump a beat earlier than feels natural, as the hurdle comes close, and land softly.',
  squat: 'Drop your hips like sitting on a chair and hold until the beam has passed.',
  armsUp: 'Push both hands fully above your head and keep them there through the crate.',
  reachLeft: 'Reach your left arm high and out to the side, above head height.',
  reachRight: 'Reach your right arm high and out to the side, above head height.',
};

const ORDER: WorkoutId[] = ['fullBody', 'legs', 'arms', 'shoulders'];

/** Added to `reason` when the next session is low impact. Never names the age. */
const LOW_IMPACT_NOTE = 'Low impact: no jumps, same workout.';

/** Legs is not offered in treadmill mode: running is the leg work. */
function available(mode: SavedSession['config']['mode']): WorkoutId[] {
  return mode === 'treadmill' ? ORDER.filter((w) => w !== 'legs') : ORDER;
}

/**
 * Pure. `sessions` is newest first, as listSessions returns them; the first one is the round
 * just played. `now` is injectable for tests.
 */
export function ruleBasedAdvice(
  profile: Profile | null,
  sessions: SavedSession[],
  now: number = Date.now(),
): CoachAdvice {
  const latest = sessions[0];
  const mode = latest?.config.mode ?? 'floor';
  const name = profile?.displayName ?? 'there';

  // Recommend the workout played least this week (ties keep ORDER).
  const thisWeek = sessions.filter((s) => now - s.at < COACH_WEEK_MS);
  const choices = available(mode);
  const counts = choices.map((w) => thisWeek.filter((s) => s.config.workout === w).length);
  const workout = choices[counts.indexOf(Math.min(...counts))];

  // The tier: the latest round's, or for a first round the one matching the player's fitness level.
  // One tier up after a strong round; one down after a weak one or after running out of lives early.
  const base = latest
    ? tierIndex(latest.config.difficulty)
    : profile
      ? TIER_OF_LEVEL[profile.level]
      : tierIndex(DIFFICULTY_DEFAULT);
  let tier = base;
  if (latest) {
    const struggled =
      latest.outOfLives === true && (latest.levelReached ?? 1) < COACH_STRUGGLE_BELOW_LEVEL;
    if (latest.accuracy < ACCURACY_LOWER_BELOW || struggled) tier = base - 1;
    else if (latest.accuracy > ACCURACY_RAISE_ABOVE && latest.outOfLives !== true) tier = base + 1;
  }
  tier = Math.min(COACH_TIERS.length - 1, Math.max(0, tier));
  const difficulty = COACH_TIERS[tier];
  // A round is always every level (CONTRACTS.md).
  const durationSec = COACH_ROUND_SEC;
  // From COACH_LOW_IMPACT_AGE: low impact (no hurdles), the same workout and tier. Under it, or
  // with no age, the advice is exactly as before (no lowImpact key, no extra sentence).
  const lowImpact = typeof profile?.age === 'number' && profile.age >= COACH_LOW_IMPACT_AGE;
  const next = lowImpact
    ? { workout, mode, durationSec, difficulty, lowImpact: true }
    : { workout, mode, durationSec, difficulty };
  const withNote = (reason: string): string =>
    lowImpact ? `${reason} ${LOW_IMPACT_NOTE}` : reason;

  // Tip on the move missed most in the latest round.
  let worst: MoveType | null = null;
  if (latest) {
    for (const [move, n] of Object.entries(latest.missed) as [MoveType, number][]) {
      if (n > 0 && (worst === null || n > latest.missed[worst])) worst = move;
    }
  }

  if (!latest) {
    return {
      recap: `Welcome, ${name}! Play your first round and your coach will build on it.`,
      tip: 'Stand on your mark, face the screen, and start each move as soon as you see its cue.',
      next,
      reason: withNote(
        `A first round on the ${TIER_NAMES[tier]} tier shows which moves to work on.`,
      ),
      source: 'rules',
    };
  }

  const pct = Math.round(latest.accuracy * 100);
  const trend =
    tier > base
      ? `moving you up to ${TIER_NAMES[tier]}`
      : tier < base
        ? `easing back to ${TIER_NAMES[tier]}`
        : `keeping you on ${TIER_NAMES[tier]}`;
  // Levels, when the round reports them (a round saved before levels existed does not).
  const levels = Math.max(1, Math.round(latest.config.durationSec / LEVEL_SEC));
  const reached = latest.levelReached;
  const levelPart =
    reached === undefined
      ? null
      : latest.outOfLives
        ? `you reached level ${reached} before running out of lives`
        : reached >= levels
          ? `you cleared all ${levels} levels`
          : `you reached level ${reached}`;
  // Praise only what earned it: a judge who stood still all round is not told "Nice work".
  const [opener, closer] =
    latest.accuracy >= ACCURACY_RAISE_ABOVE
      ? ['Nice work', 'That was a strong round.']
      : latest.accuracy >= ACCURACY_LOWER_BELOW
        ? ['Good round', 'Every round makes the next one easier.']
        : ['Round done', 'Start each move as soon as its cue appears, and the points follow.'];
  return {
    recap: levelPart
      ? `${opener}, ${name}: ${levelPart}, with ${latest.score} points at ${pct}% accuracy. ${closer}`
      : `${opener}, ${name}: ${latest.score} points at ${pct}% accuracy, with a best streak of ${latest.bestStreak}. ${closer}`,
    tip: worst
      ? TIPS[worst]
      : 'Clean round! Each level is faster than the last: start every move on its cue.',
    next,
    reason: withNote(
      `You have played ${WORKOUT_NAMES[workout]} the least this week, so we are ${trend}.`,
    ),
    source: 'rules',
  };
}
