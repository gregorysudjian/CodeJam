import * as THREE from 'three';
import type { InputState } from '@/contracts';
import { neon } from './scene';
import * as T from './tuning';

/**
 * The runner: a capsule body, a head and two arms that visibly go up with the player's
 * arms, so the person in front of the webcam sees the game understood them.
 * The camera looks at the runner's back, so the player's left is screen left.
 */
export interface Player {
  readonly root: THREE.Group;
  readonly x: number;
  /** World position of each hand, for orb collect effects. */
  handPosition(side: 'left' | 'right', out: THREE.Vector3): THREE.Vector3;
  /** `moving`: the world is scrolling, so the runner jogs. */
  update(dt: number, state: InputState, moving: boolean): void;
  flashHit(): void;
}

const lerpRate = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

export function createPlayer(): Player {
  const R = T.PLAYER_RADIUS;
  const L = T.PLAYER_BODY_LENGTH;
  const root = new THREE.Group();
  const body = new THREE.Group(); // pivot at the feet, squashed when crouching
  root.add(body);

  const suitMat = new THREE.MeshStandardMaterial({
    color: 0xd9e1ec,
    roughness: 0.35,
    metalness: 0.15,
    emissive: new THREE.Color(T.COLOR_HIT),
    emissiveIntensity: 0,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.5, metalness: 0.4 });
  const limeMat = new THREE.MeshBasicMaterial({ color: neon(T.COLOR_LIME) });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(R, L, 6, 18), suitMat);
  torso.position.y = R + L / 2;
  body.add(torso);

  const headY = 2 * R + L + 0.26;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 14), suitMat);
  head.position.y = headY;
  body.add(head);
  // Visor band wraps the head; the lime strip shows from behind.
  const visor = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.045, 8, 28), limeMat);
  visor.rotation.x = Math.PI / 2;
  visor.position.y = headY + 0.02;
  body.add(visor);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(R + 0.01, 0.04, 8, 28), limeMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = R + 0.12;
  body.add(belt);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.16), darkMat);
  pack.position.set(0, R + L * 0.75, R * 0.95);
  body.add(pack);
  const packLight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.02), limeMat);
  packLight.position.set(0, R + L * 0.75, R * 0.95 + 0.09);
  body.add(packLight);

  const armGeo = new THREE.CapsuleGeometry(0.085, 0.5, 4, 10);
  const handGeo = new THREE.SphereGeometry(0.11, 12, 10);
  const shoulderY = R + L * 0.95;
  const makeArm = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (R + 0.06), shoulderY, 0);
    const arm = new THREE.Mesh(armGeo, suitMat);
    arm.position.y = -0.33;
    const hand = new THREE.Mesh(handGeo, limeMat);
    hand.position.y = -0.66;
    pivot.add(arm, hand);
    body.add(pivot);
    return { pivot, hand };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // Ground ring and soft shadow stay on the floor while the body jumps.
  const ground = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.64, 40),
    new THREE.MeshBasicMaterial({ color: neon(T.COLOR_LIME, T.NEON_BOOST * 0.7), transparent: true, opacity: 0.9 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  ground.add(shadow, ring);
  root.add(ground);

  let x = 0;
  let wasAirborne = false;
  let jumpT = Infinity;
  let crouch = 1;
  let armUpL = 0;
  let armUpR = 0;
  let runPhase = 0;
  let hitT = Infinity;

  return {
    root,
    get x() {
      return x;
    },
    handPosition(side, out) {
      return (side === 'left' ? armL : armR).hand.getWorldPosition(out);
    },
    flashHit() {
      hitT = 0;
    },
    update(dt, s, moving) {
      // Lane slide with a lean into the move.
      const targetX = s.lane * T.LANE_WIDTH;
      const dx = targetX - x;
      x += dx * lerpRate(T.LANE_SLIDE_RATE, dt);
      root.position.x = x;
      body.rotation.z = THREE.MathUtils.clamp(-dx * 0.12, -0.35, 0.35);

      // Jump arc starts on the airborne rising edge.
      if (s.airborne && !wasAirborne) jumpT = 0;
      wasAirborne = s.airborne;
      jumpT += dt;
      const p = jumpT / T.JUMP_VISUAL_SEC;
      const jumpY = p < 1 ? T.JUMP_HEIGHT * 4 * p * (1 - p) : 0;

      // Crouch squashes the body down from the feet.
      crouch += ((s.ducking ? T.CROUCH_SCALE : 1) - crouch) * lerpRate(T.CROUCH_RATE, dt);
      const squash = 1 + (1 - crouch) * 0.35;
      body.scale.set(squash, crouch, squash);

      // Running bob and arm swing while grounded.
      const running = moving && jumpY === 0 && dt > 0;
      if (running) runPhase += dt * T.RUN_BOB_HZ * Math.PI * 2;
      const bob = running ? Math.abs(Math.sin(runPhase)) * T.RUN_BOB_HEIGHT : 0;
      body.position.y = jumpY + bob;

      armUpL += ((s.leftArmUp ? 1 : 0) - armUpL) * lerpRate(T.ARM_RATE, dt);
      armUpR += ((s.rightArmUp ? 1 : 0) - armUpR) * lerpRate(T.ARM_RATE, dt);
      const swing = running ? Math.sin(runPhase) * 0.45 : 0;
      const down = 0.18;
      const up = Math.PI - 0.22;
      armL.pivot.rotation.z = -THREE.MathUtils.lerp(down, up, armUpL);
      armR.pivot.rotation.z = THREE.MathUtils.lerp(down, up, armUpR);
      armL.pivot.rotation.x = swing * (1 - armUpL);
      armR.pivot.rotation.x = -swing * (1 - armUpR);

      const lift = Math.min(1, jumpY / T.JUMP_HEIGHT);
      shadow.scale.setScalar(1 - lift * 0.5);
      ring.scale.setScalar(1 + lift * 0.3);

      hitT += dt;
      suitMat.emissiveIntensity = hitT < T.HIT_FLASH_SEC ? 1.4 * (1 - hitT / T.HIT_FLASH_SEC) : 0;
    },
  };
}
