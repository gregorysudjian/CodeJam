import type { PlayMode, WorkoutId } from "@/contracts";
export function leaderboardFilter(
  workout: WorkoutId,
  mode: PlayMode,
): { workout: WorkoutId; mode: PlayMode } {
  return { workout: workout === "legs" && mode === "treadmill" ? "fullBody" : workout, mode };
}
