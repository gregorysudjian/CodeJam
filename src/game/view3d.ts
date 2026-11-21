import * as THREE from 'three';
import type { InputState, Level } from '@/contracts';
import { feverTier, type Item } from './core';
import { requirementMet } from './judge';
import type { Verdict } from './judge';
import { colorKeyFor } from './obstacles';
import { createObstacles, type ObstacleView } from './obstacles';
import { createPlayer } from './player';
import type { Quality } from './quality';
import { createStage, neon } from './scene';
import { createTrack } from './timeline';
import * as T from './tuning';

export type Phase = 'idle' | 'running' | 'paused' | 'finished';

/** What createGame tells a renderer every frame. */
export interface FrameInfo {
  elapsed: number; // game seconds
  visDt: number; // seconds of animation this frame (0 while paused)
  realDt: number; // wall seconds, for fades that run while paused
  state: InputState;
  phase: Phase;
  streak: number;
}

export interface GameView {
  frame(f: FrameInfo): void;
  engage(item: Item): void;
  verdict(item: Item, v: Verdict): void;
  setQuality(q: Quality): void;
  dispose(): void;
}

/** Throws if WebGL is unavailable; createGame then falls back to the 2D view. */
export function create3DView(
  canvas: HTMLCanvasElement,
  level: Level,
  items: readonly Item[],
): GameView {
  const { mode, durationSec } = level.config;
  const track = createTrack(level.waves, durationSec);
  const stage = createStage(canvas);
  const player = createPlayer();
  stage.scene.add(player.root);
  const obstacles = createObstacles(stage.scene);
  const finish = createFinishGate();
  stage.scene.add(finish);
  const finishDistance = track.distanceAt(durationSec);

  const views = new Map<Item, ObstacleView>();
  let nextSpawn = 0;
  let clock = 0;
  let lastState: InputState | null = null;
  // After the finish the world coasts to a stop instead of freezing.
  let coast = 0;
  let coastSpeed = track.speedAt(durationSec);
  let finishedSeen = false;

  const lengthOf = (item: Item): number => {
    const hold = item.spawn.holdSec ?? 0;
    return hold > 0 ? track.distanceAt(item.wave.t + hold) - track.distanceAt(item.wave.t) : 0;
  };
  const hand = new THREE.Vector3();
  /** The hand that took the orb: treadmill by lane, floor by the raised arm. */
  const handFor = (item: Item): (() => THREE.Vector3) => {
    const lane = item.spawn.lanes[0] ?? 0;
    const side: 'left' | 'right' =
      mode === 'treadmill'
        ? lane === -1
          ? 'left'
          : 'right'
        : lastState?.rightArmUp || !lastState?.leftArmUp
          ? 'right'
          : 'left';
    return () => player.handPosition(side, hand);
  };

  return {
    frame({ elapsed, visDt, realDt, state, phase, streak }) {
      lastState = state;
      clock += visDt;
      if (phase === 'finished') {
        if (!finishedSeen) {
          finishedSeen = true;
          for (const move of ['jump', 'armsUp', 'sidestep'] as const)
            obstacles.burst(player.x, move);
        }
        coast += coastSpeed * visDt;
        coastSpeed *= Math.exp(-T.COAST_DECAY * visDt);
      }
      const distance = track.distanceAt(elapsed) + coast;

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
      // Hold feedback: is the player holding the held beam or crate they are under?
      let aura: { color: number; ok: boolean } | null = null;
      if (phase === 'running') {
        for (const item of views.keys()) {
          const hold = item.spawn.holdSec ?? 0;
          const t = item.wave.t;
          if (hold <= 0 || item.judge.verdict !== 'pending') continue;
          if (elapsed < t - T.WINDOW_BEFORE_SEC || elapsed > t + hold) continue;
          aura = {
            color: T.MOVE_COLOR[colorKeyFor(item.spawn.requires)],
            ok: requirementMet(item.spawn, mode, state),
          };
          break;
        }
      }
      player.setAura(aura);

      finish.position.z = distance - finishDistance;
      finish.visible = -finish.position.z < T.VIEW_DISTANCE && finish.position.z < T.DESPAWN_BEHIND;

      obstacles.tick(visDt);
      const moving = phase === 'running' || (phase === 'finished' && coastSpeed > 1);
      player.update(visDt, state, moving, phase === 'finished');
      stage.update({
        distance,
        playerX: player.x,
        dt: visDt,
        realDt,
        speed: phase === 'finished' ? coastSpeed : track.speedAt(elapsed),
        fever: phase === 'finished' ? 0 : feverTier(streak),
        dim: phase === 'paused',
      });
      stage.render();
    },
    engage(item) {
      views.get(item)?.engage(item.spawn.kind === 'orb' ? handFor(item) : undefined);
    },
    verdict(item, v) {
      const view = views.get(item);
      view?.setVerdict(v);
      if (v === 'cleared' || v === 'collected') {
        view?.engage(item.spawn.kind === 'orb' ? handFor(item) : undefined);
        obstacles.burst(player.x, item.spawn.requires);
      } else if (v === 'hit') {
        player.flashHit();
        stage.shake();
        obstacles.burst(player.x, 'hit');
      }
    },
    setQuality(q) {
      stage.setQuality(q);
    },
    dispose() {
      obstacles.dispose();
      stage.dispose();
    },
  };
}

/** A checkered finish arch, placed where the runner is when the clock hits durationSec. */
function createFinishGate(): THREE.Group {
  const gate = new THREE.Group();
  const half = (3 * T.LANE_WIDTH) / 2 + 0.9;
  const glow = new THREE.MeshBasicMaterial({ color: neon(0xffffff, T.NEON_BOOST * 0.7) });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, T.FINISH_HEIGHT, 0.22), glow);
    post.position.set(s * half, T.FINISH_HEIGHT / 2, 0);
    gate.add(post);
  }
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  const sq = 24;
  for (let x = 0; x < c.width; x += sq)
    for (let y = 0; y < c.height; y += sq) {
      g.fillStyle = (x / sq + y / sq) % 2 === 0 ? '#f4f7fb' : '#07090d';
      g.fillRect(x, y, sq, sq);
    }
  g.fillStyle = '#07090d';
  g.fillRect(96, 18, 320, 60);
  g.fillStyle = `#${T.COLOR_LIME.toString(16)}`;
  g.font = 'bold 50px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FINISH', 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2, (half * 2 * c.height) / c.width),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  banner.position.y = T.FINISH_HEIGHT - 0.6;
  gate.add(banner);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 0.5), glow);
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.03;
  gate.add(line);
  gate.visible = false;
  return gate;
}
