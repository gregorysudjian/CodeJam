import type { InputState, PlayMode, Spawn } from '@/contracts';
import { HOLD_GRACE_SEC, WINDOW_AFTER_SEC, WINDOW_BEFORE_SEC } from './tuning';

/**
 * Collision judge for one spawn (CONTRACTS.md "Collision rules"). Pure: the game feeds it
 * the game clock and the polled input state every frame.
 *
 * - Cleared if the required state is true at any sample in [t - 0.35, t + 0.15].
 * - A beam or crate with holdSec > 0 must also stay held until t + holdSec; a gap longer
 *   than HOLD_GRACE_SEC (measured after the entry window) is a hit.
 * - Orbs never hit: they are 'collected' or 'missed' (no GameEvent for a miss).
 */
export type Verdict = 'pending' | 'cleared' | 'hit' | 'collected' | 'missed';

export interface Judge {
  readonly spawn: Spawn;
  readonly t: number;
  readonly verdict: Verdict;
  /** Feed one frame. Returns the verdict if it was decided by this call, else null. */
  sample(elapsed: number, state: InputState): Verdict | null;
}

export function requirementMet(spawn: Spawn, mode: PlayMode, s: InputState): boolean {
  switch (spawn.kind) {
    case 'block':
      return !spawn.lanes.includes(s.lane);
    case 'hurdle':
      return s.airborne;
    case 'beam':
      return s.ducking;
    case 'crate':
      return s.leftArmUp && s.rightArmUp;
    case 'orb':
      if (mode === 'treadmill') {
        return spawn.lanes.some((l) =>
          l === -1 ? s.leftArmUp : l === 1 ? s.rightArmUp : s.leftArmUp && s.rightArmUp,
        );
      }
      return spawn.lanes.includes(s.lane) && (s.leftArmUp || s.rightArmUp);
  }
}

export function createJudge(spawn: Spawn, t: number, mode: PlayMode): Judge {
  const hold = spawn.kind === 'beam' || spawn.kind === 'crate' ? (spawn.holdSec ?? 0) : 0;
  const isOrb = spawn.kind === 'orb';
  const windowStart = t - WINDOW_BEFORE_SEC;
  const windowEnd = t + WINDOW_AFTER_SEC;
  let verdict: Verdict = 'pending';
  let engaged = false;
  let lastTrue = -Infinity;

  const decide = (ok: boolean): Verdict => {
    verdict = ok ? (isOrb ? 'collected' : 'cleared') : isOrb ? 'missed' : 'hit';
    return verdict;
  };

  return {
    spawn,
    t,
    get verdict() {
      return verdict;
    },
    sample(elapsed, state) {
      if (verdict !== 'pending' || elapsed < windowStart) return null;
      const ok = requirementMet(spawn, mode, state);

      if (hold <= 0) {
        if (elapsed <= windowEnd) return ok ? decide(true) : null;
        return decide(false);
      }

      // Held object: engage inside the entry window, then keep it up to t + hold.
      if (ok) lastTrue = elapsed;
      if (elapsed <= windowEnd) {
        if (ok) engaged = true;
        return null;
      }
      if (!engaged || elapsed - lastTrue > HOLD_GRACE_SEC) return decide(false);
      if (elapsed >= t + hold) return decide(true);
      return null;
    },
  };
}
