// Every recorded clip, replayed as synthetic variants (different body sizes and distances,
// landmark jitter, dropped frames): each must give the same moves at about the same times.
import { describe, expect, test } from 'vitest';
import type { MoveEvent } from '@/contracts';
import { createDetector, type Point } from './detect';
import {
  calibrateFromClip,
  jitter,
  loadClip,
  replay,
  type ReplayOptions,
  scaleAbout,
  toPoints,
} from './fixtures';
import { DETECTION, resetDetectionTuning } from './tuning';

/** A camera rolled by `deg` degrees (laptop on an uneven table), about the frame centre, in pixels. */
const roll = (deg: number) => (pose: Point[]) => {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return pose.map((p) => {
    const [x, y] = [(p.x - 0.5) * 640, (p.y - 0.5) * 480];
    return { ...p, x: 0.5 + (x * c - y * s) / 640, y: 0.5 + (x * s + y * c) / 480 };
  });
};

const jitterAll = jitter(0.005, 11);

/**
 * About 1.5 m from the camera, head to knees in view (CALIBRATION_FEET_IN_VIEW = false): 1.45×
 * bigger, framed like the calibration asks. Landmarks pushed out of the frame get MediaPipe's low
 * visibility, so a hip leaving the frame mid-move would show up as lost frames.
 */
const closer = (pose: Point[]) =>
  scaleAbout(
    0.5,
    0.87,
    1.45,
  )(pose).map((p) => (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 ? { ...p, visibility: 0.1 } : p));

/**
 * One frame in fifteen (~0.5 s) where MediaPipe is unsure of the left hip (visibility under the
 * line). Not more often: regaining tracking needs 0.3 s without a gap, on purpose (a body coming
 * back at the frame edge flickers; tolerating that gave Greg's leaveFrame a false squat).
 */
const hipFlicker = (pose: Point[], t = 0) =>
  Math.round(t / 33) % 15 === 14
    ? pose.map((p, i) => (i === 23 ? { ...p, visibility: 0.3 } : p))
    : pose;

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
  // Greg (a second body, Sat ~1 PM, one spot): calibrated on his standing clip, plus a 1 s tail
  // so a squat that ends near the clip's end is still decided.
  'greg/standing': { calibrate: 'greg/standing' },
  'greg/sidestep': { calibrate: 'greg/standing' },
  'greg/jump': { calibrate: 'greg/standing' },
  'greg/squat': { calibrate: 'greg/standing', holdLastMs: 1000 },
  'greg/armsUp': { calibrate: 'greg/standing' },
  'greg/reach': { calibrate: 'greg/standing' },
  'greg/leaveFrame': { calibrate: 'greg/standing' },
  'greg/mixed': { calibrate: 'greg/standing', upToMs: 6300 }, // walks to the laptop after 6.3 s
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
  'camera tilted 3°': { opts: { transform: roll(3) }, slackMs: 100 },
  'camera tilted -3°': { opts: { transform: roll(-3) }, slackMs: 100 },
  '20% dropped frames': { opts: { dropFraction: 0.2 }, slackMs: 200 },
  'all at once: taller, ±0.5% jitter, 2° tilt, 30% dropped': {
    opts: {
      transform: (p: Point[]) => roll(2)(jitterAll(scaleAbout(0.5, 0.97, 1.15)(p))),
      dropFraction: 0.3,
    },
    slackMs: 250,
  },
  '40% dropped frames (~17 FPS)': { opts: { dropFraction: 0.4 }, slackMs: 250 },
  'closer, head to knees (~1.5 m)': { opts: { transform: closer }, slackMs: 100 },
  // Pose plus the 3D game on a slow laptop: every other frame, evenly (~15 FPS).
  // Greg's double raise (arm dips just under the down line between) reads as one raise at 15 FPS,
  // so that reach fires ~0.2 s earlier.
  '15 FPS steady': { opts: { everyNth: 2 }, slackMs: 250 },
  'hip visibility flicker (1 frame in 15)': { opts: { transform: hipFlicker }, slackMs: 100 },
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
    'greg/standing': [],
    'greg/sidestep': Array(10).fill('sidestep'), // R, C, L, C, R, C, L, C, R, C
    'greg/jump': ['jump', 'jump', 'jump', 'jump'],
    'greg/squat': ['squat', 'squat'],
    // His first press peaks just under the line with one wrist over it: no reach (was reachRight).
    'greg/armsUp': ['armsUp', 'armsUp', 'armsUp'],
    'greg/reach': [
      'reachRight',
      'reachLeft',
      'reachRight',
      'reachLeft',
      'reachRight',
      'reachLeft',
      'reachRight',
      'reachLeft',
    ],
    'greg/leaveFrame': ['sidestep', 'sidestep'],
    // The deep crouch before the jump is not a squat (was squat, jump).
    'greg/mixed': ['jump', 'reachRight', 'reachLeft', 'squat', 'sidestep', 'sidestep', 'sidestep'],
  };
  for (const [clip, opts] of Object.entries(CLIPS)) {
    test(clip, () => {
      const r = replay(clip, opts);
      expect(kinds(r.events)).toEqual(expected[clip]);
      expect(r.gestures).toEqual([]); // the pause X never fires during real moves
    });
  }
});

