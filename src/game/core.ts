import type { GameEvent, InputState, Level, Spawn, Wave } from '@/contracts';
import { createJudge, requirementMet, type Judge, type Verdict } from './judge';
import * as T from './tuning';

/**
 * The game's rules without any drawing: the clock, cues, judging, pause and finish.
 * Pure and deterministic, so it is unit-tested (core.test.ts). `createGame` drives it from
 * requestAnimationFrame and turns its hooks into pictures and sounds.
 */
export interface Item {
  readonly wave: Wave;
  readonly spawn: Spawn;
  readonly judge: Judge;
}

export interface CoreHooks {
  cue?(wave: Wave): void;
  /** First frame a crate's move is seen inside its window (smash it, even if it is held). */
  engage?(item: Item): void;
  /**
   * `offset`: game seconds from the object's time t to the first frame its move was seen inside
   * the window (negative = early), for the timing grade (feedback.ts); null for a hit or a miss.
   * For a held object this is when the hold started, not when it ended.
   */
  verdict?(item: Item, v: Verdict, offset: number | null): void;
  /** A hit cost a life (after its verdict); 0 left starts the out-of-lives ending. */
  lifeLost?(livesLeft: number): void;
}

export type PauseReason = 'user' | 'trackingLost' | 'otherPerson';

export interface Core {
  readonly items: readonly Item[];
  elapsed(): number;
  /** Clears and collected orbs in a row; a hit resets it (mirrors the scoring streak). */
  streak(): number;
  started(): boolean;
  finished(): boolean;
  /** Lives left (T.LIVES at the start). */
  lives(): number;
  /** The level the round is in (Stage.index, from 'stage' events), 0 before the first. */
  stageIndex(): number;
  /** Game seconds of grace left after a lost life (no second life can go), else 0. */
  graceLeft(): number;
  /**
   * True from the moment the last life goes: judging and game time stop, and 'finished'
   * (reason 'outOfLives') follows OUT_OF_LIVES_SEC of real time later.
   */
  outOfLives(): boolean;
  /** Why the round is held; still set during the 3-2-1 before it resumes (resumingIn). */
  pauseReason(): PauseReason | null;
  /** Seconds left of the countdown before a resume (game time frozen), or null. */
  resumingIn(): number | null;
  start(): void;
  pause(): void;
  resume(): void;
  /** One frame: real seconds since the last frame (clamped here), polled input, performance.now(). */
  step(realDtSec: number, state: InputState, nowMs: number): void;
  onEvent(cb: (e: GameEvent) => void): () => void;
  clearListeners(): void;
}

/**
 * `leads`: seconds each object is drawn ahead of its judging time, by move (VISUAL_LEAD_SEC).
 * The cue counts down to when the wave *visually* reaches the runner, t - lead, so a player who
 * follows the HUD countdown moves when the latency compensation expects it.
 */
