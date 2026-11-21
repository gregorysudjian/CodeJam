import type { InputState, Lane, MoveType, PlayMode, Spawn } from '@/contracts';
import type { Item } from './core';
import { requirementMet } from './judge';
import * as T from './tuning';

/**
 * Timing probe for the camera session (`?debug=timing`). For every object it records when the
 * move that clears it was seen, as intervals relative to the judging time t (negative = early),
 * from t - 1 s until 1 s after the object (its hold included). From that:
 * - per move: the median first-seen offset, the share inside the judging window and the lead
 *   that would centre the median (for tuning VISUAL_LEAD_SEC). Objects already satisfied when
 *   the probe starts watching (standing in the free lane already) teach nothing and are skipped;
 * - per hit or missed orb: why (explainMiss). Never seen, early or late and by how much, or a
 *   hold that was dropped or let go: timing, detection or the player, told apart.
 */
export interface MoveTiming {
  move: MoveType;
  seen: number; // objects where the move was seen around t
  medianOffsetSec: number;
  inWindowShare: number; // 0 to 1
  leadSec: number; // current VISUAL_LEAD_SEC
  suggestedLeadSec: number;
  /** Median + lead: the webcam lag, if the player moved as the object reached the runner. */
  lagSec: number;
}

/** When each move was first seen relative to its judging time (seconds, negative = early). */
export type TimingSamples = Map<MoveType, number[]>;

/** Why an object was hit or an orb missed, from when its move was seen. */
export interface Miss {
  cause: 'not seen' | 'early' | 'late' | 'dropped' | 'let go' | 'in window';
  detail: string;
}

export interface TimingProbe {
  /** Feed one frame of the running round (game time and the polled input). */
  sample(elapsed: number, state: InputState): void;
  /** This round's first-seen offsets, to combine rounds (mergeTiming). */
  samples(): TimingSamples;
  /** This round's table (summarizeTiming with the current leads). */
  report(): MoveTiming[];
  /** Why this object was hit or missed. Call at the end of the round, so late moves count. */
  explain(item: Item): Miss;
}

/** [start, end] in seconds relative to t; the end is the last frame the move was still seen. */
type Interval = [number, number];

const WINDOW_MID = (T.WINDOW_AFTER_SEC - T.WINDOW_BEFORE_SEC) / 2; // -0.1 s: middle of the window

/** Seconds an object is held (beams and crates), else 0: the judge's rule. */
const holdOf = (spawn: Spawn): number =>
  spawn.kind === 'beam' || spawn.kind === 'crate' ? (spawn.holdSec ?? 0) : 0;

export function createTimingProbe(
  items: readonly Item[],
  mode: PlayMode,
  leads: T.Leads,
): TimingProbe {
  const watched = new Map<Item, { first: number; open: boolean; seen: Interval[] }>();
  const samples = (): TimingSamples => {
    const byMove: TimingSamples = new Map();
    for (const [item, w] of watched) {
      const start = w.seen[0]?.[0];
      if (start === undefined || start > T.TIMING_PROBE_SEC) continue;
      // Already satisfied in the probe's first frame: the player did not have to move.
      if (start - w.first < T.TIMING_PROBE_FIRST_FRAME_SEC) continue;
      const move = item.spawn.requires;
      byMove.set(move, [...(byMove.get(move) ?? []), start]);
    }
    return byMove;
  };

  return {
    sample(elapsed, state) {
      for (const item of items) {
        const rel = elapsed - item.wave.t;
        if (rel < -T.TIMING_PROBE_SEC) break; // items are in time order
        if (rel > holdOf(item.spawn) + T.TIMING_PROBE_SEC) continue;
        let w = watched.get(item);
        if (!w) {
          w = { first: rel, open: false, seen: [] };
          watched.set(item, w);
        }
        if (!requirementMet(item.spawn, mode, state)) w.open = false;
        else if (w.open) w.seen[w.seen.length - 1]![1] = rel;
        else {
          w.seen.push([rel, rel]);
          w.open = true;
        }
      }
    },
    samples,
    report: () => summarizeTiming(samples(), leads()),
    explain: (item) => explainMiss(item.spawn, watched.get(item)?.seen ?? []),
  };
}

