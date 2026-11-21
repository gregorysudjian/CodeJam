import * as THREE from 'three';
import type { InputState, Level } from '@/contracts';
import { feverTier, holdFeedback, type HoldFeedback, type Item } from './core';
import { comboLabel, GRADE_LABEL, type Grade } from './feedback';
import { OUTCOME_LABEL, raceLabel, racePulse, type GhostOutcome, type GhostPose } from './ghost';
import { countdownAt, flyProgress } from './intro';
import { requirementMet, type Verdict } from './judge';
import { colorKeyFor, createObstacles, variantFor, type ObstacleView } from './obstacles';
import { createPlayer } from './player';
import type { Quality } from './quality';
import { createStage, neon } from './scene';
import { createTrack } from './timeline';
import { planTrail } from './trail';
import * as T from './tuning';
import { planZones } from './world';

export type Phase = 'idle' | 'intro' | 'running' | 'paused' | 'finished';

/** What createGame tells a renderer every frame. */
export interface FrameInfo {
  elapsed: number; // game seconds
  visDt: number; // seconds of animation this frame (0 while paused)
  realDt: number; // wall seconds, for fades that run while paused
  state: InputState;
  phase: Phase;
  streak: number;
  /** Seconds since the intro began, continuing into the round (for GO); -1: no intro. */
  intro: number;
  /** The ghost runner's pose at this moment, or null when there is no ghost to race. */
  ghost: GhostPose | null;
  /** The player's live lead over the ghost (cleared + collected), or null: no chip. */
  race: number | null;
}

export interface GameView {
  frame(f: FrameInfo): void;
  engage(item: Item): void;
  /** `grade`: the timing grade of a clear or collect (feedback.ts), null for a hit or miss. */
  verdict(item: Item, v: Verdict, grade: Grade | null): void;
  /** The combo reached a milestone (5, 10, 20, then every 10). */
  milestone(streak: number): void;
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
  const stage = createStage(canvas, planZones(durationSec, track.distanceAt));
  const player = createPlayer();
  stage.scene.add(player.root);
  const obstacles = createObstacles(stage.scene);
  const finish = createFinishGate();
  stage.scene.add(finish.group);
  const finishDistance = track.distanceAt(durationSec);

  const views = new Map<Item, ObstacleView>();
  // The live race chip and the end banner: built now, hidden, so their shader is precompiled.
  const raceChip = createLabel(stage.scene, T.RACE_WIDTH, 512, T.RACE_POS, 999);
  const banner = createLabel(stage.scene, T.BANNER_WIDTH, 1024, T.BANNER_POS, 1000);
  let raceShown: number | null = null;
  let raceChangedT = Infinity; // seconds since the lead last changed (chip pop)
  let bannerT = -1; // seconds since the banner appeared; < 0: not shown
  let compiled = false;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // Countdown, timing grades, combo counter, milestone banner: built now, hidden (precompiled).
  const countLabel = createLabel(
    stage.scene,
    T.COUNT_WIDTH,
    512,
    { x: 0, y: T.COUNT_POS.y, z: 0 },
    1001,
    true,
  );
  let countShown: string | null = null;
  const gradeLabels = (Object.keys(GRADE_LABEL) as Grade[]).map((g) => {
    const l = createLabel(stage.scene, T.GRADE_WIDTH, 512, { x: 0, y: 0, z: 0 }, 1002, true);
    l.draw(GRADE_LABEL[g]);
    return { grade: g, ...l };
  });
  let gradeT = Infinity; // seconds since the last grade popped
  let gradeShown: (typeof gradeLabels)[number] | null = null;
  let gradeSide = 1;
  const comboChip = createLabel(
    stage.scene,
    T.COMBO_WIDTH,
    512,
    { x: 0, y: T.COMBO_POS.y, z: T.COMBO_POS.z },
    998,
  );
  let comboShown: string | null = null;
  let comboChangedT = Infinity;
  const milestoneLabel = createLabel(stage.scene, T.MILESTONE_WIDTH, 1024, T.MILESTONE_POS, 997);
  let milestoneT = Infinity;
  const showMilestone = (label: { text: string; color: number }): void => {
    milestoneLabel.draw(label);
    milestoneT = 0;
  };
  let finaleSeen = false;
  let countT = 0;

