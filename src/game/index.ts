import type { Game, GameEvent, InputSource, InputState, Level, Wave } from '../contracts';
import { createJudge, requirementMet, type Judge } from './judge';
import { createObstacles, type ObstacleView } from './obstacles';
import { createPlayer } from './player';
import { createStage } from './scene';
import { createTrack } from './timeline';
import * as T from './tuning';

interface Active {
  wave: Wave;
  judge: Judge;
  view: ObstacleView;
}

/**
 * The runner. Owns its requestAnimationFrame loop; nothing here touches React.
 * The loop renders from creation (so the scene shows behind a countdown); game time
 * only advances after start() and while not paused. The app owns input.start()/stop().
 */
export function createGame(canvas: HTMLCanvasElement, level: Level, input: InputSource): Game {
  const { mode, durationSec } = level.config;
  const waves = level.waves;
  const track = createTrack(waves, durationSec);
  const stage = createStage(canvas);
  const player = createPlayer();
  stage.scene.add(player.root);
  const obstacles = createObstacles(stage.scene);

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
  let destroyed = false;
  let pauseReason: 'user' | 'trackingLost' | null = null;
  let elapsed = 0;
  let clock = 0; // visual time for idle animations
  let last = performance.now();
  let raf = 0;
  let nextCue = 0;
  let nextSpawn = 0;
  const active: Active[] = [];

  /** Bring objects into view as they come within VIEW_DISTANCE. */
  function spawnAhead(distance: number): void {
    while (nextSpawn < waves.length) {
      const wave = waves[nextSpawn]!;
      if (track.distanceAt(wave.t) - distance > T.VIEW_DISTANCE) break;
      nextSpawn++;
      for (const spawn of wave.spawns) {
        const view = obstacles.acquire(spawn.kind);
        const hold = spawn.holdSec ?? 0;
        view.show(spawn, hold > 0 ? track.distanceAt(wave.t + hold) - track.distanceAt(wave.t) : 0);
        active.push({ wave, judge: createJudge(spawn, wave.t, mode), view });
      }
    }
  }

  function judgeAll(now: number, state: InputState): void {
    for (const a of active) {
      const { judge, view } = a;
      if (judge.verdict !== 'pending') continue;
      if (
        judge.spawn.kind === 'crate' &&
        elapsed >= judge.t - T.WINDOW_BEFORE_SEC &&
        elapsed <= judge.t + T.WINDOW_AFTER_SEC &&
        requirementMet(judge.spawn, mode, state)
      ) {
        view.engage(); // smash on contact; a long crate is still judged to the end of its hold
      }
      const v = judge.sample(elapsed, state);
      if (!v) continue;
      view.setVerdict(v);
      const spawn = judge.spawn;
      if (v === 'cleared') {
        view.engage();
        obstacles.burst(player.x, spawn.requires);
        emit({ type: 'cleared', spawn, t: now });
      } else if (v === 'collected') {
        view.engage();
        obstacles.burst(player.x, spawn.requires);
        emit({ type: 'collected', spawn, t: now });
      } else if (v === 'hit') {
        player.flashHit();
        stage.shake();
        emit({ type: 'hit', spawn, t: now });
      }
      // 'missed' orbs fire no event (contract).
    }
  }

  function frame(now: number): void {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(Math.max(0, (now - last) / 1000), T.MAX_DT_SEC);
    last = now;

    const state = input.getState(); // polled once per frame
    if (started && !finished) {
      const tracking = state.tracking;
      if (!tracking && pauseReason === null) {
        pauseReason = 'trackingLost';
        emit({ type: 'paused', reason: 'trackingLost' });
      } else if (tracking && pauseReason === 'trackingLost') {
        pauseReason = null;
        emit({ type: 'resumed' });
      }
    }

    const running = started && !finished && pauseReason === null;
    if (running) {
      elapsed = Math.min(durationSec, elapsed + dt);
      while (nextCue < waves.length && waves[nextCue]!.t - elapsed <= T.CUE_LEAD_SEC) {
        const wave = waves[nextCue++]!;
        emit({ type: 'cue', wave, inSec: Math.max(0, wave.t - elapsed) });
      }
      judgeAll(now, state);
      if (elapsed >= durationSec) {
        finished = true;
        emit({ type: 'finished' });
      }
    }

    // Visuals. Everything freezes while paused; before start the runner idles in place.
    const visDt = pauseReason ? 0 : dt;
    clock += visDt;
    const distance = track.distanceAt(elapsed);
    spawnAhead(distance);
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i]!;
      const z = distance - track.distanceAt(a.wave.t);
      a.view.root.position.z = z;
      a.view.tick(visDt, clock);
      const hold = a.judge.spawn.holdSec ?? 0;
      const tail = hold > 0 ? track.distanceAt(a.wave.t + hold) - track.distanceAt(a.wave.t) : 0;
      if (z - tail > T.DESPAWN_BEHIND && a.judge.verdict !== 'pending') {
        obstacles.release(a.view);
        active.splice(i, 1);
      }
    }
    obstacles.tick(visDt);
    player.update(visDt, state, started && !finished);
    stage.update(distance, player.x, visDt);
    stage.render();
  }
  raf = requestAnimationFrame(frame);

  return {
    start() {
      if (started || destroyed) return;
      started = true;
      last = performance.now();
    },
    pause() {
      if (!started || finished || pauseReason) return;
      pauseReason = 'user';
      emit({ type: 'paused', reason: 'user' });
    },
    resume() {
      if (!pauseReason || finished) return;
      pauseReason = null;
      emit({ type: 'resumed' }); // if tracking is still lost, the next frame pauses again
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      listeners.clear();
      stage.dispose();
    },
    getElapsedSec: () => elapsed,
    onEvent(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
