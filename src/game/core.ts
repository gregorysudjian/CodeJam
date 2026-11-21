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
  verdict?(item: Item, v: Verdict): void;
}

export type PauseReason = 'user' | 'trackingLost';

export interface Core {
  readonly items: readonly Item[];
  elapsed(): number;
  started(): boolean;
  finished(): boolean;
  pauseReason(): PauseReason | null;
  start(): void;
  pause(): void;
  resume(): void;
  /** One frame: real seconds since the last frame (clamped here), polled input, performance.now(). */
  step(realDtSec: number, state: InputState, nowMs: number): void;
  onEvent(cb: (e: GameEvent) => void): () => void;
  clearListeners(): void;
}

export function createCore(level: Level, hooks: CoreHooks = {}): Core {
  const { mode, durationSec } = level.config;
  const waves = level.waves;
  const items: Item[] = waves.flatMap((wave) =>
    wave.spawns.map((spawn) => ({ wave, spawn, judge: createJudge(spawn, wave.t, mode) })),
  );
  const engaged = new WeakSet<Item>();
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
  let elapsed = 0;
  let nextCue = 0;
  let firstUndecided = 0; // items before this index are all decided

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
        spawn.kind === 'crate' &&
        elapsed <= judge.t + T.WINDOW_AFTER_SEC &&
        requirementMet(spawn, mode, state)
      ) {
        engage(item);
      }
      const v = judge.sample(elapsed, state);
      if (!v) continue;
      if (v === 'cleared' || v === 'collected') engage(item);
      hooks.verdict?.(item, v);
      if (v === 'cleared') emit({ type: 'cleared', spawn, t: nowMs });
      else if (v === 'collected') emit({ type: 'collected', spawn, t: nowMs });
      else if (v === 'hit') emit({ type: 'hit', spawn, t: nowMs });
      // a missed orb fires no event (contract)
    }
  }

  return {
    items,
    elapsed: () => elapsed,
    started: () => started,
    finished: () => finished,
    pauseReason: () => pauseReason,
    start() {
      started = true;
    },
    pause() {
      if (!started || finished || pauseReason) return;
      pauseReason = 'user';
      emit({ type: 'paused', reason: 'user' });
    },
    resume() {
      if (!pauseReason || finished) return;
      pauseReason = null;
      emit({ type: 'resumed' }); // if tracking is still lost, the next step pauses again
    },
    step(realDtSec, state, nowMs) {
      if (!started || finished) return;
      if (!state.tracking && pauseReason === null) {
        pauseReason = 'trackingLost';
        emit({ type: 'paused', reason: 'trackingLost' });
      } else if (state.tracking && pauseReason === 'trackingLost') {
        pauseReason = null;
        emit({ type: 'resumed' });
      }
      if (pauseReason) return;

      elapsed = Math.min(durationSec, elapsed + Math.min(Math.max(0, realDtSec), T.MAX_DT_SEC));
      while (nextCue < waves.length && waves[nextCue]!.t - elapsed <= T.CUE_LEAD_SEC) {
        const wave = waves[nextCue++]!;
        hooks.cue?.(wave);
        emit({ type: 'cue', wave, inSec: Math.max(0, wave.t - elapsed) });
      }
      judgeAll(state, nowMs);
      if (elapsed >= durationSec) {
        finished = true;
        emit({ type: 'finished' });
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
