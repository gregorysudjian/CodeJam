import type { SessionConfig } from '@/contracts';

// A round is every level back to back, 30 s each, with 3 lives (docs/CONTRACTS.md, Stage).
export const ROUND_LEVELS = 6;
export const ROUND_SEC = 180;
export const ROUND_LIVES = 3;

/** The tier sets how many obstacles (SessionConfig.difficulty). */
export type Tier = 'beginner' | 'regular' | 'athlete';
export const TIER_DIFFICULTY: Record<Tier, number> = { beginner: 0, regular: 0.5, athlete: 1 };
export const TIER_LABELS: Record<Tier, string> = {
  beginner: 'BEGINNER',
  regular: 'REGULAR',
  athlete: 'ATHLETE',
};

/** The nearest tier to a difficulty (the coach may still pick tenths); missing = regular. */
export function tierOf(difficulty: number | undefined): Tier {
  if (difficulty === undefined || !Number.isFinite(difficulty)) return 'regular';
  if (difficulty < 0.25) return 'beginner';
  return difficulty < 0.75 ? 'regular' : 'athlete';
}

/** The config as it is played: every level, on the tier it shows. */
export function asRound(config: SessionConfig): SessionConfig {
  return {
    ...config,
    durationSec: ROUND_SEC,
    difficulty: TIER_DIFFICULTY[tierOf(config.difficulty)],
  };
}
