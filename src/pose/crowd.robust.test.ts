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

// MediaPipe reports up to MAX_POSES (2) bodies. The two-body cases exercise the session picker
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
// With the player missing, a lone passer-by of any size is followed only if they stand still
// near the mark with the player's size (session.ts, REFIND_*); walking across, never.
test.each([0.4, 0.5, 0.55, 0.6, 0.65, 0.8, 1])(
  'a lone passerby at %s× never controls a standing player',
  (scale) => {
    expect(crossBehind(scale, 'only stranger')).toEqual({
      calibrated: true,
      picks: [],
      moves: [],
      pauses: [],
    });
  },
);

function spectatorX(scale: number) {
  const s = createSession();
  for (const f of playerClip.frames) {
    if (f.t > 2500) break;
    s.frame(f.pose ? [toPoints(f.pose)] : [], f.t);
  }
  expect(s.calibration).not.toBeNull();
  const clip = loadClip('near/pauseX');
  let frame = 0;
  const pauses: number[] = [];
  s.onGesture(() => pauses.push(frame));
  // The camera switches to a spectator demonstrating the pause sign, to one side of the mark.
  for (const [i, f] of clip.frames.entries()) {
    frame = i;
    const pose = f.pose
      ? toPoints(f.pose).map((p) => ({
          ...p,
          x: 0.65 + (p.x - 0.5) * scale,
          y: 0.55 + (p.y - 0.55) * scale,
        }))
      : null;
    s.frame(pose ? [pose] : [], 2500 + f.t);
  }
  return pauses;
}
test.each([0.4, 0.55, 0.6, 0.65])(
  'a spectator at %s× demonstrating X does not pause the player',
  (scale) => {
    expect(spectatorX(scale)).toEqual([]);
  },
);
// Known limit: a spectator near the player's size, under 1 W from where the player stood, right as
// the player vanishes, is followed (FOLLOW_*). With 2 poses the player stays in the model's output.
test.fails.each([0.8, 1])(
  'Abdo: a spectator at %s× demonstrating X must not pause the player',
  (scale) => {
    expect(spectatorX(scale)).toEqual([]);
  },
);
