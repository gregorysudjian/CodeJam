// Rule-based coach: the permanent fallback for /api/coach (docs/CONTRACTS.md, "Server endpoint").
import type { CoachAdvice, MoveType, Profile, SavedSession, WorkoutId } from '@/contracts';
import {
  ACCURACY_LOWER_BELOW,
  ACCURACY_RAISE_ABOVE,
  COACH_DEFAULT_DURATION,
  COACH_DURATIONS,
  COACH_WEEK_MS,
  DIFFICULTY_DEFAULT,
  DIFFICULTY_STEP,
} from './tuning';

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

/** Legs is not offered in treadmill mode: running is the leg work. */
function available(mode: SavedSession['config']['mode']): WorkoutId[] {
  return mode === 'treadmill' ? ORDER.filter((w) => w !== 'legs') : ORDER;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

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

  // Difficulty follows the latest accuracy.
  const base = latest?.config.difficulty ?? DIFFICULTY_DEFAULT;
  let difficulty = base;
  if (latest && latest.accuracy > ACCURACY_RAISE_ABOVE) difficulty = base + DIFFICULTY_STEP;
  else if (latest && latest.accuracy < ACCURACY_LOWER_BELOW) difficulty = base - DIFFICULTY_STEP;
  difficulty = round1(clamp01(difficulty));

  const duration = latest?.config.durationSec;
  const durationSec = (COACH_DURATIONS as readonly number[]).includes(duration ?? -1)
    ? duration!
    : COACH_DEFAULT_DURATION;

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
      next: { workout, mode, durationSec, difficulty },
      reason: 'A balanced first round shows which moves to work on.',
      source: 'rules',
    };
  }

  const pct = Math.round(latest.accuracy * 100);
  const trend =
    difficulty > base
      ? 'turning it up a notch'
      : difficulty < base
        ? 'easing off a little'
        : 'keeping the same level';
  return {
    recap: `Nice work, ${name}: ${latest.score} points at ${pct}% accuracy, with a best streak of ${latest.bestStreak}. ${
      pct >= 85 ? 'That was a strong round.' : 'Every round makes the next one easier.'
    }`,
    tip: worst ? TIPS[worst] : 'Clean round! Try a longer session to build endurance.',
    next: { workout, mode, durationSec, difficulty },
    reason: `You have played ${WORKOUT_NAMES[workout]} the least this week, so we are ${trend}.`,
    source: 'rules',
  };
}
