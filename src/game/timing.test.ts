import { describe, expect, it } from 'vitest';
import type { InputState, Level, MoveType, Spawn, Wave } from '@/contracts';
import { createCore } from './core';
import {
  createTimingProbe,
  describeSpawn,
  explainMiss,
  frameStats,
  leadsToPaste,
  mergeTiming,
  summarizeTiming,
  type TimingSamples,
} from './timing';
import { VISUAL_LEAD_SEC } from './tuning';

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
    expect(jump!.lagSec).toBeCloseTo(0, 1); // seen 0.1 s early with a 0.1 s lead: no lag
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

describe('why a hit happened (explainMiss)', () => {
  const heldBeam: Spawn = { ...beam, holdSec: 1.6 };
  const heldCrate: Spawn = { kind: 'crate', lanes: [-1, 0, 1], requires: 'armsUp', holdSec: 1.6 };

  it('never seen: a detection problem (or the player did not move)', () => {
    expect(explainMiss(hurdle, []).cause).toBe('not seen');
  });

  it('late or early, by how much, whichever is closer to the window', () => {
    const late = explainMiss(hurdle, [[0.32, 0.7]]);
    expect(late.cause).toBe('late');
    expect(late.detail).toContain('+0.32 s');
    expect(late.detail).toContain('0.17 s after the window closed');
    const early = explainMiss(hurdle, [[-0.9, -0.45]]);
    expect(early.cause).toBe('early');
    expect(early.detail).toContain('0.10 s before the window opened');
    // early by 0.15 s, late by 0.05 s: it was late
    expect(
      explainMiss(hurdle, [
        [-0.9, -0.5],
        [0.2, 0.6],
      ]).cause,
    ).toBe('late');
  });

  it('a held object dropped for longer than the grace, and back before its end', () => {
    const m = explainMiss(heldBeam, [
      [-0.2, 0.8],
      [1.2, 1.7],
    ]);
    expect(m.cause).toBe('dropped');
    expect(m.detail).toContain('gone at +0.80 s for 0.40 s');
    expect(
      explainMiss(heldCrate, [
        [-0.2, 0.8],
        [1.2, 1.7],
      ]).cause,
    ).toBe('dropped');
  });

  it('a held object let go too soon; short gaps are bridged like the judge does', () => {
    const m = explainMiss(heldBeam, [
      [-0.2, 0.5],
      [0.7, 1.0],
    ]); // 0.2 s gap bridged
    expect(m.cause).toBe('let go');
    expect(m.detail).toContain('let go at +1.00 s: 0.60 s before the hold ended');
    // seen again only after the hold: still let go, not dropped
    expect(
      explainMiss(heldBeam, [
        [-0.2, 0.9],
        [1.9, 2.2],
      ]).cause,
    ).toBe('let go');
  });

  it('a hold kept to within the grace of its end is not blamed', () => {
    expect(explainMiss(heldBeam, [[-0.2, 1.4]]).cause).toBe('in window');
  });

  it('the probe records what the judge saw, late moves included', () => {
    const t = 5;
    const items = itemsOf([w(t, heldBeam), w(10, hurdle)]);
    const p = createTimingProbe(items, 'floor', () => NO_LEAD);
    for (let e = 0; e <= 12; e += 1 / 60) {
      const ducking = (e >= t - 0.2 && e < t + 0.8) || (e >= t + 1.2 && e < t + 1.7);
      p.sample(e, { ...idle, ducking, airborne: e >= 10.4 && e < 10.85 });
    }
    expect(p.explain(items[0]!)).toMatchObject({ cause: 'dropped' });
    expect(p.explain(items[1]!)).toMatchObject({ cause: 'late' });
  });
});

describe('camera-session helpers', () => {
  it('leadsToPaste: suggested leads for measured moves, current ones for the rest', () => {
    const rows = summarizeTiming(new Map([['squat', [0.15, 0.2, 0.25]]]), VISUAL_LEAD_SEC.pose);
    expect(leadsToPaste(rows, VISUAL_LEAD_SEC.pose)).toBe(
      `{ jump: 0.1, sidestep: 0.25, squat: ${rows[0]!.suggestedLeadSec}, armsUp: 0.3, reachLeft: 0.3, reachRight: 0.3 }`,
    );
  });

  it('describeSpawn names the object and what clears it', () => {
    expect(describeSpawn({ ...beam, holdSec: 1.6 })).toBe('beam (squat, held 1.6 s)');
    expect(describeSpawn(blockFreeLeft)).toBe('block (sidestep, free lane -1)');
    expect(describeSpawn({ kind: 'orb', lanes: [1], requires: 'reachRight' })).toBe(
      'orb (reachRight, lane 1)',
    );
  });

  it('frameStats: median and slowest-5 % frame rate, worst frame', () => {
    const frames = [...Array<number>(95).fill(1 / 60), ...Array<number>(5).fill(1 / 20)];
    expect(frameStats(frames)).toEqual({
      frames: 100,
      medianFps: 60,
      slowFps: 20,
      worstFrameMs: 50,
    });
    expect(frameStats([])).toMatchObject({ frames: 0 });
  });
});
