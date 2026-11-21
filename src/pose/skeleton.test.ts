import { describe, expect, test } from 'vitest';
import { coverMap } from './skeleton';

describe('coverMap (skeleton over an object-cover, mirrored video)', () => {
  test('same aspect: plain scale, mirrored', () => {
    const map = coverMap(1280, 960, 640, 480);
    expect(map({ x: 0.25, y: 0.5 })).toEqual([960, 480]); // raw left = player's right = screen right
    expect(map({ x: 1, y: 0 })).toEqual([0, 0]);
  });

  test('wider box: video scaled to the width, top and bottom cropped', () => {
    const map = coverMap(1600, 600, 640, 480); // scale 2.5 → video 1600×1200, 300 px cropped each side
    expect(map({ x: 0.5, y: 0.5 })).toEqual([800, 300]);
    expect(map({ x: 0.5, y: 0.25 })[1]).toBeCloseTo(0);
  });

  test('taller box: video scaled to the height, sides cropped', () => {
    const map = coverMap(400, 960, 640, 480); // scale 2 → 1280×960, 440 px cropped each side
    expect(map({ x: 0.5, y: 0.5 })).toEqual([200, 480]);
  });

  test('no video size yet: does not divide by zero', () => {
    const [x, y] = coverMap(100, 100, 0, 0)({ x: 0.5, y: 0.5 });
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });
});
