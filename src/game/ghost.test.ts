import { describe, expect, it } from 'vitest';
import type { InputState, Lane, Level } from '@/contracts';
import {
  compareRuns,
  createGhostRecorder,
  finishOutcome,
  decodePose,
  encodePose,
  ghostPoseAt,
  isBetter,
  ghostKey,
  levelFingerprint,
  neutralPose,
  parseGhost,
  type GhostPose,
  type GhostRun,
} from './ghost';

const idle: InputState = {
  tracking: true,
  lane: 0,
  ducking: false,
  airborne: false,
  leftArmUp: false,
  rightArmUp: false,
};
const level = (over: Partial<Level['config']> = {}, t = 4): Level => ({
  config: { workout: 'fullBody', mode: 'floor', durationSec: 45, seed: 1, ...over },
  waves: [
    { t, intensity: 0.2, spawns: [{ kind: 'block', lanes: [0, 1], requires: 'sidestep' }] },
    {
      t: 7,
      intensity: 0.3,
      spawns: [{ kind: 'beam', lanes: [-1, 0, 1], requires: 'squat', holdSec: 1.5 }],
    },
  ],
});

describe('pose encoding', () => {
  it('round-trips all 3 x 2 x 2 x 2 x 2 = 48 poses through one character each', () => {
    const seen = new Set<string>();
    for (const lane of [-1, 0, 1] as Lane[])
      for (const airborne of [false, true])
        for (const ducking of [false, true])
          for (const leftArmUp of [false, true])
            for (const rightArmUp of [false, true]) {
              const p: GhostPose = { lane, airborne, ducking, leftArmUp, rightArmUp };
              const c = encodePose(p);
              expect(c).toHaveLength(1);
              seen.add(c);
              expect(decodePose(c, neutralPose())).toEqual(p);
            }
    expect(seen.size).toBe(48);
  });

  it('reads an unknown character as standing still in the centre', () => {
    expect(decodePose('#', neutralPose())).toEqual(neutralPose());
  });
});

describe('recorder and playback', () => {
  it('samples at the given rate by game time, repeating the state over slow frames', () => {
    const rec = createGhostRecorder(20);
    rec.sample(0, idle);
    rec.sample(0.02, idle); // same tick: nothing new
    rec.sample(0.26, { ...idle, lane: 1 }); // slow frame: ticks 1..5 get the current state
    expect(rec.samples).toHaveLength(6);
    const out = neutralPose();
    expect(ghostPoseAt(rec.samples, 20, 0, out).lane).toBe(0);
    expect(ghostPoseAt(rec.samples, 20, 0.1, out).lane).toBe(1);
    expect(ghostPoseAt(rec.samples, 20, 0.25, out).lane).toBe(1);
  });

  it('a 45 s round at 20 Hz is about 900 characters', () => {
    const rec = createGhostRecorder(20);
    for (let e = 0; e <= 45; e += 1 / 60) rec.sample(e, idle);
    expect(rec.samples.length).toBeGreaterThanOrEqual(900);
    expect(rec.samples.length).toBeLessThanOrEqual(902);
  });

  it('playback clamps before the start, after the end, and copes with no samples', () => {
    const rec = createGhostRecorder(20);
    rec.sample(0, { ...idle, lane: -1 });
    rec.sample(1, { ...idle, lane: 1, airborne: true });
    const out = neutralPose();
    expect(ghostPoseAt(rec.samples, 20, -5, out).lane).toBe(-1);
    expect(ghostPoseAt(rec.samples, 20, 99, out)).toMatchObject({ lane: 1, airborne: true });
    expect(ghostPoseAt('', 20, 3, out)).toEqual(neutralPose());
  });

  it('writes into the object it is given (no allocation per frame)', () => {
    const out = neutralPose();
    expect(ghostPoseAt('C', 20, 0, out)).toBe(out);
  });
});

