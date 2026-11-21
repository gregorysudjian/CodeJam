import * as THREE from 'three';
import type { InputState } from '@/contracts';
import { jumpHeight, leanFor, newPose, runnerPose, strideHz, type PoseInput } from './runnerPose';
import { neon } from './scene';
import * as T from './tuning';

/**
 * The runner: a jointed figure (hips, spine, head, arms with elbows, legs with knees) that
 * mirrors the player. It runs with a real stride, jumps on an arc and squashes on landing,
 * squats (standing still) or slides (running) on a duck, leans into lane changes and raises
 * each arm with the player's. The angles come from runnerPose.ts (pure, tested).
 * The camera looks at the runner's back, so the player's left is screen left.
 */
export interface Player {
  readonly root: THREE.Group;
  readonly x: number;
  /**
   * Hold feedback (core.holdFeedback): a light column around the runner. 'prompt' pulses
   * softly in the move's colour, 'ok' glows steadily in it, 'warn' pulses red; null hides it.
   */
  setAura(aura: { color: number; mode: 'prompt' | 'ok' | 'warn' } | null): void;
  /** World position of each hand, for orb collect effects. */
  handPosition(side: 'left' | 'right', out: THREE.Vector3): THREE.Vector3;
  /**
   * `speed`: how fast the world scrolls (units per second); 0 = standing still.
   * `celebrate`: the round is over; both arms go up and the runner hops.
   */
  update(dt: number, state: InputState, speed: number, celebrate?: boolean): void;
  /** Red flash plus a stumble: a backward jolt and a short wobble. */
  flashHit(): void;
}

const lerpRate = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/**
 * `ghost`: the ghost runner's look (ghost.ts). See-through light cyan glass with cyan accents
 * instead of lime, so it never reads as the player; slightly larger, so in the same lane it
 * wraps the player as a shell; no shadow, aura, hit flash or move pop.
 */
