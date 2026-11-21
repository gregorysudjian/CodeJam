import { expect, test } from 'vitest';
import type { MoveType } from '@/contracts';
import { L_SHOULDER, R_SHOULDER, mid } from './detect';
import { loadClip, toPoints } from './fixtures';
import { createSession } from './session';

type Exposure = 'both' | 'only stranger' | 'during calibration';
const playerClip = loadClip('near/standing');
const walkerClip = loadClip('greg/sidestep');
const shoulders = (pose: ReturnType<typeof toPoints>) => mid(pose[L_SHOULDER], pose[R_SHOULDER]);
const width = (pose: ReturnType<typeof toPoints>) =>
  Math.abs(pose[L_SHOULDER].x - pose[R_SHOULDER].x);

function crossBehind(scale: number, exposure: Exposure) {
  const session = createSession();
  const moves: { frame: number; type: MoveType }[] = [];
  const picks: number[] = [];
  const pauses: number[] = [];
  let frame = 0;
  session.onMove((e) => moves.push({ frame, type: e.type }));
  session.onGesture(() => pauses.push(frame));
  const initialPlayer = toPoints(playerClip.frames[0].pose!);
  const initialWalker = toPoints(walkerClip.frames[0].pose!);
  const factor = (scale * width(initialPlayer)) / width(initialWalker);
  const playerCentre = shoulders(initialPlayer);
  const walkerCentre = shoulders(initialWalker);
  let walkerFrame = 0;
  for (const [i, f] of playerClip.frames.entries()) {
    frame = i;
    const player = f.pose ? toPoints(f.pose) : null;
    const start = exposure === 'during calibration' ? 0 : 2500;
    const elapsed = f.t - start;
    if (elapsed < 0 || elapsed > 2000) {
      session.frame(player ? [player] : [], f.t);
      continue;
    }
    while (
      walkerFrame + 1 < walkerClip.frames.length &&
      walkerClip.frames[walkerFrame + 1].t <= elapsed
    )
      walkerFrame++;
    const walker = toPoints(walkerClip.frames[walkerFrame].pose!);
    const centre = shoulders(walker);
    // The walker's shoulders cross the frame in two seconds. Keep recorded gait and vertical motion.
    const stranger = walker.map((p) => ({
      ...p,
      x: 0.15 + (0.7 * elapsed) / 2000 + (p.x - centre.x) * factor,
      y: playerCentre.y + (p.y - walkerCentre.y) * factor,
    }));
    const bodies = player && exposure !== 'only stranger' ? [player, stranger] : [stranger];
    session.frame(bodies, f.t);
    if (session.player === stranger) picks.push(frame);
  }
  return { picks, moves, pauses, calibrated: !!session.calibration };
}

// MediaPipe currently reports at most one body. The two-body cases exercise the session picker
// separately from a model handover, where only the passerby's landmarks reach the session.
for (const exposure of ['both', 'during calibration'] as const) {
  test.each([0.4, 0.5, 0.6, 0.7, 0.8, 0.95, 1, 1.05])(
    exposure + ': a passerby at %s× never takes over or controls the round',
    (scale) =>
      expect(crossBehind(scale, exposure)).toEqual({
        calibrated: true,
        picks: [],
        moves: [],
        pauses: [],
      }),
  );
}
test.each([0.4, 0.5, 0.55])('only a distant passerby at %s× is reported', (scale) => {
  expect(crossBehind(scale, 'only stranger')).toEqual({
    calibrated: true,
    picks: [],
    moves: [],
    pauses: [],
  });
});
test.fails.each([0.6, 0.65, 0.8, 1])(
  'Abdo: the lone passerby at %s× must not control a standing player',
  (scale) => {
    const { picks, moves } = crossBehind(scale, 'only stranger');
    expect({ firstPick: picks[0], moves }).toEqual({ firstPick: undefined, moves: [] });
  },
);
