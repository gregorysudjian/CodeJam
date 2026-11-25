import * as T from './tuning';

/**
 * The runner's animation as numbers: joint angles from what the player is doing. Pure, so it is
 * unit-tested (runnerPose.test.ts); player.ts puts the angles on the meshes.
 *
 * Angles are radians. Limbs hang down from their joint; a positive swing moves them forward
 * (toward the horizon), a negative knee bends the shin back, a positive elbow bends the forearm
 * forward. `spine` > 0 leans the torso forward. `raise` 0 is arm down, 1 straight up (sideways).
 */
export interface RunnerPose {
  hipY: number; // pelvis above the floor, before the jump height
  spine: number;
  thighL: number;
  thighR: number;
  kneeL: number;
  kneeR: number;
  shoulderL: number;
  shoulderR: number;
  elbowL: number;
  elbowR: number;
  raiseL: number;
  raiseR: number;
  squash: number; // vertical scale of the whole body from the feet (landing, take-off)
}

export interface PoseInput {
  phase: number; // run cycle, radians
  run: number; // 0 standing, 1 running
  air: number; // jump progress 0 to 1, or -1 on the ground
  land: number; // seconds since the last landing (Infinity: long ago)
  duck: number; // 0 upright, 1 fully down
  slide: number; // while ducking: 0 squat (standing still), 1 slide (running)
  armL: number; // 0 to 1
  armR: number;
  idle: number; // seconds, for the ready bounce while standing
}

export const newPose = (): RunnerPose => ({
  hipY: 0,
  spine: 0,
  thighL: 0,
  thighR: 0,
  kneeL: 0,
  kneeR: 0,
  shoulderL: 0,
  shoulderR: 0,
  elbowL: 0,
  elbowR: 0,
  raiseL: 0,
  raiseR: 0,
  squash: 1,
});

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const R = T.RIG;

/** Height of the pelvis pivot when this leg's sole touches the floor. */
export function legReach(thigh: number, knee: number): number {
  return R.hipDrop + R.thigh * Math.cos(thigh) + R.shin * Math.cos(thigh + knee) + R.foot;
}

/** Jump height over the visual arc, progress 0 to 1: a parabola peaking at JUMP_HEIGHT. */
export function jumpHeight(p: number): number {
  return p > 0 && p < 1 ? T.JUMP_HEIGHT * 4 * p * (1 - p) : 0;
}

/** Vertical scale while landing: dips to 1 - LAND_SQUASH and recovers over LAND_SEC. */
export function landingSquash(sinceLand: number): number {
  if (!(sinceLand >= 0) || sinceLand >= T.LAND_SEC) return 1;
  return 1 - T.LAND_SQUASH * Math.sin((Math.PI * sinceLand) / T.LAND_SEC);
}

/** Highest point of the body (top of the head) for a pose, ignoring the jump. */
export function topOf(p: RunnerPose): number {
  return (p.hipY + Math.cos(p.spine) * (R.torso + R.neck) + R.head) * p.squash;
}

/** Lowest sole above the floor for a pose, ignoring the jump. */
export function feetOf(p: RunnerPose): number {
  return p.hipY - Math.max(legReach(p.thighL, p.kneeL), legReach(p.thighR, p.kneeR));
}

/**
 * The pose for one frame. Blends, in order: stand → run cycle, → squat or slide (duck), → jump
 * tuck (air), then the landing dip and the arm raises on top. Feet stay planted on the floor:
 * the pelvis height comes from the legs (legReach), except in the air.
 */
