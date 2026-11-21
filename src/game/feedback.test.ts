import { describe, expect, it } from 'vitest';
import type { InputState, Level, Spawn } from '@/contracts';
import { createCore } from './core';
import { comboLabel, comboMilestone, gradeFor } from './feedback';
import * as T from './tuning';

describe('gradeFor', () => {
  it('keyboard: on time is PERFECT, early is GOOD, the end of the window is LATE', () => {
    expect(gradeFor(0, 'keyboard')).toBe('perfect');
    expect(gradeFor(-0.1, 'keyboard')).toBe('perfect');
    expect(gradeFor(-0.3, 'keyboard')).toBe('good');
    expect(gradeFor(0.1, 'keyboard')).toBe('late');
  });

  it('camera: a move made as the object reaches the runner is PERFECT despite the lag', () => {
    // Each lead is the measured lag minus 0.1 s (tuning.ts), so an object drawn `lead` early
    // and reacted to on sight is seen lag − lead = 0.1 s after its time t.
    expect(gradeFor(0.1, 'pose')).toBe('perfect');
    expect(gradeFor(0, 'pose')).toBe('perfect');
    expect(gradeFor(-0.3, 'pose')).toBe('good');
    expect(gradeFor(0.14, 'pose')).toBe('late');
  });

  it('every offset inside the judging window gets a grade, and LATE only at its end', () => {
    for (const input of ['pose', 'keyboard'] as const) {
      const { lateFrom, perfectFrom } = T.GRADE_BANDS[input];
      expect(perfectFrom).toBeGreaterThan(-T.WINDOW_BEFORE_SEC);
      expect(lateFrom).toBeLessThan(T.WINDOW_AFTER_SEC);
      expect(lateFrom).toBeGreaterThan(perfectFrom);
    }
  });
});

describe('comboMilestone', () => {
  it('fires at 5, 10, 20, then every 10', () => {
    const hits: number[] = [];
    for (let s = 1; s <= 45; s++) {
      const m = comboMilestone(s - 1, s);
      if (m !== null) hits.push(m);
    }
    expect(hits).toEqual([5, 10, 20, 30, 40]);
  });

  it('never fires on a reset or a repeat', () => {
    expect(comboMilestone(10, 0)).toBeNull();
    expect(comboMilestone(10, 10)).toBeNull();
    expect(comboMilestone(5, 6)).toBeNull();
  });

  it('a jump over several gives the highest', () => {
    expect(comboMilestone(4, 12)).toBe(10);
    expect(comboMilestone(19, 31)).toBe(30);
  });

  it('labels the combo from the second clear', () => {
    expect(comboLabel(1)).toBeNull();
    expect(comboLabel(2)).toBe('2 COMBO');
  });
});

describe('core reports when the move was first seen', () => {
  const idle: InputState = {
    tracking: true,
    lane: 0,
    ducking: false,
    airborne: false,
    leftArmUp: false,
    rightArmUp: false,
  };
  const run = (spawn: Spawn, stateAt: (e: number) => InputState) => {
    const level: Level = {
      config: { workout: 'fullBody', mode: 'floor', durationSec: 8, seed: 1 },
      waves: [{ t: 4, intensity: 0.5, spawns: [spawn] }],
    };
    const got: [string, number | null][] = [];
    const core = createCore(level, { verdict: (_, v, offset) => got.push([v, offset]) });
    core.start();
    for (let i = 0; i < 8 * 60; i++) core.step(1 / 60, stateAt(core.elapsed()), i * 16);
    return got;
  };

  it('a hurdle jumped 0.1 s early reports about -0.1', () => {
    const got = run({ kind: 'hurdle', lanes: [-1, 0, 1], requires: 'jump' }, (e) => ({
      ...idle,
      airborne: e >= 3.9 && e < 4.4,
    }));
    expect(got).toHaveLength(1);
    expect(got[0]![0]).toBe('cleared');
    expect(got[0]![1]).toBeCloseTo(-0.1, 1);
  });

  it('a held beam reports when the squat started, not when the hold ended', () => {
    const got = run({ kind: 'beam', lanes: [-1, 0, 1], requires: 'squat', holdSec: 1.5 }, (e) => ({
      ...idle,
      ducking: e >= 4.05 && e < 5.8,
    }));
    expect(got[0]![0]).toBe('cleared');
    expect(got[0]![1]).toBeCloseTo(0.05, 1);
  });

  it('a hit has no offset', () => {
    const got = run({ kind: 'hurdle', lanes: [-1, 0, 1], requires: 'jump' }, () => idle);
    expect(got).toEqual([['hit', null]]);
  });
});
