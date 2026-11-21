import { describe, expect, it } from 'vitest';
import { OVERLAY_MARGIN } from './look';
import { RACE_PULSE as RACE_PULSE_MAX } from './tuning';
import {
  endBannerBox,
  LABEL_ASPECT,
  labelHeight,
  milestoneBox,
  raceBox,
  toCameraSpace,
  type CameraSpot,
  type PixelBox,
} from './overlay';

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

/**
 * QA Q15: the game's banner and race chip once sat under GameHud's move cue. GameHud's boxes,
 * in CSS pixels (src/ui/screens/GameHud.tsx), so a later change to either side fails here.
 */
interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
const rectOf = (b: PixelBox): Rect => {
  const w = b.h / LABEL_ASPECT;
  return { left: b.cx - w / 2, right: b.cx + w / 2, top: b.cy - b.h / 2, bottom: b.cy + b.h / 2 };
};
const overlaps = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const hudBoxes = (W: number, H: number): Record<string, Rect> => ({
  // `hud-cue`: inset-x-6 top-[124px]; the word and ring are 72 px plus padding (to about 214).
  cue: { left: 24, top: 124, right: W - 24, bottom: 214 },
  // `hud-camera`: bottom-6 left-6, w-64 h-36.
  camera: { left: 24, top: H - 24 - 144, right: 24 + 256, bottom: H - 24 },
  // The "+100" pop: top-[68%], 48 px text (about 58 px tall), rising 55 px.
  points: { left: 0, top: H * 0.68 - 55, right: W, bottom: H * 0.68 + 58 },
});
// Projector, the common laptops (Windows at 125 %, the MacBooks), full HD, a 1440p monitor.
const SIZES: [number, number][] = [
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1512, 982],
  [1536, 864],
  [1920, 1080],
  [2560, 1440],
];

describe('the banner and race chip stay clear of GameHud (Q15)', () => {
  for (const [W, H] of SIZES) {
    it(`at ${W}x${H}`, () => {
      const hud = hudBoxes(W, H);
      for (const grow of [0, 1]) {
        for (const pop of [1, 1 + RACE_PULSE_MAX]) {
          const banner = rectOf(milestoneBox(W, H, grow));
          const chip = rectOf(raceBox(W, H, pop));
          for (const [name, r] of Object.entries({ banner, chip })) {
            for (const [hudName, h] of Object.entries(hud))
              expect(overlaps(r, h), `${name} over the HUD ${hudName}`).toBe(false);
            expect(r.left).toBeGreaterThanOrEqual(OVERLAY_MARGIN - 0.01);
            expect(r.right).toBeLessThanOrEqual(W - OVERLAY_MARGIN + 0.01);
            expect(r.bottom).toBeLessThanOrEqual(H - OVERLAY_MARGIN + 0.01);
          }
          expect(overlaps(banner, chip), 'banner over the chip').toBe(false);
        }
      }
    });
  }

  it('the end banner sits under the score and clock plates, inside the screen', () => {
    for (const [W, H] of SIZES) {
      const end = rectOf(endBannerBox(W, H));
      // Measured in Chrome: plates end 220 px from the top; the score plate is about 320 px
      // wide at a 4-digit score, the clock plate 240 px.
      const score = { left: 24, top: 24, right: 340, bottom: 230 };
      const clock = { left: W - 264, top: 24, right: W - 24, bottom: 230 };
      expect(overlaps(end, score), `${W}x${H} score plate`).toBe(false);
      expect(overlaps(end, clock), `${W}x${H} clock plate`).toBe(false);
      expect(end.left).toBeGreaterThanOrEqual(OVERLAY_MARGIN - 0.01);
      expect(end.right).toBeLessThanOrEqual(W - OVERLAY_MARGIN + 0.01);
      expect(end.bottom).toBeLessThan(H * 0.68 - 55); // above the "+100" pop's band
    }
    expect(endBannerBox(1280, 720, 0).h).toBe(0); // pops in from nothing
    expect(endBannerBox(1280, 720).h).toBeGreaterThanOrEqual(100); // letters about 60 px
  });

  it('a canvas without layout gives empty boxes, never negative ones', () => {
    // The 2D view's roundRect throws on a negative radius, and a throw stops all drawing.
    for (const [W, H] of [
      [1, 1],
      [0, 0],
      [30, 720],
    ]) {
      for (const b of [milestoneBox(W!, H!), raceBox(W!, H!, 1.3), endBannerBox(W!, H!)])
        expect(b.h, `${W}x${H}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('they stay readable from the mark on a 1280x720 projector', () => {
    // Letters are 56 % of the plate: about 38 px and 30 px tall.
    expect(milestoneBox(1280, 720).h).toBeGreaterThanOrEqual(64);
    expect(raceBox(1280, 720).h).toBeGreaterThanOrEqual(50);
  });
});
