// The pose input's core flow (what createPoseInput does per camera frame), on recorded clips:
// calibrate() with status messages, then moves; recalibration; background people.
import { describe, expect, test } from 'vitest';
import type { CalibrationStatus, MoveEvent } from '@/contracts';
import type { Point } from './detect';
import { loadClip, scaleAbout, toPoints } from './fixtures';
import { createSession, NEUTRAL_STATE, type Session } from './session';
import { CALIBRATION_HOLD_MS } from './tuning';

type Transform = (p: Point[]) => Point[];
const same: Transform = (p) => p;

/** Feeds a clip's frames into the session, shifted to start at `t0`. Returns the end time. */
interface FeedOptions {
  transform?: Transform;
  others?: (p: Point[]) => Point[][];
  upToMs?: number;
}

function feed(s: Session, clip: string, t0: number, opts: FeedOptions = {}): number {
  const { transform = same, others = () => [], upToMs = Infinity } = opts;
  let t = t0;
  for (const f of loadClip(clip).frames) {
    if (f.t > upToMs) break;
    t = t0 + f.t;
    const pose = f.pose ? transform(toPoints(f.pose)) : null;
    s.frame(pose ? [pose, ...others(pose)] : others([]), t);
  }
  return t + 33;
}

/** Calibrates on standing.json (floor). Returns the statuses and the time after calibration. */
async function calibrateOnStanding(s: Session, transform = same) {
  const statuses: CalibrationStatus[] = [];
  let done = false;
  const p = s.calibrate('floor', (st) => statuses.push(st)).then(() => (done = true));
  const t = feed(s, 'standing', 0, { transform, upToMs: 2500 });
  await p;
  return { statuses, t, done };
}

describe('calibrate()', () => {
  test('on standing still: holdStill progress, then done; reports in steps, not every frame', async () => {
    const s = createSession();
    const { statuses, done } = await calibrateOnStanding(s);
    expect(done).toBe(true);
    expect(statuses[0].step).toBe('holdStill');
    expect(statuses.at(-1)).toMatchObject({ step: 'done', progress: 1 });
    const progress = statuses.map((x) => x.progress);
    expect(progress).toEqual([...progress].sort((a, b) => a - b)); // never goes back
    expect(statuses.length).toBeLessThan(30); // ~20 steps of 5%, not ~45 frames
    expect(statuses.every((x) => x.message.length > 0)).toBe(true);
    expect(s.calibration!.T).toBeCloseTo(0.2, 1);
  });

  test('takes about the hold time', async () => {
    const s = createSession();
    let doneAt = -1;
    const p = s.calibrate('floor', (st) => {
      if (st.step === 'done') doneAt = lastT;
    });
    let lastT = 0;
    for (const f of loadClip('standing').frames) {
      if (f.t > 2500) break;
      lastT = f.t;
      s.frame([toPoints(f.pose!)], f.t);
    }
    await p;
    expect(doneAt).toBeGreaterThanOrEqual(CALIBRATION_HOLD_MS);
    expect(doneAt).toBeLessThan(CALIBRATION_HOLD_MS + 200);
  });

  test('then moves fire through onMove: four jumps', async () => {
    const s = createSession();
    const { t } = await calibrateOnStanding(s);
    const moves: MoveEvent[] = [];
    s.onMove((e) => moves.push(e));
    feed(s, 'jump', t, { upToMs: 7200 });
    expect(moves.map((e) => e.type)).toEqual(['jump', 'jump', 'jump', 'jump']);
  });

  test('getState is neutral with tracking false before calibration and while recalibrating', async () => {
    const s = createSession();
    expect(s.getState()).toEqual(NEUTRAL_STATE);
    const { t } = await calibrateOnStanding(s);
    feed(s, 'standing', t, { upToMs: 1000 });
    expect(s.getState().tracking).toBe(true);
    void s.calibrate('floor', () => {}).catch(() => {});
    expect(s.getState()).toEqual(NEUTRAL_STATE);
  });

  test('no body: noBody, and never done', () => {
    const s = createSession();
    const statuses: string[] = [];
    void s.calibrate('floor', (st) => statuses.push(st.step));
    for (let t = 0; t < 3000; t += 33) s.frame([], t);
    expect(new Set(statuses)).toEqual(new Set(['noBody']));
  });

  test('too far away (body under 15% of the frame height): tooFar', () => {
    const s = createSession();
    const statuses: string[] = [];
    void s.calibrate('floor', (st) => statuses.push(st.step));
    feed(s, 'standing', 0, { transform: scaleAbout(0.5, 0.97, 0.6), upToMs: 3000 });
    expect(new Set(statuses)).toEqual(new Set(['tooFar']));
  });

  test('feet cut off at the bottom: tooClose', () => {
    const s = createSession();
    const statuses: string[] = [];
    void s.calibrate('floor', (st) => statuses.push(st.step));
    const down: Transform = (p) => p.map((q) => ({ ...q, y: q.y + 0.08 }));
    feed(s, 'standing', 0, { transform: down, upToMs: 3000 });
    expect(new Set(statuses)).toEqual(new Set(['tooClose']));
  });

  test('a newer calibrate() rejects the older one; the newer one finishes', async () => {
    const s = createSession();
    const first = s.calibrate('floor', () => {});
    const second = s.calibrate('floor', () => {});
    await expect(first).rejects.toThrow('restarted');
    feed(s, 'standing', 0, { upToMs: 2500 });
    await expect(second).resolves.toBeUndefined();
  });

  test('cancel() (camera stopped) rejects, and keeps the last calibration', async () => {
    const s = createSession();
    await calibrateOnStanding(s);
    const cal = s.calibration;
    const p = s.calibrate('floor', () => {});
    s.cancel('The camera was stopped.');
    await expect(p).rejects.toThrow('camera was stopped');
    expect(s.calibration).toBe(cal);
  });

  test('a stopped listener gets nothing', async () => {
    const s = createSession();
    const { t } = await calibrateOnStanding(s);
    const moves: MoveEvent[] = [];
    const off = s.onMove((e) => moves.push(e));
    off();
    feed(s, 'jump', t, { upToMs: 7200 });
    expect(moves).toEqual([]);
  });
});

