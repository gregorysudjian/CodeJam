import type { PlayMode, WorkoutId } from '@/contracts';
/** How often the board's "POSTED" times refresh (the kiosk stays open for an hour). */
export const POSTED_CLOCK_MS = 30_000;
export function leaderboardFilter(
  workout: WorkoutId,
  mode: PlayMode,
): { workout: WorkoutId; mode: PlayMode } {
  return { workout: workout === 'legs' && mode === 'treadmill' ? 'fullBody' : workout, mode };
}
