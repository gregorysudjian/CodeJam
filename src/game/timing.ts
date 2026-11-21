import type { InputState, MoveType, PlayMode } from '@/contracts';
import type { Item } from './core';
import { requirementMet } from './judge';
import * as T from './tuning';

/**
 * Timing probe for tuning VISUAL_LEAD_SEC in front of the camera (`?debug=timing`).
 * For every object it records when its move was first seen, relative to the judging time t
 * (negative = early). Moves already satisfied before the probe starts watching (standing in
 * the free lane already) teach nothing and are skipped. The report gives, per move, the
 * median offset, the share inside the judging window, and the lead that would put that
 * median in the middle of the window.
 */
export interface MoveTiming {
  move: MoveType;
  seen: number; // objects where the move was seen around t
  medianOffsetSec: number;
  inWindowShare: number; // 0 to 1
  leadSec: number; // current VISUAL_LEAD_SEC
  suggestedLeadSec: number;
}

/** When each move was seen relative to its judging time (seconds, negative = early), by move. */
export type TimingSamples = Map<MoveType, number[]>;

export interface TimingProbe {
  /** Feed one frame of the running round (game time and the polled input). */
  sample(elapsed: number, state: InputState): void;
  /** This round's raw offsets, to combine rounds (mergeTiming). */
  samples(): TimingSamples;
  /** This round's table (summarizeTiming with the current leads). */
  report(): MoveTiming[];
}

const WINDOW_MID = (T.WINDOW_AFTER_SEC - T.WINDOW_BEFORE_SEC) / 2; // -0.1 s: middle of the window

export function createTimingProbe(
  items: readonly Item[],
  mode: PlayMode,
  leads: T.Leads,
): TimingProbe {
  const seenAt = new Map<Item, number>();
  const skipped = new WeakSet<Item>();
  const samples = (): TimingSamples => {
    const byMove: TimingSamples = new Map();
    for (const [item, offset] of seenAt) {
      const move = item.spawn.requires;
      byMove.set(move, [...(byMove.get(move) ?? []), offset]);
    }
    return byMove;
  };

  return {
    sample(elapsed, state) {
      for (const item of items) {
        const t = item.wave.t;
        if (elapsed < t - T.TIMING_PROBE_SEC) break; // items are in time order
        if (elapsed > t + T.TIMING_PROBE_SEC || seenAt.has(item) || skipped.has(item)) continue;
        if (!requirementMet(item.spawn, mode, state)) continue;
        // Already satisfied in the probe's first frame: the player did not have to move.
        if (elapsed - (t - T.TIMING_PROBE_SEC) < T.TIMING_PROBE_FIRST_FRAME_SEC) skipped.add(item);
        else seenAt.set(item, elapsed - t);
      }
    },
    samples,
    report: () => summarizeTiming(samples(), leads()),
  };
}

/**
 * One row per move: the median offset, the share inside the judging window, the lead it was
 * played with and the lead that would put the median in the middle of the window.
 */
export function summarizeTiming(
  samples: ReadonlyMap<MoveType, readonly number[]>,
  leads: T.LeadTable,
): MoveTiming[] {
  return [...samples]
    .filter(([, offsets]) => offsets.length > 0)
    .map(([move, offsets]) => {
      const sorted = [...offsets].sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1]!;
      const inWindow = offsets.filter(
        (o) => o >= -T.WINDOW_BEFORE_SEC && o <= T.WINDOW_AFTER_SEC,
      ).length;
      // offset ≈ lag - lead, so raising the lead by (median - middle) centres the median.
      const suggested = Math.min(
        T.TIMING_MAX_LEAD_SEC,
        Math.max(0, leads[move] + median - WINDOW_MID),
      );
      return {
        move,
        seen: offsets.length,
        medianOffsetSec: round2(median),
        inWindowShare: round2(inWindow / offsets.length),
        leadSec: leads[move],
        suggestedLeadSec: round2(suggested),
      };
    });
}

/** Adds `more` into `into`, in place: one table over several rounds of the tuning session. */
export function mergeTiming(
  into: TimingSamples,
  more: ReadonlyMap<MoveType, readonly number[]>,
): void {
  for (const [move, offsets] of more) into.set(move, [...(into.get(move) ?? []), ...offsets]);
}

const round2 = (x: number): number => Math.round(x * 100) / 100;
