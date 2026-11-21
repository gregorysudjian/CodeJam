// Treadmill mode (docs/PLAN.md Phase 3): upper body only, calibrated on the shoulders, 1–1.5 m
// from the camera. Simulated by scaling A's clips up (the player closer to the camera).
import { describe, expect, test } from 'vitest';
import type { MoveEvent } from '@/contracts';
import { createCalibrator } from './calibration';
import { type Point } from './detect';
import { loadClip, replay, type ReplayOptions, scaleAbout, toPoints } from './fixtures';
import { createSession } from './session';

/** About 1.2 m from the camera: head to hips in view, feet out of frame. */
const near = scaleAbout(0.5, 0.35, 1.8);
/** About 1 m: hips out of frame too. */
const veryNear = scaleAbout(0.5, 0.3, 2.4);
const kinds = (events: MoveEvent[]) => events.map((e) => e.type);
const tm = (clip: string, opts: ReplayOptions = {}) =>
  kinds(replay(clip, { mode: 'treadmill', transform: near, ...opts }).events);

function calibrateStanding(mode: 'floor' | 'treadmill', transform: (p: Point[]) => Point[]) {
  const cal = createCalibrator(mode);
  for (const f of loadClip('standing').frames) {
    const u = cal.update(transform(toPoints(f.pose!)), f.t);
    if (u.result) return { step: u.status.step, result: u.result };
    if (f.t > 3000) return { step: u.status.step, result: null };
  }
  return { step: 'none', result: null };
}

describe('treadmill calibration', () => {
  test('calibrates on the shoulders at about 1.2 m (feet out of frame)', () => {
    const { step, result } = calibrateStanding('treadmill', near);
    expect(step).toBe('done');
    expect(result!.T).toBeCloseTo(0.2 * 1.8, 1);
    // The centre is the shoulder centre, not the hips.
    expect(result!.centreY).toBeLessThan(0.65);
  });

  test('estimates the torso from the shoulder width when the hips are out of view (about 1 m)', () => {
    const { step, result } = calibrateStanding('treadmill', veryNear);
    expect(step).toBe('done');
    expect(result!.T).toBeGreaterThan(0.2 * 2.4 * 0.85);
    expect(result!.T).toBeLessThan(0.2 * 2.4 * 1.15);
  });

  test('uses the real video aspect for that estimate (a 16:9 camera)', async () => {
    const s = createSession();
    const done = s.calibrate('treadmill', () => {});
    for (const f of loadClip('standing').frames.slice(0, 80)) {
      s.frame([veryNear(toPoints(f.pose!))], f.t, 16 / 9);
    }
    await done;
    // Same body in pixels, but y units are relatively larger on a 16:9 frame.
    expect(s.calibration!.T).toBeCloseTo(1.5 * s.calibration!.W * (16 / 9), 2);
  });

  test.each([0.1, 0.15])('calibrates while already jogging (shoulders bob ±%s T)', (amp) => {
    const bounce = (p: Point[], t: number) => {
      const dy = amp * 0.36 * Math.sin((2 * Math.PI * 2.5 * t) / 1000);
      return near(p).map((q) => ({ ...q, y: q.y + dy }));
    };
    const cal = createCalibrator('treadmill');
    let done = -1;
    for (const f of loadClip('standing').frames) {
      if (f.t > 5000) break;
      if (done < 0 && cal.update(bounce(toPoints(f.pose!), f.t), f.t).result) done = f.t;
    }
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThan(2500);
  });

  test('floor calibration still wants the player to hold still (bobbing ±0.1 T never finishes)', () => {
    const cal = createCalibrator('floor');
    let done = false;
    for (const f of loadClip('standing').frames) {
      if (f.t > 5000) break;
      const dy = 0.1 * 0.2 * Math.sin((2 * Math.PI * 2.5 * f.t) / 1000);
      if (
        cal.update(
          toPoints(f.pose!).map((q) => ({ ...q, y: q.y + dy })),
          f.t,
        ).result
      )
        done = true;
    }
    expect(done).toBe(false);
  });

  test('says tooFar at floor distance (about 2.5 m)', () => {
    expect(calibrateStanding('treadmill', (p) => p).step).toBe('tooFar');
  });

  test('says tooClose when the head is cut off', () => {
    const up = (p: Point[]) => near(p).map((q) => ({ ...q, y: q.y - 0.5 }));
    expect(calibrateStanding('treadmill', up).step).toBe('tooClose');
  });

  test('floor mode at 1.2 m says tooClose (feet out of frame)', () => {
    expect(calibrateStanding('floor', near).step).toBe('tooClose');
  });
});

