import type { Level } from '@/contracts';
import { createCore } from './core';
import { ghostPoseAt, neutralPose, type GhostResult, type GhostRun } from './ghost';
import * as T from './tuning';

/**
 * Live race against the ghost. A shadow copy of the game's rules (core.ts) judges the ghost's
 * recorded moves against the same level, so at any moment of the round we know what the ghost
 * had scored by then. Driven by the main round's game time, so pauses never make it drift.
 * Pure: no drawing, no events outside, tested.
 */
export interface GhostRace {
  /** Brings the ghost's round up to the main round's game time. */
  syncTo(elapsed: number): void;
  /** What the ghost has cleared, collected and hit so far. */
  readonly ghost: GhostResult;
}

export function createGhostRace(level: Level, ghost: GhostRun): GhostRace {
  const result: GhostResult = { cleared: 0, collected: 0, hit: 0 };
  const shadow = createCore(level, {
    verdict: (_item, v) => {
      if (v === 'cleared' || v === 'collected' || v === 'hit') result[v]++;
    },
  });
  shadow.start();
  const pose = neutralPose();
  const state = { tracking: true, ...pose };

  return {
    ghost: result,
    syncTo(elapsed) {
      // Same step size limit as the real loop, so both judge at comparable sample times.
      while (!shadow.finished() && shadow.elapsed() < elapsed - 1e-9) {
        const dt = Math.min(T.MAX_DT_SEC, elapsed - shadow.elapsed());
        ghostPoseAt(ghost.samples, ghost.hz, shadow.elapsed() + dt, pose);
        state.lane = pose.lane;
        state.airborne = pose.airborne;
        state.ducking = pose.ducking;
        state.leftArmUp = pose.leftArmUp;
        state.rightArmUp = pose.rightArmUp;
        shadow.step(dt, state, 0);
      }
    },
  };
}

/** Player minus ghost in cleared + collected: positive = the player is ahead. */
export function raceLead(player: GhostResult, ghost: GhostResult): number {
  return player.cleared + player.collected - (ghost.cleared + ghost.collected);
}
