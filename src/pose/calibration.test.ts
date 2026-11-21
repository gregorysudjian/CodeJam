import { describe, expect, test } from 'vitest';
import { CALIBRATION_MESSAGES, createCalibrator } from './calibration';
import type { Point } from './detect';
import { loadClip, toPoints } from './fixtures';
import { CALIBRATION_HOLD_MS } from './tuning';

const standing = loadClip('standing')
  .frames.filter((f) => f.t < 5000)
  .map((f) => toPoints(f.pose!));

describe('calibrator', () => {
  test('moving during the hold restarts it', () => {
    const cal = createCalibrator('floor');
    let t = 0;
    // Hold for 1 s, then step 0.1 of the frame sideways (a real step), then hold again.
    for (let i = 0; i < 30; i++) cal.update(standing[i], (t += 33));
    const shifted = standing[30].map((p) => ({ ...p, x: p.x + 0.1 }));
    const u = cal.update(shifted, (t += 33));
    expect(u.status.step).toBe('holdStill');
    expect(u.status.progress).toBe(0);
    let doneAt = -1;
    const start = t;
    for (let i = 31; i < standing.length && doneAt < 0; i++) {
      const p = standing[i].map((q) => ({ ...q, x: q.x + 0.1 }));
      if (cal.update(p, (t += 33)).result) doneAt = t;
    }
    expect(doneAt - start).toBeGreaterThanOrEqual(CALIBRATION_HOLD_MS);
  });

  test('small sway (real standing clip) does not restart the hold', () => {
    const cal = createCalibrator('floor');
    let done = -1;
    standing.forEach((p, i) => {
      if (done < 0 && cal.update(p, i * 33).result) done = i * 33;
    });
    expect(done).toBeGreaterThanOrEqual(CALIBRATION_HOLD_MS);
    expect(done).toBeLessThan(CALIBRATION_HOLD_MS + 100);
  });

  test('after done it stays done', () => {
    const cal = createCalibrator('floor');
    standing.forEach((p, i) => cal.update(p, i * 33));
    expect(cal.update(null, 99999).status).toMatchObject({ step: 'done', progress: 1 });
  });

  test('feet flickering at the frame edge (1 frame in 4) pause the hold but do not restart it', () => {
    const cal = createCalibrator('floor');
    let done = -1;
    standing.forEach((p, i) => {
      const pose =
        i % 4 === 3 ? p.map((q, k) => (k === 27 || k === 28 ? { ...q, y: 1.03 } : q)) : p;
      if (done < 0 && cal.update(pose, i * 33).result) done = i * 33;
    });
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThan(CALIBRATION_HOLD_MS + 200);
  });

  test('a lasting problem (knees out for 0.4 s) restarts the hold and says why', () => {
    const cal = createCalibrator('floor');
    const steps: string[] = [];
    let done = -1;
    standing.forEach((p, i) => {
      const t = i * 33;
      const out = t > 900 && t < 1300;
      const pose = out ? p.map((q, k) => (k === 25 || k === 26 ? { ...q, y: 1.03 } : q)) : p;
      const u = cal.update(pose, t);
      steps.push(u.status.step);
      if (done < 0 && u.result) done = t;
    });
    expect(steps).toContain('tooClose');
    expect(done).toBeGreaterThanOrEqual(1300 + CALIBRATION_HOLD_MS - 33);
  });

  test('a size change during the hold (shoulders 30% wider, same centre) restarts it', () => {
    const cal = createCalibrator('floor');
    const wider = (p: Point[]) => {
      const cx = (p[23].x + p[24].x) / 2;
      return p.map((q) => ({ ...q, x: cx + (q.x - cx) * 1.3 }));
    };
    let done = -1;
    standing.forEach((p, i) => {
      const t = i * 33;
      if (done < 0 && cal.update(t >= 1000 ? wider(p) : p, t).result) done = t;
    });
    expect(done).toBeGreaterThanOrEqual(1000 + CALIBRATION_HOLD_MS - 33);
  });

  test('every step has a message in both modes', () => {
    for (const mode of ['floor', 'treadmill'] as const) {
      for (const step of ['noBody', 'tooFar', 'tooClose', 'holdStill', 'done'] as const) {
        expect(CALIBRATION_MESSAGES[mode][step].length).toBeGreaterThan(10);
      }
    }
  });

  test('feet cut off: fine by default (head to knees); tooClose with the feet switch on', () => {
    const down = standing.map((p) => p.map((q) => ({ ...q, y: q.y + 0.06 })));
    const strict = createCalibrator('floor', 4 / 3, true);
    const relaxed = createCalibrator('floor');
    let strictStep = '';
    let relaxedDone = false;
    down.forEach((p, i) => {
      strictStep = strict.update(p, i * 33).status.step;
      if (relaxed.update(p, i * 33).result) relaxedDone = true;
    });
    expect(strictStep).toBe('tooClose');
    expect(relaxedDone).toBe(true);
  });

  test("A's real clip at ~1.4 m (head to knees, feet at the bottom edge) calibrates", () => {
    const rec = loadClip('near/standing');
    const cal = createCalibrator('floor', rec.video.width / rec.video.height);
    let done = false;
    for (const f of rec.frames) if (cal.update(toPoints(f.pose!), f.t).result) done = true;
    expect(done).toBe(true);
  });

  test('no room above the shoulders for a jump (body high in the frame): tooClose', () => {
    const high = standing.map((p) => p.map((q) => ({ ...q, y: q.y - 0.39 })));
    const cal = createCalibrator('floor');
    let step = '';
    high.forEach((p, i) => (step = cal.update(p, i * 33).status.step));
    expect(high[0][0].y).toBeGreaterThan(0); // the head is still in view
    expect(step).toBe('tooClose');
  });

  test('low visibility counts as no body', () => {
    const cal = createCalibrator('floor');
    const dim = standing[0].map((p) => ({ ...p, visibility: 0.2 }));
    expect(cal.update(dim, 0).status.step).toBe('noBody');
  });
});
