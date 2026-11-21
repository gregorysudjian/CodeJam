// The pause X (gesture.ts): forearms crossed in front of the chest, held 1 s, fires 'pause' once.
// Positive cases splice an X into A's real standing clip; that it never fires during real moves is
// checked on every clip and variant in variants.test.ts.
import { describe, expect, test } from 'vitest';
import { type Point } from './detect';
import { isCrossed } from './gesture';
import { jitter, replay, type ReplayOptions, scaleAbout } from './fixtures';
import { GESTURE_HOLD_MS } from './tuning';

type Arms = 'x' | 'xOverhead' | 'xAtHips' | 'touching';

/** Puts the wrists of a raw pose in a given arm position, built from its own shoulders and hips. */
function arms(pose: Point[], how: Arms): Point[] {
  const [ls, rs, lh, rh] = [pose[11], pose[12], pose[23], pose[24]];
  const sy = (ls.y + rs.y) / 2;
  const T = (lh.y + rh.y) / 2 - sy;
  const cx = (ls.x + rs.x) / 2;
  const half = Math.abs(ls.x - rs.x) / 2; // raw x: the player's left shoulder has the larger raw x
  const out = pose.map((p) => ({ ...p }));
  const put = (i: number, x: number, y: number) => (out[i] = { ...out[i], x, y });
  if (how === 'touching') {
    // Hands meeting in front of the chest, not past each other.
    put(15, cx + 0.05 * half, sy + 0.3 * T);
    put(16, cx - 0.05 * half, sy + 0.3 * T);
    return out;
  }
  const y = how === 'xOverhead' ? sy - 1.2 * T : how === 'xAtHips' ? sy + 1.0 * T : sy + 0.3 * T;
  // Crossed: each wrist near the OTHER shoulder.
  put(15, rs.x - 0.1 * half, y);
  put(16, ls.x + 0.1 * half, y);
  return out;
}

/** Arm positions over time: [from ms, to ms, how]. Outside the windows the clip is unchanged. */
const during =
  (windows: [number, number, Arms][]) =>
  (pose: Point[], t = 0): Point[] => {
    const w = windows.find(([a, b]) => t >= a && t < b);
    return w ? arms(pose, w[2]) : pose;
  };

const run = (windows: [number, number, Arms][], opts: ReplayOptions = {}) =>
  replay('standing', { upToMs: 5500, transform: during(windows), holdLastMs: 0, ...opts });

const times = (r: { gestures: { t: number }[] }) => r.gestures.map((g) => g.t);

describe('isCrossed', () => {
  test('only the X in front of the chest counts', () => {
    const pose = (how: Arms | null) => {
      const base: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5 }));
      base[11] = { x: 0.55, y: 0.48 }; // player's left shoulder (raw x larger)
      base[12] = { x: 0.45, y: 0.48 };
      base[23] = { x: 0.53, y: 0.68 };
      base[24] = { x: 0.47, y: 0.68 };
      base[15] = { x: 0.57, y: 0.66 }; // arms down
      base[16] = { x: 0.43, y: 0.66 };
      return how ? arms(base, how) : base;
    };
    expect(isCrossed(pose('x'), 0.1, 0.2)).toBe(true);
    expect(isCrossed(pose(null), 0.1, 0.2)).toBe(false);
    expect(isCrossed(pose('touching'), 0.1, 0.2)).toBe(false);
    expect(isCrossed(pose('xOverhead'), 0.1, 0.2)).toBe(false);
    expect(isCrossed(pose('xAtHips'), 0.1, 0.2)).toBe(false);
  });
});

describe('pause X on the real standing clip', () => {
  test('held 1.5 s: one pause, about 1 s after crossing; no moves', () => {
    const r = run([[1500, 3000, 'x']]);
    expect(r.gestures.map((g) => g.type)).toEqual(['pause']);
    expect(times(r)[0] - 1500).toBeGreaterThanOrEqual(GESTURE_HOLD_MS - 40);
    expect(times(r)[0] - 1500).toBeLessThanOrEqual(GESTURE_HOLD_MS + 80);
    expect(r.events).toEqual([]);
  });

  test('held 3.5 s: still only one pause (once per hold)', () => {
    expect(times(run([[1000, 4500, 'x']]))).toHaveLength(1);
  });

  test('cross, uncross, cross again: two pauses (pause, then resume)', () => {
    expect(
      times(
        run([
          [800, 2200, 'x'],
          [3200, 4600, 'x'],
        ]),
      ),
    ).toHaveLength(2);
  });

  test('held only 0.8 s: no pause', () => {
    expect(times(run([[1500, 2300, 'x']]))).toEqual([]);
  });

  test('a short gap (one 0.1 s wobble) neither restarts the hold nor re-arms it', () => {
    const r = run([
      [1000, 1600, 'x'],
      [1700, 4000, 'x'],
    ]);
    expect(times(r)).toHaveLength(1);
    expect(times(r)[0]).toBeLessThan(1000 + GESTURE_HOLD_MS + 200);
  });

  test('not an X: crossed overhead, crossed at the hips, or hands just touching', () => {
    expect(times(run([[1000, 4000, 'xOverhead']]))).toEqual([]);
    expect(times(run([[1000, 4000, 'xAtHips']]))).toEqual([]);
    expect(times(run([[1000, 4000, 'touching']]))).toEqual([]);
  });

  test('robust: ±1% landmark noise, 15 FPS, and about 1.5 m away still give exactly one', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const noisy = jitter(0.01, seed);
      const r = replay('standing', {
        upToMs: 5500,
        transform: (p, t) => noisy(during([[1500, 3200, 'x']])(p, t)),
      });
      expect(times(r)).toHaveLength(1);
    }
    expect(times(run([[1500, 3200, 'x']], { everyNth: 2 }))).toHaveLength(1);
    const closer = scaleAbout(0.5, 0.87, 1.45);
    const near = replay('standing', {
      upToMs: 5500,
      transform: (p, t) => closer(during([[1500, 3200, 'x']])(p, t)),
    });
    expect(times(near)).toHaveLength(1);
  });
});
