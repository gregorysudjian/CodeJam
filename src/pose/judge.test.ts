// How a first-time judge plays (A's camera session, Sat evening; DECISIONS 44, 47). Each clip in
// fixtures/near/ has its expected outcome written here before it was recorded, so it referees the
// change it tests. A clip not recorded yet is skipped. Calibrated on the clip's own first 300 ms
// (A stands still for the first second of every clip).
import { describe, expect, test } from 'vitest';
import { replay } from './fixtures';

const recorded = new Set(
  Object.keys(import.meta.glob('./fixtures/near/*.json', { eager: true, import: 'default' })).map(
    (path) => path.replace('./fixtures/near/', '').replace('.json', ''),
  ),
);

interface Expect {
  /** Exact moves, in order (omit when the clip has no fixed list). */
  moves?: string[];
  /** Moves that must never appear. */
  never?: string[];
  pauses: number;
  /** Tracking must never be lost. */
  keepsTracking: boolean;
}

const JUDGE: Record<string, Expect> = {
  // Steps 30–50 cm forward, 2 s, back; twice. The drift fix (DECISIONS 44) must hold on a real body.
  drift: { moves: [], pauses: 0, keepsTracking: true },
  // Weight shifts, sway and small hand moves while standing.
  fidget: { moves: [], pauses: 0, keepsTracking: true },
  // Someone walks behind the player, near and far (DECISIONS 47).
  passerby: { moves: [], pauses: 0, keepsTracking: true },
  // Sidesteps left, back, right, back, turning 20–30° toward each step.
  turnStep: { moves: Array(4).fill('sidestep'), pauses: 0, keepsTracking: true },
  // Three squats with the arms straight out in front: squats, not presses or a pause.
  squatArmsOut: {
    moves: ['squat', 'squat', 'squat'],
    never: ['armsUp', 'reachLeft', 'reachRight'],
    pauses: 0,
    keepsTracking: true,
  },
  // X near-misses: never a pause.
  xLow: { pauses: 0, keepsTracking: true },
  xTouch: { pauses: 0, keepsTracking: true },
  xOverhead: { pauses: 0, keepsTracking: true },
  // The X with the arms out in front, held twice.
  'pauseX-armsOut': { moves: [], pauses: 2, keepsTracking: true },
};

describe('judge-behaviour clips (real, ~1.5 m)', () => {
  const present = Object.keys(JUDGE).filter((name) => recorded.has(name));
  if (present.length === 0) {
    test('none recorded yet', () => expect(present).toEqual([]));
    return;
  }
  test.each(present)('%s', (name) => {
    const want = JUDGE[name];
    const r = replay(`near/${name}`, { calibrate: 'self' });
    const got = r.events.map((e) => e.type);
    if (want.moves) expect(got).toEqual(want.moves);
    for (const bad of want.never ?? []) expect(got).not.toContain(bad);
    expect(r.gestures).toHaveLength(want.pauses);
    if (want.keepsTracking) expect(r.tracking).toEqual([]);
  });
});
