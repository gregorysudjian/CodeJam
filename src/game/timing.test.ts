import { describe, expect, it } from 'vitest';
import type { InputState, Level, MoveType, Spawn, Wave } from '@/contracts';
import { createCore } from './core';
import { createTimingProbe, mergeTiming, summarizeTiming, type TimingSamples } from './timing';

const idle: InputState = {
  tracking: true,
  lane: 0,
  ducking: false,
  airborne: false,
  leftArmUp: false,
  rightArmUp: false,
};
const hurdle: Spawn = { kind: 'hurdle', lanes: [-1, 0, 1], requires: 'jump' };
const beam: Spawn = { kind: 'beam', lanes: [-1, 0, 1], requires: 'squat' };
const blockFreeLeft: Spawn = { kind: 'block', lanes: [0, 1], requires: 'sidestep' };
const blockFreeCentre: Spawn = { kind: 'block', lanes: [-1, 1], requires: 'sidestep' };
const NO_LEAD: Record<MoveType, number> = {
  jump: 0,
  sidestep: 0,
  squat: 0,
  armsUp: 0,
  reachLeft: 0,
  reachRight: 0,
};
const w = (t: number, ...spawns: Spawn[]): Wave => ({ t, intensity: 0.5, spawns });
const itemsOf = (waves: Wave[]) =>
  createCore({
    config: { workout: 'fullBody', mode: 'floor', durationSec: 30, seed: 1 },
    waves,
  } satisfies Level).items;

/** Runs the probe at 60 fps over 0..30 s with `stateAt(elapsed)`. */
function probe(waves: Wave[], stateAt: (e: number) => InputState, leads = NO_LEAD) {
  const p = createTimingProbe(itemsOf(waves), 'floor', () => leads);
  for (let e = 0; e <= 30; e += 1 / 60) p.sample(e, stateAt(e));
  return p.report();
}

describe('timing probe', () => {
  it('reports when each move was seen relative to its judging time', () => {
    // three jumps, each seen 0.25 s late
    const ts = [5, 10, 15];
    const report = probe(
      ts.map((t) => w(t, hurdle)),
      (e) => ({
        ...idle,
        airborne: ts.some((t) => e >= t + 0.25 && e < t + 0.7),
      }),
    );
    expect(report).toHaveLength(1);
    expect(report[0]).toMatchObject({ move: 'jump', seen: 3, inWindowShare: 0 });
    expect(report[0]!.medianOffsetSec).toBeCloseTo(0.25, 1);
  });

  it('suggests the lead that centres the median in the window', () => {
    // squats seen 0.25 s late with no lead: +0.35 s of lead moves them to -0.1 s
    const ts = [5, 10, 15];
    const [squat] = probe(
      ts.map((t) => w(t, beam)),
      (e) => ({
        ...idle,
        ducking: ts.some((t) => e >= t + 0.25 && e < t + 1),
      }),
    );
    expect(squat!.suggestedLeadSec).toBeCloseTo(0.35, 1);
  });

  it('a well-timed move keeps its lead', () => {
    const ts = [5, 10];
    const [jump] = probe(
      ts.map((t) => w(t, hurdle)),
      (e) => ({ ...idle, airborne: ts.some((t) => e >= t - 0.1 && e < t + 0.35) }),
      { ...NO_LEAD, jump: 0.1 },
    );
    expect(jump!.inWindowShare).toBe(1);
    expect(jump!.suggestedLeadSec).toBeCloseTo(0.1, 1);
  });

  it('skips objects the player did not have to move for', () => {
    // standing in the centre already clears a block that leaves the centre free
    const report = probe([w(5, blockFreeCentre)], () => idle);
    expect(report).toEqual([]);
  });

  it('combines rounds into one table (a steadier median for the tuning session)', () => {
    const ts = [5, 10, 15];
    const round = (late: number) => {
      const p = createTimingProbe(itemsOf(ts.map((t) => w(t, hurdle))), 'floor', () => NO_LEAD);
      for (let e = 0; e <= 30; e += 1 / 60)
        p.sample(e, { ...idle, airborne: ts.some((t) => e >= t + late && e < t + late + 0.45) });
      return p;
    };
    const session: TimingSamples = new Map();
    mergeTiming(session, round(0.1).samples());
    mergeTiming(session, round(0.3).samples());
    mergeTiming(session, round(0.3).samples());
    const [jump] = summarizeTiming(session, NO_LEAD);
    expect(jump).toMatchObject({ move: 'jump', seen: 9 });
    expect(jump!.medianOffsetSec).toBeCloseTo(0.3, 1); // 3 at 0.1 s, 6 at 0.3 s
    expect(summarizeTiming(new Map([['jump', []]]), NO_LEAD)).toEqual([]); // nothing seen: no row
    // A round's own table is the same summary of its own samples.
    const one = round(0.1);
    expect(one.report()).toEqual(summarizeTiming(one.samples(), NO_LEAD));
  });

  it('counts a sidestep made in time for a block', () => {
    const report = probe([w(5, blockFreeLeft)], (e) => ({ ...idle, lane: e >= 4.8 ? -1 : 0 }));
    expect(report[0]).toMatchObject({ move: 'sidestep', seen: 1 });
    expect(report[0]!.medianOffsetSec).toBeCloseTo(-0.2, 1);
  });
});