  // Trail motes leading into the next free lane or orb (trail.ts): one instanced mesh.
  const motes = planTrail(items, track.distanceAt);
  const moteMat = new THREE.MeshBasicMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const moteMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.17, 0),
    moteMat,
    Math.max(1, motes.length),
  );
  moteMesh.frustumCulled = false;
  const moteColor = motes.map((m) => neon(T.MOVE_COLOR[colorKeyFor(m.move)], T.NEON_BOOST * 0.8));
  const black = new THREE.Color(0, 0, 0);
  const moteTint = new THREE.Color();
  const moteScale = new THREE.Vector3();
  const motePop = new Float32Array(motes.length).fill(-1); // seconds since popped; < 0: not yet
  const m4 = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < motes.length; i++) {
    moteMesh.setMatrixAt(i, hidden);
    moteMesh.setColorAt(i, moteColor[i]!);
  }
  if (motes.length === 0) moteMesh.setMatrixAt(0, hidden);
  stage.scene.add(moteMesh);
  let firstMote = 0; // motes before this are behind the runner for good
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
    frame({ elapsed, visDt, realDt, state, phase, streak, intro, ghost, race }) {
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
        view.show(item.spawn, lengthOf(item), variantFor(item.wave.t, item.spawn.kind));
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
      const runSpeed =
        phase === 'running'
          ? track.speedAt(elapsed)
          : phase === 'finished' && coastSpeed > 1
            ? coastSpeed
            : 0;
      player.update(visDt, state, runSpeed, phase === 'finished');

      // Trail motes: drawn ahead like the object they lead to; the runner pops them in passing.
      while (firstMote < motes.length && motes[firstMote]!.d < distance - 12) {
        moteMesh.setMatrixAt(firstMote, hidden);
        firstMote++;
      }
      for (let i = firstMote; i < motes.length; i++) {
        const m = motes[i]!;
        const z = ahead(lead[m.move]) - m.d;
        if (z < -T.VIEW_DISTANCE * 0.8) break; // sorted by distance: the rest are further
        const x = m.lane * T.LANE_WIDTH;
        if (motePop[i]! < 0 && z > -0.2 && z < 1.2 && Math.abs(player.x - x) < 0.8) motePop[i] = 0;
        if (motePop[i]! >= 0) motePop[i]! += visDt;
        const pop = motePop[i]!;
        if ((pop < 0 && z > 2.5) || pop > 0.25) {
          moteMesh.setMatrixAt(i, hidden);
          continue;
        }
        const bob = reduceMotion ? 0 : Math.sin(clock * 4 + i) * 0.08;
        const s = pop < 0 ? 1 : 1 + pop * 6;
        m4.makeRotationY(clock * 2 + i).scale(moteScale.setScalar(s));
        m4.setPosition(x, T.TRAIL_HEIGHT + bob + (pop > 0 ? pop * 2 : 0), z);
        moteMesh.setMatrixAt(i, m4);
        moteTint.copy(moteColor[i]!).lerp(black, pop < 0 ? 0 : pop / 0.25);
        moteMesh.setColorAt(i, moteTint);
      }
      moteMesh.instanceMatrix.needsUpdate = true;
      if (moteMesh.instanceColor) moteMesh.instanceColor.needsUpdate = true;
      if (race !== null && race !== raceShown) {
        raceChip.draw(raceLabel(race));
        if (raceShown !== null) raceChangedT = 0; // not the first draw: the lead changed
        raceShown = race;
      }
      raceChip.sprite.visible = race !== null;
      raceChangedT += realDt;
      const chipScale = T.RACE_WIDTH * (1 + (reduceMotion ? 0 : racePulse(raceChangedT)));
      raceChip.sprite.scale.set(chipScale, chipScale * LABEL_ASPECT, 1);
      if (bannerT >= 0) {
        bannerT += realDt;
        const k = reduceMotion ? 1 : Math.min(1, bannerT / T.BANNER_POP_SEC);
        const pop = 1 - (1 - k) ** 3; // ease out
        banner.sprite.scale.set(T.BANNER_WIDTH * pop, T.BANNER_WIDTH * LABEL_ASPECT * pop, 1);
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
        ghostRunner.update(visDt, ghostInput, runSpeed);
      }

      // Intro: the countdown number over the runner (3, 2, 1, GO).
      const count = countdownAt(intro);
      if (count !== countShown) {
        countShown = count;
        if (count) {
          countLabel.draw({ text: count, color: count === 'GO' ? T.COLOR_LIME : 0xf4f7fb });
          countT = 0;
        }
      }
      countLabel.sprite.visible = count !== null;
      if (count) {
        countT += realDt;
        const k = reduceMotion ? 1 : Math.min(1, countT / 0.18);
        const s = T.COUNT_WIDTH * (1.6 - 0.6 * (1 - (1 - k) ** 3));
        countLabel.sprite.scale.set(s, s * LABEL_ASPECT, 1);
        countLabel.sprite.position.x = player.x;
        countLabel.sprite.material.opacity =
          count === 'GO' ? Math.max(0, 1 - countT / T.INTRO_GO_SEC) : 1;
      }

      // Timing grade beside the runner: pops, rises, fades.
      gradeT += realDt;
      for (const g of gradeLabels) g.sprite.visible = g === gradeShown && gradeT < T.GRADE_SEC;
      if (gradeShown && gradeT < T.GRADE_SEC) {
        const k = gradeT / T.GRADE_SEC;
        const pop = reduceMotion ? 1 : 1 + 0.35 * Math.max(0, 1 - gradeT / 0.12);
        const s = T.GRADE_WIDTH * pop;
        gradeShown.sprite.scale.set(s, s * LABEL_ASPECT, 1);
        gradeShown.sprite.position.set(
          player.x + gradeSide * T.GRADE_POS.side,
          T.GRADE_POS.y + (reduceMotion ? 0 : T.GRADE_RISE * k),
          T.GRADE_POS.z,
        );
        gradeShown.sprite.material.opacity = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
      }

      // Combo counter on the floor behind the runner; it pops when it grows.
      const combo = phase === 'running' || phase === 'paused' ? comboLabel(streak) : null;
      if (combo !== comboShown) {
        if (combo) {
          comboChip.draw({
            text: combo,
            color: streak >= 10 ? T.MOVE_COLOR.armsUp : T.MOVE_COLOR.squat,
          });
          comboChangedT = 0;
        }
        comboShown = combo;
      }
      comboChip.sprite.visible = combo !== null;
      comboChangedT += realDt;
      const cs =
        T.COMBO_WIDTH * (1 + (reduceMotion ? 0 : 0.25 * Math.max(0, 1 - comboChangedT / 0.2)));
      comboChip.sprite.scale.set(cs, cs * LABEL_ASPECT, 1);
      comboChip.sprite.position.x = player.x;

      // The finale stretch: a banner, a flash, and (in createGame) the music pushes on.
      if (!finaleSeen && phase === 'running' && elapsed >= durationSec - T.FINALE_SEC) {
        finaleSeen = true;
        showMilestone({ text: 'FINAL STRETCH', color: T.ZONE_LOOK.finale.accentA });
        stage.milestone();
      }
      // Milestone banner in the sky band, above every obstacle.
      milestoneT += realDt;
      milestoneLabel.sprite.visible = milestoneT < T.MILESTONE_SEC;
      if (milestoneLabel.sprite.visible) {
        const k = reduceMotion ? 1 : Math.min(1, milestoneT / 0.2);
        const pop = 1 - (1 - k) ** 3;
        const s = T.MILESTONE_WIDTH * (0.6 + 0.4 * pop);
        milestoneLabel.sprite.scale.set(s, s * LABEL_ASPECT, 1);
        const fade = milestoneT / T.MILESTONE_SEC;
        milestoneLabel.sprite.material.opacity = fade < 0.7 ? 1 : 1 - (fade - 0.7) / 0.3;
      }

      stage.update({
        distance,
        playerX: player.x,
        dt: visDt,
        realDt,
        speed: phase === 'finished' ? coastSpeed : track.speedAt(elapsed),
        fever: phase === 'finished' ? 0 : feverTier(streak),
        dim: phase === 'paused',
        intro: reduceMotion || intro < 0 ? 1 : flyProgress(intro),
      });
      if (!compiled) {
        compiled = true; // first frame: before any object reaches the runner
        stage.precompile();
      }
      stage.render();
    },
    engage(item) {
      views.get(item)?.engage(item.spawn.kind === 'orb' ? handFor(item) : undefined);
    },
    verdict(item, v, grade) {
      const view = views.get(item);
      view?.setVerdict(v);
      if (grade) {
        gradeShown = gradeLabels.find((g) => g.grade === grade) ?? null;
        gradeT = 0;
        gradeSide = player.x > 0.1 ? -1 : 1; // toward the middle of the track
      }
      if (v === 'cleared' || v === 'collected') {
        view?.engage(item.spawn.kind === 'orb' ? handFor(item) : undefined);
        obstacles.burst(player.x, item.spawn.requires);
      } else if (v === 'hit') {
        gradeT = Infinity; // a miss hides the last grade at once
        player.flashHit();
        stage.shake();
        obstacles.burst(player.x, 'hit');
      }
    },
    milestone(n) {
      showMilestone({
        text: `${n} COMBO!`,
        color: n >= 20 ? T.MOVE_COLOR.armsUp : n >= 10 ? T.MOVE_COLOR.sidestep : T.COLOR_LIME,
      });
      stage.milestone();
      for (const move of ['jump', 'armsUp', 'sidestep'] as const) obstacles.burst(player.x, move);
    },
    showGhostOutcome(outcome) {
      if (bannerT >= 0) return;
      banner.draw(OUTCOME_LABEL[outcome]);
      banner.sprite.visible = true;
      bannerT = 0; // the next frame pops it in from nothing
    },
    setQuality(q) {
      stage.setQuality(q);
    },
    dispose() {
      obstacles.dispose();
      stage.dispose(); // also frees the labels and the trail motes, which live in its scene
    },
  };
}

