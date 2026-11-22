import { describe, expect, it } from 'vitest';
import { VIDEO_BACKDROP } from './look';
import * as T from './tuning';
import { clipRate, clipToShow } from './videoBackdrop';

describe('clipRate: how fast the clip plays', () => {
  it("on a real level, moves the clip's road at the game's speed", () => {
    expect(clipRate(10, 8)).toBeCloseTo(1.25);
    expect(clipRate(8, 8)).toBeCloseTo(1);
  });

  it('stays within the real-mode limits', () => {
    expect(clipRate(40, 5)).toBe(T.REAL_CAMERA.rateMax);
    expect(clipRate(1, 5)).toBe(T.REAL_CAMERA.rateMin);
    expect(clipRate(0, 5)).toBe(T.REAL_CAMERA.rateMin);
  });

  it("keeps today's rule without a road speed (neon levels): rateMin to 1x", () => {
    expect(clipRate(T.SPEED_MIN)).toBeCloseTo(VIDEO_BACKDROP.rateMin);
    expect(clipRate(T.SPEED_MAX)).toBeCloseTo(1);
    expect(clipRate(T.SPEED_MAX + 10)).toBeCloseTo(1);
    expect(clipRate(0)).toBeCloseTo(VIDEO_BACKDROP.rateMin);
  });

  it('has a road speed for every real level that has a clip', async () => {
    const { LEVEL_BACKDROPS } = await import('./backdrop');
    LEVEL_BACKDROPS.forEach((b, i) => {
      if (b.style === 'real' && b.video) expect(T.REAL_CAMERA.roadSpeed[i + 1]).toBeGreaterThan(0);
    });
  });
});

const clip = (ready: boolean, failed = false) => ({ ready, failed });

describe('clipToShow: which level clip is behind the track', () => {
  it("shows the level's clip once it has a frame", () => {
    const prev = clip(true);
    const next = clip(true);
    expect(clipToShow(next, prev)).toBe(next);
  });

  it('keeps the previous clip while the new one loads: a portal never shows a blank', () => {
    const prev = clip(true);
    expect(clipToShow(clip(false), prev)).toBe(prev);
  });

  it('shows the built-in scenery while level 1 loads, when nothing showed before', () => {
    expect(clipToShow(clip(false), null)).toBeNull();
  });

  it('falls back to the built-in scenery for a level without a clip or with a failed one', () => {
    expect(clipToShow(null, clip(true))).toBeNull();
    expect(clipToShow(clip(true, true), clip(true))).toBeNull();
    expect(clipToShow(clip(false), clip(true, true))).toBeNull();
  });
});
