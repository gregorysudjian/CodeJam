import { describe, expect, it } from 'vitest';
import type { GameEvent, InputState, Level, Spawn, Wave } from '@/contracts';
import { createCore, feverTier, holdFeedback, movesSeen, type Item } from './core';
import type { Verdict } from './judge';
import { CUE_LEAD_SEC, MAX_DT_SEC } from './tuning';

const idle: InputState = {
  tracking: true,
  lane: 0,
  ducking: false,
  airborne: false,
  leftArmUp: false,
  rightArmUp: false,
};
const block: Spawn = { kind: 'block', lanes: [0, 1], requires: 'sidestep' };
const hurdle: Spawn = { kind: 'hurdle', lanes: [-1, 0, 1], requires: 'jump' };
const crate: Spawn = { kind: 'crate', lanes: [-1, 0, 1], requires: 'armsUp' };
const heldCrate: Spawn = { ...crate, holdSec: 1.5 };
const orb: Spawn = { kind: 'orb', lanes: [1], requires: 'reachRight' };
const orbLeft: Spawn = { kind: 'orb', lanes: [-1], requires: 'reachLeft' }; // in the block's free lane

const level = (waves: Wave[], durationSec = 20, mode: 'floor' | 'treadmill' = 'floor'): Level => ({
  config: { workout: 'fullBody', mode, durationSec, difficulty: 0.5, lowImpact: false, seed: 1 },
  waves,
});
const w = (t: number, ...spawns: Spawn[]): Wave => ({ t, intensity: 0.5, spawns });

/** Does the right move for every wave, like a perfect player. */
function perfect(lv: Level) {
  return (e: number): InputState => {
    const s = { ...idle };
    for (const wave of lv.waves)
      for (const sp of wave.spawns) {
        if (e < wave.t - 0.3 || e > wave.t + 0.1 + (sp.holdSec ?? 0)) continue;
        if (sp.kind === 'block') s.lane = -1;
        if (sp.kind === 'hurdle') s.airborne = true;
        if (sp.kind === 'beam') s.ducking = true;
        if (sp.kind === 'crate') s.leftArmUp = s.rightArmUp = true;
        if (sp.kind === 'orb') Object.assign(s, { lane: sp.lanes[0], rightArmUp: true });
      }
    return s;
  };
}

/** Runs the core at 60 fps until it finishes (or `maxSec` of steps). */
function run(
  lv: Level,
  stateAt: (elapsed: number, step: number) => InputState = () => idle,
  maxSec = 60,
) {
  const events: (GameEvent & { at: number })[] = [];
  const hooks = { engaged: [] as Item[], verdicts: [] as [Item, Verdict][], cues: [] as Wave[] };
  const core = createCore(lv, {
    cue: (wv) => hooks.cues.push(wv),
    engage: (item) => hooks.engaged.push(item),
    verdict: (item, v) => hooks.verdicts.push([item, v]),
  });
  core.onEvent((e) => events.push({ ...e, at: core.elapsed() }));
  core.start();
  let now = 1000;
  for (let i = 0; i < maxSec * 60 && !core.finished(); i++) {
    now += 1000 / 60;
    core.step(1 / 60, stateAt(core.elapsed(), i), now);
  }
  const count = (type: GameEvent['type']) => events.filter((e) => e.type === type).length;
  return { core, events, count, hooks };
}

describe('clock', () => {
  it('does nothing before start()', () => {
    const core = createCore(level([w(4, hurdle)]));
    const got: GameEvent[] = [];
    core.onEvent((e) => got.push(e));
    for (let i = 0; i < 600; i++) core.step(1 / 60, idle, i);
    core.pause();
    expect(core.elapsed()).toBe(0);
    expect(got).toEqual([]);
  });

  it('clamps a long stall to one step of MAX_DT_SEC', () => {
    const core = createCore(level([w(4, hurdle)]));
    core.start();
    core.step(5, idle, 0);
    expect(core.elapsed()).toBeCloseTo(MAX_DT_SEC);
  });

  it('finishes exactly once, at durationSec, after the events of the same frame', () => {
    const { events, count, core } = run(level([w(4, hurdle)], 10));
    expect(count('finished')).toBe(1);
    expect(events[events.length - 1]!.type).toBe('finished');
    expect(core.elapsed()).toBe(10);
    core.step(1, idle, 0);
    core.pause();
    expect(events[events.length - 1]!.type).toBe('finished');
  });
});

describe('cues', () => {
  it('one per wave, CUE_LEAD_SEC ahead, in order', () => {
    const lv = level([w(4, hurdle), w(6, block), w(8, orb, block)]);
    const { events } = run(lv);
    const cues = events.filter(
      (e): e is Extract<GameEvent, { type: 'cue' }> & { at: number } => e.type === 'cue',
    );
    expect(cues.map((c) => c.wave.t)).toEqual([4, 6, 8]);
    for (const c of cues) {
      expect(c.wave.t - c.at).toBeCloseTo(CUE_LEAD_SEC, 1);
      expect(c.inSec).toBeCloseTo(CUE_LEAD_SEC, 1);
    }
  });

  it('a wave closer than the lead at start is cued at once with the time left', () => {
    const { events } = run(level([w(1, hurdle)], 5));
    const cue = events.find((e) => e.type === 'cue') as Extract<GameEvent, { type: 'cue' }>;
    expect(cue.inSec).toBeCloseTo(1 - 1 / 60, 2);
  });
});

