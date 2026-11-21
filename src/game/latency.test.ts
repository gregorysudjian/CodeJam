import { describe, expect, it } from 'vitest';
import type { InputState, Spawn } from '@/contracts';
import { createJudge, type Verdict } from './judge';
import { VISUAL_LEAD_SEC } from './tuning';

const idle: InputState = {
  tracking: true,
  lane: 0,
  ducking: false,
  airborne: false,
  leftArmUp: false,
  rightArmUp: false,
};
const hurdle: Spawn = { kind: 'hurdle', lanes: [-1, 0, 1], requires: 'jump' };
const beam: Spawn = { kind: 'beam', lanes: [-1, 0, 1], requires: 'squat' };

/**
 * A player who moves the moment the object visually reaches the runner (t - lead), seen by
 * the game `lag` seconds later. Jumps count as airborne for 450 ms; squats are held 0.6 s.
 */
function reactAtArrival(spawn: Spawn, lead: number, lag: number, early = 0): Verdict {
  const t = 10;
  const seen = t - lead - early + lag;
  const hold = spawn.kind === 'hurdle' ? 0.45 : 0.6;
  const judge = createJudge(spawn, t, 'floor');
  for (let e = t - 1; e <= t + 1; e += 1 / 60) {
    const on = e >= seen && e < seen + hold;
    const v = judge.sample(e, {
      ...idle,
      airborne: spawn.kind === 'hurdle' && on,
      ducking: spawn.kind === 'beam' && on,
    });
    if (v) return v;
  }
  return judge.verdict;
}

describe('latency compensation (VISUAL_LEAD_SEC)', () => {
  it('a webcam player reacting on sight clears with typical lag (0.1 to 0.3 s)', () => {
    for (const lag of [0.1, 0.2, 0.25, 0.3]) {
      expect(reactAtArrival(hurdle, VISUAL_LEAD_SEC.pose, lag), `hurdle, lag ${lag}`).toBe(
        'cleared',
      );
      expect(reactAtArrival(beam, VISUAL_LEAD_SEC.pose, lag), `beam, lag ${lag}`).toBe('cleared');
    }
  });

  it('a player who anticipates and moves 0.15 s early still clears with a short lag', () => {
    expect(reactAtArrival(hurdle, VISUAL_LEAD_SEC.pose, 0.1, 0.15)).toBe('cleared');
    expect(reactAtArrival(beam, VISUAL_LEAD_SEC.pose, 0.1, 0.15)).toBe('cleared');
  });

  it('without the lead the same player is hit at 0.25 s of lag (why the lead exists)', () => {
    expect(reactAtArrival(hurdle, 0, 0.25)).toBe('hit');
  });

  it('the keyboard has no lag, so it needs no lead', () => {
    expect(VISUAL_LEAD_SEC.keyboard).toBe(0);
    expect(reactAtArrival(hurdle, VISUAL_LEAD_SEC.keyboard, 0)).toBe('cleared');
  });
});
