import * as T from './tuning';

/**
 * Graphics quality ladder. On a webcam laptop the GPU is shared with MediaPipe, and the cost
 * of this game is pixel fill (canvas size × bloom passes), not geometry or JavaScript
 * (measured: about 100 draw calls and 0.4 ms of JavaScript per frame). So the first step
 * down halves the pixel ratio and keeps the neon bloom; only the second step drops bloom.
 *
 *   0  full: pixel ratio up to 2, bloom, skyline
 *   1  pixel ratio 1, bloom, skyline (4× fewer pixels on a Retina screen)
 *   2  pixel ratio 1, no bloom, no skyline
 */
export type Quality = 0 | 1 | 2;

export interface QualityGovernor {
  readonly level: Quality;
  /** Frames per second over the last finished window (NaN before the first one). */
  readonly lastFps: number;
  /**
   * One frame of real time while the round runs (pass running = false otherwise, so a
   * pause or the countdown never counts). Returns the new level when it steps down.
   */
  sample(realDtSec: number, running: boolean): Quality | null;
}

export function createQualityGovernor(
  start: Quality,
  auto: boolean,
  devicePixelRatio: number,
): QualityGovernor {
  let level: Quality = start;
  let time = 0; // seconds in the current window, start-up frames included
  let frames = 0; // frames after the start-up skip
  let lastFps = NaN;

  return {
    get level() {
      return level;
    },
    get lastFps() {
      return lastFps;
    },
    sample(realDtSec, running) {
      if (!auto || level === 2 || !running) return null;
      time += realDtSec;
      if (time < T.QUALITY_SKIP_SEC) return null; // just started or just stepped: ignore
      frames++;
      const measured = time - T.QUALITY_SKIP_SEC;
      const fps = frames / Math.max(measured, 1e-6);
      // Fast path: at a very low frame rate the round runs in slow motion (each frame's
      // step is capped), so do not wait for the full window.
      const panic = measured >= T.QUALITY_PANIC_SEC && fps < T.QUALITY_PANIC_FPS;
      if (!panic && measured < T.QUALITY_WINDOW_SEC) return null;
      lastFps = fps;
      time = 0;
      frames = 0;
      if (fps >= T.QUALITY_MIN_FPS) return null;
      // Step 1 only helps where it lowers the pixel ratio; on a 1x screen go straight to 2.
      level = level === 0 && devicePixelRatio > 1 ? 1 : 2;
      return level;
    },
  };
}
