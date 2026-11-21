import { describe, expect, it } from 'vitest';
import { createQualityGovernor, type Quality } from './quality';
import {
  QUALITY_MIN_FPS,
  QUALITY_PANIC_FPS,
  QUALITY_PANIC_SEC,
  QUALITY_SKIP_SEC,
  QUALITY_WINDOW_SEC,
} from './tuning';

/** Feeds `sec` seconds at `fps`; returns every level change. */
function run(
  g: ReturnType<typeof createQualityGovernor>,
  fps: number,
  sec: number,
  running = true,
) {
  const changes: Quality[] = [];
  for (let i = 0; i < Math.round(sec * fps); i++) {
    const q = g.sample(1 / fps, running);
    if (q !== null) changes.push(q);
  }
  return changes;
}
const WINDOW = QUALITY_SKIP_SEC + QUALITY_WINDOW_SEC;

describe('quality governor', () => {
  it('stays put at a good frame rate', () => {
    const g = createQualityGovernor(0, true, 2);
    expect(run(g, 60, 30)).toEqual([]);
    expect(g.level).toBe(0);
  });

  it('on a Retina screen: first the pixel ratio, one window later the bloom', () => {
    const g = createQualityGovernor(0, true, 2);
    expect(run(g, QUALITY_MIN_FPS - 15, WINDOW + 0.2)).toEqual([1]);
    expect(run(g, QUALITY_MIN_FPS - 15, WINDOW + 0.2)).toEqual([2]);
    expect(run(g, 10, 30)).toEqual([]); // nothing below 2
  });

  it('steps at once, not after a full window, when the frame rate is very low', () => {
    const g = createQualityGovernor(0, true, 2);
    const slow = QUALITY_PANIC_FPS / 2;
    expect(run(g, slow, QUALITY_SKIP_SEC + QUALITY_PANIC_SEC + 0.3)).toEqual([1]);
    expect(run(g, slow, QUALITY_SKIP_SEC + QUALITY_PANIC_SEC + 0.3)).toEqual([2]);
  });

  it('a merely slow frame rate (not a panic) still waits for the full window', () => {
    const g = createQualityGovernor(0, true, 2);
    const fps = (QUALITY_PANIC_FPS + QUALITY_MIN_FPS) / 2;
    expect(run(g, fps, QUALITY_SKIP_SEC + QUALITY_WINDOW_SEC - 0.2)).toEqual([]);
    expect(run(g, fps, 0.4)).toEqual([1]);
  });

  it('on a 1x screen it skips the step that would not help', () => {
    const g = createQualityGovernor(0, true, 1);
    expect(run(g, 20, WINDOW + 0.2)).toEqual([2]);
  });

  it('stops stepping once the frame rate recovers', () => {
    const g = createQualityGovernor(0, true, 2);
    expect(run(g, 25, WINDOW + 0.2)).toEqual([1]);
    expect(run(g, 60, 30)).toEqual([]);
    expect(g.level).toBe(1);
  });

  it('ignores the start-up frames of each window', () => {
    const g = createQualityGovernor(0, true, 2);
    // A slow first second (shader compiles), then smooth: no step.
    expect(run(g, 5, QUALITY_SKIP_SEC * 0.9)).toEqual([]);
    expect(run(g, 60, 20)).toEqual([]);
  });

  it('never counts paused or idle time', () => {
    const g = createQualityGovernor(0, true, 2);
    expect(run(g, 5, 60, false)).toEqual([]);
    expect(g.level).toBe(0);
  });

  it('a hidden tab or a single hitch is not a slow GPU', () => {
    const g = createQualityGovernor(0, true, 2);
    expect(run(g, 60, 2)).toEqual([]);
    // Back from 30 s in another tab: requestAnimationFrame delivers it as one frame.
    expect(g.sample(30, true)).toBeNull();
    expect(run(g, 60, 1)).toEqual([]);
    expect(g.sample(0.8, true)).toBeNull(); // a hitch
    expect(run(g, 60, WINDOW * 3)).toEqual([]);
    expect(g.level).toBe(0);
  });

  it('a GPU that really draws 2 frames a second still steps down at once', () => {
    const g = createQualityGovernor(0, true, 2);
    expect(run(g, 2, 6)).toEqual([1, 2]);
  });

  it('does nothing when fixed by ?gfx', () => {
    const fixedHigh = createQualityGovernor(0, false, 2);
    expect(run(fixedHigh, 10, 30)).toEqual([]);
    expect(fixedHigh.level).toBe(0);
    const fixedLow = createQualityGovernor(2, false, 2);
    expect(fixedLow.level).toBe(2);
  });
});
