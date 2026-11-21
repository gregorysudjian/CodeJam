import { describe, expect, test } from 'vitest';
import type { MoveEvent } from '@/contracts';
import { createDetector, measureBody, type Point } from './detect';
import { replay } from './fixtures';
import { DETECTION as K } from './tuning';

/*
 * Synthetic standing pose: W = 0.1 (shoulders), T = 0.2 (shoulder centre to hip centre).
 * dx moves the whole body to the PLAYER's right (raw MediaPipe x gets smaller: the mirroring trap).
 * dy moves it down. Arms: 'down' at the hips, 'up' above the head.
 */
const W = 0.1;
const T = 0.2;
function pose({
  dx = 0,
  dy = 0,
  left = 'down',
  right = 'down',
  vis = 1,
}: {
  dx?: number;
  dy?: number;
  left?: 'down' | 'up';
  right?: 'down' | 'up';
  vis?: number;
} = {}): Point[] {
  const pts: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: vis }));
  const at = (i: number, playerX: number, y: number) => {
    // Raw MediaPipe x, written out (not via toPlayerX) so a broken mirror fails the tests.
    pts[i] = { x: 1 - (playerX + dx), y: y + dy, visibility: vis };
  };
  at(0, 0.5, 0.41); // nose
  at(11, 0.45, 0.48); // left shoulder (player's left = smaller player x)
  at(12, 0.55, 0.48);
  at(15, 0.43, left === 'up' ? 0.27 : 0.66); // left wrist
  at(16, 0.57, right === 'up' ? 0.27 : 0.66);
  at(23, 0.47, 0.68); // left hip
  at(24, 0.53, 0.68);
  return pts;
}

const FRAME_MS = 33;

/** Feeds `frames` copies of a pose, 33 ms apart, starting at `t`. Returns events and the next t. */
function run(det: ReturnType<typeof createDetector>, p: Point[] | null, frames: number, t: number) {
  const events: MoveEvent[] = [];
  for (let i = 0; i < frames; i++) events.push(...det.update(p, (t += FRAME_MS)));
  return { events, t };
}

const types = (events: MoveEvent[]) => events.map((e) => e.type);
const standingDetector = () => createDetector(measureBody(pose()));

describe('measureBody', () => {
  test('measures W and T, and mirrors x into player coordinates', () => {
    const cal = measureBody(pose({ dx: 0.1 }));
    expect(cal.W).toBeCloseTo(W);
    expect(cal.T).toBeCloseTo(T);
    expect(cal.centreX).toBeCloseTo(0.6);
  });
});

describe('lane', () => {
  test("a step to the player's right is lane +1 (mirroring trap)", () => {
    const det = standingDetector();
    const { events } = run(det, pose({ dx: 0.7 * W }), 10, 0);
    expect(det.state.lane).toBe(1);
    expect(types(events)).toEqual(['sidestep']);
  });

  test("a step to the player's left is lane -1", () => {
    const det = standingDetector();
    run(det, pose({ dx: -0.7 * W }), 10, 0);
    expect(det.state.lane).toBe(-1);
  });

  test('hysteresis: stays in the lane between the off and on lines, returns inside the off line', () => {
    const det = standingDetector();
    let { t } = run(det, pose({ dx: 0.7 * W }), 10, 0);
    ({ t } = run(det, pose({ dx: 0.4 * W }), 10, t));
    expect(det.state.lane).toBe(1);
    const back = run(det, pose({ dx: 0.1 * W }), 10, t);
    expect(det.state.lane).toBe(0);
    expect(types(back.events)).toEqual(['sidestep']);
  });

  test('a small sway does not change lane', () => {
    const det = standingDetector();
    const { events } = run(det, pose({ dx: 0.4 * W }), 20, 0);
    expect(det.state.lane).toBe(0);
    expect(events).toEqual([]);
  });
});

