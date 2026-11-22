import * as THREE from 'three';
import type { InputState, Level } from '@/contracts';
import { feverTier, holdFeedback, type HoldFeedback, type Item } from './core';
import { comboLabel, GRADE_LABEL, type Grade } from './feedback';
import { OUTCOME_LABEL, raceLabel, racePulse, type GhostOutcome, type GhostPose } from './ghost';
import { countdownAt, flyProgress, resumeCountAt } from './intro';
import { requirementMet, type Verdict } from './judge';
import { backdropFor } from './backdrop';
import { colorKeyFor, createObstacles, variantFor, type ObstacleView } from './obstacles';
import { createPlayer } from './player';
import type { Quality } from './quality';
import { createStage, neon } from './scene';
import * as LK from './look';
import {
  endBannerBox,
  LABEL_ASPECT,
  milestoneBox,
  raceBox,
  toCameraSpace,
  type CameraSpot,
  type PixelBox,
} from './overlay';
import { createTrack } from './timeline';
import { planTrail } from './trail';
import * as T from './tuning';
import { createVideoBackdrop } from './videoBackdrop';
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
  /** Seconds left of the 3-2-1 before a resume (core.resumingIn), or null. */
  resumeIn: number | null;
  /** The last life went (core.outOfLives): the ending, with phase 'finished'. */
  outOfLives: boolean;
  /** Game seconds of grace left after a lost life (core.graceLeft), else 0. */
  grace: number;
  /** The level the round is in (core.stageIndex), 0 before the first 'stage'. */
  stage: number;
  /** The ghost runner's pose at this moment, or null when there is no ghost to race. */
  ghost: GhostPose | null;
  /** The player's live lead over the ghost (cleared + collected), or null: no chip. */
  race: number | null;
}

export interface GameView {
  /**
   * This frame's polled input, given before the rules run: engage and verdict fire during the
   * rules, so the hand an orb flies to (and anything else that reads the player's move) uses
   * the move just made, not the previous frame's.
   */
  setInput(state: InputState): void;
  frame(f: FrameInfo): void;
  engage(item: Item): void;
  /** `grade`: the timing grade of a clear or collect (feedback.ts), null for a hit or miss. */
  verdict(item: Item, v: Verdict, grade: Grade | null): void;
  /** The combo reached a milestone (5, 10, 20, then every 10). */
  milestone(streak: number): void;
  /** A hit cost a life ('lifeLost'): flash the canvas red. */
  lifeLost(livesLeft: number): void;
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
  const track = createTrack(level.waves, durationSec, level.stages);
  const stage = createStage(canvas, planZones(durationSec, track.distanceAt, level.stages));
  const player = createPlayer();
  stage.scene.add(player.root);
  const obstacles = createObstacles(stage.scene);
  const finish = createFinishGate();
  stage.scene.add(finish.group);
  const finishDistance = track.distanceAt(durationSec);

