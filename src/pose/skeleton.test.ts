import { describe, expect, test } from 'vitest';
import { coverMap, guides } from './skeleton';
import { DETECTION } from './tuning';

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

describe('threshold guides (debug overlay)', () => {
  const readout = {
    offsetW: 0,
    dropT: 0,
    upSpeedT: 0,
    leftArmT: 0,
    rightArmT: 0,
    W: 0.1,
    T: 0.2,
    centreX: 0.5,
    standY: 0.68,
    noseY: 0.41,
  };

  test('floor: lane lines either side of the centre, squat below and jump above standing height', () => {
    const g = guides(readout, 'floor');
    const xs = g
      .filter((x) => x.axis === 'x' && !x.dashed)
      .map((x) => x.at - 0.5)
      .sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-DETECTION.LANE_ON_W * 0.1);
    expect(xs[1]).toBeCloseTo(DETECTION.LANE_ON_W * 0.1);
    const y = (label: string) => g.find((x) => x.label === label)!.at;
    expect(y('squat')).toBeGreaterThan(y('stand'));
    expect(y('jump')).toBeLessThan(y('stand'));
    expect(y('arm up')).toBeLessThan(0.41);
  });

  test('treadmill: only the arm line', () => {
    expect(guides(readout, 'treadmill').map((x) => x.label)).toEqual(['arm up']);
  });

  test('a guide at player x lands where a landmark at that player x is drawn', () => {
    const map = coverMap(640, 480, 640, 480);
    const playerX = 0.7; // player's right = screen right
    const landmark = { x: 1 - playerX, y: 0.5 }; // raw MediaPipe x
    expect(map(landmark)[0]).toBeCloseTo(playerX * 640);
  });
});