/** Variant-only overrides: Greg's first press peaks right on the line (an ambiguous rep), so the
 * timing comparison starts after it; a separate test checks it never becomes a reach. */
const VARIANT_OVERRIDES: Record<string, ReplayOptions> = { 'greg/armsUp': { fromMs: 1500 } };

/** Known limits: quick alternating reaches (Greg, ~0.6–1.2 s apart) at ~17–20 FPS can be missed.
 * There the variant may drop moves (keeping ≥ 75%) but must never invent one. */
const MAY_MISS = new Set([
  'landmark jitter ±1%|greg/reach', // fine at ±0.75%; one quick swap lost at ±1%
  '40% dropped frames (~17 FPS)|greg/reach',
  '40% dropped frames (~17 FPS)|greg/mixed',
  'all at once: taller, ±0.5% jitter, 2° tilt, 30% dropped|greg/reach',
  // Greg holds a quick reach ~0.3 s; a flicker on its first frame leaves < ARM_SETTLE_MS.
  'hip visibility flicker (1 frame in 15)|greg/reach',
]);

/** True if `sub` can be read in order inside `seq` (only drops, no additions or swaps). */
const isSubsequence = (sub: string[], seq: string[]) => {
  let i = 0;
  for (const x of seq) if (i < sub.length && sub[i] === x) i++;
  return i === sub.length;
};

describe.each(Object.entries(VARIANTS))('%s', (name, { opts, slackMs }) => {
  test.each(Object.keys(CLIPS))('%s: same moves at the same times, same tracking', (clip) => {
    const clipOpts = { ...CLIPS[clip], ...VARIANT_OVERRIDES[clip] };
    const base = replay(clip, clipOpts);
    const v = replay(clip, { ...clipOpts, ...opts });
    expect(v.tracking.map(([, on]) => on)).toEqual(base.tracking.map(([, on]) => on));
    expect(v.gestures).toEqual([]); // no pause X from real moves, in any variant
    // Walking out of frame: lane changes on the way out mean nothing; only tracking matters.
    if (clip.endsWith('leaveFrame')) return;
    if (MAY_MISS.has(`${name}|${clip}`)) {
      expect(isSubsequence(kinds(v.events), kinds(base.events))).toBe(true);
      expect(v.events.length).toBeGreaterThanOrEqual(Math.ceil(base.events.length * 0.75));
      return;
    }
    expect(kinds(v.events)).toEqual(kinds(base.events));
    v.events.forEach((e, i) =>
      expect(Math.abs(e.t - base.events[i].t)).toBeLessThanOrEqual(slackMs),
    );
  });
});