describe('treadmill moves', () => {
  test('both arms up: three presses', () => {
    expect(tm('armsUp', { calibrate: 'self' })).toEqual(['armsUp', 'armsUp', 'armsUp']);
  });

  test('reach left and right', () => {
    expect(tm('reach', { calibrate: 'self' })).toEqual(['reachLeft', 'reachLeft', 'reachRight']);
  });

  test('legs are ignored: no lanes, jumps or squats (bouncing like jogging gives nothing)', () => {
    expect(tm('standing', { upToMs: 5500 })).toEqual([]);
    expect(tm('sidestep')).toEqual([]);
    expect(tm('jump', { upToMs: 7200 })).toEqual([]);
  });

  test('mixed play: only the two presses count', () => {
    expect(tm('mixed', { calibrate: 'self' })).toEqual(['armsUp', 'armsUp']);
  });

  test('lane stays centre and the player is never ducking or airborne', () => {
    const s = createSession();
    void s.calibrate('treadmill', () => {});
    let t = 0;
    for (const f of loadClip('standing').frames) s.frame([near(toPoints(f.pose!))], (t = f.t));
    for (const f of loadClip('jump').frames.slice(0, 210)) {
      s.frame([near(toPoints(f.pose!))], t + 33 + f.t);
      const st = s.getState();
      expect([st.lane, st.ducking, st.airborne]).toEqual([0, false, false]);
    }
  });

  test('walking out of view loses tracking, coming back regains it', () => {
    const { tracking } = replay('leaveFrame', { mode: 'treadmill', transform: near });
    expect(tracking.map(([, on]) => on)).toEqual([false, true]);
  });
});

describe('floor mode is unchanged by treadmill mode', () => {
  const FLOOR: [string, ReplayOptions][] = [
    ['standing', { upToMs: 5500 }],
    ['sidestep', {}],
    ['jump', { upToMs: 7200 }],
    ['squat', {}],
    ['leaveFrame', {}],
    ['armsUp', { calibrate: 'self' }],
    ['reach', { calibrate: 'self' }],
    ['mixed', { calibrate: 'self' }],
  ];
  test.each(FLOOR)('%s: same moves and times with mode floor as with the default', (clip, opts) => {
    const a = replay(clip, opts);
    const b = replay(clip, { ...opts, mode: 'floor' });
    expect(b.events).toEqual(a.events);
    expect(b.tracking).toEqual(a.tracking);
  });

  test('a session calibrated for treadmill, then floor, detects floor moves as before', async () => {
    const s = createSession();
    const moves: MoveEvent[] = [];
    s.onMove((e) => moves.push(e));
    let t = 0;
    const p1 = s.calibrate('treadmill', () => {});
    for (const f of loadClip('standing').frames.slice(0, 80))
      s.frame([near(toPoints(f.pose!))], (t = f.t));
    await p1;
    const p2 = s.calibrate('floor', () => {});
    const t0 = t + 33;
    for (const f of loadClip('standing').frames.slice(0, 80))
      s.frame([toPoints(f.pose!)], (t = t0 + f.t));
    await p2;
    const t1 = t + 33;
    for (const f of loadClip('jump').frames)
      if (f.t <= 7200) s.frame([toPoints(f.pose!)], t1 + f.t);
    expect(kinds(moves)).toEqual(['jump', 'jump', 'jump', 'jump']);
  });
});
