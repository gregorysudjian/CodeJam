import type { AddFriendResult, PlayMode, WorkoutId } from '@/contracts';
/** How often the board's "POSTED" times refresh (the kiosk stays open for an hour). */
export const POSTED_CLOCK_MS = 30_000;
export function leaderboardFilter(
  workout: WorkoutId,
  mode: PlayMode,
): { workout: WorkoutId; mode: PlayMode } {
  return { workout: workout === 'legs' && mode === 'treadmill' ? 'fullBody' : workout, mode };
}

/** The line under the friends board's ADD button, one per result. */
export function addFriendMessage(
  result: AddFriendResult,
  typed: string,
): { text: string; ok: boolean } {
  if (result.ok) return { text: `Added ${result.displayName}`, ok: true };
  const text = {
    notFound: `No player called ${typed.trim()}`,
    self: "That's you",
    already: 'Already your friend',
    limit: '50 friends max',
    offline: 'Friends need the internet',
  }[result.reason];
  return { text, ok: false };
}
