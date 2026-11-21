import { describe, expect, it } from 'vitest';
import {
  feetOf,
  jumpHeight,
  landingSquash,
  leanFor,
  newPose,
  runnerPose,
  strideHz,
  topOf,
  type PoseInput,
} from './runnerPose';
import * as T from './tuning';

const base = (patch: Partial<PoseInput> = {}): PoseInput => ({
  phase: 0,
  run: 0,
  air: -1,
  land: Infinity,
  duck: 0,
  slide: 0,
  armL: 0,
  armR: 0,
  idle: 0,
  ...patch,
});
const poseOf = (patch: Partial<PoseInput>) => runnerPose(base(patch), newPose());

describe('runner pose', () => {
  it('stands about two metres tall with its feet on the floor', () => {
    const p = poseOf({});
    expect(topOf(p)).toBeGreaterThan(1.9);
    expect(topOf(p)).toBeLessThan(2.15);
    expect(feetOf(p)).toBeCloseTo(0, 5);
  });

  it('keeps a foot on the floor through the whole run cycle', () => {
    for (let k = 0; k < 32; k++) {
      const p = poseOf({ run: 1, phase: (k / 32) * Math.PI * 2 });
      expect(feetOf(p)).toBeGreaterThanOrEqual(-1e-9);
      expect(feetOf(p)).toBeLessThanOrEqual(T.RUN_BOB + 1e-9);
    }
  });

  it('swings the legs in opposition and the arms against the legs', () => {
    const p = poseOf({ run: 1, phase: Math.PI / 2 });
    expect(p.thighL).toBeGreaterThan(0.5);
    expect(p.thighR).toBeLessThan(-0.5);
    expect(Math.sign(p.shoulderL)).toBe(-Math.sign(p.thighL));
  });

  // The runner must read as "under the beam": its head clears the beam's underside.
  it.each([
    ['squat, standing still', 0],
    ['slide, running', 1],
  ])('ducks below the beam (%s)', (_, slide) => {
    for (const run of [0, 1]) {
      const p = poseOf({ duck: 1, slide, run, phase: 1.3 });
      expect(topOf(p)).toBeLessThan(T.BEAM_HEIGHT - 0.1);
      expect(feetOf(p)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('clears the hurdle at the top of the jump', () => {
    const p = poseOf({ air: 0.5, run: 1 });
    expect(jumpHeight(0.5) + feetOf(p)).toBeGreaterThan(T.HURDLE_HEIGHT + 0.3);
  });

  it('jump arc: starts and ends on the floor, peaks at JUMP_HEIGHT', () => {
    expect(jumpHeight(0)).toBe(0);
    expect(jumpHeight(1)).toBe(0);
    expect(jumpHeight(0.5)).toBeCloseTo(T.JUMP_HEIGHT);
    expect(jumpHeight(-1)).toBe(0);
  });

  it('stretches at take-off and squashes on landing, then recovers', () => {
    expect(poseOf({ air: 0.02 }).squash).toBeGreaterThan(1.05);
    expect(landingSquash(T.LAND_SEC / 2)).toBeCloseTo(1 - T.LAND_SQUASH);
    expect(landingSquash(T.LAND_SEC)).toBe(1);
    expect(landingSquash(Infinity)).toBe(1);
    const landing = poseOf({ land: T.LAND_SEC / 2 });
    expect(landing.squash).toBeLessThan(0.9);
    expect(feetOf(landing)).toBeGreaterThanOrEqual(-1e-9); // knees give, feet stay down
  });

  it('raised arms override the run swing', () => {
    const p = poseOf({ run: 1, phase: Math.PI / 2, armL: 1 });
    expect(p.raiseL).toBe(1);
    expect(p.shoulderL).toBeCloseTo(0);
    expect(p.raiseR).toBe(0);
    expect(p.shoulderR).not.toBe(0);
  });

  it('leans into a lane change, capped', () => {
    expect(leanFor(10)).toBeLessThan(0); // moving right rolls the top to the right
    expect(leanFor(-10)).toBeGreaterThan(0);
    expect(Math.abs(leanFor(1000))).toBe(T.LEAN_MAX);
    expect(leanFor(0)).toBeCloseTo(0);
  });

  it('strides faster at a higher speed', () => {
    expect(strideHz(T.SPEED_MAX)).toBeGreaterThan(strideHz(T.SPEED_MIN));
    expect(strideHz(T.SPEED_MIN)).toBeGreaterThan(1.5);
    expect(strideHz(T.SPEED_MAX)).toBeLessThan(3);
  });
});