describe('squat', () => {
  test('one event per rep, ducking while held, off inside the off line', () => {
    const det = standingDetector();
    let r = run(det, pose({ dy: 0.5 * T }), 15, 0);
    expect(types(r.events)).toEqual(['squat']);
    expect(det.state.ducking).toBe(true);
    r = run(det, pose({ dy: 0.2 * T }), 10, r.t); // between the off and on lines: still ducking
    expect(det.state.ducking).toBe(true);
    r = run(det, pose({ dy: 0.05 * T }), 10, r.t);
    expect(det.state.ducking).toBe(false);
    expect(r.events).toEqual([]);
  });

  test('standing up out of a squat, even overshooting, is not a jump', () => {
    const det = standingDetector();
    let r = run(det, pose({ dy: 0.8 * T }), 20, 0);
    // Spring up fast past standing height within one frame.
    r = run(det, pose({ dy: -0.2 * T }), 5, r.t);
    expect(types(r.events)).not.toContain('jump');
    expect(det.state.airborne).toBe(false);
  });
});

describe('jump', () => {
  test('rising above the line fires one jump; airborne lasts the fixed airtime', () => {
    const det = standingDetector();
    let r = run(det, pose(), 10, 0);
    r = run(det, pose({ dy: -0.5 * T }), 3, r.t);
    expect(types(r.events)).toEqual(['jump']);
    expect(det.state.airborne).toBe(true);
    const landed = run(det, pose(), Math.ceil(K.AIRBORNE_MS / FRAME_MS), r.t);
    expect(det.state.airborne).toBe(false);
    expect(landed.events).toEqual([]);
  });

  test('a second jump inside the cooldown is ignored', () => {
    const det = standingDetector();
    let r = run(det, pose(), 10, 0);
    r = run(det, pose({ dy: -0.5 * T }), 3, r.t);
    r = run(det, pose(), Math.ceil(K.AIRBORNE_MS / FRAME_MS), r.t); // just landed, still in cooldown
    r = run(det, pose({ dy: -0.5 * T }), 3, r.t);
    expect(r.events).toEqual([]);
  });

  test('holding still up high (no upward speed) is not a jump', () => {
    const det = createDetector(measureBody(pose({ dy: 0.5 * T })));
    // Calibrated low, standing still higher: above the line but not moving.
    const r = run(det, pose(), 1, 0);
    const still = run(det, pose(), 10, r.t + 1000);
    expect(types(still.events)).not.toContain('jump');
  });

  test('arms swinging up during a jump do not fire armsUp', () => {
    const det = standingDetector();
    let r = run(det, pose(), 10, 0);
    r = run(det, pose({ dy: -0.5 * T }), 2, r.t);
    const swing = run(det, pose({ dy: -0.5 * T, left: 'up', right: 'up' }), 5, r.t);
    expect(types([...r.events, ...swing.events])).toEqual(['jump']);
  });
});

describe('arms', () => {
  test('both arms up is one armsUp, even when one arm leads', () => {
    const det = standingDetector();
    const r = run(det, pose({ left: 'up' }), 3, 0); // leads by 100 ms, under the settle time
    const both = run(det, pose({ left: 'up', right: 'up' }), 10, r.t);
    expect(types([...r.events, ...both.events])).toEqual(['armsUp']);
    expect(det.state.leftArmUp && det.state.rightArmUp).toBe(true);
    run(det, pose(), 5, both.t);
    expect(det.state.leftArmUp || det.state.rightArmUp).toBe(false);
  });

  test('one arm held alone is a reach on that side; lowering it re-arms', () => {
    const det = standingDetector();
    let r = run(det, pose({ left: 'up' }), 15, 0);
    expect(types(r.events)).toEqual(['reachLeft']);
    r = run(det, pose(), 5, r.t);
    r = run(det, pose({ right: 'up' }), 15, r.t);
    expect(types(r.events)).toEqual(['reachRight']);
  });

  test('press reps: lowering to nose height ends a rep, forehead height keeps it up', () => {
    const det = standingDetector();
    let r = run(det, pose({ left: 'up', right: 'up' }), 10, 0);
    const forehead = pose({ left: 'up', right: 'up' });
    forehead[15] = { ...forehead[15], y: 0.41 - 0.15 * T }; // between the down and up lines
    forehead[16] = { ...forehead[16], y: 0.41 - 0.15 * T };
    r = run(det, forehead, 5, r.t);
    expect(det.state.leftArmUp && det.state.rightArmUp).toBe(true);
    const shoulderHeight = pose({ left: 'up', right: 'up' });
    shoulderHeight[15] = { ...shoulderHeight[15], y: 0.46 };
    shoulderHeight[16] = { ...shoulderHeight[16], y: 0.46 };
    r = run(det, shoulderHeight, 5, r.t);
    expect(det.state.leftArmUp || det.state.rightArmUp).toBe(false);
    const again = run(det, pose({ left: 'up', right: 'up' }), 5, r.t);
    expect(types([...again.events])).toEqual(['armsUp']);
  });
});

