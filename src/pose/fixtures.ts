// Owner: A. Test-only helpers to replay recorded clips (src/pose/fixtures/*.json) through the detector.
import type { MoveEvent } from '@/contracts';
import { createDetector, measureBody, type Calibration, type Point } from './detect';
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

/** Calibration from the median of the clip's first `ms` milliseconds, when the player stands still. */
export function calibrateFromClip(rec: Recording, ms = 500): Calibration {
  const bodies = rec.frames
    .filter((f) => f.t < ms && f.pose)
    .map((f) => measureBody(toPoints(f.pose!)));
  const median = (k: keyof Calibration) =>
    bodies.map((b) => b[k]).sort((a, b) => a - b)[bodies.length >> 1];
  return { hipX: median('hipX'), hipY: median('hipY'), W: median('W'), T: median('T') };
}

export interface Replay {
  events: MoveEvent[];
  /** Times where tracking flipped, as [t, tracking]. */
  tracking: [number, boolean][];
}

/**
 * Replays a clip. Calibration comes from the standing clip recorded in the same session,
 * like the real app, because move clips can start mid-move.
 */
export function replay(name: string, upToMs = Infinity, calibrationClip = 'standing'): Replay {
  const rec = loadClip(name);
  const det = createDetector(calibrateFromClip(loadClip(calibrationClip), 1000));
  const events: MoveEvent[] = [];
  const tracking: [number, boolean][] = [];
  let wasTracking = det.state.tracking;
  for (const f of rec.frames) {
    if (f.t > upToMs) break;
    events.push(...det.update(f.pose ? toPoints(f.pose) : null, f.t));
    if (det.state.tracking !== wasTracking) {
      wasTracking = det.state.tracking;
      tracking.push([f.t, wasTracking]);
    }
  }
  return { events, tracking };
}
