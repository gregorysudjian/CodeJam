// Owner: A. Pure move detection: landmarks in, InputState and move events out.
// No DOM and no MediaPipe here, so it runs in Vitest on recorded clips.
import type { InputState, Lane, MoveEvent } from '@/contracts';
import * as K from './tuning';

/** The fields of a MediaPipe NormalizedLandmark that detection uses. */
export interface Point {
  x: number;
  y: number;
  visibility?: number;
}

/** Standing pose measured at calibration, in player coordinates (x already mirrored). */
export interface Calibration {
  hipX: number; // hip centre x
  hipY: number; // hip centre y (standing height)
  W: number; // shoulder width, in x units
  T: number; // torso length (shoulder centre to hip centre), in y units
}

// MediaPipe landmark indices (names are the player's own).
const NOSE = 0;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_WRIST = 15;
const R_WRIST = 16;
const L_HIP = 23;
const R_HIP = 24;
const USED = [NOSE, L_SHOULDER, R_SHOULDER, L_WRIST, R_WRIST, L_HIP, R_HIP];

/**
 * The single place where MediaPipe's unmirrored x becomes the player's x
 * (docs/CONTRACTS.md, "Mirroring trap"). Everything in src/pose uses this.
 */
export function toPlayerX(x: number): number {
  return 1 - x;
}

/** Body measurements of one pose, in player coordinates. */
export function measureBody(pose: Point[]): Calibration {
  const ls = pose[L_SHOULDER];
  const rs = pose[R_SHOULDER];
  const lh = pose[L_HIP];
  const rh = pose[R_HIP];
  const hipY = (lh.y + rh.y) / 2;
  return {
    hipX: toPlayerX((lh.x + rh.x) / 2),
    hipY,
    W: Math.abs(ls.x - rs.x),
    T: Math.abs(hipY - (ls.y + rs.y) / 2),
  };
}

export interface Detector {
  /** Feed one frame (null when MediaPipe found no body). Returns the moves that started this frame. */
  update(pose: Point[] | null, t: number): MoveEvent[];
  readonly state: InputState;
}

