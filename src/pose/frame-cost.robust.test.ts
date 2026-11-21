import { expect, test } from 'vitest';
import { loadClip, calibrateFromClip, toPoints } from './fixtures';
import { createDetector } from './detect';
import { createGestureDetector } from './gesture';
import { createSession } from './session';

test('frame cost on the two-X recording, with a positive gesture control', () => {
  const standing = loadClip('near/standing');
  const clip = loadClip('near/pauseX');
  const calibration = calibrateFromClip(standing, 1000);
  const reference = createDetector(calibration);
  const frames = clip.frames.map(({ t, pose }) => {
    const points = pose ? toPoints(pose) : null;
    reference.update(points, t);
    return {
      t,
      points,
      bodies: points ? [points] : [],
      state: { ...reference.state },
      readout: { ...reference.readout },
    };
  });
  const last = frames[frames.length - 1].t;
  const interval = last + 33;
  const session = createSession();
  for (const { t, pose } of standing.frames) session.frame(pose ? [toPoints(pose)] : [], t);
  expect(session.calibration).not.toBeNull();
  const detector = createDetector(calibration);
  const gesture = createGestureDetector();
  let sessionPauses = 0,
    isolatedPauses = 0;
  session.onGesture(() => sessionPauses++);
  const measure = (step: (f: (typeof frames)[number], t: number) => void) => {
    let time = standing.frames[standing.frames.length - 1].t + 33;
    const batches: number[] = [];
    for (let batch = 0; batch <= 11; batch++) {
      const start = performance.now();
      for (let replay = 0; replay < 10; replay++) {
        for (const f of frames) step(f, time + f.t);
        time += interval;
      }
      if (batch) batches.push((performance.now() - start) / (10 * frames.length));
    }
    batches.sort((a, b) => a - b);
    return batches[5];
  };
  const sessionMs = measure((f, t) => session.frame(f.bodies, t));
  const detectMs = measure((f, t) => {
    detector.update(f.points, t);
  });
  const gestureMs = measure((f, t) => {
    if (gesture.update(f.points, t, f.state, f.readout)) isolatedPauses++;
  });
  expect(sessionPauses).toBe(2 * 120);
  expect(isolatedPauses).toBe(sessionPauses);
  console.info('Median batch mean, ms/frame', {
    sessionMs,
    detectMs,
    gestureMs,
    framesPerBatch: 10 * frames.length,
  });
});