  const views = new Map<Item, ObstacleView>();
  // The level an object belongs to (its obstacle skin), in a round of levels; else none.
  const stageList = level.stages ?? [];
  const levelAt = (t: number): number | undefined => {
    if (stageList.length < 2) return undefined;
    let index = stageList[0]!.index;
    for (const s of stageList) if (s.startSec <= t) index = s.index;
    return index;
  };
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
    const l = createLabel(stage.scene, LK.GRADE_WIDTH, 512, { x: 0, y: 0, z: 0 }, 1002, true);
    l.draw(GRADE_LABEL[g]);
    return { grade: g, ...l };
  });
  let gradeT = Infinity; // seconds since the last grade popped
  let gradeShown: (typeof gradeLabels)[number] | null = null;
  let gradeSide = 1;
  const comboChip = createLabel(
    stage.scene,
    LK.COMBO_WIDTH,
    512,
    { x: 0, y: T.COMBO_POS.y, z: T.COMBO_POS.z },
    998,
  );
  let comboShown: string | null = null;
  let comboChangedT = Infinity;
  const milestoneLabel = createLabel(stage.scene, T.MILESTONE_WIDTH, 1024, T.MILESTONE_POS, 997);
  let milestoneT = Infinity;
  // Screen-space labels (overlay.ts): GameHud is laid out in CSS pixels (its move cue sits in
  // the top band at every size), so these are placed in pixels too, on the camera: the race
  // chip bottom right, milestone and FINAL STRETCH banners bottom centre under the combo.
  stage.camera.add(raceChip.sprite, milestoneLabel.sprite, banner.sprite);
  const spot: CameraSpot = { x: 0, y: 0, z: 0, height: 0 };
  const box: PixelBox = { cx: 0, cy: 0, h: 0 };
  /** Puts a label where `layout` (overlay.ts: milestoneBox, raceBox) says, in CSS pixels. */
  const placeOnScreen = (
    sprite: THREE.Sprite,
    layout: (w: number, h: number, k: number, out: PixelBox) => PixelBox,
    k: number,
  ): void => {
    const W = Math.max(1, canvas.clientWidth);
    const H = Math.max(1, canvas.clientHeight);
    toCameraSpace(layout(W, H, k, box), W, H, stage.camera.fov, LK.OVERLAY_DEPTH, spot);
    sprite.position.set(spot.x, spot.y, spot.z);
    sprite.scale.set(spot.height / LABEL_ASPECT, spot.height, 1);
  };
  // "YOUR BEST" on the floor behind the ghost, like the player's combo counter.
  const ghostTag = createLabel(
    stage.scene,
    LK.GHOST_TAG_WIDTH,
    512,
    { x: 0, y: LK.GHOST_TAG.y, z: LK.GHOST_TAG.z },
    996,
  );
  ghostTag.draw({ text: 'YOUR BEST', color: LK.GHOST_ACCENT });
  const showMilestone = (label: { text: string; color: number }): void => {
    milestoneLabel.draw(label);
    milestoneT = 0;
  };
  let finaleSeen = false;
  let countT = 0;
  const lifeFlash = createScreenFlash(
    stage.camera,
    T.COLOR_HIT,
    reduceMotion ? LK.LIFE_FLASH.reducedPeak : LK.LIFE_FLASH.peak,
    LK.LIFE_FLASH.sec,
  );
  // Levels: a portal at each boundary after the first, a white flash and the milestone
  // shockwave as the runner passes through, and "LEVEL n" big in the middle (look.ts PORTAL).
  const boundaries = (level.stages ?? []).slice(1).map((s) => ({
    d: track.distanceAt(s.startSec),
    veil: backdropFor(s.index).look.horizon,
  }));
  const portal = createPortal();
  stage.scene.add(portal.group);
  let passed = 0; // boundaries the runner has passed through
  const portalFlash = createScreenFlash(
    stage.camera,
    0xffffff,
    reduceMotion ? LK.PORTAL.reducedFlash : LK.PORTAL.flash,
    LK.PORTAL.flashSec,
  );
  const levelLabel = createLabel(stage.scene, T.BANNER_WIDTH, 1024, T.BANNER_POS, 1000);
  stage.camera.add(levelLabel.sprite);
  let levelShown = 0;
  let levelT = Infinity; // seconds since "LEVEL n" appeared (< 0: waits for the intro's GO)
  let outroT = 0; // seconds since the finish
  // Each level's Montreal clip as the sky (videoBackdrop.ts), switched as the runner passes
  // through a portal (under its white flash); none at quality 2 ("Low graphics").
  const videoBackdrop = createVideoBackdrop();
  let quality: Quality = 0;

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
  let lastState: InputState | null = null; // this frame's input (setInput)
  // After the finish the world coasts to a stop instead of freezing.
  let coast = 0;
  let coastSpeed = track.speedAt(durationSec);
  let finishedSeen = false;

  /**
   * Drawn length of a held beam or crate. Its front is drawn `lead` early (latency compensation),
   * but its back end passes the runner at t + holdSec, when the judge decides the hold: letting go
   * as the object ends is always in time, and the clear comes as the end passes. Drawn `lead`
   * early as well, a release on sight had only the detector's release lag as slack, which
   * recorded clips put as low as 0.10 s for both arms; now it has the 0.3 s grace on top.
   */
  const lengthOf = (item: Item, lead: number): number => {
    const hold = item.spawn.holdSec ?? 0;
    const t = item.wave.t;
    return hold > 0 ? track.distanceAt(t + hold + lead) - track.distanceAt(t) : 0;
  };
  const lengths = new Map<Item, number>(); // fixed when the object comes into view
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
    frame(f) {
      const { elapsed, visDt, realDt, state, phase, streak, intro, resumeIn, ghost, race } = f;
      const { outOfLives, grace } = f;
      lastState = state;
      clock += visDt;
      if (phase === 'finished') {
        if (!finishedSeen) {
          finishedSeen = true;
          if (outOfLives) {
            // The last life went: the world stops short where it happened, no celebration.
            coastSpeed = track.speedAt(elapsed);
            banner.draw({ text: 'OUT OF LIVES', color: T.COLOR_HIT });
            banner.sprite.visible = true;
            bannerT = 0;
          } else {
            for (const move of ['jump', 'armsUp', 'sidestep'] as const)
              obstacles.burst(player.x, move);
          }
        }
        coast += coastSpeed * visDt;
        coastSpeed *= Math.exp(-T.COAST_DECAY * (outOfLives ? LK.OUT_STOP : 1) * visDt);
      }
      // A lost life: a red flash over the scene, then the runner flickers through the grace.
      lifeFlash.update(realDt);
      player.root.visible =
        reduceMotion || grace <= 0 || phase !== 'running'
          ? true
          : Math.sin(clock * Math.PI * 2 * LK.GRACE_BLINK_HZ) > -0.5;
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
        const length = lengthOf(item, lead[item.spawn.requires]);
        lengths.set(item, length);
        view.show(
          item.spawn,
          length,
          variantFor(item.wave.t, item.spawn.kind),
          levelAt(item.wave.t),
        );
        if (item.judge.verdict !== 'pending') view.setVerdict(item.judge.verdict);
        views.set(item, view);
      }
      for (const [item, view] of views) {
        const z = ahead(lead[item.spawn.requires]) - track.distanceAt(item.wave.t);
        view.root.position.z = z;
        view.tick(visDt, clock);
        if (z - (lengths.get(item) ?? 0) > T.DESPAWN_BEHIND && item.judge.verdict !== 'pending') {
          obstacles.release(view);
          views.delete(item);
          lengths.delete(item);
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

      // The portal: the one just passed while it fades behind the runner, else the next one.
      while (passed < boundaries.length && distance >= boundaries[passed]!.d) {
        passed++;
        portalFlash.flash();
        stage.milestone();
      }
      const behind = boundaries[passed - 1];
      const shown = behind && distance - behind.d < T.FINISH_FADE_END ? behind : boundaries[passed];
      if (shown) {
        const z = distance - shown.d;
        const k = (T.FINISH_FADE_END - z) / (T.FINISH_FADE_END - T.FINISH_FADE_START);
        const portalFade = Math.min(1, Math.max(0, k));
        portal.set(z, shown.veil, portalFade);
        portal.group.visible = -z < T.VIEW_DISTANCE && portalFade > 0.01;
      } else portal.group.visible = false;
      portalFlash.update(realDt);
      stage.setBackdrop(
        videoBackdrop.update(
          level.stages?.[passed]?.index ?? 1,
          phase === 'intro' || phase === 'running' || phase === 'finished', // still while paused
          quality < 2,
        ),
      );

      // "LEVEL n" in the middle as each level starts (level 1 once the intro's GO has gone).
      if (f.stage > levelShown) {
        levelShown = f.stage;
        levelLabel.draw({ text: `LEVEL ${f.stage}`, color: T.COLOR_LIME });
        levelT = f.stage === 1 ? -T.INTRO_GO_SEC : 0;
      }
      levelT += realDt;
      levelLabel.sprite.visible =
        phase !== 'finished' && levelT >= 0 && levelT < LK.LEVEL_LABEL_SEC;
      if (levelLabel.sprite.visible) {
        const k = reduceMotion ? 1 : Math.min(1, levelT / T.BANNER_POP_SEC);
        placeOnScreen(levelLabel.sprite, endBannerBox, 1 - (1 - k) ** 3);
        const u = levelT / LK.LEVEL_LABEL_SEC;
        levelLabel.sprite.material.opacity = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      }

      obstacles.tick(visDt);
      const runSpeed =
        phase === 'running'
          ? track.speedAt(elapsed)
          : phase === 'finished' && coastSpeed > 1
            ? coastSpeed
            : 0;
      player.update(visDt, state, runSpeed, phase === 'finished' && !outOfLives);

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
      if (raceChip.sprite.visible) {
        // Bottom right, clear of GameHud's plates, move cue and camera preview.
        const pop = 1 + (reduceMotion ? 0 : racePulse(raceChangedT));
        placeOnScreen(raceChip.sprite, raceBox, pop);
      }
      if (bannerT >= 0) {
        bannerT += realDt;
        const k = reduceMotion ? 1 : Math.min(1, bannerT / T.BANNER_POP_SEC);
        placeOnScreen(banner.sprite, endBannerBox, 1 - (1 - k) ** 3); // ease out
      }
      // Outro: seconds since the finish, for the camera's swing toward the celebrating runner.
      if (phase === 'finished' && !outOfLives) outroT += realDt; // no swing after OUT OF LIVES
      const outroK = reduceMotion ? 0 : Math.min(1, outroT / LK.OUTRO_SEC);
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
      // The tag shows while the ghost is in another lane (in the player's lane it wraps the
      // player, and the tag would read as the player's).
      ghostTag.sprite.visible =
        ghostRunner !== null && ghost !== null && Math.abs(ghostRunner.x - player.x) > 1;
      if (ghostRunner) ghostTag.sprite.position.x = ghostRunner.x;

      // The countdown number over the runner: the intro's 3, 2, 1, GO, or the 3-2-1 before a
      // resume (the same label and pop; bigger, since the chase camera is further away).
      const resumeCount = resumeCountAt(resumeIn);
      const count = resumeCount ?? countdownAt(intro);
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
        const big = resumeCount ? LK.RESUME_COUNT.scale : 1;
        const s = T.COUNT_WIDTH * big * (1.6 - 0.6 * (1 - (1 - k) ** 3));
        countLabel.sprite.scale.set(s, s * LABEL_ASPECT, 1);
        countLabel.sprite.position.x = player.x;
        countLabel.sprite.position.y = resumeCount ? LK.RESUME_COUNT.y : T.COUNT_POS.y;
        countLabel.sprite.material.opacity =
          count === 'GO' ? Math.max(0, 1 - countT / T.INTRO_GO_SEC) : 1;
      }

      // Timing grade beside the runner: pops, rises, fades.
      gradeT += realDt;
      for (const g of gradeLabels) g.sprite.visible = g === gradeShown && gradeT < T.GRADE_SEC;
      if (gradeShown && gradeT < T.GRADE_SEC) {
        const k = gradeT / T.GRADE_SEC;
        const pop = reduceMotion ? 1 : 1 + 0.35 * Math.max(0, 1 - gradeT / 0.12);
        const s = LK.GRADE_WIDTH * pop;
        gradeShown.sprite.scale.set(s, s * LABEL_ASPECT, 1);
        gradeShown.sprite.position.set(
          player.x + gradeSide * LK.GRADE_SIDE,
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
      // While a milestone banner says "10 COMBO!" the counter steps aside instead of repeating it.
      comboChip.sprite.visible = combo !== null && milestoneT >= T.MILESTONE_SEC;
      comboChangedT += realDt;
      const cs =
        LK.COMBO_WIDTH * (1 + (reduceMotion ? 0 : 0.25 * Math.max(0, 1 - comboChangedT / 0.2)));
      comboChip.sprite.scale.set(cs, cs * LABEL_ASPECT, 1);
      comboChip.sprite.position.x = player.x;

      // The finale stretch: a banner, a flash, and (in createGame) the music pushes on.
      if (!finaleSeen && phase === 'running' && elapsed >= durationSec - T.FINALE_SEC) {
        finaleSeen = true;
        showMilestone({ text: 'FINAL STRETCH', color: T.ZONE_LOOK.finale.accentA });
        stage.milestone();
      }
      // Milestone banner bottom centre, under the combo counter (overlay.ts milestoneBox).
      milestoneT += realDt;
      milestoneLabel.sprite.visible = milestoneT < T.MILESTONE_SEC;
      if (milestoneLabel.sprite.visible) {
        const k = reduceMotion ? 1 : Math.min(1, milestoneT / 0.2);
        placeOnScreen(milestoneLabel.sprite, milestoneBox, 1 - (1 - k) ** 3);
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
        dim: phase === 'paused' && resumeIn === null, // the countdown shows the scene undimmed
        intro: reduceMotion || intro < 0 ? 1 : flyProgress(intro),
        outro: outroK * outroK * outroK * (outroK * (outroK * 6 - 15) + 10), // smootherstep
      });
      if (!compiled) {
        compiled = true; // first frame: before any object reaches the runner
        stage.precompile();
      }
      stage.render();
    },
    setInput(state) {
      lastState = state;
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
      // One ring: three at once added up to a white glare over the runner.
      obstacles.burst(player.x, 'jump');
    },
    lifeLost() {
      lifeFlash.flash();
    },
    showGhostOutcome(outcome) {
      if (bannerT >= 0) return;
      banner.draw(OUTCOME_LABEL[outcome]);
      banner.sprite.visible = true;
      bannerT = 0; // the next frame pops it in from nothing
    },
    setQuality(q) {
      quality = q;
      stage.setQuality(q);
      obstacles.setLowGraphics(q >= 2); // Low graphics: neon obstacles (package B)
    },
    dispose() {
      videoBackdrop.dispose();
      obstacles.dispose();
      stage.dispose(); // also frees the labels and the trail motes, which live in its scene
    },
  };
}

