import { describe, expect, it } from 'vitest';
import { labelHeight, toCameraSpace, type CameraSpot } from './overlay';

const spot = (): CameraSpot => ({ x: 0, y: 0, z: 0, height: 0 });

describe('screen-space labels', () => {
  it('the centre of the screen is straight ahead', () => {
    const s = toCameraSpace({ cx: 683, cy: 384, h: 10 }, 1366, 768, 62, 2, spot());
    expect(s.x).toBeCloseTo(0);
    expect(s.y).toBeCloseTo(0);
    expect(s.z).toBe(-2);
  });

  it('the top edge of the screen is at the edge of the field of view', () => {
    const fov = 62;
    const s = toCameraSpace({ cx: 960, cy: 0, h: 1080 }, 1920, 1080, fov, 2, spot());
    const half = 2 * Math.tan((fov * Math.PI) / 360);
    expect(s.y).toBeCloseTo(half);
    expect(s.height).toBeCloseTo(2 * half); // the full height spans the whole view
  });

  it('a box at the bottom right lands below and right of centre', () => {
    const s = toCameraSpace({ cx: 1200, cy: 700, h: 40 }, 1366, 768, 62, 2, spot());
    expect(s.x).toBeGreaterThan(0);
    expect(s.y).toBeLessThan(0);
  });

  it('label height follows the canvas, within limits', () => {
    expect(labelHeight(768, 0.06, 36, 64)).toBeCloseTo(46.08);
    expect(labelHeight(300, 0.06, 36, 64)).toBe(36);
    expect(labelHeight(2160, 0.06, 36, 64)).toBe(64);
  });
});