describe('tracking', () => {
  test('lost after the lost time with no body, regained after the regained time', () => {
    const det = standingDetector();
    let r = run(det, null, Math.floor(K.TRACKING_LOST_MS / FRAME_MS) - 1, 0);
    expect(det.state.tracking).toBe(true);
    r = run(det, null, 3, r.t);
    expect(det.state.tracking).toBe(false);
    r = run(det, pose(), Math.floor(K.TRACKING_REGAINED_MS / FRAME_MS) - 1, r.t);
    expect(det.state.tracking).toBe(false);
    run(det, pose(), 3, r.t);
    expect(det.state.tracking).toBe(true);
  });

  test('low visibility and hips outside the frame both count as missing', () => {
    const lowVis = standingDetector();
    run(lowVis, pose({ vis: 0.3 }), 20, 0);
    expect(lowVis.state.tracking).toBe(false);
    const offFrame = standingDetector();
    run(offFrame, pose({ dx: 0.6 }), 20, 0);
    expect(offFrame.state.tracking).toBe(false);
  });

  test('no move events while not tracking', () => {
    const det = standingDetector();
    let r = run(det, null, 20, 0);
    r = run(det, pose({ dy: 0.5 * T }), 3, r.t); // squats before tracking is regained
    expect(r.events).toEqual([]);
  });
});

describe('baseline drift', () => {
  test('standing a little lower for a while does not become a squat', () => {
    const det = standingDetector();
    // Just under the squat line, held for 10 s (e.g. the player relaxes their knees).
    const r = run(det, pose({ dy: 0.1 * T }), 300, 0);
    const deeper = run(det, pose({ dy: 0.25 * T }), 10, r.t);
    expect(r.events).toEqual([]);
    expect(deeper.events).toEqual([]);
  });

  test('a held squat does not drift away', () => {
    const det = standingDetector();
    run(det, pose({ dy: 0.5 * T }), 150, 0); // 5 s hold
    expect(det.state.ducking).toBe(true);
  });
});

/* Replays of A's recorded clips (src/pose/fixtures), calibrated from standing.json. */
describe('recorded clips', () => {
  const kinds = (name: string, upTo?: number) => types(replay(name, { upToMs: upTo }).events);

  test('standing still: no moves', () => {
    expect(kinds('standing', 5500)).toEqual([]);
  });

  test('sidestep: centre, right, centre, left, centre, right', () => {
    expect(kinds('sidestep')).toEqual(Array(5).fill('sidestep'));
  });

  test('jump: four jumps, no squats or arm moves from the landing and arm swing', () => {
    expect(kinds('jump', 7200)).toEqual(['jump', 'jump', 'jump', 'jump']);
  });

  test('squat: two squats (clip starts mid-squat), no jumps from standing up', () => {
    expect(kinds('squat')).toEqual(['squat', 'squat']);
  });

  // Second session, recorded from a different spot: calibrated from each clip's first 300 ms.
  test('armsUp: three overhead presses from shoulder height', () => {
    expect(types(replay('armsUp', { calibrate: 'self' }).events)).toEqual([
      'armsUp',
      'armsUp',
      'armsUp',
    ]);
  });

  test('reach: left, left, right (the second right rep runs past the clip end)', () => {
    expect(types(replay('reach', { calibrate: 'self' }).events)).toEqual([
      'reachLeft',
      'reachLeft',
      'reachRight',
    ]);
  });

  test('mixed play: jump (arm swing ignored), squat, two presses, sidestep, walks off', () => {
    const { events, tracking } = replay('mixed', { calibrate: 'self' });
    expect(types(events)).toEqual(['jump', 'squat', 'armsUp', 'armsUp', 'sidestep']);
    expect(tracking.map(([, on]) => on)).toEqual([false]);
  });

  test('leaveFrame: tracking lost once while out of frame, then regained', () => {
    const { tracking } = replay('leaveFrame');
    expect(tracking.map(([, on]) => on)).toEqual([false, true]);
    expect(tracking[0][0]).toBeGreaterThan(2000);
    expect(tracking[1][0]).toBeLessThan(5500);
  });
});