export function runnerPose(s: PoseInput, out: RunnerPose): RunnerPose {
  const { phase, run } = s;
  const sin = Math.sin(phase);
  const cos = Math.cos(phase);

  // Standing (a light ready bounce) blended into the run cycle.
  const ready = 0.04 * (1 - run) * (0.5 + 0.5 * Math.sin(s.idle * Math.PI * 2 * 1.1));
  out.thighL = lerp(0.05 + ready, 0.78 * sin, run);
  out.thighR = lerp(0.05 + ready, -0.78 * sin, run);
  out.kneeL = lerp(-0.12 - ready * 2, -(0.3 + 1.25 * Math.max(0, cos)), run); // folds while swinging forward
  out.kneeR = lerp(-0.12 - ready * 2, -(0.3 + 1.25 * Math.max(0, -cos)), run);
  out.shoulderL = lerp(0.05, -0.75 * sin, run); // arms counter-swing the legs
  out.shoulderR = lerp(0.05, 0.75 * sin, run);
  out.elbowL = out.elbowR = lerp(0.35, 1.35, run);
  out.spine = lerp(0.06, 0.24, run);

  // Squat (standing still) or slide (running): low enough for any beam (runnerPose.test.ts).
  const d = clamp01(s.duck);
  if (d > 0) {
    const sl = clamp01(s.slide);
    out.thighL = lerp(out.thighL, lerp(1.55, 1.35, sl), d);
    out.thighR = lerp(out.thighR, lerp(1.55, 0.3, sl), d);
    out.kneeL = lerp(out.kneeL, lerp(-2.3, -0.1, sl), d);
    out.kneeR = lerp(out.kneeR, lerp(-2.3, -2.2, sl), d);
    out.spine = lerp(out.spine, lerp(0.8, -0.7, sl), d); // squat leans in, slide leans back
    out.shoulderL = lerp(out.shoulderL, lerp(1.2, -0.5, sl), d);
    out.shoulderR = lerp(out.shoulderR, lerp(1.2, 0.9, sl), d);
    out.elbowL = lerp(out.elbowL, 0.3, d);
    out.elbowR = lerp(out.elbowR, 0.3, d);
  }

  const planted = Math.max(legReach(out.thighL, out.kneeL), legReach(out.thighR, out.kneeR));
  // The run cycle floats between steps; standing and ducking stay on the floor.
  out.hipY = planted + T.RUN_BOB * run * (1 - d) * Math.abs(cos);

  // Jump: tuck the legs and swing the arms up while airborne. The weight eases in and out so
  // the take-off and touch-down blend with the run instead of snapping.
  out.squash = 1;
  if (s.air >= 0 && s.air < 1) {
    const w = clamp01(Math.min(s.air / 0.12, (1 - s.air) / 0.18));
    out.thighL = lerp(out.thighL, 1.15, w);
    out.thighR = lerp(out.thighR, 0.55, w);
    out.kneeL = lerp(out.kneeL, -1.55, w);
    out.kneeR = lerp(out.kneeR, -1.1, w);
    out.shoulderL = lerp(out.shoulderL, 1.5, w);
    out.shoulderR = lerp(out.shoulderR, 1.5, w);
    out.elbowL = lerp(out.elbowL, 0.5, w);
    out.elbowR = lerp(out.elbowR, 0.5, w);
    out.spine = lerp(out.spine, 0.12, w);
    // Pelvis stays where take-off left it, so the tucked feet rise with the knees.
    out.hipY = lerp(out.hipY, legReach(0.05, -0.12), w);
    if (s.air < 0.3) out.squash = 1 + T.TAKEOFF_STRETCH * (1 - s.air / 0.3);
  }

  // Landing: the body dips and the knees give.
  const land = landingSquash(s.land);
  if (land < 1) {
    const k = (1 - land) / T.LAND_SQUASH; // 0 to 1 at the deepest point
    out.kneeL -= 0.7 * k;
    out.kneeR -= 0.7 * k;
    out.thighL += 0.35 * k;
    out.thighR += 0.35 * k;
    // Feet stay on the floor while the knees give, so the hips drop.
    out.hipY = Math.min(
      out.hipY,
      Math.max(legReach(out.thighL, out.kneeL), legReach(out.thighR, out.kneeR)),
    );
    out.squash *= land;
  }

  // Arms up (crate, orb) win over every other arm motion.
  out.raiseL = clamp01(s.armL);
  out.raiseR = clamp01(s.armR);
  out.shoulderL *= 1 - out.raiseL;
  out.shoulderR *= 1 - out.raiseR;
  out.elbowL = lerp(out.elbowL, 0.12, out.raiseL);
  out.elbowR = lerp(out.elbowR, 0.12, out.raiseR);
  return out;
}

/** Run cycles per second at a world speed. */
export function strideHz(speed: number): number {
  return T.STRIDE_HZ_BASE + T.STRIDE_HZ_PER_SPEED * Math.max(0, speed);
}

/** Sideways roll into a lane change, from the runner's sideways speed (units per second). */
export function leanFor(vx: number): number {
  return Math.max(-T.LEAN_MAX, Math.min(T.LEAN_MAX, -vx * T.LEAN_PER_SPEED));
}
