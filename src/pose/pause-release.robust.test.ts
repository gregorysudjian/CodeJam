import { expect, test } from 'vitest';
import { loadClip, toPoints } from './fixtures';
import { isCrossed } from './gesture';
import { createSession } from './session';

// Shorten just the steady part of Abdo's first X. Keep the original movement into
// and out of the X, preserve frame intervals at the join, and keep the second hold.
function replayRelease(resumeAt: number) {
  const session = createSession();
  const standing = loadClip('near/standing');
  const clip = loadClip('near/pauseX');
  const lastStanding = standing.frames.filter((f) => f.t <= 2200);
  for (const { pose, t } of lastStanding) session.frame(pose ? [toPoints(pose)] : [], t);
  expect(session.calibration).not.toBeNull();

  let frame = 0;
  const pauses: { frame: number; crossed: boolean }[] = [];
  session.onGesture(() => {
    const { W, T } = session.detector!.readout;
    pauses.push({ frame, crossed: !!session.player && isCrossed(session.player, W, T) });
  });
  const cutStart = 22;
  const cutMs = clip.frames[resumeAt].t - clip.frames[cutStart].t;
  const start = lastStanding.at(-1)!.t + 33;
  for (const [i, { pose, t }] of clip.frames.entries()) {
    if (i >= cutStart && i < resumeAt) continue;
    frame = i;
    session.frame(pose ? [toPoints(pose)] : [], start + t - (i >= resumeAt ? cutMs : 0));
  }
  return pauses;
}
test('both X holds fire with the wrists crossed in the original recording', () => {
  expect(replayRelease(22)).toEqual([
    { frame: 40, crossed: true },
    { frame: 123, crossed: true },
  ]);
});
test('an earlier release suppresses the first pause and preserves the second hold', () => {
  expect(replayRelease(39)).toEqual([{ frame: 123, crossed: true }]);
});
test('the full second hold survives the 610 ms cut', () => {
  expect(replayRelease(38).filter((p) => p.frame >= 92)).toEqual([{ frame: 123, crossed: true }]);
});
test.fails(
  'Abdo: releasing after 851 ms cannot finish the first pause on an uncrossed frame',
  () => {
    expect(replayRelease(38).filter((p) => p.frame < 92)).toEqual([]);
  },
);