export function createCore(level: Level, hooks: CoreHooks = {}, leads?: T.Leads): Core {
  const { mode, durationSec } = level.config;
  const arrivesAt = (wave: Wave): number => {
    const move = wave.spawns[0]?.requires;
    return wave.t - (move && leads ? leads()[move] : 0);
  };
  // Sorted copy: the contract says waves come sorted, but cues and judging rely on it.
  const waves = [...level.waves].sort((a, b) => a.t - b.t);
  const items: Item[] = waves.flatMap((wave) =>
    wave.spawns.map((spawn) => ({ wave, spawn, judge: createJudge(spawn, wave.t, mode) })),
  );
  const engaged = new WeakSet<Item>();
  const firstSeen = new WeakMap<Item, number>(); // game time the move was first seen in the window
  const listeners = new Set<(e: GameEvent) => void>();
  const emit = (e: GameEvent): void => {
    for (const cb of [...listeners]) {
      try {
        cb(e);
      } catch (err) {
        console.error('[game] event listener failed', err);
      }
    }
  };

  let started = false;
  let finished = false;
  let pauseReason: PauseReason | null = null;
  // Every resume counts down first (RESUME_COUNTDOWN_SEC, real time, game time frozen), so the
  // player is back in position before objects move: null when no countdown runs.
  let countdown: number | null = null;
  const holdAgain = (reason: PauseReason): void => {
    countdown = null;
    pauseReason = reason;
    emit({ type: 'paused', reason });
  };
  const countDown = (): void => {
    countdown = T.RESUME_COUNTDOWN_SEC;
    emit({ type: 'resuming', inSec: T.RESUME_COUNTDOWN_SEC });
  };
  let elapsed = 0;
  // Lives: a hit on a block, hurdle, beam or crate costs one (a missed orb never does). After a
  // lost life, LIFE_GRACE_SEC of game time in which no other can go: one held beam, or a block
  // and its orb, is one mistake. The last one starts the ending (outFor: real seconds since).
  let lives: number = T.LIVES;
  let graceUntil = -Infinity;
  let outFor: number | null = null;
  // Levels (level.stages): 'stage' as game time enters each one, level 1 on the first frame.
  const stages = level.stages ?? [];
  let nextStage = 0;
  let nextCue = 0;
  let firstUndecided = 0; // items before this index are all decided
  let streak = 0;

  const engage = (item: Item): void => {
    if (engaged.has(item)) return;
    engaged.add(item);
    hooks.engage?.(item);
  };

  function judgeAll(state: InputState, nowMs: number): void {
    while (firstUndecided < items.length && items[firstUndecided]!.judge.verdict !== 'pending')
      firstUndecided++;
    for (let i = firstUndecided; i < items.length; i++) {
      const item = items[i]!;
      const { judge, spawn } = item;
      if (judge.t - T.WINDOW_BEFORE_SEC > elapsed) break; // items are in time order
      if (judge.verdict !== 'pending') continue;
      if (
        !firstSeen.has(item) &&
        elapsed <= judge.t + T.WINDOW_AFTER_SEC &&
        requirementMet(spawn, mode, state)
      ) {
        firstSeen.set(item, elapsed);
        if (spawn.kind === 'crate') engage(item);
      }
      const v = judge.sample(elapsed, state);
      if (!v) continue;
      let offset: number | null = null;
      if (v === 'cleared' || v === 'collected') {
        engage(item);
        streak++;
        offset = (firstSeen.get(item) ?? elapsed) - judge.t;
      } else if (v === 'hit') {
        streak = 0;
      }
      hooks.verdict?.(item, v, offset);
      if (v === 'cleared') emit({ type: 'cleared', spawn, t: nowMs });
      else if (v === 'collected') emit({ type: 'collected', spawn, t: nowMs });
      else if (v === 'hit') {
        emit({ type: 'hit', spawn, t: nowMs });
        if (spawn.kind !== 'orb' && lives > 0 && elapsed >= graceUntil) {
          lives--;
          graceUntil = elapsed + T.LIFE_GRACE_SEC;
          hooks.lifeLost?.(lives);
          emit({ type: 'lifeLost', livesLeft: lives });
          if (lives === 0) {
            outFor = 0; // the ending: nothing more is judged
            return;
          }
        }
      }
      // a missed orb fires no event (contract)
    }
  }

  return {
    items,
    elapsed: () => elapsed,
    streak: () => streak,
    started: () => started,
    finished: () => finished,
    lives: () => lives,
    stageIndex: () => (nextStage > 0 ? stages[nextStage - 1]!.index : 0),
    graceLeft: () => Math.max(0, graceUntil - elapsed),
    outOfLives: () => outFor !== null,
    pauseReason: () => pauseReason,
    resumingIn: () => countdown,
    start() {
      started = true;
    },
    pause() {
      if (!started || finished || outFor !== null) return; // the ending runs on
      // A pause during the countdown stops it: the player paused again.
      if (pauseReason && countdown === null) return;
      holdAgain('user');
    },
    resume() {
      if (!pauseReason || finished || countdown !== null) return;
      countDown(); // if tracking is still lost, the next step pauses again
    },
    step(realDtSec, state, nowMs) {
      if (!started || finished) return;
      if (outFor !== null) {
        // Out of lives: game time stays where the last life went; 'finished' follows.
        outFor += Math.min(Math.max(0, realDtSec), T.RESUME_MAX_DT_SEC);
        if (outFor >= T.OUT_OF_LIVES_SEC) {
          finished = true;
          emit({ type: 'finished', reason: 'outOfLives' });
        }
        return;
      }
      // Someone else in the play area, or the player gone: pose sets tracking false for both.
      const lost: PauseReason | null = state.otherPerson
        ? 'otherPerson'
        : !state.tracking
          ? 'trackingLost'
          : null;
      if (lost) {
        // Paused now, or again if it happens during the countdown ('resumed' is never sent).
        // A user pause keeps its reason; a tracking pause follows what the camera sees now.
        if (pauseReason === null || countdown !== null) holdAgain(lost);
        else if (pauseReason !== 'user' && pauseReason !== lost) holdAgain(lost);
      } else if (
        (pauseReason === 'trackingLost' || pauseReason === 'otherPerson') &&
        countdown === null
      ) {
        countDown(); // the player is back: count down, then resume
      }
      if (countdown !== null) {
        countdown -= Math.min(Math.max(0, realDtSec), T.RESUME_MAX_DT_SEC);
        if (countdown > 0) return;
        countdown = null;
        pauseReason = null;
        emit({ type: 'resumed' });
        return; // game time starts with the next frame
      }
      if (pauseReason) return;

      elapsed = Math.min(durationSec, elapsed + Math.min(Math.max(0, realDtSec), T.MAX_DT_SEC));
      while (nextStage < stages.length && elapsed >= stages[nextStage]!.startSec) {
        emit({ type: 'stage', stage: stages[nextStage++]! });
      }
      while (nextCue < waves.length && arrivesAt(waves[nextCue]!) - elapsed <= T.CUE_LEAD_SEC) {
        const wave = waves[nextCue++]!;
        hooks.cue?.(wave);
        emit({ type: 'cue', wave, inSec: Math.max(0, arrivesAt(wave) - elapsed) });
      }
      judgeAll(state, nowMs);
      if (outFor === null && elapsed >= durationSec) {
        finished = true;
        emit({ type: 'finished', reason: 'complete' });
      }
    },
    onEvent(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    clearListeners() {
      listeners.clear();
    },
  };
}

/** Visual intensity tier from the streak: 0, then 1, 2, 3 at T.STREAK_TIERS (5, 10, 20). */
export function feverTier(streak: number): number {
  let tier = 0;
  for (const min of T.STREAK_TIERS) if (streak >= min) tier++;
  return tier;
}

export type SeenMove = 'step' | 'hop' | 'duck' | 'raise';

/** Moves that started between two polled states, for the "I saw that" sounds. */
export function movesSeen(prev: InputState, next: InputState): SeenMove[] {
  const seen: SeenMove[] = [];
  if (next.lane !== prev.lane) seen.push('step');
  if (next.airborne && !prev.airborne) seen.push('hop');
  if (next.ducking && !prev.ducking) seen.push('duck');
  if ((next.leftArmUp && !prev.leftArmUp) || (next.rightArmUp && !prev.rightArmUp))
    seen.push('raise');
  return seen;
}

/**
 * Live feedback while a held beam or crate is due (from t - 0.35 s to t + holdSec):
 * 'prompt' until the move is first seen, 'ok' while it is held, 'warn' (red) only if it was
 * seen and then let go. Webcam input lags by about 0.3 s, so a player who moves on time is
 * still reported idle for a moment: that must read as a prompt, never as a mistake.
 */
export type HoldFeedback = 'prompt' | 'ok' | 'warn';

export function holdFeedback(
  t: number,
  holdSec: number,
  elapsed: number,
  met: boolean,
  seenBefore: boolean,
): HoldFeedback | null {
  if (elapsed < t - T.WINDOW_BEFORE_SEC || elapsed > t + holdSec) return null;
  if (met) return 'ok';
  return seenBefore ? 'warn' : 'prompt';
}
