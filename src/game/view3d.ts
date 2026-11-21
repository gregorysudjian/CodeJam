import * as THREE from 'three';
import type { InputState, Level } from '@/contracts';
import { feverTier, holdFeedback, type HoldFeedback, type Item } from './core';
import { OUTCOME_LABEL, raceLabel, type GhostOutcome, type GhostPose } from './ghost';
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
  /** The ghost runner's pose at this moment, or null when there is no ghost to race. */
  ghost: GhostPose | null;
  /** The player's live lead over the ghost (cleared + collected), or null: no chip. */
  race: number | null;
}

export interface GameView {
  frame(f: FrameInfo): void;
  engage(item: Item): void;
  verdict(item: Item, v: Verdict): void;
  setQuality(q: Quality): void;
  /** End of round against the ghost: a banner over the track ("GHOST BEATEN", ...). */
  showGhostOutcome(outcome: GhostOutcome): void;
  dispose(): void;
}

/** Throws if WebGL is unavailable; createGame then falls back to the 2D view. */
export function create3DView(
  canvas: HTMLCanvasElement,
  level: Level,
  items: readonly Item[],
  /** Seconds each object is drawn ahead of the judging clock, by move (latency compensation). */
  leads: T.Leads,
): GameView {
  const { mode, durationSec } = level.config;
  const track = createTrack(level.waves, durationSec);
  const stage = createStage(canvas);
  const player = createPlayer();
  stage.scene.add(player.root);
  const obstacles = createObstacles(stage.scene);
  const finish = createFinishGate();
  stage.scene.add(finish.group);
  const finishDistance = track.distanceAt(durationSec);

  const views = new Map<Item, ObstacleView>();
  let banner: THREE.Sprite | null = null;
  let raceChip: ReturnType<typeof createChip> | null = null;
  let raceShown: number | null = null;
  let bannerT = 0;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // The ghost runner, created the first time a ghost pose arrives; fed through one reused state.
  let ghostRunner: ReturnType<typeof createPlayer> | null = null;
  const ghostInput: InputState = {
    tracking: true,
    lane: 0,
    airborne: false,
    ducking: false,
    leftArmUp: false,
    rightArmUp: false,
  };
  const seenHolds = new WeakSet<Item>(); // held objects whose move has been seen
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
    frame({ elapsed, visDt, realDt, state, phase, streak, ghost, race }) {
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
      // Scenery and the finish use the judging clock; each object runs ahead by its lead.
      const distance = track.distanceAt(elapsed) + coast;
      const ahead = (lead: number): number => track.distanceAt(elapsed + lead) + coast;
      const lead = leads(); // read per frame: K can switch input mid-round
      const spawnLine = ahead(Math.max(...Object.values(lead)));

      // Bring objects into view as they come within VIEW_DISTANCE (items are in time order).
      while (nextSpawn < items.length) {
        const item = items[nextSpawn]!;
        if (track.distanceAt(item.wave.t) - spawnLine > T.VIEW_DISTANCE) break;
        nextSpawn++;
        const view = obstacles.acquire(item.spawn.kind);
        view.show(item.spawn, lengthOf(item));
        if (item.judge.verdict !== 'pending') view.setVerdict(item.judge.verdict);
        views.set(item, view);
      }
      for (const [item, view] of views) {
        const z = ahead(lead[item.spawn.requires]) - track.distanceAt(item.wave.t);
        view.root.position.z = z;
        view.tick(visDt, clock);
        if (z - lengthOf(item) > T.DESPAWN_BEHIND && item.judge.verdict !== 'pending') {
          obstacles.release(view);
          views.delete(item);
        }
      }
      // Hold feedback for the held beam or crate that is due (see holdFeedback).
      let aura: { color: number; mode: HoldFeedback } | null = null;
      if (phase === 'running') {
        for (const item of views.keys()) {
          const hold = item.spawn.holdSec ?? 0;
          if (hold <= 0 || item.judge.verdict !== 'pending') continue;
          const met = requirementMet(item.spawn, mode, state);
          const feedback = holdFeedback(item.wave.t, hold, elapsed, met, seenHolds.has(item));
          if (!feedback) continue;
          if (met) seenHolds.add(item);
          aura = { color: T.MOVE_COLOR[colorKeyFor(item.spawn.requires)], mode: feedback };
          break;
        }
      }
      player.setAura(aura);

      const finishZ = distance - finishDistance;
      // Fades out from FINISH_FADE_START to FINISH_FADE_END past the runner (see createFinishGate).
      const fade = Math.min(
        1,
        Math.max(0, (T.FINISH_FADE_END - finishZ) / (T.FINISH_FADE_END - T.FINISH_FADE_START)),
      );
      finish.group.position.z = finishZ;
      finish.group.visible = -finishZ < T.VIEW_DISTANCE && fade > 0.01;
      finish.setFade(fade);

      obstacles.tick(visDt);
      const moving = phase === 'running' || (phase === 'finished' && coastSpeed > 1);
      player.update(visDt, state, moving, phase === 'finished');
      if (race !== null && race !== raceShown) {
        raceChip ??= createChip(stage.scene);
        raceChip.draw(raceLabel(race));
        raceShown = race;
      }
      if (raceChip) raceChip.sprite.visible = race !== null;
      if (banner) {
        bannerT += realDt;
        const k = reduceMotion ? 1 : Math.min(1, bannerT / T.BANNER_POP_SEC);
        const pop = 1 - (1 - k) ** 3; // ease out
        banner.scale.set(T.BANNER_WIDTH * pop, (T.BANNER_WIDTH / 5.33) * pop, 1);
      }
      if (ghost) {
        if (!ghostRunner) {
          ghostRunner = createPlayer({ ghost: true });
          stage.scene.add(ghostRunner.root);
        }
        ghostInput.lane = ghost.lane;
        ghostInput.airborne = ghost.airborne;
        ghostInput.ducking = ghost.ducking;
        ghostInput.leftArmUp = ghost.leftArmUp;
        ghostInput.rightArmUp = ghost.rightArmUp;
        ghostRunner.update(visDt, ghostInput, moving);
      }
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
    showGhostOutcome(outcome) {
      if (banner) return;
      banner = createBanner(outcome);
      bannerT = 0;
      stage.scene.add(banner);
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
/**
 * The finish arch. After the finish the world coasts on and the arch passes the camera; its
 * banner hangs at eye height, so it would sweep across the whole view (a giant FINISH, a lime
 * blob under bloom) during the app's 1.5 s celebration. `setFade` dissolves it as it passes
 * the runner instead.
 */
function createFinishGate(): { group: THREE.Group; setFade(opacity: number): void } {
  const gate = new THREE.Group();
  const half = (3 * T.LANE_WIDTH) / 2 + 0.9;
  const glow = new THREE.MeshBasicMaterial({
    color: neon(0xffffff, T.NEON_BOOST * 0.7),
    transparent: true,
  });
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
  const bannerMat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2, (half * 2 * c.height) / c.width),
    bannerMat,
  );
  banner.position.y = T.FINISH_HEIGHT - 0.6;
  gate.add(banner);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 0.5), glow);
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.03;
  gate.add(line);
  gate.visible = false;
  return {
    group: gate,
    setFade(opacity) {
      glow.opacity = opacity;
      bannerMat.opacity = opacity;
      // Opaque while it approaches, so it sorts and depth-tests like the rest of the track.
      glow.depthWrite = bannerMat.depthWrite = opacity >= 1;
    },
  };
}