describe('judging through the core', () => {
  const mixed = level(
    [w(4, block), w(6, hurdle), w(8, crate), w(10, orb), w(12, heldCrate), w(16, block, orbLeft)],
    20,
  );

  it('perfect play: everything cleared or collected, no hits', () => {
    const { count } = run(mixed, perfect(mixed));
    expect(count('cleared')).toBe(5);
    expect(count('collected')).toBe(2);
    expect(count('hit')).toBe(0);
  });

  it('no moves: every non-orb is a hit, missed orbs are silent', () => {
    const { count, hooks } = run(mixed);
    expect(count('hit')).toBe(5);
    expect(count('collected')).toBe(0);
    expect(hooks.verdicts.filter(([, v]) => v === 'missed')).toHaveLength(2);
  });

  it('events carry the spawn and the frame time', () => {
    const { events } = run(level([w(4, hurdle)], 6));
    const hit = events.find((e) => e.type === 'hit') as Extract<GameEvent, { type: 'hit' }>;
    expect(hit.spawn).toBe(hurdle);
    expect(hit.t).toBeGreaterThan(1000 + 4000);
  });

  it('a crate engages (smashes) once, on first contact, before a held crate is decided', () => {
    const lv = level([w(4, heldCrate)], 8);
    const { hooks, events } = run(lv, perfect(lv));
    expect(hooks.engaged).toHaveLength(1);
    const clearedAt = events.find((e) => e.type === 'cleared')!.at;
    expect(clearedAt).toBeCloseTo(4 + 1.5, 1);
    expect(hooks.verdicts).toHaveLength(1);
  });

  it('treadmill orbs follow the arm, not the lane', () => {
    const left: Spawn = { kind: 'orb', lanes: [-1], requires: 'reachLeft' };
    const lv = level([w(4, left)], 6, 'treadmill');
    expect(run(lv, (e) => ({ ...idle, leftArmUp: e > 3.8 })).count('collected')).toBe(1);
    expect(run(lv, (e) => ({ ...idle, lane: -1, rightArmUp: e > 3.8 })).count('collected')).toBe(0);
  });
});

describe('pause and resume', () => {
  it('user pause stops time and judging; resume continues', () => {
    const core = createCore(level([w(4, hurdle)], 10));
    const got: string[] = [];
    core.onEvent((e) => got.push(e.type));
    core.start();
    for (let i = 0; i < 60; i++) core.step(1 / 60, idle, i);
    core.pause();
    core.pause(); // second pause is ignored
    const t = core.elapsed();
    for (let i = 0; i < 600; i++) core.step(1 / 60, idle, i);
    expect(core.elapsed()).toBe(t);
    core.resume();
    core.resume(); // ignored, not paused
    core.step(1 / 60, idle, 0);
    expect(core.elapsed()).toBeGreaterThan(t);
    expect(got).toEqual(['paused', 'resumed']);
  });

  it('losing tracking pauses and finding it again resumes', () => {
    const { events, core } = run(level([w(4, hurdle)], 8), (_e, i) => ({
      ...idle,
      tracking: !(i >= 60 && i < 120),
    }));
    const types = events.map((e) => e.type).filter((x) => x === 'paused' || x === 'resumed');
    expect(types).toEqual(['paused', 'resumed']);
    expect(events.find((e) => e.type === 'paused')).toMatchObject({ reason: 'trackingLost' });
    expect(core.elapsed()).toBe(8);
  });

  it('a user pause is not resumed when tracking returns', () => {
    const core = createCore(level([w(4, hurdle)], 8));
    const got: GameEvent[] = [];
    core.onEvent((e) => got.push(e));
    core.start();
    core.step(1 / 60, idle, 0);
    core.pause();
    for (let i = 0; i < 60; i++) core.step(1 / 60, { ...idle, tracking: i % 2 === 0 }, i);
    expect(core.pauseReason()).toBe('user');
    expect(got.map((e) => e.type)).toEqual(['paused']);
  });

  it('resuming by hand while tracking is still lost pauses again on the next frame', () => {
    const core = createCore(level([w(4, hurdle)], 8));
    const got: string[] = [];
    core.onEvent((e) => got.push(e.type === 'paused' ? `paused:${e.reason}` : e.type));
    core.start();
    core.step(1 / 60, { ...idle, tracking: false }, 0);
    core.resume();
    core.step(1 / 60, { ...idle, tracking: false }, 1);
    expect(got).toEqual(['paused:trackingLost', 'resumed', 'paused:trackingLost']);
  });
});

