import type { InputState, Level } from '@/contracts';
import type { Item } from './core';
import type { Verdict } from './judge';
import { createObstacles, type ObstacleView } from './obstacles';
import { createPlayer } from './player';
import { createStage } from './scene';
import { createTrack } from './timeline';
import * as T from './tuning';

/** What createGame needs from a renderer: the Three.js one, or the 2D fallback. */
export interface FrameInfo {
  elapsed: number;
  visDt: number; // 0 while paused
  state: InputState;
  moving: boolean; // the world scrolls
}

export interface GameView {
  frame(f: FrameInfo): void;
  engage(item: Item): void;
  verdict(item: Item, v: Verdict): void;
  setLowGraphics(on: boolean): void;
  dispose(): void;
}

/** Throws if WebGL is unavailable; createGame then falls back to the 2D view. */
export function create3DView(
  canvas: HTMLCanvasElement,
  level: Level,
  items: readonly Item[],
): GameView {
  const track = createTrack(level.waves, level.config.durationSec);
  const stage = createStage(canvas);
  const player = createPlayer();
  stage.scene.add(player.root);
  const obstacles = createObstacles(stage.scene);

  const views = new Map<Item, ObstacleView>();
  let nextSpawn = 0;
  let clock = 0;
  const lengthOf = (item: Item): number => {
    const hold = item.spawn.holdSec ?? 0;
    return hold > 0 ? track.distanceAt(item.wave.t + hold) - track.distanceAt(item.wave.t) : 0;
  };

  return {
    frame({ elapsed, visDt, state, moving }) {
      clock += visDt;
      const distance = track.distanceAt(elapsed);
      // Bring objects into view as they come within VIEW_DISTANCE (items are in time order).
      while (nextSpawn < items.length) {
        const item = items[nextSpawn]!;
        if (track.distanceAt(item.wave.t) - distance > T.VIEW_DISTANCE) break;
        nextSpawn++;
        const view = obstacles.acquire(item.spawn.kind);
        view.show(item.spawn, lengthOf(item));
        if (item.judge.verdict !== 'pending') view.setVerdict(item.judge.verdict);
        views.set(item, view);
      }
      for (const [item, view] of views) {
        const z = distance - track.distanceAt(item.wave.t);
        view.root.position.z = z;
        view.tick(visDt, clock);
        if (z - lengthOf(item) > T.DESPAWN_BEHIND && item.judge.verdict !== 'pending') {
          obstacles.release(view);
          views.delete(item);
        }
      }
      obstacles.tick(visDt);
      player.update(visDt, state, moving);
      stage.update(distance, player.x, visDt);
      stage.render();
    },
    engage(item) {
      views.get(item)?.engage();
    },
    verdict(item, v) {
      const view = views.get(item);
      view?.setVerdict(v);
      if (v === 'cleared' || v === 'collected') {
        view?.engage();
        obstacles.burst(player.x, item.spawn.requires);
      } else if (v === 'hit') {
        player.flashHit();
        stage.shake();
      }
    },
    setLowGraphics(on) {
      stage.setLowGraphics(on);
    },
    dispose() {
      stage.dispose();
    },
  };
}