export function createPlayer(opts: { ghost?: boolean } = {}): Player {
  const ghost = opts.ghost ?? false;
  const R = T.RIG;
  const root = new THREE.Group();
  const body = new THREE.Group(); // pivot at the feet: jump height, squash, lean, stumble
  root.add(body);
  if (ghost) body.scale.setScalar(T.GHOST_SCALE);

  const glass = (): Partial<THREE.MeshStandardMaterialParameters> =>
    ghost ? { transparent: true, opacity: T.GHOST_OPACITY, depthWrite: false } : {};
  const suitMat = new THREE.MeshStandardMaterial({
    color: ghost ? T.GHOST_COLOR : 0xd9e1ec,
    roughness: 0.35,
    metalness: 0.15,
    emissive: new THREE.Color(ghost ? T.GHOST_COLOR : T.COLOR_HIT),
    emissiveIntensity: ghost ? 0.25 : 0,
    ...glass(),
  });
  const darkMat = ghost
    ? suitMat
    : new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.5, metalness: 0.4 });
  const limeMat = new THREE.MeshBasicMaterial({
    color: neon(ghost ? T.GHOST_ACCENT : T.COLOR_LIME),
    ...(ghost ? { transparent: true, opacity: T.GHOST_ACCENT_OPACITY, depthWrite: false } : {}),
  });
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, y = 0): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    return m;
  };
  const joint = (parent: THREE.Object3D, x: number, y: number, z = 0): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  /* Pelvis, the root of the figure; its height comes from the pose. */
  const hips = joint(body, 0, 1);
  const pelvis = mesh(new THREE.SphereGeometry(0.22, 16, 10), darkMat, -0.02);
  pelvis.scale.set(1.15, 0.75, 0.9);
  const belt = mesh(new THREE.TorusGeometry(0.235, 0.035, 8, 28), limeMat, 0.06);
  belt.rotation.x = Math.PI / 2;
  hips.add(pelvis, belt);

  /* Spine: torso, backpack, head. */
  const spine = joint(hips, 0, 0);
  const torso = mesh(new THREE.CapsuleGeometry(0.25, 0.3, 6, 16), suitMat, 0.36);
  torso.scale.set(1.08, 1, 0.82);
  spine.add(torso);
  const pack = mesh(new THREE.BoxGeometry(0.38, 0.42, 0.14), darkMat, 0.4);
  pack.position.z = 0.22;
  const packLight = mesh(new THREE.BoxGeometry(0.06, 0.3, 0.02), limeMat, 0.4);
  packLight.position.z = 0.3;
  spine.add(pack, packLight);
  const neck = joint(spine, 0, R.torso + R.neck);
  const head = mesh(new THREE.SphereGeometry(R.head, 20, 14), suitMat);
  // The visor band wraps the head; the lime strip shows from behind.
  const visor = mesh(new THREE.TorusGeometry(R.head - 0.005, 0.042, 8, 28), limeMat, 0.02);
  visor.rotation.x = Math.PI / 2;
  neck.add(head, visor);

  /* Arms: shoulder (raise sideways, swing forward), elbow, glowing hand. */
  const upperGeo = new THREE.CapsuleGeometry(0.075, R.upperArm - 0.1, 4, 10);
  const foreGeo = new THREE.CapsuleGeometry(0.065, R.foreArm - 0.1, 4, 10);
  const handGeo = new THREE.SphereGeometry(0.105, 12, 10);
  const makeArm = (side: -1 | 1) => {
    const shoulder = joint(spine, side * R.shoulderSide, R.torso - 0.08);
    shoulder.add(mesh(upperGeo, suitMat, -R.upperArm / 2));
    const elbow = joint(shoulder, 0, -R.upperArm);
    elbow.add(mesh(foreGeo, suitMat, -R.foreArm / 2));
    const hand = mesh(handGeo, limeMat, -R.foreArm - 0.04);
    elbow.add(hand);
    return { shoulder, elbow, hand };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  /* Legs: hip, knee, a shoe with a lime sole. */
  const thighGeo = new THREE.CapsuleGeometry(0.1, R.thigh - 0.16, 4, 10);
  const shinGeo = new THREE.CapsuleGeometry(0.085, R.shin - 0.14, 4, 10);
  const shoeGeo = new THREE.BoxGeometry(0.15, 0.09, 0.3);
  const soleGeo = new THREE.BoxGeometry(0.15, 0.025, 0.3);
  const makeLeg = (side: -1 | 1) => {
    const hip = joint(hips, side * R.hipSide, -R.hipDrop);
    hip.add(mesh(thighGeo, suitMat, -R.thigh / 2));
    const knee = joint(hip, 0, -R.thigh);
    knee.add(mesh(shinGeo, suitMat, -R.shin / 2));
    const ankle = joint(knee, 0, -R.shin);
    const shoe = mesh(shoeGeo, darkMat, -R.foot + 0.045);
    shoe.position.z = -0.06;
    const sole = mesh(soleGeo, limeMat, -R.foot + 0.0125);
    sole.position.z = -0.06;
    ankle.add(shoe, sole);
    return { hip, knee, ankle };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // Ground ring and soft shadow stay on the floor while the body jumps.
  const ground = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: neon(ghost ? T.GHOST_ACCENT : T.COLOR_LIME, T.NEON_BOOST * 0.7),
    transparent: true,
    opacity: ghost ? T.GHOST_ACCENT_OPACITY : 0.9,
    depthWrite: !ghost,
  });
  const ringBase = ringMat.color.clone();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.64, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 32),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  shadow.visible = !ghost;
  ground.add(shadow, ring);
  const auraMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const aura = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.3, 28, 1, true), auraMat);
  aura.position.y = 1.15;
  aura.visible = false;
  ground.add(aura);
  let auraState: { color: number; mode: 'prompt' | 'ok' | 'warn' } | null = null;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let auraClock = 0;
  root.add(ground);

  const pose = newPose();
  const input: PoseInput = {
    phase: 0,
    run: 0,
    air: -1,
    land: Infinity,
    duck: 0,
    slide: 0,
    armL: 0,
    armR: 0,
    idle: 0,
  };
  let x = 0;
  const prev: InputState = {
    tracking: true,
    lane: 0,
    airborne: false,
    ducking: false,
    leftArmUp: false,
    rightArmUp: false,
  };
  let jumpT = Infinity;
  let hitT = Infinity;
  let popT = Infinity; // seconds since a move was detected (ground ring flash)
  let celebrateT = 0;

  return {
    root,
    get x() {
      return x;
    },
    handPosition(side, out) {
      return (side === 'left' ? armL : armR).hand.getWorldPosition(out);
    },
    setAura(a) {
      if (ghost) return;
      if (a && (!auraState || auraState.color !== a.color || auraState.mode !== a.mode)) {
        auraMat.color.set(a.mode === 'warn' ? T.COLOR_HIT : a.color);
      }
      auraState = a;
    },
    flashHit() {
      if (ghost) return;
      hitT = 0;
    },
    update(dt, s, speed, celebrate = false) {
      // A move just started: the ground ring flashes, so the player sees it land.
      if (
        s.lane !== prev.lane ||
        (s.airborne && !prev.airborne) ||
        (s.ducking && !prev.ducking) ||
        (s.leftArmUp && !prev.leftArmUp) ||
        (s.rightArmUp && !prev.rightArmUp)
      )
        popT = 0;
      // Jump arc from the airborne rising edge; the landing squash follows it.
      if (s.airborne && !prev.airborne) jumpT = 0;
      Object.assign(prev, s);

      // Lane slide with a lean into the move.
      const targetX = s.lane * T.LANE_WIDTH;
      const before = x;
      x += (targetX - x) * lerpRate(T.LANE_SLIDE_RATE, dt);
      root.position.x = x;
      const vx = dt > 0 ? (x - before) / dt : 0;
      body.rotation.z = leanFor(vx);

      const wasInAir = input.air >= 0;
      jumpT += dt;
      const p = jumpT / T.JUMP_VISUAL_SEC;
      input.air = p < 1 ? p : -1;
      if (wasInAir && input.air < 0) input.land = 0;
      else input.land += dt;
      const jumpY = jumpHeight(p);

      // Stride from the world speed; standing still blends into a ready stance.
      const running = speed > 0.5 && dt > 0;
      input.run += ((running ? 1 : 0) - input.run) * lerpRate(T.RUN_BLEND_RATE, dt);
      if (input.air < 0) input.phase += dt * strideHz(speed) * Math.PI * 2 * input.run;
      input.idle += dt;
      input.duck += ((s.ducking ? 1 : 0) - input.duck) * lerpRate(T.DUCK_RATE, dt);
      input.slide += ((running ? 1 : 0) - input.slide) * lerpRate(T.SLIDE_RATE, dt);
      input.armL += ((s.leftArmUp || celebrate ? 1 : 0) - input.armL) * lerpRate(T.ARM_RATE, dt);
      input.armR += ((s.rightArmUp || celebrate ? 1 : 0) - input.armR) * lerpRate(T.ARM_RATE, dt);
      runnerPose(input, pose);

      // Celebration hops at the finish.
      celebrateT = celebrate ? celebrateT + dt : 0;
      const hop =
        celebrate && !reduceMotion ? 0.22 * Math.abs(Math.sin(celebrateT * Math.PI * 2)) : 0;

      body.position.y = jumpY + hop;
      body.scale.set(
        (ghost ? T.GHOST_SCALE : 1) * (1 + (1 - pose.squash) * 0.5),
        (ghost ? T.GHOST_SCALE : 1) * pose.squash,
        (ghost ? T.GHOST_SCALE : 1) * (1 + (1 - pose.squash) * 0.5),
      );
      hips.position.y = pose.hipY;
      spine.rotation.x = -pose.spine;
      neck.rotation.x = pose.spine * 0.55; // the head stays level-ish, eyes on the track
      legL.hip.rotation.x = pose.thighL;
      legR.hip.rotation.x = pose.thighR;
      legL.knee.rotation.x = pose.kneeL;
      legR.knee.rotation.x = pose.kneeR;
      legL.ankle.rotation.x = -(pose.thighL + pose.kneeL) * 0.6; // soles stay roughly flat
      legR.ankle.rotation.x = -(pose.thighR + pose.kneeR) * 0.6;
      const down = 0.14;
      const up = Math.PI - 0.22;
      // The spine leans the shoulders; raised arms counter it so they point straight up.
      armL.shoulder.rotation.set(
        pose.shoulderL + pose.spine * pose.raiseL,
        0,
        -THREE.MathUtils.lerp(down, up, pose.raiseL),
      );
      armR.shoulder.rotation.set(
        pose.shoulderR + pose.spine * pose.raiseR,
        0,
        THREE.MathUtils.lerp(down, up, pose.raiseR),
      );
      armL.elbow.rotation.x = pose.elbowL;
      armR.elbow.rotation.x = pose.elbowR;

      const lift = Math.min(1, jumpY / T.JUMP_HEIGHT);
      shadow.scale.setScalar(1 - lift * 0.5);
      popT += dt;
      const pop = ghost || popT >= T.MOVE_POP_SEC ? 0 : 1 - popT / T.MOVE_POP_SEC;
      ring.scale.setScalar(1 + lift * 0.3 + pop * 0.45);
      ringMat.color.copy(ringBase).multiplyScalar(1 + pop * 1.2);

      auraClock += dt;
      // Pulses stay well under 3 flashes a second (WCAG 2.3.1) and are steady with reduced motion.
      const pulse = reduceMotion
        ? 1
        : 0.6 + 0.4 * Math.sin(auraClock * Math.PI * 2 * T.AURA_PULSE_HZ);
      const auraTarget = !auraState
        ? 0
        : auraState.mode === 'ok'
          ? T.AURA_OPACITY
          : auraState.mode === 'prompt'
            ? T.AURA_OPACITY * T.AURA_PROMPT_SCALE * pulse
            : T.AURA_OPACITY * pulse;
      auraMat.opacity += (auraTarget - auraMat.opacity) * lerpRate(20, dt);
      aura.visible = auraMat.opacity > 0.01;
      const crouch = 1 - input.duck * 0.42;
      aura.scale.y = crouch;
      aura.position.y = 1.15 * crouch;

      hitT += dt;
      if (!ghost)
        suitMat.emissiveIntensity = hitT < T.HIT_FLASH_SEC ? 1.4 * (1 - hitT / T.HIT_FLASH_SEC) : 0;
      // Stumble: jolt back, then a damped wobble.
      const st = hitT / T.STUMBLE_SEC;
      body.rotation.x = st < 1 ? 0.45 * Math.sin(st * Math.PI * 3) * (1 - st) : 0;
    },
  };
}