/**
 * The checkered finish arch, placed where the runner is when the clock hits durationSec.
 * After the finish the world coasts on and the arch passes the camera; its
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

/** Canvas height over width of a label (1024 x 192, 512 x 96). */
const LABEL_ASPECT = 3 / 16;

/**
 * A text badge as a sprite (the live race chip, the end banner): a canvas redrawn only when the
 * text changes, always on top, no fog. Built hidden with the scene, so its shader is compiled
 * before the round (Stage.precompile) instead of stalling the frame it first shows.
 */
function createLabel(
  scene: THREE.Scene,
  width: number,
  canvasWidth: number,
  pos: { x: number; y: number; z: number },
  renderOrder: number,
  /** No plate: big text with a dark outline (the countdown, the timing grades). */
  plain = false,
): { sprite: THREE.Sprite; draw(label: { text: string; color: number }): void } {
  const c = document.createElement('canvas');
  c.width = canvasWidth;
  c.height = Math.round(canvasWidth * LABEL_ASPECT);
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }),
  );
  sprite.renderOrder = renderOrder;
  sprite.position.set(pos.x, pos.y, pos.z);
  sprite.scale.set(width, width * LABEL_ASPECT, 1);
  sprite.visible = false;
  scene.add(sprite);
  return {
    sprite,
    draw({ text, color }) {
      const hex = `#${color.toString(16).padStart(6, '0')}`;
      const h = c.height;
      const line = Math.round(h * 0.045);
      g.clearRect(0, 0, c.width, h);
      if (plain) {
        g.font = `italic 800 ${Math.round(h * 0.8)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = h * 0.12;
        g.strokeStyle = 'rgba(7, 9, 13, 0.85)';
        g.strokeText(text, c.width / 2, h / 2 + h * 0.04);
        g.fillStyle = hex;
        g.fillText(text, c.width / 2, h / 2 + h * 0.04);
        tex.needsUpdate = true;
        return;
      }
      g.fillStyle = 'rgba(7, 9, 13, 0.75)';
      g.strokeStyle = hex;
      g.lineWidth = line;
      g.beginPath();
      g.roundRect(line, line, c.width - 2 * line, h - 2 * line, h * 0.22);
      g.fill();
      g.stroke();
      g.fillStyle = hex;
      g.font = `italic 800 ${Math.round(h * 0.56)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, c.width / 2, h / 2 + h * 0.03);
      tex.needsUpdate = true;
    },
  };
}
