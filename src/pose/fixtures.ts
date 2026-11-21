// Owner: A. Test-only helpers: replay recorded clips (src/pose/fixtures/*.json) through the
// detector, optionally transformed into synthetic variants (scaled, jittery, dropped frames,
// a second person in frame).
import type { MoveEvent, PlayMode } from '@/contracts';
import { measureForMode } from './calibration';
import { type Calibration, createDetector, type Point, pickBody, toPlayerX, mid } from './detect';
import type { Recording } from './recording';

const clips = import.meta.glob<Recording>('./fixtures/**/*.json', {
  eager: true,
  import: 'default',
});

export function loadClip(name: string): Recording {
  const clip = clips[`./fixtures/${name}.json`];
  if (!clip) throw new Error(`No fixture ${name}`);
  return clip;
}

export const toPoints = (pose: [number, number, number, number][]): Point[] =>
  pose.map(([x, y, , visibility]) => ({ x, y, visibility }));

/** Deterministic random numbers (mulberry32), so noisy tests are repeatable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Changes one frame's pose; `t` is the frame time in the original clip (ms). */
export type PoseTransform = (pose: Point[], t?: number) => Point[];

/** Scales the body about a fixed point: about the feet = taller/shorter, about the centre = closer/farther. */
export const scaleAbout =
  (cx: number, cy: number, s: number): PoseTransform =>
  (pose) =>
    pose.map((p) => ({ ...p, x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s }));

/** Adds uniform noise of ±amp to every coordinate (landmark jitter). */
export const jitter = (amp: number, seed = 1): PoseTransform => {
  const r = rng(seed);
  return (pose) =>
    pose.map((p) => ({ ...p, x: p.x + (r() * 2 - 1) * amp, y: p.y + (r() * 2 - 1) * amp }));
};

export interface ReplayOptions {
  upToMs?: number;
  /** 'standing': calibrate on standing.json (session 1, same spot). 'self': the clip's first 300 ms. */
  /** A standing clip to calibrate on (first second), or 'self': the clip's own first 300 ms. */
  calibrate?: string;
  mode?: PlayMode;
  /** Applied to every pose, in the calibration clip too (the same body, transformed). */
  transform?: PoseTransform;
  /** Fraction of frames to drop at random (camera hiccups). */
  dropFraction?: number;
  /** Plays the clip this many times slower (2 = half speed). */
  timeScale?: number;
  /** Keeps feeding the last frame this long after the clip, so pending decisions can finish. */
  holdLastMs?: number;
  /** Starts the replay at this clip time (ms), e.g. to skip an ambiguous first rep. */
  fromMs?: number;
  /** Extra bodies in frame for each pose (e.g. someone behind the player); pickBody chooses. */
  others?: (pose: Point[], t: number) => Point[][];
}

/** Calibration from the median of the clip's first `ms` milliseconds, when the player stands still. */
export function calibrateFromClip(
  rec: Recording,
  ms: number,
  mode: PlayMode = 'floor',
  transform: PoseTransform = (p) => p,
): Calibration {
  const aspect = rec.video.width / rec.video.height;
  const bodies = rec.frames
    .filter((f) => f.t < ms && f.pose)
    .map((f) => measureForMode(transform(toPoints(f.pose!), f.t), mode, aspect));
  const median = (k: keyof Calibration) =>
    bodies.map((b) => b[k]).sort((a, b) => a - b)[bodies.length >> 1];
  return {
    centreX: median('centreX'),
    centreY: median('centreY'),
    W: median('W'),
    T: median('T'),
  };
}

export interface Replay {
  events: MoveEvent[];
  /** Times where tracking flipped, as [t, tracking]. */
  tracking: [number, boolean][];
  /** How often pickBody chose a body other than the real player (index 0). */
  wrongPicks: number;
}

export function replay(name: string, opts: ReplayOptions = {}): Replay {
  const {
    upToMs = Infinity,
    calibrate = 'standing',
    mode = 'floor',
    transform = (p) => p,
    dropFraction = 0,
    timeScale = 1,
    holdLastMs = 0,
    fromMs = 0,
    others,
  } = opts;
  const rec = loadClip(name);
  const cal =
    calibrate === 'self'
      ? calibrateFromClip(rec, 300, mode, transform)
      : calibrateFromClip(loadClip(calibrate), 1000, mode, transform);
  const det = createDetector(cal, mode);
  const drop = rng(7);
  const events: MoveEvent[] = [];
  const tracking: [number, boolean][] = [];
  let wasTracking = det.state.tracking;
  let last: { x: number; y: number } | null = null;
  let wrongPicks = 0;
  for (const f of rec.frames) {
    if (f.t > upToMs) break;
    if (f.t < fromMs) continue;
    if (dropFraction > 0 && drop() < dropFraction) continue;
    let pose = f.pose ? transform(toPoints(f.pose), f.t) : null;
    if (pose && others) {
      const bodies = [pose, ...others(pose, f.t)];
      const i = pickBody(bodies, last);
      if (i !== 0) wrongPicks++;
      pose = bodies[i];
      const s = mid(pose[11], pose[12]);
      last = { x: toPlayerX(s.x), y: s.y };
    }
    const t = f.t * timeScale;
    events.push(...det.update(pose, t));
    if (det.state.tracking !== wasTracking) {
      wasTracking = det.state.tracking;
      tracking.push([t, wasTracking]);
    }
  }
  const lastFrame = rec.frames.at(-1);
  if (holdLastMs > 0 && lastFrame?.pose) {
    const end = lastFrame.t * timeScale;
    for (let t = end + 33; t <= end + holdLastMs; t += 33) {
      events.push(...det.update(transform(toPoints(lastFrame.pose), lastFrame.t), t));
    }
  }
  return { events, tracking, wrongPicks };
}
