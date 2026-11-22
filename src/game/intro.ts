import * as T from './tuning';

/**
 * The intro before the round: 3, 2, 1 (one second each) while the camera flies from a shot of
 * the runner's front to the chase position behind it, then GO as the clock starts. Pure, so it is
 * unit-tested (intro.test.ts). With reduced motion the camera stays in the chase position.
 */

/** What the countdown shows `t` seconds into the intro (t ≥ INTRO_SEC: the round has started). */
export function countdownAt(t: number): '3' | '2' | '1' | 'GO' | null {
  if (t < 0) return null;
  if (t < T.INTRO_SEC) return String(Math.max(1, Math.ceil(T.INTRO_SEC - t))) as '3' | '2' | '1';
  return t < T.INTRO_SEC + T.INTRO_GO_SEC ? 'GO' : null;
}

/**
 * The number shown during the countdown before a resume (core.resumingIn: seconds left), as
 * the intro shows it: '3', '2', '1'. Null when no countdown runs.
 */
export function resumeCountAt(secLeft: number | null): string | null {
  if (secLeft === null || !(secLeft > 0)) return null;
  return String(Math.max(1, Math.ceil(secLeft)));
}

/** Fly-in progress 0 to 1 (eased), `t` seconds into the intro. */
export function flyProgress(t: number): number {
  const k = Math.min(1, Math.max(0, t / T.INTRO_FLY_SEC));
  return k * k * k * (k * (k * 6 - 15) + 10); // smootherstep
}

export interface CameraPose {
  px: number;
  py: number;
  pz: number;
  lx: number;
  ly: number;
  lz: number;
}

/**
 * Camera position and look target at fly-in progress `k`, around a runner at x = 0. The camera
 * orbits from in front of the runner (INTRO_FROM) to behind it, rising and pulling back, while
 * its target slides from the runner's chest to the chase look point. At k = 1 it is exactly the
 * chase camera (CAMERA_POS, CAMERA_LOOK).
 *
 * `flat` (a 'real' level, its clip behind the track): no orbit, since a flat clip can't turn with
 * the camera. The camera moves straight in along the chase camera's line of sight, from
 * REAL_CAMERA.dolly units further back, and its target moves with it. It never turns, so the
 * clip's vanishing point stays on the track's.
 */
export function introCamera(k: number, out: CameraPose, flat = false): CameraPose {
  if (flat) {
    const dx = T.CAMERA_LOOK.x - T.CAMERA_POS.x;
    const dy = T.CAMERA_LOOK.y - T.CAMERA_POS.y;
    const dz = T.CAMERA_LOOK.z - T.CAMERA_POS.z;
    const back = (T.REAL_CAMERA.dolly * (1 - k)) / Math.hypot(dx, dy, dz);
    out.px = T.CAMERA_POS.x - dx * back;
    out.py = T.CAMERA_POS.y - dy * back;
    out.pz = T.CAMERA_POS.z - dz * back;
    out.lx = T.CAMERA_LOOK.x - dx * back;
    out.ly = T.CAMERA_LOOK.y - dy * back;
    out.lz = T.CAMERA_LOOK.z - dz * back;
    return out;
  }
  const chaseR = Math.hypot(T.CAMERA_POS.x, T.CAMERA_POS.z);
  const angle = T.INTRO_FROM.angle * (1 - k);
  const radius = T.INTRO_FROM.radius + (chaseR - T.INTRO_FROM.radius) * k;
  out.px = Math.sin(angle) * radius + T.CAMERA_POS.x * k;
  out.pz = Math.cos(angle) * radius;
  out.py = T.INTRO_FROM.height + (T.CAMERA_POS.y - T.INTRO_FROM.height) * k;
  // The look target leaves the runner late, so the runner stays framed for most of the flight.
  const lk = k * k;
  out.lx = T.CAMERA_LOOK.x * lk;
  out.ly = T.INTRO_LOOK_Y + (T.CAMERA_LOOK.y - T.INTRO_LOOK_Y) * lk;
  out.lz = T.CAMERA_LOOK.z * lk;
  return out;
}
