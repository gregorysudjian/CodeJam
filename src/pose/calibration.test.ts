import { describe, expect, test } from 'vitest';
import { CALIBRATION_MESSAGES, createCalibrator } from './calibration';
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

  test('every step has a message in both modes', () => {
    for (const mode of ['floor', 'treadmill'] as const) {
      for (const step of ['noBody', 'tooFar', 'tooClose', 'holdStill', 'done'] as const) {
        expect(CALIBRATION_MESSAGES[mode][step].length).toBeGreaterThan(10);
      }
    }
  });

  test('low visibility counts as no body', () => {
    const cal = createCalibrator('floor');
    const dim = standing[0].map((p) => ({ ...p, visibility: 0.2 }));
    expect(cal.update(dim, 0).status.step).toBe('noBody');
  });
});