/**
 * The portal between two levels: a neon ring standing on the track, wide enough for every lane,
 * with a faint veil inside in the next level's horizon colour. One mesh, moved to the next
 * boundary each time the runner passes through one. Fades out as it passes the runner, like the
 * finish arch, so it never sweeps across the camera.
 */
function createPortal(): { group: THREE.Group; set(z: number, veil: number, fade: number): void } {
  const group = new THREE.Group();
  const r = (3 * T.LANE_WIDTH) / 2 + LK.PORTAL.margin;
  const ringMat = new THREE.MeshBasicMaterial({
    color: neon(LK.PORTAL.color, T.NEON_BOOST * LK.PORTAL.glow),
    transparent: true,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, LK.PORTAL.tube, 10, 64), ringMat);
  ring.position.y = r * LK.PORTAL.lift;
  const veilMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: LK.PORTAL.veil,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const veil = new THREE.Mesh(new THREE.CircleGeometry(r, 48), veilMat);
  veil.position.y = ring.position.y;
  group.add(ring, veil);
  group.visible = false;
  return {
    group,
    set(z, veilColor, fade) {
      group.position.z = z;
      veilMat.color.set(veilColor);
      veilMat.opacity = LK.PORTAL.veil * fade;
      ringMat.opacity = fade;
      ringMat.depthWrite = fade >= 1;
    },
  };
}

/**
 * A full-screen colour flash (a lost life): a plane on the camera, just in front of the labels'
 * depth, sized to cover the view, fading out over `sec`. Built hidden with the scene.
 */
function createScreenFlash(
  camera: THREE.PerspectiveCamera,
  color: number,
  peak: number,
  sec: number,
): { flash(): void; update(realDt: number): void } {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  const depth = LK.OVERLAY_DEPTH * 0.95;
  mesh.position.z = -depth;
  mesh.renderOrder = 990; // over the scene, under the labels
  mesh.visible = false;
  camera.add(mesh);
  let t = Infinity;
  return {
    flash() {
      t = 0;
    },
    update(realDt) {
      t += realDt;
      const k = t / sec;
      mesh.visible = k < 1;
      if (!mesh.visible) return;
      const h = 2 * depth * Math.tan((camera.fov * Math.PI) / 360) * 1.1;
      mesh.scale.set(h * Math.max(1, camera.aspect), h, 1);
      mat.opacity = peak * (1 - k) ** 2;
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
    color: neon(0xffffff, T.NEON_BOOST * LK.FINISH_GLOW),
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
