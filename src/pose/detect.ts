// Owner: A. Pure move detection: landmarks in, InputState and move events out.
// No DOM and no MediaPipe here, so it runs in Vitest on recorded clips.
import type { InputState, Lane, MoveEvent, MoveType, PlayMode } from '@/contracts';
import { DETECTION as K, PICK_DISTANCE_WEIGHT } from './tuning';

/** The fields of a MediaPipe NormalizedLandmark that detection uses (raw, unmirrored x). */
export interface Point {
  x: number;
  y: number;
  visibility?: number;
}

/**
 * The player's standing pose, measured at calibration, in player coordinates (x mirrored).
 * The centre is the hip centre in floor mode and the shoulder centre in treadmill mode.
 */
export interface Calibration {
  centreX: number;
  centreY: number;
  W: number; // shoulder width, in x units (fraction of the frame width)
  T: number; // torso length, shoulder centre to hip centre, in y units (fraction of the height)
}

// MediaPipe landmark indices (names are the player's own).
export const NOSE = 0;
export const L_SHOULDER = 11;
export const R_SHOULDER = 12;
export const L_WRIST = 15;
export const R_WRIST = 16;
export const L_HIP = 23;
export const R_HIP = 24;
export const L_ANKLE = 27;
export const R_ANKLE = 28;
const USED = [NOSE, L_SHOULDER, R_SHOULDER, L_WRIST, R_WRIST, L_HIP, R_HIP];

/**
 * The single place where MediaPipe's unmirrored x becomes the player's x
 * (docs/CONTRACTS.md, "Mirroring trap"). Everything in src/pose uses this.
 */
export function toPlayerX(x: number): number {
  return 1 - x;
}

export const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Landmarks a mode relies on: shoulders and hips on the floor, shoulders only on a treadmill. */
export const coreLandmarks = (mode: PlayMode) =>
  mode === 'floor' ? [L_SHOULDER, R_SHOULDER, L_HIP, R_HIP] : [L_SHOULDER, R_SHOULDER];

/** Body measurements of one pose, in player coordinates. T is shoulder centre to hip centre. */
export function measureBody(pose: Point[], mode: PlayMode = 'floor'): Calibration {
  const shoulders = mid(pose[L_SHOULDER], pose[R_SHOULDER]);
  const hips = mid(pose[L_HIP], pose[R_HIP]);
  const centre = mode === 'floor' ? hips : shoulders;
  return {
    centreX: toPlayerX(centre.x),
    centreY: centre.y,
    W: Math.abs(pose[L_SHOULDER].x - pose[R_SHOULDER].x),
    T: Math.abs(hips.y - shoulders.y),
  };
}

/**
 * Picks the player among several bodies: the largest (shoulder width) and closest to where the
 * player was last seen (or to the frame centre). People further back look smaller.
 * `last` is in player coordinates. Returns -1 when there is no usable body.
 */
