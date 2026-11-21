import { describe, expect, it } from 'vitest';
import type { InputState, Spawn } from '@/contracts';
import { createJudge, requirementMet, type Verdict } from './judge';
import { HOLD_GRACE_SEC, WINDOW_AFTER_SEC, WINDOW_BEFORE_SEC } from './tuning';

const idle: InputState = {
  tracking: true,
  lane: 0,
  ducking: false,
  airborne: false,
  leftArmUp: false,
  rightArmUp: false,
};
const S = (p: Partial<InputState>): InputState => ({ ...idle, ...p });

/** Runs a judge at 60 fps from t-1 to t+hold+1 with `stateAt(elapsed)`. */
function run(
  spawn: Spawn,
  stateAt: (elapsed: number) => InputState,
  mode: 'floor' | 'treadmill' = 'floor',
  t = 10,
): { verdict: Verdict; at: number } {
  const j = createJudge(spawn, t, mode);
  const end = t + (spawn.holdSec ?? 0) + 1;
  for (let e = t - 1; e <= end; e += 1 / 60) {
    const v = j.sample(e, stateAt(e));
    if (v) return { verdict: v, at: e };
  }
  return { verdict: j.verdict, at: NaN };
}

const block: Spawn = { kind: 'block', lanes: [0, 1], requires: 'sidestep' };
const hurdle: Spawn = { kind: 'hurdle', lanes: [-1, 0, 1], requires: 'jump' };
const beam: Spawn = { kind: 'beam', lanes: [-1, 0, 1], requires: 'squat' };
const crate: Spawn = { kind: 'crate', lanes: [-1, 0, 1], requires: 'armsUp' };
const orbR: Spawn = { kind: 'orb', lanes: [1], requires: 'reachRight' };

describe('requirementMet', () => {
  it('block clears when the lane is free', () => {
    expect(requirementMet(block, 'floor', S({ lane: -1 }))).toBe(true);
    expect(requirementMet(block, 'floor', S({ lane: 1 }))).toBe(false);
  });
  it('crate needs both arms', () => {
    expect(requirementMet(crate, 'floor', S({ leftArmUp: true }))).toBe(false);
    expect(requirementMet(crate, 'floor', S({ leftArmUp: true, rightArmUp: true }))).toBe(true);
  });
  it('floor orb: in its lane with either arm', () => {
    expect(requirementMet(orbR, 'floor', S({ lane: 1, leftArmUp: true }))).toBe(true);
    expect(requirementMet(orbR, 'floor', S({ lane: 0, rightArmUp: true }))).toBe(false);
  });
  it('treadmill orb: lane picks the arm, lane does not matter', () => {
    const left: Spawn = { kind: 'orb', lanes: [-1], requires: 'reachLeft' };
    const mid: Spawn = { kind: 'orb', lanes: [0], requires: 'armsUp' };
    expect(requirementMet(left, 'treadmill', S({ lane: 1, leftArmUp: true }))).toBe(true);
    expect(requirementMet(left, 'treadmill', S({ rightArmUp: true }))).toBe(false);
    expect(requirementMet(orbR, 'treadmill', S({ rightArmUp: true }))).toBe(true);
    expect(requirementMet(mid, 'treadmill', S({ rightArmUp: true }))).toBe(false);
    expect(requirementMet(mid, 'treadmill', S({ leftArmUp: true, rightArmUp: true }))).toBe(true);
  });
});

describe('judge window', () => {
  it('clears as soon as the move happens inside the window', () => {
    const r = run(hurdle, (e) => S({ airborne: e > 9.8 && e < 10.25 }));
    expect(r.verdict).toBe('cleared');
    expect(r.at).toBeCloseTo(9.8, 1);
  });

  it('a move just before the window does not count', () => {
    const r = run(hurdle, (e) => S({ airborne: e > 9 && e < 10 - WINDOW_BEFORE_SEC - 0.05 }));
    expect(r.verdict).toBe('hit');
  });

  it('a late move inside t + 0.15 still clears', () => {
    const r = run(hurdle, (e) => S({ airborne: e > 10 + WINDOW_AFTER_SEC - 0.05 }));
    expect(r.verdict).toBe('cleared');
  });

  it('a hit is decided right after the window closes', () => {
    const r = run(hurdle, () => idle);
    expect(r.verdict).toBe('hit');
    expect(r.at).toBeGreaterThan(10 + WINDOW_AFTER_SEC);
    expect(r.at).toBeLessThan(10 + WINDOW_AFTER_SEC + 0.02);
  });

  it('block: standing in a blocked lane is a hit, a free lane clears', () => {
    expect(run(block, () => S({ lane: 0 })).verdict).toBe('hit');
    expect(run(block, () => S({ lane: -1 })).verdict).toBe('cleared');
  });

  it('orbs are collected or missed, never hit', () => {
    expect(run(orbR, () => S({ lane: 1, rightArmUp: true })).verdict).toBe('collected');
    expect(run(orbR, () => S({ lane: 1 })).verdict).toBe('missed');
  });

  it('decides exactly once', () => {
    const j = createJudge(hurdle, 10, 'floor');
    expect(j.sample(10, S({ airborne: true }))).toBe('cleared');
    expect(j.sample(10.01, idle)).toBeNull();
    expect(j.sample(11, idle)).toBeNull();
    expect(j.verdict).toBe('cleared');
  });
});

describe('held objects', () => {
  const longBeam: Spawn = { ...beam, holdSec: 2 };

  it('beam without holdSec clears on a short duck', () => {
    expect(run(beam, (e) => S({ ducking: e > 9.9 && e < 10.05 })).verdict).toBe('cleared');
  });

  it('long beam clears when held to the end, decided at t + holdSec', () => {
    const r = run(longBeam, (e) => S({ ducking: e > 9.8 }));
    expect(r.verdict).toBe('cleared');
    expect(r.at).toBeCloseTo(12, 1);
  });

  it('long beam tolerates a gap shorter than the grace', () => {
    const gap = HOLD_GRACE_SEC - 0.1;
    const r = run(longBeam, (e) => S({ ducking: e > 9.8 && !(e > 11 && e < 11 + gap) }));
    expect(r.verdict).toBe('cleared');
  });

  it('long beam is hit when the player stands up too long', () => {
    const r = run(longBeam, (e) => S({ ducking: e > 9.8 && e < 11 }));
    expect(r.verdict).toBe('hit');
    expect(r.at).toBeCloseTo(11 + HOLD_GRACE_SEC, 1);
  });

  it('long beam is hit when never engaged in the entry window', () => {
    expect(run(longBeam, (e) => S({ ducking: e > 10.5 })).verdict).toBe('hit');
  });

  it('overhead hold applies to crates too', () => {
    const longCrate: Spawn = { ...crate, holdSec: 1.5 };
    const up = S({ leftArmUp: true, rightArmUp: true });
    expect(run(longCrate, (e) => (e > 9.8 ? up : idle)).verdict).toBe('cleared');
    expect(run(longCrate, (e) => (e > 9.8 && e < 10.4 ? up : idle)).verdict).toBe('hit');
  });
});
