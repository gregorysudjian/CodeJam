import type { MoveType } from '@/contracts';
import { MOVE_LABELS } from '@/ui/kit/tokens';

export function raceProgress(elapsedSec: number, durationSec: number): number {
  return durationSec > 0 ? Math.max(0, Math.min(1, elapsedSec / durationSec)) : 0;
}

export function hudCueLabel(move: MoveType): string {
  return move === 'reachLeft' || move === 'reachRight' ? 'REACH' : MOVE_LABELS[move];
}

export type PauseReason = 'trackingLost' | 'otherPerson' | 'user';

/** True while the game holds the round because it can't see (only) the player: Esc can't resume. */
export function heldByGame(trackingLost: boolean, pauseReason: PauseReason | undefined): boolean {
  return trackingLost || pauseReason === 'trackingLost' || pauseReason === 'otherPerson';
}

/** Which pause message to show: none during the 3-2-1 before a resume (the game draws it). */
export function hudOverlay(s: {
  paused: boolean;
  trackingLost: boolean;
  pauseReason?: PauseReason;
  resuming: boolean;
}): PauseReason | null {
  const held = heldByGame(s.trackingLost, s.pauseReason);
  if (s.resuming || !(s.paused || held)) return null;
  if (s.pauseReason === 'otherPerson') return 'otherPerson';
  return held ? 'trackingLost' : 'user';
}

/** Hearts to draw: whole numbers, left within 0..total. */
export function heartCount(lives: { left: number; total: number }): {
  left: number;
  total: number;
} {
  const total = Math.max(0, Math.round(lives.total));
  return { total, left: Math.max(0, Math.min(total, Math.round(lives.left))) };
}
