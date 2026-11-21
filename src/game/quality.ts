import * as T from './tuning';

/**
 * Graphics quality ladder. On a webcam laptop the GPU is shared with MediaPipe, and the cost
 * of this game is pixel fill (canvas size × bloom passes), not geometry or JavaScript
 * (measured: about 100 draw calls and 0.4 ms of JavaScript per frame). So the first step
 * down halves the pixel ratio and keeps the neon bloom; only the second step drops bloom.
 *
 *   0  full: pixel ratio up to 2, bloom, every extra
 *   1  pixel ratio 1, bloom, half the particles (4× fewer pixels on a Retina screen)
 *   2  pixel ratio 1, no bloom, and none of the extras: towers, far skyline, particles, water
 *      glints, tunnel light strips. The track, obstacles, cues and zone structure all stay.
 */
export type Quality = 0 | 1 | 2;

/** Frame rate over a round, for the console line at the finish (`window.__gameFps`). */
export interface FrameSummary {
  frames: number;
  avgFps: number;
  /** The frame time that 95 % of frames beat, in ms (the slow tail a player feels). */
  p95Ms: number;
}

/** Collects frame times in 1 ms buckets: constant memory however long the round. */
export function createFrameStats(): {
  sample(realDtSec: number): void;
  summary(): FrameSummary | null;
} {
  const buckets = new Uint32Array(251); // 0..249 ms, and 250+ in the last
  let frames = 0;
  let total = 0;
  return {
    sample(dt) {
      if (!(dt > 0)) return;
      const capped = Math.min(dt, T.QUALITY_MAX_FRAME_SEC); // a hidden tab is not a slow frame
      frames++;
      total += capped;
      buckets[Math.min(250, Math.floor(capped * 1000))]!++;
    },
    summary() {
      if (frames === 0) return null;
      let seen = 0;
      let p95 = 250;
      for (let ms = 0; ms < buckets.length; ms++) {
        seen += buckets[ms]!;
        if (seen >= frames * 0.95) {
          p95 = ms + 1;
          break;
        }
      }
      return { frames, avgFps: frames / total, p95Ms: p95 };
    },
  };
}

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
      // One long frame is a stall, not a slow GPU: a hidden tab (requestAnimationFrame stops,
      // so the first frame back spans the whole absence), a minimised window, a hitch. Counted
      // whole, it would read as a frame rate near 0 and drop the graphics for the rest of the
      // round. Capped, a GPU that really draws 2 frames a second still measures 4 fps: a panic.
      time += Math.min(realDtSec, T.QUALITY_MAX_FRAME_SEC);
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
