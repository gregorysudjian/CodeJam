import { describe, expect, it } from 'vitest';
import type { InputState, MoveType, Spawn } from '@/contracts';
import { createJudge, type Verdict } from './judge';
import { VISUAL_LEAD_SEC } from './tuning';

/*
 * Webcam lag per move, measured on A's recorded clips (src/pose/fixtures on abdo-1): from the
 * first raw-landmark movement to the detector's state change, worst rep. Camera capture and
 * the model add about CAMERA_SEC on top; that part is not in the clips' timestamps.
 */
const DETECTOR_LAG_SEC: Record<MoveType, number> = {
  jump: 0.078,
  squat: 0.286,
  armsUp: 0.306,
  reachLeft: 0.306,
  reachRight: 0.306,
  sidestep: 0.271,
};
const CAMERA_SEC = 0.1;
const clipLagOf = (move: MoveType): number => DETECTOR_LAG_SEC[move] + CAMERA_SEC;

/*
 * The whole lag, camera included, measured in a camera session with ?debug=timing. After the
 * second round the console prints this line next to the VISUAL_LEAD_SEC.pose line: paste both.
 * Moves the session did not measure keep the clip lags above.
 */
const SESSION_LAG_SEC: Partial<Record<MoveType, number>> = {};
const lagOf = (move: MoveType): number => SESSION_LAG_SEC[move] ?? clipLagOf(move);

const idle: InputState = {
  tracking: true,
  lane: 0,
  ducking: false,
  airborne: false,
  leftArmUp: false,
  rightArmUp: false,
};
const OBJECTS: Spawn[] = [
  { kind: 'hurdle', lanes: [-1, 0, 1], requires: 'jump' },
  { kind: 'beam', lanes: [-1, 0, 1], requires: 'squat' },
  { kind: 'crate', lanes: [-1, 0, 1], requires: 'armsUp' },
  { kind: 'block', lanes: [0, 1], requires: 'sidestep' }, // free lane: -1
  { kind: 'orb', lanes: [1], requires: 'reachRight' }, // the player is already in lane 1
];

/** The state the game sees from `seen` on, for a player making the move that clears `spawn`. */
function moving(spawn: Spawn, on: boolean): InputState {
  switch (spawn.kind) {
    case 'hurdle':
      return { ...idle, airborne: on };
    case 'beam':
      return { ...idle, ducking: on };
    case 'crate':
      return { ...idle, leftArmUp: on, rightArmUp: on };
    case 'block':
      return { ...idle, lane: on ? -1 : 0 };
    case 'orb':
      return { ...idle, lane: 1, rightArmUp: on };
  }
}

/**
 * The player moves `early` seconds before the object visually reaches the runner (t - lead),
 * and the game sees it `lag` seconds later. Jumps stay airborne 450 ms; held moves 0.6 s;
 * a lane change stays.
 */
function play(spawn: Spawn, lead: number, lag: number, early = 0): Verdict {
  const t = 10;
  const seen = t - lead - early + lag;
  const lasts = spawn.kind === 'hurdle' ? 0.45 : spawn.kind === 'block' ? Infinity : 0.6;
  const judge = createJudge(spawn, t, 'floor');
  for (let e = t - 1.5; e <= t + 1; e += 1 / 60) {
    const v = judge.sample(e, moving(spawn, e >= seen && e < seen + lasts));
    if (v) return v;
  }
  return judge.verdict;
}

describe('latency compensation (VISUAL_LEAD_SEC)', () => {
  const pose = VISUAL_LEAD_SEC.pose;

  it('a webcam player who moves when the object reaches the runner clears every kind', () => {
    for (const s of OBJECTS) {
      const expected = s.kind === 'orb' ? 'collected' : 'cleared';
      expect(play(s, pose[s.requires], lagOf(s.requires)), s.kind).toBe(expected);
    }
  });

  it('without the leads, slow moves would be hits (why they exist, on the clip lags)', () => {
    for (const s of OBJECTS.filter((o) => o.kind !== 'hurdle' && o.kind !== 'orb')) {
      expect(play(s, 0, clipLagOf(s.requires)), s.kind).toBe('hit');
    }
  });

  it('a player who anticipates by 0.2 s with a short lag still clears', () => {
    for (const s of OBJECTS) {
      const expected = s.kind === 'orb' ? 'collected' : 'cleared';
      expect(play(s, pose[s.requires], DETECTOR_LAG_SEC.jump, 0.2), s.kind).toBe(expected);
    }
  });

  it('the keyboard has no lag, so it needs no lead', () => {
    for (const move of Object.keys(VISUAL_LEAD_SEC.keyboard) as MoveType[]) {
      expect(VISUAL_LEAD_SEC.keyboard[move]).toBe(0);
    }
    for (const s of OBJECTS) {
      expect(play(s, 0, 0)).not.toBe('hit');
    }
  });

  it('leads differ by less than the 1.1 s minimum wave gap, so objects never swap order', () => {
    const leads = Object.values(pose);
    expect(Math.max(...leads) - Math.min(...leads)).toBeLessThan(1.1);
  });
});