describe('level fingerprint', () => {
  it('is stable for the same level', () => {
    expect(levelFingerprint(level())).toBe(levelFingerprint(level()));
    expect(levelFingerprint(level())).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes with the waves, the duration or the mode', () => {
    const base = levelFingerprint(level());
    expect(levelFingerprint(level({}, 4.5))).not.toBe(base);
    expect(levelFingerprint(level({ durationSec: 90 }))).not.toBe(base);
    expect(levelFingerprint(level({ mode: 'treadmill' }))).not.toBe(base);
    const held = level();
    held.waves[1]!.spawns[0]!.holdSec = 2;
    expect(levelFingerprint(held)).not.toBe(base);
  });

  it('ghostKey keeps camera and keyboard ghosts apart', () => {
    expect(ghostKey(level(), 'pose')).not.toBe(ghostKey(level(), 'keyboard'));
    expect(ghostKey(level(), 'pose')).toBe(ghostKey(level(), 'pose'));
    expect(ghostKey(level(), 'pose').startsWith(levelFingerprint(level()))).toBe(true);
  });

  it('ignores what does not change the level: seed and workout labels', () => {
    expect(levelFingerprint(level({ seed: 2, workout: 'legs' }))).toBe(levelFingerprint(level()));
  });
});

describe('ranking', () => {
  const r = (cleared: number, collected: number, hit: number) => ({ cleared, collected, hit });

  it('more cleared + collected wins; ties go to fewer hits; equal is not better', () => {
    expect(isBetter(r(10, 3, 2), r(9, 3, 0))).toBe(true);
    expect(isBetter(r(9, 3, 0), r(10, 3, 2))).toBe(false);
    expect(isBetter(r(10, 3, 1), r(11, 2, 3))).toBe(true); // 13 = 13, fewer hits
    expect(isBetter(r(10, 3, 1), r(10, 3, 1))).toBe(false);
    expect(isBetter(r(0, 0, 9), null)).toBe(true);
  });

  it('finishOutcome: against the raced ghost, saved for a stored first run, else nothing', () => {
    expect(finishOutcome(r(10, 4, 2), r(12, 4, 0), true)).toBe('beaten');
    expect(finishOutcome(r(10, 4, 2), r(12, 4, 0), false)).toBe('beaten'); // even if not stored
    expect(finishOutcome(r(10, 4, 2), r(8, 4, 4), false)).toBe('lost');
    expect(finishOutcome(r(10, 4, 2), r(10, 4, 2), false)).toBe('tie');
    expect(finishOutcome(null, r(3, 0, 13), true)).toBe('saved');
    expect(finishOutcome(null, r(3, 0, 13), false)).toBeNull(); // no storage: no banner
  });

  it('compareRuns gives the end banner', () => {
    expect(compareRuns(r(12, 4, 0), r(10, 4, 2))).toBe('beaten');
    expect(compareRuns(r(8, 4, 4), r(10, 4, 2))).toBe('lost');
    expect(compareRuns(r(10, 4, 2), r(10, 4, 2))).toBe('tie');
  });
});

describe('parseGhost', () => {
  const fp = 'abc';
  const good: GhostRun = {
    v: 1,
    fingerprint: fp,
    hz: 20,
    samples: 'BBBC',
    result: { cleared: 3, collected: 1, hit: 0 },
    savedAt: 1,
  };

  it('accepts a valid run for this level', () => {
    expect(parseGhost(JSON.stringify(good), fp)).toEqual(good);
  });

  it('rejects anything malformed or for another level, without throwing', () => {
    const bad: unknown[] = [
      null,
      '',
      '{',
      '42',
      'null',
      JSON.stringify({ ...good, fingerprint: 'other' }),
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, hz: 0 }),
      JSON.stringify({ ...good, samples: '' }),
      JSON.stringify({ ...good, samples: 'BB#B' }),
      JSON.stringify({ ...good, result: { cleared: -1, collected: 0, hit: 0 } }),
      JSON.stringify({ ...good, result: null }),
      JSON.stringify({ ...good, savedAt: 'x' }),
    ];
    for (const b of bad) expect(parseGhost(b as string | null, fp)).toBeNull();
  });
});
