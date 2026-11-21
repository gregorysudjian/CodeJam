// Every recorded clip, replayed as synthetic variants (different body sizes and distances,
// landmark jitter, dropped frames): each must give the same moves at about the same times.
import { describe, expect, test } from 'vitest';
import type { MoveEvent } from '@/contracts';
import type { Point } from './detect';
import { jitter, replay, type ReplayOptions, scaleAbout } from './fixtures';
import { DETECTION, resetDetectionTuning } from './tuning';

/** Clip → replay options for the plain recording. Session 2 clips calibrate on their own start. */
const CLIPS: Record<string, ReplayOptions> = {
  standing: { upToMs: 5500 },
  sidestep: {},
  jump: { upToMs: 7200 }, // A walks to the laptop after 7.2 s
  squat: {},
  leaveFrame: {},
  armsUp: { calibrate: 'self' },
  reach: { calibrate: 'self' },
  mixed: { calibrate: 'self' },
};

const VARIANTS: Record<string, { opts: ReplayOptions; slackMs: number }> = {
  'shorter person (0.8×, same feet)': {
    opts: { transform: scaleAbout(0.5, 0.97, 0.8) },
    slackMs: 100,
  },
  'taller person (1.15×, same feet)': {
    opts: { transform: scaleAbout(0.5, 0.97, 1.15) },
    slackMs: 100,
  },
  'standing farther (0.7×)': { opts: { transform: scaleAbout(0.5, 0.5, 0.7) }, slackMs: 100 },
  'standing closer (1.25×)': { opts: { transform: scaleAbout(0.5, 0.6, 1.25) }, slackMs: 100 },
  'landmark jitter ±0.5%': { opts: { transform: jitter(0.005, 3) }, slackMs: 150 },
  'landmark jitter ±1%': { opts: { transform: jitter(0.01, 4) }, slackMs: 200 },
  '20% dropped frames': { opts: { dropFraction: 0.2 }, slackMs: 150 },
  '40% dropped frames (~17 FPS)': { opts: { dropFraction: 0.4 }, slackMs: 250 },
};

const kinds = (events: MoveEvent[]) => events.map((e) => e.type);

describe('recorded clips give the expected moves', () => {
  const expected: Record<string, string[]> = {
    standing: [],
    sidestep: ['sidestep', 'sidestep', 'sidestep', 'sidestep', 'sidestep'],
    jump: ['jump', 'jump', 'jump', 'jump'],
    squat: ['squat', 'squat'],
    leaveFrame: ['sidestep', 'sidestep', 'sidestep'], // walks right off-frame, then back across
    armsUp: ['armsUp', 'armsUp', 'armsUp'],
    reach: ['reachLeft', 'reachLeft', 'reachRight'],
    mixed: ['jump', 'squat', 'armsUp', 'armsUp', 'sidestep'],
  };
  for (const [clip, opts] of Object.entries(CLIPS)) {
    test(clip, () => {
      expect(kinds(replay(clip, opts).events)).toEqual(expected[clip]);
    });
  }
});

describe.each(Object.entries(VARIANTS))('%s', (_name, { opts, slackMs }) => {
  test.each(Object.keys(CLIPS))('%s: same moves at the same times, same tracking', (clip) => {
    const base = replay(clip, CLIPS[clip]);
    const v = replay(clip, { ...CLIPS[clip], ...opts });
    expect(kinds(v.events)).toEqual(kinds(base.events));
    v.events.forEach((e, i) =>
      expect(Math.abs(e.t - base.events[i].t)).toBeLessThanOrEqual(slackMs),
    );
    expect(v.tracking.map(([, on]) => on)).toEqual(base.tracking.map(([, on]) => on));
  });
});

describe('squat edge cases on the real squat clip', () => {
  /** A springy stand-up: hips pushed above standing height for 300 ms right after each rise. */
  const springUp =
    (lift: number) =>
    (pose: Point[], t = 0) =>
      (t > 2250 && t < 2550) || (t > 6850 && t < 7150)
        ? pose.map((p) => ({ ...p, y: p.y - lift }))
        : pose;

  test.each([0.03, 0.05, 0.08])(
    'standing up out of a squat onto the toes (+%s of the frame) is not a jump',
    (lift) => {
      expect(kinds(replay('squat', { transform: springUp(lift) }).events)).toEqual([
        'squat',
        'squat',
      ]);
    },
  );

  test('the guard is what prevents it (without the post-squat block the same clip jumps)', () => {
    DETECTION.JUMP_BLOCK_AFTER_SQUAT_MS = 0;
    try {
      expect(kinds(replay('squat', { transform: springUp(0.05) }).events)).toContain('jump');
    } finally {
      resetDetectionTuning();
    }
  });

  test.each([2, 3, 4])('a %s× slower squat still counts, without a jump', (timeScale) => {
    expect(kinds(replay('squat', { timeScale }).events)).toEqual(['squat', 'squat']);
  });
});