test("Greg's half press (both arms at the line) is not a reach, except on a tilted camera", () => {
  // Known limit: with the camera rolled ±3°, one wrist sits higher and the arms can come down
  // unevenly from this half press, which can read as a reach. Rules that block that also lose
  // real quick left/right reaches (Greg's reach clip), which matter more. DECISIONS.md 35.
  for (const [name, { opts }] of Object.entries(VARIANTS)) {
    if (name.startsWith('camera tilted')) continue;
    const k = kinds(replay('greg/armsUp', { ...CLIPS['greg/armsUp'], ...opts }).events);
    expect(k.filter((x) => x.startsWith('reach'))).toEqual([]);
    expect(k.filter((x) => x === 'armsUp').length).toBeGreaterThanOrEqual(3);
  }
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
    DETECTION.JUMP_AFTER_SQUAT_MS = 0;
    try {
      expect(kinds(replay('squat', { transform: springUp(0.05) }).events)).toContain('jump');
    } finally {
      resetDetectionTuning();
    }
  });

  test.each([2, 3, 4])('a %s× slower squat still counts, without a jump', (timeScale) => {
    expect(kinds(replay('squat', { timeScale, holdLastMs: 1000 }).events)).toEqual([
      'squat',
      'squat',
    ]);
  });
});

describe('jumps with a deeper crouch first (countermovement), on the real jump clip', () => {
  const STAND = 0.676; // A's standing hip height in the first session
  /** Deepens every dip below standing height by `k` (1.4 = crouches 40% deeper than A's). */
  const deeperCrouch = (k: number) => (pose: Point[]) => {
    const hipY = (pose[23].y + pose[24].y) / 2;
    const extra = hipY > STAND ? (hipY - STAND) * (k - 1) : 0;
    return pose.map((p) => ({ ...p, y: p.y + extra }));
  };

  test.each([1.2, 1.4, 1.6])('%s× deeper crouches: all four jumps, no squats', (k) => {
    expect(kinds(replay('jump', { upToMs: 7200, transform: deeperCrouch(k) }).events)).toEqual([
      'jump',
      'jump',
      'jump',
      'jump',
    ]);
  });

  test('2× deeper (a held, squat-deep crouch): still all four jumps', () => {
    const k = kinds(replay('jump', { upToMs: 7200, transform: deeperCrouch(2) }).events);
    expect(k.filter((x) => x === 'jump')).toHaveLength(4);
  });
});

describe('faster squats (the real squat clip sped up)', () => {
  test.each([0.5, 0.33, 0.25])('%s× the time: both squats count, no jumps', (timeScale) => {
    expect(kinds(replay('squat', { timeScale, holdLastMs: 1000 }).events)).toEqual([
      'squat',
      'squat',
    ]);
  });
});

/*
 * State timing on the clips. Patrick tuned the game's pose latency leads (VISUAL_LEAD_SEC in
 * src/game/tuning.ts) on this detector's lag. If a threshold change moves these onsets, update
 * those leads (or the change) — the game would otherwise judge pose moves late.
 */
describe('when states turn on (the game pose latency leads depend on it)', () => {
  const onsets = (
    clip: string,
    opts: ReplayOptions,
    key: 'airborne' | 'ducking' | 'leftArmUp' | 'rightArmUp' | 'lane',
  ) => {
    const rec = loadClip(clip);
    const det = createDetector(
      opts.calibrate === 'self'
        ? calibrateFromClip(rec, 300)
        : calibrateFromClip(loadClip('standing'), 1000),
    );
    const out: number[] = [];
    let prev: unknown = det.state[key];
    for (const f of rec.frames) {
      if (opts.upToMs !== undefined && f.t > opts.upToMs) break;
      det.update(f.pose ? toPoints(f.pose) : null, f.t);
      const now = det.state[key];
      if (now && now !== prev) out.push(f.t);
      prev = now;
    }
    return out;
  };
  const FRAME = 35;
  test.each([
    ['armsUp', { calibrate: 'self' }, 'leftArmUp', [537, 2910, 5134]],
    ['reach', { calibrate: 'self' }, 'leftArmUp', [1166, 3681]],
    ['reach', { calibrate: 'self' }, 'rightArmUp', [6112]],
    ['jump', { upToMs: 7200 }, 'airborne', [169, 1840, 3756, 5671]],
    ['squat', {}, 'ducking', [29, 4156]],
    ['sidestep', {}, 'lane', [405, 3534, 6247]],
  ] as const)('%s: %s turns on at the tuned times (±1 frame)', (clip, opts, key, times) => {
    const got = onsets(clip, opts as ReplayOptions, key);
    expect(got).toHaveLength(times.length);
    got.forEach((t, i) => expect(Math.abs(t - times[i])).toBeLessThanOrEqual(FRAME));
  });
});

