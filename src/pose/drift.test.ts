// A judge who drifts (DECISIONS 44): the same player stepping closer to read the screen, or
// backing off, mid-play. Their size changes smoothly, so it is a distance change, not a squat and not
// a stranger. Synthetic: A's real ~1.4 m clips, scaled over time about the point that stays put in
// the image (the camera's height). Real drift clips (`● drift`) take over as referee once recorded.
import { describe, expect, test } from 'vitest';
import type { MoveEvent } from '@/contracts';
import type { Point } from './detect';
import { jitter, loadClip, scaleAbout, toPoints } from './fixtures';
import { createSession } from './session';

const smoothstep = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const FRAME_MS = 33;

interface DriftRun {
  /** Moves during the drift itself (standing still while walking): must be none. */
  duringDrift: string[];
  /** Moves while playing a clip at the new distance. */
  played: string[];
  /** Times tracking was lost. */
  lost: number;
}

/**
 * Calibrates at 1.4 m (near/standing), walks to `scale` × the size over `rampMs` while standing,
 * stands `settleMs`, then plays `clip` at that size. `cy`: the image height that stays put (where the
 * camera points; 0.35 = aimed above the hips, 0.5 = level).
 */
function drift(
  clip: string,
  scale: number,
  cy: number,
  rampMs = 1000,
  settleMs = 1500,
  { noise = 0, everyNth = 1 } = {},
): DriftRun {
  const shake = noise > 0 ? jitter(noise, 31) : (p: Point[]) => p;
  const s = createSession();
  s.calibrate('floor', () => {}).catch(() => {});
  const stand = loadClip('near/standing').frames;
  let t = 0;
  for (const f of stand) {
    if (f.t > 2500) break;
    t = f.t;
    s.frame([toPoints(f.pose!)], t);
  }
  const duringDrift: string[] = [];
  const played: string[] = [];
  let playing = false;
  s.onMove((e: MoveEvent) => (playing ? played : duringDrift).push(e.type));
  let lost = 0;
  let tracking = true;
  let n = 0;
  const feed = (pose: Point[] | null, k: number) => {
    t += FRAME_MS;
    if (n++ % everyNth !== 0) return; // a lower camera rate
    s.frame(pose ? [shake(scaleAbout(0.5, cy, k)(pose))] : [], t);
    const now = s.getState().tracking;
    if (tracking && !now) lost++;
    tracking = now;
  };
  let i = 0;
  for (let u = 0; u < rampMs + settleMs; u += FRAME_MS, i++) {
    const k = 1 + (scale - 1) * smoothstep(u / rampMs);
    feed(toPoints(stand[i % stand.length].pose!), k);
  }
  playing = true;
  for (const f of loadClip(clip).frames) feed(f.pose ? toPoints(f.pose) : null, scale);
  // Stand a moment after the clip so a quick last squat can be decided.
  for (let n = 0; n < 40; n++) feed(toPoints(stand[n].pose!), scale);
  return { duringDrift, played, lost };
}

const EXPECTED: Record<string, string[]> = {
  standing: [],
  sidestep: Array(4).fill('sidestep'),
  jump: Array(4).fill('jump'),
  squat: ['squat', 'squat'],
  armsUp: Array(3).fill('armsUp'),
};

describe('a judge who steps closer or backs off mid-play', () => {
  // 1.3× ≈ 1.4 m → 1.1 m (30 cm forward); 1.5× ≈ 0.95 m; 0.7× ≈ 2 m.
  const cases: [string, number, number][] = [
    ['30 cm closer, camera aimed above the hips', 1.3, 0.35],
    ['45 cm closer, camera aimed above the hips', 1.45, 0.35],
    ['45 cm closer, level camera', 1.5, 0.5],
    ['60 cm back, level camera', 0.7, 0.5],
    ['60 cm back, camera aimed above the hips', 0.7, 0.35],
  ];
  for (const [name, scale, cy] of cases) {
    test.each(Object.keys(EXPECTED))(`${name}: %s gives its moves, nothing else`, (clip) => {
      const r = drift(`near/${clip}`, scale, cy);
      expect(r.duringDrift).toEqual([]);
      expect(r.played).toEqual(EXPECTED[clip]);
      expect(r.lost).toBe(0);
    });
  }

  test.each(Object.keys(EXPECTED))(
    '30 cm closer, camera aimed above the hips, ±0.5%% noise at 15 FPS: %s',
    (clip) => {
      const r = drift(`near/${clip}`, 1.3, 0.35, 1000, 1500, { noise: 0.005, everyNth: 2 });
      expect(r.duringDrift).toEqual([]);
      expect(r.played).toEqual(EXPECTED[clip]);
      expect(r.lost).toBe(0);
    },
  );

  test('walking up to 0.85 m (1.7×) and standing there keeps tracking, with no moves', () => {
    const r = drift('near/standing', 1.7, 0.5, 2000);
    expect(r.duringDrift).toEqual([]);
    expect(r.played).toEqual([]);
    expect(r.lost).toBe(0);
  });
});

describe('a different body is still not the player', () => {
  test('the player leaves and a much bigger stranger steps in at once: tracking is lost', () => {
    const s = createSession();
    s.calibrate('floor', () => {}).catch(() => {});
    const stand = loadClip('near/standing').frames;
    let t = 0;
    for (const f of stand) {
      if (f.t > 2500) break;
      t = f.t;
      s.frame([toPoints(f.pose!)], t);
    }
    const stranger = scaleAbout(0.5, 0.5, 1.8)(toPoints(stand[10].pose!));
    for (let k = 0; k < 60; k++) s.frame([stranger], (t += FRAME_MS));
    expect(s.getState().tracking).toBe(false);
  });
});
