import type { MoveType } from "@/contracts";
import { MOVE_LABELS } from "@/ui/kit/tokens";

export function raceProgress(elapsedSec: number, durationSec: number): number {
  return durationSec > 0 ? Math.max(0, Math.min(1, elapsedSec / durationSec)) : 0;
}

export function hudCueLabel(move: MoveType): string {
  return move === "reachLeft" || move === "reachRight" ? "REACH" : MOVE_LABELS[move];
}
