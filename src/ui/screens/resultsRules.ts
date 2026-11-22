import type { MoveType, SessionSummary } from '@/contracts';
import { MOVE_ORDER } from '@/ui/kit/tokens';

export function accuracyGrade(accuracy: number): 'S' | 'A' | 'B' | 'C' {
  if (accuracy >= 0.95) return 'S';
  if (accuracy >= 0.85) return 'A';
  if (accuracy >= 0.7) return 'B';
  return 'C';
}
export function mostMissed(summary: SessionSummary): MoveType | null {
  let move: MoveType | null = null;
  let max = 0;
  for (const candidate of MOVE_ORDER) {
    if (summary.missed[candidate] > max) {
      max = summary.missed[candidate];
      move = candidate;
    }
  }
  return move;
}
/** How the round ended, for the results headline. Sessions saved before levels: ROUND COMPLETE. */
export function roundHeadline(summary: Pick<SessionSummary, 'levelReached' | 'outOfLives'>): {
  text: string;
  outOfLives: boolean;
} {
  const level = Math.max(1, Math.round(summary.levelReached ?? 1));
  if (summary.outOfLives) return { text: `OUT OF LIVES · LEVEL ${level}`, outOfLives: true };
  if (summary.levelReached === undefined) return { text: 'ROUND COMPLETE', outOfLives: false };
  return {
    text: level === 1 ? 'LEVEL 1 CLEARED' : `ALL ${level} LEVELS CLEARED`,
    outOfLives: false,
  };
}
export function cueProgress(inSec: number): number {
  return Math.max(0, Math.min(1, 1 - inSec / 2));
}
