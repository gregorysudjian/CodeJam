import { describe, expect, it } from 'vitest';
import type { GameEvent, InputState, Level, Spawn, Wave } from '@/contracts';
import { createCore, feverTier, holdFeedback, movesSeen, type Item } from './core';
import type { Verdict } from './judge';
import {
  CUE_LEAD_SEC,
  LIFE_GRACE_SEC,
  LIVES,
  MAX_DT_SEC,
  OUT_OF_LIVES_SEC,
  RESUME_COUNTDOWN_SEC,
  RESUME_MAX_DT_SEC,
} from './tuning';

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

  it('no moves: hits until the lives run out, then the round ends', () => {
    const { count, events } = run(mixed);
    expect(count('hit')).toBe(LIVES); // block, hurdle, crate: each a life
    expect(count('collected')).toBe(0);
    expect(events.at(-1)).toMatchObject({ type: 'finished', reason: 'outOfLives' });
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
    core.resume(); // ignored: the countdown already runs
    for (let i = 0; i < RESUME_COUNTDOWN_SEC * 60 + 2; i++) core.step(1 / 60, idle, i);
    expect(core.elapsed()).toBeGreaterThan(t);
    expect(got).toEqual(['paused', 'resuming', 'resumed']);
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
    expect(got).toEqual(['paused:trackingLost', 'resuming', 'paused:trackingLost']);
  });
});

describe('lives', () => {
  const lifeEvents = (events: GameEvent[]) =>
    events.flatMap((e) => (e.type === 'lifeLost' ? [e.livesLeft] : []));

  it('each hit on a block, hurdle, beam or crate costs a life, after its hit event', () => {
    const lv = level([w(4, block), w(7, hurdle)], 12);
    const { events, core } = run(lv);
    expect(lifeEvents(events)).toEqual([LIVES - 1, LIVES - 2]);
    const i = events.findIndex((e) => e.type === 'lifeLost');
    expect(events[i - 1]!.type).toBe('hit');
    expect(core.lives()).toBe(LIVES - 2);
    expect(events.at(-1)).toMatchObject({ type: 'finished', reason: 'complete' });
  });

  it('a missed orb costs nothing', () => {
    const { events, core } = run(level([w(4, orb), w(6, orbLeft)], 10));
    expect(lifeEvents(events)).toEqual([]);
    expect(core.lives()).toBe(LIVES);
  });

  it('no second life goes within LIFE_GRACE_SEC: two hits close together are one mistake', () => {
    // A block, then a hurdle 1.2 s later: two hits, one life. One later still costs one.
    const lv = level([w(4, block), w(5.2, hurdle), w(4 + LIFE_GRACE_SEC + 1, hurdle)], 12);
    const { events, count, core } = run(lv);
    expect(count('hit')).toBe(3);
    expect(lifeEvents(events)).toEqual([LIVES - 1, LIVES - 2]);
    expect(core.graceLeft()).toBe(0);
  });

  it('the last life: judging and time stop, OUT_OF_LIVES_SEC later finished(outOfLives)', () => {
    const lv = level([w(4, block), w(7, hurdle), w(10, crate), w(13, block), w(15, hurdle)], 20);
    const { events, core } = run(lv);
    expect(lifeEvents(events)).toEqual([2, 1, 0]);
    expect(events.filter((e) => e.type === 'hit')).toHaveLength(3); // the block at 13 never came
    const lastLife = events.find((e) => e.type === 'lifeLost' && e.livesLeft === 0)!;
    const done = events.at(-1)!;
    expect(done).toMatchObject({ type: 'finished', reason: 'outOfLives' });
    expect(done.at).toBe(lastLife.at); // game time stopped where the last life went
    expect(core.elapsed()).toBeLessThan(11);
    expect(core.outOfLives()).toBe(true);
  });

  it('during the ending a pause does nothing and the finish still comes', () => {
    const lv = level([w(4, block), w(7, hurdle), w(10, crate)], 20);
    const core = createCore(lv);
    const got: string[] = [];
    core.onEvent((e) => got.push(e.type));
    core.start();
    let i = 0;
    while (!core.outOfLives() && i < 60 * 20) core.step(1 / 60, idle, i++);
    core.pause();
    for (let k = 0; k < (OUT_OF_LIVES_SEC + 0.1) * 60; k++)
      core.step(1 / 60, { ...idle, tracking: false }, i++);
    expect(got.filter((t) => t === 'paused')).toEqual([]);
    expect(got.at(-1)).toBe('finished');
  });

  it('a perfect round keeps every life and finishes complete', () => {
    const lv = level([w(4, block), w(6, hurdle), w(8, crate)], 12);
    const { events, core } = run(lv, perfect(lv));
    expect(core.lives()).toBe(LIVES);
    expect(events.at(-1)).toMatchObject({ type: 'finished', reason: 'complete' });
  });
});

