// Owner: C. STUB — a simple but valid level generator and tracker so the app runs end to end.
// Replace with the real versions (weights, intensity curve, fairness rules in docs/CONTRACTS.md).
import type {
  GameEvent,
  Lane,
  Level,
  LiveStats,
  MoveEvent,
  MoveType,
  ObstacleKind,
  SessionConfig,
  SessionSummary,
  SessionTracker,
  Spawn,
  Wave,
  WorkoutId,
  WorkoutInfo,
} from '@/contracts';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_WEIGHT_KG,
  END_MARGIN_SEC,
  FIRST_WAVE_SEC,
  MET_FLOOR,
  MET_TREADMILL,
  MULTIPLIER_STREAKS,
  POINTS_CLEARED,
  POINTS_ORB,
  WAVE_GAP_SEC,
} from './tuning';

export { DEMO_CONFIG, DEMO_SEED } from './tuning';

export const WORKOUTS: Record<WorkoutId, WorkoutInfo> = {
  legs: {
    id: 'legs',
    name: 'Legs',
    tagline: 'Squats, jumps and sidesteps',
    moves: ['squat', 'jump', 'sidestep'],
    availableIn: ['floor'],
  },
  arms: {
    id: 'arms',
    name: 'Arms',
    tagline: 'Fast left and right reaches',
    moves: ['reachLeft', 'reachRight', 'armsUp'],
    availableIn: ['floor', 'treadmill'],
  },
  shoulders: {
    id: 'shoulders',
    name: 'Shoulders',
    tagline: 'Overhead presses and holds',
    moves: ['armsUp', 'reachLeft', 'reachRight'],
    availableIn: ['floor', 'treadmill'],
  },
  fullBody: {
    id: 'fullBody',
    name: 'Full body',
    tagline: 'A bit of everything',
    moves: ['sidestep', 'jump', 'squat', 'armsUp'],
    availableIn: ['floor', 'treadmill'],
  },
};

const ZERO_REPS: Record<MoveType, number> = {
  sidestep: 0,
  jump: 0,
  squat: 0,
  armsUp: 0,
  reachLeft: 0,
  reachRight: 0,
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function spawnFor(kind: ObstacleKind, rand: () => number, freeLane: Lane): Spawn {
  const all: Lane[] = [-1, 0, 1];
  switch (kind) {
    case 'block':
      return { kind, lanes: all.filter((l) => l !== freeLane), requires: 'sidestep' };
    case 'hurdle':
      return { kind, lanes: all, requires: 'jump' };
    case 'beam':
      return { kind, lanes: all, requires: 'squat' };
    case 'crate':
      return { kind, lanes: all, requires: 'armsUp' };
    case 'orb': {
      const lane = all[Math.floor(rand() * 3)];
      const requires: MoveType = lane === -1 ? 'reachLeft' : lane === 1 ? 'reachRight' : 'armsUp';
      return { kind, lanes: [lane], requires };
    }
  }
}

export function generateLevel(config: SessionConfig): Level {
  const full: SessionConfig = {
    ...config,
    difficulty: config.difficulty ?? DEFAULT_DIFFICULTY,
    lowImpact: config.lowImpact ?? false,
    seed: config.seed ?? Math.floor(Math.random() * 2 ** 31),
  };
  const rand = mulberry32(full.seed!);
  let kinds: ObstacleKind[] =
    full.mode === 'treadmill' ? ['crate', 'orb'] : ['block', 'hurdle', 'beam', 'crate', 'orb'];
  if (full.lowImpact) kinds = kinds.filter((k) => k !== 'hurdle');

  const waves: Wave[] = [];
  let freeLane: Lane = 0;
  for (let t = FIRST_WAVE_SEC; t < full.durationSec - END_MARGIN_SEC; t += WAVE_GAP_SEC) {
    const kind = kinds[Math.floor(rand() * kinds.length)];
    if (kind === 'block') {
      const step = Math.floor(rand() * 3) - 1;
      freeLane = Math.max(-1, Math.min(1, freeLane + step)) as Lane;
    }
    waves.push({ t, intensity: t / full.durationSec, spawns: [spawnFor(kind, rand, freeLane)] });
  }
  return { config: full, waves };
}

export function createSessionTracker(
  config: SessionConfig,
  opts?: { weightKg?: number },
): SessionTracker {
  const weightKg = opts?.weightKg ?? DEFAULT_WEIGHT_KG;
  const reps = { ...ZERO_REPS };
  const missed = { ...ZERO_REPS };
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let cleared = 0;
  let hit = 0;
  const startedAt = performance.now();

  const multiplier = () => 1 + MULTIPLIER_STREAKS.filter((s) => streak >= s).length;
  const kcal = (activeSec: number) => {
    const met = config.mode === 'treadmill' ? MET_TREADMILL : MET_FLOOR[config.workout];
    return ((met * 3.5 * weightKg) / 200) * (activeSec / 60);
  };
  const live = (activeSec: number): LiveStats => ({
    score,
    streak,
    multiplier: multiplier(),
    reps: { ...reps },
    kcal: kcal(activeSec),
  });

  return {
    handleGameEvent(e: GameEvent) {
      if (e.type === 'cleared' || e.type === 'collected') {
        score += (e.type === 'collected' ? POINTS_ORB : POINTS_CLEARED) * multiplier();
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
        if (e.type === 'cleared') cleared += 1;
      } else if (e.type === 'hit') {
        hit += 1;
        streak = 0;
        missed[e.spawn.requires] += 1;
      }
    },
    handleMove(e: MoveEvent) {
      reps[e.type] += 1;
    },
    getLive: () => live((performance.now() - startedAt) / 1000),
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
      };
    },
  };
}