export function createDetector(cal: Calibration): Detector {
  const state: InputState = {
    tracking: true,
    lane: 0,
    ducking: false,
    airborne: false,
    leftArmUp: false,
    rightArmUp: false,
  };

  // Baselines: standing height and torso drift while idle; the centre and W stay fixed.
  let standY = cal.hipY;
  let T = cal.T;

  const smooth = new Map<number, { x: number; y: number }>();
  let lastT = -Infinity;
  let lastHipY = cal.hipY;
  let presentSince = -Infinity;
  let missingSince = -Infinity;
  let airborneUntil = -Infinity;
  let jumpAllowedAt = -Infinity;
  let armGesture: 'none' | 'settling' | 'fired' = 'none';
  let oneArmSince = 0;

  const isPresent = (pose: Point[] | null) => {
    if (!pose) return false;
    const core = [L_SHOULDER, R_SHOULDER, L_HIP, R_HIP].map((i) => pose[i]);
    if (core.some((p) => !p || (p.visibility ?? 1) < K.TRACKING_MIN_VISIBILITY)) return false;
    const hipX = (core[2].x + core[3].x) / 2;
    const hipY = (core[2].y + core[3].y) / 2;
    return hipX >= 0 && hipX <= 1 && hipY >= 0 && hipY <= 1;
  };

  function updateTracking(present: boolean, t: number) {
    if (present) {
      if (presentSince === -Infinity) presentSince = t;
      missingSince = -Infinity;
      if (!state.tracking && t - presentSince >= K.TRACKING_REGAINED_MS) state.tracking = true;
    } else {
      if (missingSince === -Infinity) missingSince = t;
      presentSince = -Infinity;
      if (state.tracking && t - missingSince >= K.TRACKING_LOST_MS) state.tracking = false;
    }
  }

  function update(pose: Point[] | null, t: number): MoveEvent[] {
    const events: MoveEvent[] = [];
    const present = isPresent(pose);
    updateTracking(present, t);
    if (state.airborne && t >= airborneUntil) state.airborne = false;
    if (!pose || !present) {
      smooth.clear(); // restart smoothing from fresh values when the body comes back
      return events;
    }

    // Smooth only the landmarks we use, in player coordinates.
    for (const i of USED) {
      const raw = { x: toPlayerX(pose[i].x), y: pose[i].y };
      const prev = smooth.get(i);
      const a = K.SMOOTHING_ALPHA;
      smooth.set(
        i,
        prev ? { x: prev.x + a * (raw.x - prev.x), y: prev.y + a * (raw.y - prev.y) } : raw,
      );
    }
    const p = (i: number) => smooth.get(i)!;
    const hipX = (p(L_HIP).x + p(R_HIP).x) / 2;
    const hipY = (p(L_HIP).y + p(R_HIP).y) / 2;
    const shoulderY = (p(L_SHOULDER).y + p(R_SHOULDER).y) / 2;

    const dt = (t - lastT) / 1000;
    const upSpeed = dt > 0 && dt < 0.5 ? (lastHipY - hipY) / T / dt : 0; // T per second, + = up
    lastT = t;
    lastHipY = hipY;

    const emit = (type: MoveEvent['type']) => {
      if (state.tracking) events.push({ type, t });
    };
    const drop = (hipY - standY) / T; // + = below standing height

    // Squat, with hysteresis.
    if (!state.ducking && drop > K.SQUAT_ON_T) {
      state.ducking = true;
      emit('squat');
    } else if (state.ducking && drop < K.SQUAT_OFF_T) {
      state.ducking = false;
      jumpAllowedAt = Math.max(jumpAllowedAt, t + K.JUMP_BLOCK_AFTER_SQUAT_MS);
    }

    // Jump: above standing height and still rising; fixed airtime, then a cooldown.
    if (
      !state.airborne &&
      !state.ducking &&
      t >= jumpAllowedAt &&
      -drop > K.JUMP_ON_T &&
      upSpeed > K.JUMP_MIN_UP_SPEED_T
    ) {
      state.airborne = true;
      airborneUntil = t + K.AIRBORNE_MS;
      jumpAllowedAt = airborneUntil + K.JUMP_COOLDOWN_MS;
      emit('jump');
    }

    // Lane, with hysteresis around the calibrated centre.
    const offset = (hipX - cal.hipX) / cal.W;
    let lane: Lane = state.lane;
    if (offset > K.LANE_ON_W) lane = 1;
    else if (offset < -K.LANE_ON_W) lane = -1;
    else if (Math.abs(offset) < K.LANE_OFF_W) lane = 0;
    if (lane !== state.lane) {
      state.lane = lane;
      emit('sidestep');
    }

    // Arms: up when the wrist passes the nose, down when it drops below its shoulder.
    // Frozen while airborne, because arms swing up during a jump.
    if (!state.airborne) {
      const armUp = (was: boolean, wrist: number, shoulder: number) =>
        was ? p(wrist).y <= p(shoulder).y : p(wrist).y < p(NOSE).y;
      state.leftArmUp = armUp(state.leftArmUp, L_WRIST, L_SHOULDER);
      state.rightArmUp = armUp(state.rightArmUp, R_WRIST, R_SHOULDER);
    }
    const both = state.leftArmUp && state.rightArmUp;
    const one = state.leftArmUp !== state.rightArmUp;
    if (!state.leftArmUp && !state.rightArmUp) armGesture = 'none';
    else if (armGesture !== 'fired') {
      if (both) {
        armGesture = 'fired';
        emit('armsUp');
      } else if (one) {
        if (armGesture === 'none') {
          armGesture = 'settling';
          oneArmSince = t;
        } else if (t - oneArmSince >= K.ARM_SETTLE_MS) {
          armGesture = 'fired';
          emit(state.leftArmUp ? 'reachLeft' : 'reachRight');
        }
      }
    }

    // Slow drift of standing height and torso length, only while standing still.
    const idle =
      !state.ducking && !state.airborne && t >= jumpAllowedAt && Math.abs(drop) < K.SQUAT_OFF_T;
    if (idle && dt > 0 && dt < 0.5) {
      const k = 1 - Math.exp(-K.BASELINE_DRIFT_PER_SEC * dt);
      standY += k * (hipY - standY);
      T += k * (Math.abs(hipY - shoulderY) - T);
    }

    return events;
  }

  return { update, state };
}
