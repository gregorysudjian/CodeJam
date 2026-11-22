import { describe, expect, it } from 'vitest';
import { clipToShow } from './videoBackdrop';

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