/*
 * Extra clips (e.g. a teammate's): save as fixtures/extra/<move>-<count>[-name].json, standing still
 * for the first second (the clip calibrates on its first 300 ms). Each one expects exactly <count>
 * moves of type <move> (sidestep, jump, squat, armsUp, reachLeft, reachRight).
 */
describe('extra clips named <move>-<count>', () => {
  const names = Object.keys(
    import.meta.glob('./fixtures/extra/*.json', { eager: true, import: 'default' }),
  ).map((path) => path.replace('./fixtures/', '').replace('.json', ''));

  if (names.length === 0) {
    test('none recorded yet', () => expect(names).toEqual([]));
    return;
  }
  test.each(names)('%s', (name) => {
    const [move, count] = name.replace('extra/', '').split('-');
    const got = kinds(replay(name, { calibrate: 'self' }).events).filter((k) => k === move);
    expect(got).toHaveLength(Number(count));
  });
});

test('an overhead press with ±1% landmark noise is never a jump (Patrick, 20 seeds)', () => {
  // Raising both arms lifts the hips 0.10–0.16 T; with noise that crossed the jump line (seeds
  // 1010, 1313, 1919 jumped mid-press). Calibrated on the clip's own start, as in his replay.
  for (let k = 1; k <= 20; k++) {
    const r = replay('greg/armsUp', { calibrate: 'self', transform: jitter(0.01, 101 * k) });
    expect(kinds(r.events).filter((x) => x === 'jump')).toEqual([]);
  }
});

/*
 * A's third session (Sat ~3:20 PM, ~1.4 m, head to knees, feet at the bottom edge): the closer
 * play distance. Calibrated on its own standing clip. The deep squats take the hips to the bottom
 * edge of the frame; tracking must hold. `pauseX` is a real X (two holds), the only clip with pauses.
 */
describe('closer play (~1.4 m, head to knees): real clips', () => {
  const near = (clip: string, opts: ReplayOptions = {}) =>
    replay(`near/${clip}`, { calibrate: 'near/standing', ...opts });
  const expected: Record<string, string[]> = {
    standing: [],
    sidestep: Array(4).fill('sidestep'),
    jump: Array(4).fill('jump'),
    squat: ['squat', 'squat'],
    armsUp: Array(3).fill('armsUp'),
    pauseX: [],
  };
  const variants: Record<string, ReplayOptions> = {
    plain: {},
    'jitter ±0.5%': { transform: jitter(0.005, 21) },
    '15 FPS steady': { everyNth: 2 },
  };
  for (const [v, opts] of Object.entries(variants)) {
    test.each(Object.keys(expected))(`%s (${v}): expected moves, tracking never lost`, (clip) => {
      const r = near(clip, { holdLastMs: clip === 'squat' ? 1000 : 0, ...opts });
      expect(kinds(r.events)).toEqual(expected[clip]);
      expect(r.tracking).toEqual([]);
    });
    test(`pauseX (${v}): the two real X holds give exactly two pauses`, () => {
      expect(near('pauseX', opts).gestures.map((g) => g.type)).toEqual(['pause', 'pause']);
    });
  }
  test.each(['standing', 'sidestep', 'jump', 'squat', 'armsUp', 'reach', 'leaveFrame', 'mixed'])(
    '%s: no pause from real moves',
    (clip) => expect(near(clip).gestures).toEqual([]),
  );
});
