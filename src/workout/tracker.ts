import type {
  GameEvent,
  LiveStats,
  MoveEvent,
  MoveType,
  SessionConfig,
  SessionSummary,
  SessionTracker,
} from '@/contracts';
import * as T from './tuning';

const zeroReps = (): Record<MoveType, number> => ({
  sidestep: 0,
  jump: 0,
  squat: 0,
  armsUp: 0,
  reachLeft: 0,
  reachRight: 0,
});

export function multiplierFor(streak: number): number {
  for (const [min, m] of T.MULTIPLIERS) if (streak >= min) return m;
  return 1;
}

/** Estimate, labelled as one in the UI: kcal = MET × 3.5 × kg / 200 × minutes. */
export function kcalFor(config: SessionConfig, weightKg: number, activeSec: number): number {
  const met = config.mode === 'treadmill' ? T.MET_TREADMILL : T.MET[config.workout];
  return ((met * 3.5 * weightKg) / 200) * (activeSec / 60);
}

/**
 * Scores per CONTRACTS.md. A clear or a collected orb scores at the multiplier of the
 * streak before it, then extends the streak. A hit resets the streak. A missed orb fires no
 * event, so it changes nothing. `now` is injectable for tests.
 */
export function createSessionTracker(
  config: SessionConfig,
  opts?: { weightKg?: number; now?: () => number },
): SessionTracker {
  const weightKg = opts?.weightKg ?? T.DEFAULT_WEIGHT_KG;
  const now = opts?.now ?? (() => performance.now());
  const reps = zeroReps();
  const missed = zeroReps();
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let cleared = 0;
  let hit = 0;
  let outOfLives = false; // the round ended on the last life ('finished', reason 'outOfLives')
  // Live calories count time between the first event and now, minus pauses.
  let runningSince: number | null = null;
  let activeMs = 0;
  const activeSecNow = (): number =>
    (activeMs + (runningSince === null ? 0 : now() - runningSince)) / 1000;

  const live = (activeSec: number): LiveStats => ({
    score,
    streak,
    multiplier: multiplierFor(streak),
    reps: { ...reps },
    kcal: kcalFor(config, weightKg, activeSec),
  });

  return {
    handleGameEvent(e: GameEvent) {
      // The 3-2-1 before a resume ('resuming') is still paused: time runs again from 'resumed'.
      if (
        runningSince === null &&
        e.type !== 'paused' &&
        e.type !== 'resuming' &&
        e.type !== 'finished'
      )
        runningSince = now();
      switch (e.type) {
        case 'cleared':
        case 'collected':
          score +=
            (e.type === 'collected' ? T.POINTS_ORB : T.POINTS_CLEARED) * multiplierFor(streak);
          streak += 1;
          bestStreak = Math.max(bestStreak, streak);
          if (e.type === 'cleared') cleared += 1;
          break;
        case 'hit':
          hit += 1;
          streak = 0;
          missed[e.spawn.requires] += 1;
          break;
        case 'paused':
        case 'finished':
          if (e.type === 'finished' && e.reason === 'outOfLives') outOfLives = true;
          if (runningSince !== null) {
            activeMs += now() - runningSince;
            runningSince = null;
          }
          break;
        case 'resumed':
        case 'cue':
          break;
      }
    },
    handleMove(e: MoveEvent) {
      reps[e.type] += 1;
    },
    getLive: () => live(activeSecNow()),
    finish(activeSec: number): SessionSummary {
      return {
        ...live(activeSec),
        config,
        bestStreak,
        cleared,
        hit,
        accuracy: cleared + hit === 0 ? 0 : cleared / (cleared + hit),
        missed: { ...missed },
        activeSec,
        outOfLives,
      };
    },
  };
}