describe('listeners', () => {
  it('a throwing listener does not stop the others, and unsubscribe works', () => {
    const core = createCore(level([w(4, hurdle)], 6));
    const a: string[] = [];
    const b: string[] = [];
    core.onEvent(() => {
      throw new Error('boom');
    });
    const offA = core.onEvent((e) => a.push(e.type));
    core.onEvent((e) => b.push(e.type));
    const original = console.error;
    console.error = () => {};
    try {
      core.start();
      core.step(1 / 60, { ...idle, tracking: false }, 0);
      offA();
      core.step(1 / 60, idle, 1);
    } finally {
      console.error = original;
    }
    expect(a).toEqual(['paused']);
    expect(b).toEqual(['paused', 'resumed']);
  });
});

describe('cues with latency leads', () => {
  it('count down to the visual arrival, t - lead, so the HUD ring hits zero on arrival', () => {
    const leads = {
      jump: 0.1,
      sidestep: 0.25,
      squat: 0.3,
      armsUp: 0.3,
      reachLeft: 0.3,
      reachRight: 0.3,
    };
    const lv = level([w(4, hurdle), w(6, crate)], 8);
    const core = createCore(lv, {}, leads);
    const cues: { at: number; inSec: number }[] = [];
    core.onEvent((e) => {
      if (e.type === 'cue') cues.push({ at: core.elapsed(), inSec: e.inSec });
    });
    core.start();
    for (let i = 0; i < 8 * 60; i++) core.step(1 / 60, idle, i);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.at + cues[0]!.inSec).toBeCloseTo(4 - leads.jump, 2);
    expect(cues[1]!.at + cues[1]!.inSec).toBeCloseTo(6 - leads.armsUp, 2);
    expect(cues[1]!.inSec).toBeCloseTo(CUE_LEAD_SEC, 1);
  });

  it('without leads (keyboard) they count down to the judging time, as before', () => {
    const { events } = run(level([w(4, hurdle)], 6));
    const cue = events.find((e) => e.type === 'cue') as Extract<GameEvent, { type: 'cue' }> & {
      at: number;
    };
    expect(cue.at + cue.inSec).toBeCloseTo(4, 2);
  });
});

describe('streak and fever', () => {
  it('counts clears and orbs in a row, resets on a hit, ignores missed orbs', () => {
    const lv = level([w(4, hurdle), w(6, orb), w(8, hurdle), w(10, orb), w(12, hurdle)], 14);
    // jump only for the first and last hurdle, collect the first orb only
    const { core } = run(lv, (e) => ({
      ...idle,
      airborne: (e > 3.8 && e < 4.1) || (e > 11.8 && e < 12.1),
      lane: e > 5 && e < 7 ? 1 : 0,
      rightArmUp: e > 5.8 && e < 6.1,
    }));
    expect(core.streak()).toBe(1); // hurdle, orb (2) → hit at 8 (0) → missed orb (0) → hurdle (1)
  });

  it('fever tiers match the score multiplier steps', () => {
    expect([0, 4, 5, 9, 10, 19, 20, 99].map(feverTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('sorts waves that arrive out of order', () => {
    const { events } = run(level([w(8, hurdle), w(4, block)], 10));
    const cues = events.filter((e) => e.type === 'cue') as Extract<GameEvent, { type: 'cue' }>[];
    expect(cues.map((c) => c.wave.t)).toEqual([4, 8]);
  });
});

describe('movesSeen', () => {
  it('reports only moves that start, one sound per rep', () => {
    expect(movesSeen(idle, idle)).toEqual([]);
    expect(movesSeen(idle, { ...idle, lane: 1, airborne: true })).toEqual(['step', 'hop']);
    const ducked = { ...idle, ducking: true, leftArmUp: true };
    expect(movesSeen(idle, ducked)).toEqual(['duck', 'raise']);
    expect(movesSeen(ducked, ducked)).toEqual([]); // held, not repeated
    expect(movesSeen(ducked, { ...ducked, rightArmUp: true })).toEqual(['raise']);
  });
});

describe('holdFeedback', () => {
  it('prompts until the move is seen, then ok while held, warn only after letting go', () => {
    // a 2 s hold due at t = 10
    expect(holdFeedback(10, 2, 9.5, false, false)).toBeNull(); // too early
    expect(holdFeedback(10, 2, 9.8, false, false)).toBe('prompt');
    expect(holdFeedback(10, 2, 10.2, false, false)).toBe('prompt'); // lagging camera: not red
    expect(holdFeedback(10, 2, 10.3, true, false)).toBe('ok');
    expect(holdFeedback(10, 2, 11, true, true)).toBe('ok');
    expect(holdFeedback(10, 2, 11.2, false, true)).toBe('warn'); // let go mid-hold
    expect(holdFeedback(10, 2, 12.1, false, true)).toBeNull(); // over
  });
});
