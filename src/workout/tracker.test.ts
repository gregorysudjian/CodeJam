import { describe, expect, it } from 'vitest';
import type { GameEvent, MoveType, SessionConfig, Spawn } from '@/contracts';
import { createSessionTracker, kcalFor, multiplierFor } from './tracker';

const config: SessionConfig = {
  workout: 'fullBody',
  mode: 'floor',
  durationSec: 45,
  difficulty: 0.5,
  lowImpact: false,
  seed: 1,
};
const hurdle: Spawn = { kind: 'hurdle', lanes: [-1, 0, 1], requires: 'jump' };
const beam: Spawn = { kind: 'beam', lanes: [-1, 0, 1], requires: 'squat' };
const orb: Spawn = { kind: 'orb', lanes: [1], requires: 'reachRight' };
const cleared = (spawn: Spawn = hurdle): GameEvent => ({ type: 'cleared', spawn, t: 0 });
const hit = (spawn: Spawn = hurdle): GameEvent => ({ type: 'hit', spawn, t: 0 });
const collected: GameEvent = { type: 'collected', spawn: orb, t: 0 };

function setup(opts?: { weightKg?: number }) {
  let ms = 0;
  const tracker = createSessionTracker(config, { ...opts, now: () => ms });
  return { tracker, advance: (sec: number) => (ms += sec * 1000) };
}

describe('multiplier (CONTRACTS.md "Scoring")', () => {
  it('is 1 at streak 0 to 4, 2 at 5 to 9, 3 at 10 to 19, 4 from 20', () => {
    const expected = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4];
    expect(expected.map((_, s) => multiplierFor(s))).toEqual(expected);
    expect(multiplierFor(500)).toBe(4);
  });
});

describe('scoring', () => {
  it('a clear scores 100 × the multiplier of the streak before it', () => {
    const { tracker } = setup();
    for (let i = 0; i < 6; i++) tracker.handleGameEvent(cleared());
    // five clears at x1, the sixth at x2 (streak was 5)
    expect(tracker.getLive()).toMatchObject({ score: 5 * 100 + 200, streak: 6, multiplier: 2 });
  });

  it('an orb scores 50 × multiplier and extends the streak', () => {
    const { tracker } = setup();
    for (let i = 0; i < 5; i++) tracker.handleGameEvent(cleared());
    tracker.handleGameEvent(collected);
    expect(tracker.getLive()).toMatchObject({ score: 500 + 100, streak: 6 });
  });

  it('a hit resets the streak and the multiplier, and keeps the score', () => {
    const { tracker } = setup();
    for (let i = 0; i < 12; i++) tracker.handleGameEvent(cleared());
    const before = tracker.getLive().score;
    tracker.handleGameEvent(hit());
    expect(tracker.getLive()).toMatchObject({ score: before, streak: 0, multiplier: 1 });
    tracker.handleGameEvent(cleared());
    expect(tracker.getLive().score).toBe(before + 100);
  });

  it('cue, pause, resume and finish change no score', () => {
    const { tracker } = setup();
    tracker.handleGameEvent({
      type: 'cue',
      wave: { t: 4, intensity: 0, spawns: [hurdle] },
      inSec: 2,
    });
    tracker.handleGameEvent({ type: 'paused', reason: 'user' });
    tracker.handleGameEvent({ type: 'resumed' });
    tracker.handleGameEvent({ type: 'finished' });
    expect(tracker.getLive()).toMatchObject({ score: 0, streak: 0, multiplier: 1 });
  });
});

