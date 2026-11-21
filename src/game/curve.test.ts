import { describe, expect, it } from 'vitest';
import { cameraYaw, curvatureAt, lateralOffset } from './curve';
import * as T from './tuning';

describe('route bends', () => {
  it('is deterministic: the same run bends the same way', () => {
    for (const d of [0, 37, 180, 941.5]) expect(curvatureAt(d)).toBe(curvatureAt(d));
  });

  it('stays within a sane curvature range', () => {
    for (let d = 0; d < 4000; d += 3.1) {
      const k = curvatureAt(d);
      expect(k).toBeGreaterThanOrEqual(-1);
      expect(k).toBeLessThanOrEqual(1);
      expect(Number.isFinite(k)).toBe(true);
    }
  });

  it('bends both ways and runs straight in between', () => {
    const ks: number[] = [];
    for (let d = 0; d < 2000; d += 2) ks.push(curvatureAt(d));
    expect(Math.min(...ks)).toBeLessThan(-0.5); // a real left
    expect(Math.max(...ks)).toBeGreaterThan(0.5); // a real right
    // Long straights between bends is the point of multiplying two sines.
    const straight = ks.filter((k) => Math.abs(k) < 0.15).length;
    expect(straight / ks.length).toBeGreaterThan(0.2);
  });

  it('is smooth — no jump between neighbouring samples', () => {
    let prev = curvatureAt(0);
    for (let d = 0.5; d < 2000; d += 0.5) {
      const k = curvatureAt(d);
      expect(Math.abs(k - prev)).toBeLessThan(0.1);
      prev = k;
    }
  });

  it('leaves the player position untouched', () => {
    // Nothing at or behind the camera may be pushed sideways: the lanes have
    // to stay where the player's sidestep put them.
    expect(lateralOffset(0, 1)).toBe(0);
    expect(lateralOffset(-20, 1)).toBe(0);
  });

  it('pushes the far skyline much further than the near ground', () => {
    const near = Math.abs(lateralOffset(10, 1));
    const far = Math.abs(lateralOffset(100, 1));
    expect(far).toBeGreaterThan(near * 50); // quadratic, not linear
  });

  it('keeps the camera yaw small enough that the lanes stay centred', () => {
    for (let d = 0; d < 2000; d += 7) {
      expect(Math.abs(cameraYaw(d))).toBeLessThanOrEqual(T.CURVE_YAW_MAX + 1e-9);
    }
  });

  it('does not throw the far skyline off screen on the tightest bend', () => {
    // The wrap length is the furthest anything is ever drawn.
    const worst = Math.abs(lateralOffset(T.TRACK_LENGTH, 1));
    expect(worst).toBeLessThan(T.TRACK_LENGTH);
  });
});