export function pickBody(poses: Point[][], last: { x: number; y: number } | null): number {
  let best = -1;
  let bestScore = -Infinity;
  const target = last ?? { x: 0.5, y: 0.5 };
  poses.forEach((pose, i) => {
    const ls = pose[L_SHOULDER];
    const rs = pose[R_SHOULDER];
    if (!ls || !rs) return;
    const c = mid(ls, rs);
    const d = Math.hypot(toPlayerX(c.x) - target.x, c.y - target.y);
    const score = Math.abs(ls.x - rs.x) - PICK_DISTANCE_WEIGHT * d;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Live values for the debug overlay. */
export interface Readout {
  offsetW: number; // centre offset from the calibrated centre, in W (+ = player's right)
  dropT: number; // centre below standing height, in T
  upSpeedT: number; // upward speed, in T per second
  leftArmT: number; // wrist height above the nose, in T
  rightArmT: number;
  W: number;
  T: number;
}

export interface Detector {
  /** Feed one frame (null when no body was found). Returns the moves that started this frame. */
  update(pose: Point[] | null, t: number): MoveEvent[];
  readonly state: InputState;
  readonly readout: Readout;
  readonly mode: PlayMode;
}

export function createDetector(cal: Calibration, mode: PlayMode = 'floor'): Detector {
  const floor = mode === 'floor';
  const state: InputState = {
    tracking: true,
    lane: 0,
    ducking: false,
    airborne: false,
    leftArmUp: false,
    rightArmUp: false,
  };
  const readout: Readout = {
    offsetW: 0,
    dropT: 0,
    upSpeedT: 0,
    leftArmT: 0,
    rightArmT: 0,
    W: cal.W,
    T: cal.T,
  };

  // Baselines. Standing height, T and W drift slowly while the player stands still; the lane
  // centre drifts even slower and only in the centre lane (docs/CONTRACTS.md, drift rule).
  let centreX = cal.centreX;
  let standY = cal.centreY;
  let T = cal.T;
  let W = cal.W;

  const smooth = new Map<number, { x: number; y: number }>();
  let lastT = -Infinity;
  /** Recent centre heights, to measure the rise over a short window (robust to dropped frames). */
  let history: { t: number; y: number }[] = [];
  let presentSince = -Infinity;
  let missingSince = -Infinity;
  let airborneUntil = -Infinity;
  let jumpAllowedAt = -Infinity;
  let still = { y: cal.centreY, since: -Infinity }; // where the centre has stayed, and since when
  let armGesture: 'none' | 'settling' | 'fired' = 'none';
  let oneArmSince = 0;
  const core = coreLandmarks(mode);

  const isPresent = (pose: Point[] | null): pose is Point[] => {
    if (!pose) return false;
    const pts = core.map((i) => pose[i]);
    if (pts.some((q) => !q || (q.visibility ?? 1) < K.TRACKING_MIN_VISIBILITY)) return false;
    const c = floor ? mid(pts[2], pts[3]) : mid(pts[0], pts[1]);
    return c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1;
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
    if (!present) {
      smooth.clear(); // restart smoothing from fresh values when the body comes back
      return events;
    }

    // Smooth only the landmarks we use, in player coordinates.
    const a = K.SMOOTHING_ALPHA;
    for (const i of USED) {
      const src = pose[i];
      if (!src) continue;
      const raw = { x: toPlayerX(src.x), y: src.y };
      const prev = smooth.get(i);
      smooth.set(
        i,
        prev ? { x: prev.x + a * (raw.x - prev.x), y: prev.y + a * (raw.y - prev.y) } : raw,
      );
    }
    const p = (i: number) => smooth.get(i) ?? { x: 0, y: 0 };
    const shoulders = mid(p(L_SHOULDER), p(R_SHOULDER));
    const hips = mid(p(L_HIP), p(R_HIP));
    const c = floor ? hips : shoulders;

    const dt = (t - lastT) / 1000;
    const fresh = dt > 0 && dt < 0.5; // no speed or drift across gaps
    lastT = t;
    if (!fresh) history = [];
    history.push({ t, y: c.y });
    while (history.length > 1 && t - history[1].t >= K.JUMP_SPEED_WINDOW_MS) history.shift();
    const ref = history[0];
    // Upward speed over the window, in T per second (+ = up).
    const upSpeed = t > ref.t ? (ref.y - c.y) / T / ((t - ref.t) / 1000) : 0;

    const emit = (type: MoveType) => {
      if (state.tracking) events.push({ type, t });
    };
    const drop = (c.y - standY) / T; // + = below standing height
    const offset = (c.x - centreX) / W;

    if (floor) {
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
        // Arms that swung up during take-off are not a reach or armsUp.
        state.leftArmUp = false;
        state.rightArmUp = false;
        armGesture = 'none';
        emit('jump');
      }

      // Lane, with hysteresis: enter a side lane past the on line, leave it inside the off line.
      let lane: Lane = state.lane;
      if (lane === 0) {
        if (offset > K.LANE_ON_W) lane = 1;
        else if (offset < -K.LANE_ON_W) lane = -1;
      } else if (lane * offset < K.LANE_OFF_W) {
        // Left the side lane: straight across to the other side lane, or back to the centre.
        lane = -lane * offset > K.LANE_ON_W ? (-lane as Lane) : 0;
      }
      if (lane !== state.lane) {
        state.lane = lane;
        emit('sidestep');
      }
    }

    // Arms: up when the wrist is well above the nose, down once it is back near nose height, so
    // overhead presses from shoulder height count as reps. Ignored while airborne.
    const armT = (wrist: number) => (p(NOSE).y - p(wrist).y) / T;
    const leftT = armT(L_WRIST);
    const rightT = armT(R_WRIST);
    if (!state.airborne) {
      const up = (was: boolean, h: number) =>
        was ? h > K.ARM_DOWN_ABOVE_NOSE_T : h > K.ARM_UP_ABOVE_NOSE_T;
      state.leftArmUp = up(state.leftArmUp, leftT);
      state.rightArmUp = up(state.rightArmUp, rightT);
      if (!state.leftArmUp && !state.rightArmUp) armGesture = 'none';
      else if (armGesture !== 'fired') {
        if (state.leftArmUp && state.rightArmUp) {
          armGesture = 'fired';
          emit('armsUp');
        } else if (armGesture === 'none') {
          armGesture = 'settling';
          oneArmSince = t;
        } else if (t - oneArmSince >= K.ARM_SETTLE_MS) {
          armGesture = 'fired';
          emit(state.leftArmUp ? 'reachLeft' : 'reachRight');
        }
      }
    }

    // Slow drift toward the current body while standing still (handles stepping closer or
    // further, or wandering). Only when the centre has stayed put for a while, so a slow squat
    // (still moving) is not eaten; never during a move, so a held squat or lane is not
    // cancelled. Arms up count as a move: they narrow and lift the shoulders (W, T).
    if (Math.abs(c.y - still.y) > K.IDLE_STILL_T * T) still = { y: c.y, since: t };
    const idle =
      !state.ducking &&
      !state.airborne &&
      !state.leftArmUp &&
      !state.rightArmUp &&
      t >= jumpAllowedAt &&
      t - still.since >= K.IDLE_STILL_MS &&
      Math.abs(drop) < K.IDLE_MAX_DROP_T;
    if (floor && idle && fresh) {
      const k = 1 - Math.exp(-K.BASELINE_DRIFT_PER_SEC * dt);
      standY += k * (c.y - standY);
      T += k * (Math.abs(hips.y - shoulders.y) - T);
      W += k * (Math.abs(p(L_SHOULDER).x - p(R_SHOULDER).x) - W);
      if (state.lane === 0 && Math.abs(offset) < K.LANE_OFF_W) {
        centreX += (1 - Math.exp(-K.CENTRE_DRIFT_PER_SEC * dt)) * (c.x - centreX);
      }
    }

    readout.offsetW = offset;
    readout.dropT = drop;
    readout.upSpeedT = upSpeed;
    readout.leftArmT = leftT;
    readout.rightArmT = rightT;
    readout.W = W;
    readout.T = T;
    return events;
  }

  return { update, state, readout, mode };
}