describe('summary', () => {
  it('counts clears, hits, best streak, accuracy and misses by required move', () => {
    const { tracker } = setup();
    for (let i = 0; i < 7; i++) tracker.handleGameEvent(cleared());
    tracker.handleGameEvent(hit(beam));
    tracker.handleGameEvent(hit(beam));
    tracker.handleGameEvent(hit());
    tracker.handleGameEvent(cleared());
    tracker.handleGameEvent(collected); // orbs score but are not part of accuracy
    const s = tracker.finish(45);
    expect(s).toMatchObject({
      cleared: 8,
      hit: 3,
      bestStreak: 7,
      streak: 2,
      activeSec: 45,
      config,
    });
    expect(s.accuracy).toBeCloseTo(8 / 11);
    expect(s.missed).toEqual({
      sidestep: 0,
      jump: 1,
      squat: 2,
      armsUp: 0,
      reachLeft: 0,
      reachRight: 0,
    });
  });

  it('accuracy is 0, not NaN, with nothing judged', () => {
    expect(setup().tracker.finish(10).accuracy).toBe(0);
  });

  it('reps come from move events, one per rep', () => {
    const { tracker } = setup();
    const moves: MoveType[] = ['jump', 'jump', 'squat', 'reachLeft', 'armsUp'];
    for (const type of moves) tracker.handleMove({ type, t: 0 });
    expect(tracker.finish(10).reps).toEqual({
      sidestep: 0,
      jump: 2,
      squat: 1,
      armsUp: 1,
      reachLeft: 1,
      reachRight: 0,
    });
  });

  it('returns copies, so later events do not change a finished summary', () => {
    const { tracker } = setup();
    tracker.handleMove({ type: 'jump', t: 0 });
    const s = tracker.finish(10);
    tracker.handleMove({ type: 'jump', t: 0 });
    tracker.handleGameEvent(hit());
    expect(s.reps.jump).toBe(1);
    expect(s.missed.jump).toBe(0);
  });
});

describe('calories (an estimate)', () => {
  it('kcal = MET × 3.5 × kg / 200 × minutes', () => {
    expect(kcalFor(config, 70, 60)).toBeCloseTo((8 * 3.5 * 70) / 200);
    expect(kcalFor({ ...config, workout: 'arms' }, 70, 60)).toBeCloseTo((6 * 3.5 * 70) / 200);
    expect(kcalFor({ ...config, workout: 'arms', mode: 'treadmill' }, 80, 120)).toBeCloseTo(
      ((9 * 3.5 * 80) / 200) * 2,
    );
  });

  it('uses 70 kg when the weight is missing, and the given weight otherwise', () => {
    expect(setup().tracker.finish(60).kcal).toBeCloseTo(kcalFor(config, 70, 60));
    expect(setup({ weightKg: 90 }).tracker.finish(60).kcal).toBeCloseTo(kcalFor(config, 90, 60));
  });

  it('levelReached is the highest level entered, 1 when no stage event came', () => {
    const stage = (index: number) => ({ index, startSec: (index - 1) * 30, endSec: index * 30 });
    const t = setup().tracker;
    for (const i of [1, 2, 3]) t.handleGameEvent({ type: 'stage', stage: stage(i) });
    t.handleGameEvent({ type: 'finished', reason: 'outOfLives' });
    expect(t.finish(70).levelReached).toBe(3);
    expect(setup().tracker.finish(10).levelReached).toBe(1);
  });

  it('a round that ends on the last life says so; a complete one does not', () => {
    const out = setup().tracker;
    out.handleGameEvent(hit());
    out.handleGameEvent({ type: 'lifeLost', livesLeft: 0 });
    out.handleGameEvent({ type: 'finished', reason: 'outOfLives' });
    // The app passes the game time played (game.getElapsedSec), which stopped at the last life.
    const s = out.finish(12.4);
    expect(s.outOfLives).toBe(true);
    expect(s.activeSec).toBe(12.4);
    expect(s.score).toBe(0);
    const done = setup().tracker;
    done.handleGameEvent({ type: 'finished', reason: 'complete' });
    expect(done.finish(45).outOfLives).toBe(false);
    const old = setup().tracker;
    old.handleGameEvent({ type: 'finished' }); // no reason: complete (contract)
    expect(old.finish(45).outOfLives).toBe(false);
  });

  it('live calories count only time while the round is running', () => {
    const { tracker, advance } = setup();
    advance(5); // countdown before the first event: not counted
    expect(tracker.getLive().kcal).toBe(0);
    tracker.handleGameEvent({
      type: 'cue',
      wave: { t: 4, intensity: 0, spawns: [hurdle] },
      inSec: 2,
    });
    advance(30);
    tracker.handleGameEvent({ type: 'paused', reason: 'trackingLost' });
    advance(100); // paused: not counted
    tracker.handleGameEvent({ type: 'resuming', inSec: 3 });
    advance(3); // the 3-2-1 before the resume: still not counted
    tracker.handleGameEvent({ type: 'resumed' });
    advance(30);
    expect(tracker.getLive().kcal).toBeCloseTo(kcalFor(config, 70, 60));
  });
});