describe('the 3-2-1 before every resume', () => {
  const DT = 1 / 60;
  function setUp() {
    const core = createCore(level([w(4, hurdle)], 20));
    const got: string[] = [];
    core.onEvent((e) =>
      got.push(
        e.type === 'paused'
          ? `paused:${e.reason}`
          : e.type === 'resuming'
            ? `resuming:${e.inSec}`
            : e.type,
      ),
    );
    core.start();
    const step = (sec: number, state: InputState = idle): void => {
      for (let k = 0; k < Math.round(sec / DT); k++) core.step(DT, state, k);
    };
    step(1);
    return { core, got, step };
  }

  it('a user resume counts down RESUME_COUNTDOWN_SEC with game time frozen, then resumes', () => {
    const { core, got, step } = setUp();
    core.pause();
    const t = core.elapsed();
    core.resume();
    expect(core.resumingIn()).toBe(RESUME_COUNTDOWN_SEC);
    step(RESUME_COUNTDOWN_SEC - 0.1);
    expect(core.elapsed()).toBe(t);
    expect(core.pauseReason()).toBe('user'); // still held: the app and views see a pause
    expect(core.resumingIn()).toBeCloseTo(0.1, 1);
    expect(got).toEqual(['paused:user', `resuming:${RESUME_COUNTDOWN_SEC}`]);
    step(0.2);
    expect(got).toEqual(['paused:user', `resuming:${RESUME_COUNTDOWN_SEC}`, 'resumed']);
    expect(core.pauseReason()).toBeNull();
    expect(core.resumingIn()).toBeNull();
    step(1);
    expect(core.elapsed()).toBeGreaterThan(t + 0.9);
  });

  it('tracking back counts down too; lost again during it pauses again, never resumed', () => {
    const { core, got, step } = setUp();
    step(0.5, { ...idle, tracking: false });
    step(1); // back: the countdown starts
    expect(core.resumingIn()).not.toBeNull();
    step(0.5, { ...idle, tracking: false }); // gone again before it ends
    expect(core.resumingIn()).toBeNull();
    expect(core.pauseReason()).toBe('trackingLost');
    expect(got).toEqual([
      'paused:trackingLost',
      `resuming:${RESUME_COUNTDOWN_SEC}`,
      'paused:trackingLost',
    ]);
    step(RESUME_COUNTDOWN_SEC + 0.1); // back for good: a fresh full countdown
    expect(got.slice(3)).toEqual([`resuming:${RESUME_COUNTDOWN_SEC}`, 'resumed']);
  });

  it('a user pause during the countdown stops it, and only a new resume counts again', () => {
    const { core, got, step } = setUp();
    core.pause();
    core.resume();
    step(1);
    core.pause();
    expect(core.resumingIn()).toBeNull();
    expect(core.pauseReason()).toBe('user');
    step(RESUME_COUNTDOWN_SEC * 2);
    expect(got).toEqual(['paused:user', `resuming:${RESUME_COUNTDOWN_SEC}`, 'paused:user']);
    core.resume();
    step(RESUME_COUNTDOWN_SEC + 0.1);
    expect(got.at(-1)).toBe('resumed');
  });

  it('someone else in the play area pauses with reason otherPerson; gone again, it counts down', () => {
    const { core, got, step } = setUp();
    const other: InputState = { ...idle, tracking: false, otherPerson: true };
    step(1, other);
    expect(core.pauseReason()).toBe('otherPerson');
    step(0.5, { ...idle, tracking: false }); // they left, the player not back yet
    expect(core.pauseReason()).toBe('trackingLost');
    step(RESUME_COUNTDOWN_SEC + 0.1);
    expect(got).toEqual([
      'paused:otherPerson',
      'paused:trackingLost',
      `resuming:${RESUME_COUNTDOWN_SEC}`,
      'resumed',
    ]);
  });

  it('the other person stepping in during the countdown stops it', () => {
    const { got, step } = setUp();
    step(0.5, { ...idle, tracking: false });
    step(1);
    step(0.5, { ...idle, tracking: false, otherPerson: true });
    expect(got.at(-1)).toBe('paused:otherPerson');
    expect(got).not.toContain('resumed');
  });

  it('a user pause keeps its reason while tracking comes and goes, and needs a resume', () => {
    const { core, got, step } = setUp();
    core.pause();
    step(0.5, { ...idle, tracking: false });
    step(RESUME_COUNTDOWN_SEC + 1);
    expect(core.pauseReason()).toBe('user');
    expect(got).toEqual(['paused:user']);
  });

  it('a stalled frame during the countdown counts as RESUME_MAX_DT_SEC, not its length', () => {
    const { core, step } = setUp();
    core.pause();
    core.resume();
    core.step(10, idle, 0); // a hidden tab
    expect(core.resumingIn()).toBeCloseTo(RESUME_COUNTDOWN_SEC - RESUME_MAX_DT_SEC);
    step(RESUME_COUNTDOWN_SEC);
    expect(core.resumingIn()).toBeNull();
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
    expect(b).toEqual(['paused', 'resuming']); // tracking back: the 3-2-1 starts
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
    const core = createCore(lv, {}, () => leads);
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

  it('follow an input switch mid-round (K): the lead is read when each cue fires', () => {
    const pose = {
      jump: 0.1,
      sidestep: 0.25,
      squat: 0.3,
      armsUp: 0.3,
      reachLeft: 0.3,
      reachRight: 0.3,
    };
    const none = { jump: 0, sidestep: 0, squat: 0, armsUp: 0, reachLeft: 0, reachRight: 0 };
    let current = none; // starts on the keyboard
    const core = createCore(level([w(4, crate), w(9, crate)], 12), {}, () => current);
    const ends: number[] = [];
    core.onEvent((e) => {
      if (e.type === 'cue') ends.push(core.elapsed() + e.inSec);
    });
    core.start();
    for (let i = 0; i < 12 * 60; i++) {
      if (i === 5 * 60) current = pose; // switched to the camera at 5 s
      core.step(1 / 60, idle, i);
    }
    expect(ends[0]).toBeCloseTo(4, 2); // keyboard: judging time
    expect(ends[1]).toBeCloseTo(9 - pose.armsUp, 2); // camera: visual arrival
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

describe('holds across pauses, input switches, tracking loss and the end of the round', () => {
  const beam: Spawn = { kind: 'beam', lanes: [-1, 0, 1], requires: 'squat', holdSec: 1.6 };
  const down: InputState = { ...idle, ducking: true };
  const arms: InputState = { ...idle, leftArmUp: true, rightArmUp: true };
  const DT = 1 / 60;
  /** Steps the core frame by frame; `step(sec, state)` plays `sec` of frames with one state. */
  function drive(lv: Level) {
    const verdicts: Verdict[] = [];
    const events: string[] = [];
    const core = createCore(lv, { verdict: (_i, v) => verdicts.push(v) });
    core.onEvent((e) => events.push(e.type === 'paused' ? `paused:${e.reason}` : e.type));
    core.start();
    let now = 0;
    const step = (sec: number, state: InputState): void => {
      for (let k = 0; k < Math.round(sec / DT); k++) core.step(DT, state, (now += DT * 1000));
    };
    return { core, verdicts, events, step };
  }

  it('a pause mid-hold freezes it: squat again on resume and the beam clears', () => {
    const d = drive(level([w(5, beam)], 10));
    d.step(4.8, idle);
    d.step(0.8, down); // down from 4.8 to 5.6
    d.core.pause();
    const frozen = d.core.elapsed();
    d.step(3, idle); // standing during the pause changes nothing
    expect(d.core.elapsed()).toBe(frozen);
    d.core.resume();
    d.step(RESUME_COUNTDOWN_SEC, idle); // the 3-2-1: still frozen
    expect(d.core.elapsed()).toBe(frozen);
    d.step(2, down);
    expect(d.verdicts).toEqual(['cleared']);
  });

  it('standing up during the pause and staying up after resume is a hit (after the grace)', () => {
    const d = drive(level([w(5, beam)], 10));
    d.step(4.8, idle);
    d.step(0.8, down);
    d.core.pause();
    d.core.resume();
    d.step(RESUME_COUNTDOWN_SEC, idle);
    d.step(0.2, idle);
    expect(d.verdicts).toEqual([]); // still inside the 0.3 s grace
    d.step(0.3, idle);
    expect(d.verdicts).toEqual(['hit']);
  });

  it('tracking lost mid-hold pauses the round; the hold goes on when tracking returns', () => {
    const d = drive(level([w(5, beam)], 10));
    d.step(4.8, idle);
    d.step(0.8, down);
    const at = d.core.elapsed();
    d.step(2, { ...idle, tracking: false });
    expect(d.core.elapsed()).toBe(at);
    expect(d.core.pauseReason()).toBe('trackingLost');
    d.step(RESUME_COUNTDOWN_SEC, down); // tracking back: the 3-2-1, still frozen
    expect(d.core.elapsed()).toBe(at);
    d.step(2, down);
    expect(d.verdicts).toEqual(['cleared']);
    expect(d.events.filter((e) => e !== 'cue')).toEqual([
      'paused:trackingLost',
      'resuming',
      'resumed',
      'cleared',
    ]);
  });

  it('K mid-hold: the new input must show the move within the 0.3 s grace', () => {
    // From the camera (down) to the keyboard: Down must be pressed within 0.3 s of game time.
    const quick = drive(level([w(5, beam)], 10));
    quick.step(4.8, idle);
    quick.step(0.8, down);
    quick.step(0.2, idle); // the keyboard, before Down is pressed
    quick.step(2, down);
    expect(quick.verdicts).toEqual(['cleared']);
    const slow = drive(level([w(5, beam)], 10));
    slow.step(4.8, idle);
    slow.step(0.8, down);
    slow.step(0.4, idle);
    slow.step(2, down);
    expect(slow.verdicts).toEqual(['hit']);
  });

  it('a pause while a held crate needs both arms up (the X gesture cannot fire then) is safe', () => {
    const d = drive(level([w(5, heldCrate)], 10));
    d.step(4.8, idle);
    d.step(0.7, arms);
    d.core.pause(); // e.g. Esc or a hidden tab
    d.step(1, idle); // arms down during the pause: not judged
    d.core.resume();
    d.step(RESUME_COUNTDOWN_SEC, idle); // the 3-2-1, arms down
    d.step(0.1, idle); // then arms back up within the grace
    d.step(2, arms);
    expect(d.verdicts).toEqual(['cleared']);
  });

  it('End round from the pause screen: a paused core never finishes, so nothing is saved', () => {
    // END ROUND unmounts the play screen and destroys the game; summary and ghost are only
    // stored on 'finished', which a paused core never emits however long it is stepped.
    const d = drive(level([w(5, beam)], 10));
    d.step(5.2, down);
    d.core.pause();
    d.step(30, down);
    expect(d.events).not.toContain('finished');
    expect(d.core.finished()).toBe(false);
  });

  it('the round ending during a hold: no verdict for that object, one finished, no crash', () => {
    // The generator never does this (every object ends 1 s before the round); a hand-made
    // level that does leaves the object undecided: neither a hit nor a clear.
    const d = drive(level([w(9, beam)], 10));
    d.step(8.8, idle);
    d.step(3, down);
    expect(d.verdicts).toEqual([]);
    expect(d.events.filter((e) => e === 'finished')).toHaveLength(1);
  });
});