const sec = (x: number): string => `${x < 0 ? '-' : '+'}${Math.abs(x).toFixed(2)} s`;

/**
 * Why an object was hit (or an orb missed), from the intervals in which its move was seen,
 * relative to t. Mirrors the judge: the move must be seen in [t - 0.35, t + 0.15]; a held object
 * must then stay seen until t + holdSec, with gaps of at most HOLD_GRACE_SEC.
 */
export function explainMiss(spawn: Spawn, seen: readonly (readonly [number, number])[]): Miss {
  const open = -T.WINDOW_BEFORE_SEC;
  const close = T.WINDOW_AFTER_SEC;
  if (seen.length === 0) return { cause: 'not seen', detail: 'never seen within 1 s of its time' };
  const entry = seen.find(([a, b]) => b >= open && a <= close);
  if (!entry) {
    const before = [...seen].reverse().find(([, b]) => b < open);
    const after = seen.find(([a]) => a > close);
    if (after && (!before || after[0] - close <= open - before[1])) {
      return {
        cause: 'late',
        detail: `first seen at ${sec(after[0])}: ${(after[0] - close).toFixed(2)} s after the window closed (${sec(close)})`,
      };
    }
    const [a, b] = before!;
    return {
      cause: 'early',
      detail: `seen ${sec(a)} to ${sec(b)}: gone ${(open - b).toFixed(2)} s before the window opened (${sec(open)})`,
    };
  }
  const hold = holdOf(spawn);
  if (hold <= 0) {
    return {
      cause: 'in window',
      detail: `seen at ${sec(Math.max(entry[0], open))}, inside the window`,
    };
  }
  // A held object: follow it from the entry, bridging gaps up to the grace, as the judge does.
  let end = entry[1];
  for (const [a, b] of seen) {
    if (b <= end) continue;
    if (a - end > T.HOLD_GRACE_SEC) {
      if (a < hold) {
        return {
          cause: 'dropped',
          detail: `held from ${sec(Math.max(entry[0], open))}, gone at ${sec(end)} for ${(a - end).toFixed(2)} s (grace ${T.HOLD_GRACE_SEC} s), back at ${sec(a)}; the hold lasts to ${sec(hold)}`,
        };
      }
      break; // seen again only after the hold: it was let go
    }
    end = Math.max(end, b);
  }
  if (end >= hold - T.HOLD_GRACE_SEC) {
    return { cause: 'in window', detail: `held to ${sec(end)} of a hold to ${sec(hold)}` };
  }
  return {
    cause: 'let go',
    detail: `held from ${sec(Math.max(entry[0], open))}, let go at ${sec(end)}: ${(hold - end).toFixed(2)} s before the hold ended (${sec(hold)})`,
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
        lagSec: round2(median + leads[move]),
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

/**
 * The lead table to paste into VISUAL_LEAD_SEC: the suggested lead for every move that was
 * measured, the current one for the rest.
 */
export function leadsToPaste(rows: readonly MoveTiming[], current: T.LeadTable): string {
  const next: Record<MoveType, number> = { ...current };
  for (const r of rows) next[r.move] = r.suggestedLeadSec;
  const order: MoveType[] = ['jump', 'sidestep', 'squat', 'armsUp', 'reachLeft', 'reachRight'];
  return `{ ${order.map((m) => `${m}: ${next[m]}`).join(', ')} }`;
}

/** For the hit report: "beam (squat, held 1.6 s)", "block (sidestep, free lane 1)". */
export function describeSpawn(s: Spawn): string {
  const free = ([-1, 0, 1] as Lane[]).find((l) => !s.lanes.includes(l));
  const where =
    s.kind === 'block' ? `, free lane ${free}` : s.kind === 'orb' ? `, lane ${s.lanes[0]}` : '';
  return `${s.kind} (${s.requires}${where}${s.holdSec ? `, held ${s.holdSec} s` : ''})`;
}

const round2 = (x: number): number => Math.round(x * 100) / 100;
