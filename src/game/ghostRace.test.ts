import { describe, expect, it } from 'vitest';
import type { InputState, Level, Spawn, Wave } from '@/contracts';
import { createCore } from './core';
import { createGhostRecorder, type GhostRun } from './ghost';
import { createGhostRace, raceLead } from './ghostRace';

const idle: InputState = {
  tracking: true,
  lane: 0,
  ducking: false,
  airborne: false,
  leftArmUp: false,
  rightArmUp: false,
};
const hurdle: Spawn = { kind: 'hurdle', lanes: [-1, 0, 1], requires: 'jump' };
const block: Spawn = { kind: 'block', lanes: [0, 1], requires: 'sidestep' };
const orb: Spawn = { kind: 'orb', lanes: [-1], requires: 'reachLeft' };
const w = (t: number, ...spawns: Spawn[]): Wave => ({ t, intensity: 0.5, spawns });
const level: Level = {
  config: { workout: 'fullBody', mode: 'floor', durationSec: 20, seed: 1 },
  waves: [w(4, hurdle), w(7, block), w(10, orb), w(13, hurdle)],
};

/** A player who clears everything except the last hurdle. */
function perfectUntil13(e: number): InputState {
  return {
    ...idle,
    airborne: e > 3.8 && e < 4.2,
    lane: e > 6.8 ? -1 : 0,
    leftArmUp: e > 9.8 && e < 10.1,
  };
}

/** Plays the level for real at 60 fps, recording a ghost. Returns the run and its counts. */
function recordRun(stateAt: (e: number) => InputState): GhostRun {
  const counts = { cleared: 0, collected: 0, hit: 0 };
  const core = createCore(level, {
    verdict: (_i, v) => {
      if (v === 'cleared' || v === 'collected' || v === 'hit') counts[v]++;
    },
  });
  const rec = createGhostRecorder(20);
  core.start();
  for (let i = 0; i < 20 * 60 && !core.finished(); i++) {
    const s = stateAt(core.elapsed() + 1 / 60);
    core.step(1 / 60, s, i);
    rec.sample(core.elapsed(), s);
  }
  return { v: 1, fingerprint: 'x', hz: 20, samples: rec.samples, result: counts, savedAt: 0 };
}

describe('ghost race', () => {
  it('re-judging the recording gives the ghost the result it really had', () => {
    const run = recordRun(perfectUntil13);
    expect(run.result).toEqual({ cleared: 2, collected: 1, hit: 1 });
    const race = createGhostRace(level, run);
    race.syncTo(20);
    expect(race.ghost).toEqual(run.result);
  });

  it('tracks the ghost live: by 8 s it has jumped and sidestepped, not yet reached the orb', () => {
    const race = createGhostRace(level, recordRun(perfectUntil13));
    race.syncTo(8);
    expect(race.ghost).toEqual({ cleared: 2, collected: 0, hit: 0 });
    race.syncTo(11);
    expect(race.ghost.collected).toBe(1);
  });

  it('syncing in big jumps or small steps gives the same result', () => {
    const run = recordRun(perfectUntil13);
    const a = createGhostRace(level, run);
    a.syncTo(20);
    const b = createGhostRace(level, run);
    for (let e = 0; e <= 20; e += 0.37) b.syncTo(e);
    b.syncTo(20);
    expect(b.ghost).toEqual(a.ghost);
  });

  it('never goes backwards and stops at the end of the round', () => {
    const race = createGhostRace(level, recordRun(perfectUntil13));
    race.syncTo(12);
    const before = { ...race.ghost };
    race.syncTo(5); // a stale time changes nothing
    expect(race.ghost).toEqual(before);
    race.syncTo(500);
    expect(race.ghost.hit).toBe(1);
  });

  it('raceLead is player minus ghost in cleared + collected', () => {
    expect(
      raceLead({ cleared: 5, collected: 2, hit: 0 }, { cleared: 4, collected: 1, hit: 3 }),
    ).toBe(2);
    expect(
      raceLead({ cleared: 1, collected: 0, hit: 0 }, { cleared: 3, collected: 0, hit: 0 }),
    ).toBe(-2);
  });
});