/** The end banner as a sprite: drawn once to a canvas, always on top, no fog. */
function createBanner(outcome: GhostOutcome): THREE.Sprite {
  const { text, color } = OUTCOME_LABEL[outcome];
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(7, 9, 13, 0.78)';
  g.strokeStyle = hex;
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect(8, 8, c.width - 16, c.height - 16, 40);
  g.fill();
  g.stroke();
  g.fillStyle = hex;
  g.font = 'italic 800 110px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }),
  );
  sprite.renderOrder = 1000;
  sprite.position.set(T.BANNER_POS.x, T.BANNER_POS.y, T.BANNER_POS.z);
  sprite.scale.set(0.001, 0.001, 1);
  return sprite;
}

/** The live race chip: one sprite whose canvas is redrawn only when the lead changes. */
function createChip(scene: THREE.Scene): {
  sprite: THREE.Sprite;
  draw(label: { text: string; color: number }): void;
} {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }),
  );
  sprite.renderOrder = 999;
  sprite.position.set(T.RACE_POS.x, T.RACE_POS.y, T.RACE_POS.z);
  sprite.scale.set(T.RACE_WIDTH, (T.RACE_WIDTH * c.height) / c.width, 1);
  scene.add(sprite);
  return {
    sprite,
    draw({ text, color }) {
      const hex = `#${color.toString(16).padStart(6, '0')}`;
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = 'rgba(7, 9, 13, 0.72)';
      g.strokeStyle = hex;
      g.lineWidth = 5;
      g.beginPath();
      g.roundRect(4, 4, c.width - 8, c.height - 8, 30);
      g.fill();
      g.stroke();
      g.fillStyle = hex;
      g.font = 'italic 800 52px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, c.width / 2, c.height / 2 + 3);
      tex.needsUpdate = true;
    },
  };
}