describe('without calibrate() (pose switched on mid-round)', () => {
  test('calibrates quietly once the player stands still, then detects moves', () => {
    const s = createSession();
    const moves: MoveEvent[] = [];
    s.onMove((e) => moves.push(e));
    const t = feed(s, 'standing', 0, { upToMs: 2500 });
    expect(s.calibration).not.toBeNull();
    feed(s, 'jump', t, { upToMs: 7200 });
    expect(moves.map((e) => e.type)).toEqual(['jump', 'jump', 'jump', 'jump']);
  });
});

describe('people in the background', () => {
  /** A smaller (further back) copy of a pose, off to one side. */
  const behind =
    (dx: number, s = 0.55): ((p: Point[]) => Point[][]) =>
    (p) =>
      p.length ? [scaleAbout(0.5, 0.5, s)(p).map((q) => ({ ...q, x: q.x + dx }))] : [];

  test('with several bodies, the player (largest, nearest) is picked: same jumps', async () => {
    const s = createSession();
    const { t } = await calibrateOnStanding(s);
    const moves: MoveEvent[] = [];
    s.onMove((e) => moves.push(e));
    // Background person listed first, so picking by order would be wrong.
    const others = behind(0.25);
    for (const f of loadClip('jump').frames) {
      if (f.t > 7200) break;
      const pose = toPoints(f.pose!);
      s.frame([...others(pose), pose], t + f.t);
    }
    expect(moves.map((e) => e.type)).toEqual(['jump', 'jump', 'jump', 'jump']);
  });

  test('a background person jumping around does not move the standing player', async () => {
    const s = createSession();
    const { t } = await calibrateOnStanding(s);
    const moves: MoveEvent[] = [];
    s.onMove((e) => moves.push(e));
    const jumper = loadClip('jump').frames;
    let i = 0;
    feed(s, 'standing', t, {
      upToMs: 5500,
      others: () => {
        const f = jumper[i++ % jumper.length];
        return [
          scaleAbout(0.5, 0.5, 0.55)(toPoints(f.pose!)).map((q) => ({ ...q, x: q.x - 0.25 })),
        ];
      },
    });
    expect(moves).toEqual([]);
  });

  test('when the player walks off and only a smaller background person is left, tracking is lost', async () => {
    const s = createSession();
    const { t } = await calibrateOnStanding(s);
    // The player is gone; MediaPipe (1 body) now returns the person behind.
    const bg = scaleAbout(0.5, 0.5, 0.55)(toPoints(loadClip('standing').frames[10].pose!));
    for (let k = 0; k < 40; k++) s.frame([bg], t + k * 33);
    expect(s.getState().tracking).toBe(false);
  });
});
