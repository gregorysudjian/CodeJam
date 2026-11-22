// Owner: A. The camera-free core of the pose input: per frame, pick the player among the bodies,
// then either calibrate or detect moves. Pure (no DOM), so the whole calibrate() → moves flow is
// tested on recorded clips. engine.ts feeds it camera frames.
import type { CalibrationStatus, Gesture, InputState, MoveEvent, PlayMode } from '@/contracts';
import { type Calibrator, createCalibrator } from './calibration';
import {
  type Calibration,
  createDetector,
  type Detector,
  L_HIP,
  L_SHOULDER,
  mid,
  NOSE,
  pickBody,
  type Point,
  R_HIP,
  R_SHOULDER,
  toPlayerX,
} from './detect';
import { createGestureDetector } from './gesture';
import {
  CALIBRATION_STATUS_STEP,
  DEFAULT_ASPECT,
  DETECTION,
  FOLLOW_GAP_MS,
  FOLLOW_MAX_SPEED_W,
  FOLLOW_MAX_STEP_W,
  FOLLOW_MIN_STEP_W,
  OTHER_AREA_W,
  OTHER_MIN_GAP_W,
  OTHER_MIN_SIZE,
  OTHER_OFF_MS,
  OTHER_ON_MS,
  PICK_SIZE_TOLERANCE,
  RECENT_EVENTS,
  REFIND_AREA_W,
  REFIND_SIZE_TOLERANCE,
  REFIND_STILL_MS,
  REFIND_STILL_W,
} from './tuning';

export const NEUTRAL_STATE: InputState = Object.freeze({
  tracking: false,
  lane: 0,
  ducking: false,
  airborne: false,
  leftArmUp: false,
  rightArmUp: false,
});

interface Pending {
  calibrator: Calibrator;
  mode: PlayMode;
  onStatus: (s: CalibrationStatus) => void;
  resolve: () => void;
  reject: (err: Error) => void;
  lastSent: CalibrationStatus | null;
  silent: boolean; // auto-calibration nobody asked for
}

export interface Session {
  /**
   * Feeds one camera frame: every body MediaPipe found (raw landmarks), at time t (ms).
   * `aspect` is the video's width / height (for the treadmill torso estimate).
   */
  frame(poses: Point[][], t: number, aspect?: number): void;
  /**
   * Starts (or restarts) calibration. Resolves when done. A newer calibrate() or cancel() rejects
   * the older one. Detection pauses (tracking: false) until it is done.
   */
  calibrate(mode: PlayMode, onStatus: (s: CalibrationStatus) => void): Promise<void>;
  /** Rejects a pending calibration (camera stopped). Keeps the last calibration. */
  cancel(reason: string): void;
  getState(): InputState;
  onMove(cb: (e: MoveEvent) => void): () => void;
  /** The pause X (gesture.ts), once per hold. Returns unsubscribe. */
  onGesture(cb: (g: Gesture) => void): () => void;
  /** How far the current X hold is, 0 to 1 (debug overlay). */
  readonly gestureProgress: number;
  /** The player's latest raw landmarks, or null. */
  readonly player: Point[] | null;
  readonly mode: PlayMode;
  readonly calibration: Calibration | null;
  readonly calibrating: CalibrationStatus | null;
  readonly detector: Detector | null;
  readonly bodies: number;
  readonly recent: MoveEvent[];
  /** Someone other than the calibrated player is in the play area (tracking is false then). */
  readonly otherPerson: boolean;
}

const within = (ratio: number, tolerance: number) =>
  ratio > 1 - tolerance && ratio < 1 / (1 - tolerance);
const hasShoulders = (pose: Point[]) => !!pose[L_SHOULDER] && !!pose[R_SHOULDER];
const shoulderCentre = (pose: Point[]) => mid(pose[L_SHOULDER], pose[R_SHOULDER]);
const widthOf = (pose: Point[]) => Math.abs(pose[L_SHOULDER].x - pose[R_SHOULDER].x);
const FOLLOW_POINTS = [NOSE, L_SHOULDER, R_SHOULDER, L_HIP, R_HIP];

/** Mean distance between two poses' nose, shoulders and hips, in frame widths. */
function poseDistance(a: Point[], b: Point[], aspect: number): number {
  let sum = 0;
  let n = 0;
  for (const i of FOLLOW_POINTS) {
    const p = a[i];
    const q = b[i];
    if (!p || !q) continue;
    sum += Math.hypot(p.x - q.x, (p.y - q.y) / aspect);
    n++;
  }
  return n ? sum / n : Infinity;
}

/**
 * The player's size, close enough to take them back after they were away: shoulder width and,
 * on the floor, torso length, against the detector's current baselines (they follow the player).
 */
function isPlayerSize(pose: Point[], d: Detector): boolean {
  if (!hasShoulders(pose) || !within(widthOf(pose) / d.readout.W, REFIND_SIZE_TOLERANCE))
    return false;
  if (d.mode !== 'floor') return true;
  if (!pose[L_HIP] || !pose[R_HIP]) return false;
  const torso = Math.abs(mid(pose[L_HIP], pose[R_HIP]).y - shoulderCentre(pose).y);
  return within(torso / d.readout.T, REFIND_SIZE_TOLERANCE);
}

export function createSession(): Session {
  let mode: PlayMode = 'floor';
  let aspect = DEFAULT_ASPECT;
  let calibration: Calibration | null = null;
  let detector: Detector | null = null;
  let pending: Pending | null = null;
  let player: Point[] | null = null;
  let lastCentre: { x: number; y: number } | null = null;
  let bodies = 0;
  const recent: MoveEvent[] = [];
  const listeners = new Set<(e: MoveEvent) => void>();
  let gesture = createGestureDetector();
  const gestureListeners = new Set<(g: Gesture) => void>();

  // Following the player after calibration (follow), and someone else in the play area.
  let last: Point[] | null = null; // the player's last pose
  let lastSeenAt = -Infinity;
  let refind: { x: number; y: number; since: number } | null = null;
  let otherPerson = false;
  let otherSince = -1;
  let otherLastAt = -Infinity;

  /**
   * How far a body's shoulder centre is from the mark, in the calibrated shoulder width: the play
   * area stays where it was calibrated, even when the player steps closer and looks bigger.
   */
  const offMark = (pose: Point[]) =>
    calibration
      ? Math.abs(toPlayerX(shoulderCentre(pose).x) - calibration.centreX) / calibration.W
      : Infinity;

  /**
   * The calibrated player among the bodies, or null. Never the largest or the newest body: the
   * one nearest the player's last pose; after a gap, only a body of the player's size standing
   * still near the mark.
   */
  function follow(poses: Point[][], t: number, d: Detector): Point[] | null {
    const W = d.readout.W;
    const usable = poses.filter(hasShoulders);
    if (last && t - lastSeenAt <= FOLLOW_GAP_MS) {
      const prev = last;
      const step = (FOLLOW_MAX_SPEED_W * (t - lastSeenAt)) / 1000;
      const reach = W * Math.min(FOLLOW_MAX_STEP_W, Math.max(FOLLOW_MIN_STEP_W, step));
      let best: Point[] | null = null;
      let bestDist = reach;
      for (const pose of usable) {
        // Size against the last frame, not the calibration: a player who stands closer than at
        // calibration is still followed, someone much bigger or smaller never is.
        if (!within(widthOf(pose) / widthOf(prev), PICK_SIZE_TOLERANCE)) continue;
        const dist = poseDistance(pose, prev, aspect);
        if (dist <= bestDist) {
          best = pose;
          bestDist = dist;
        }
      }
      return best;
    }
    let best: Point[] | null = null;
    let bestDist = REFIND_AREA_W;
    for (const pose of usable) {
      if (!isPlayerSize(pose, d)) continue;
      const dist = offMark(pose);
      if (dist <= bestDist) {
        best = pose;
        bestDist = dist;
      }
    }
    if (!best) {
      refind = null;
      return null;
    }
    const c = shoulderCentre(best);
    if (!refind || Math.hypot(c.x - refind.x, (c.y - refind.y) / aspect) > REFIND_STILL_W * W) {
      refind = { x: c.x, y: c.y, since: t };
      return null;
    }
    if (t - refind.since < REFIND_STILL_MS) return null;
    refind = null;
    return best;
  }

  /** Someone else in the play area, near the player's size: on after OTHER_ON_MS, off after OTHER_OFF_MS. */
  function updateOther(poses: Point[][], t: number, d: Detector) {
    const W = d.readout.W;
    const seen = (q: Point) => (q.visibility ?? 1) >= DETECTION.TRACKING_MIN_VISIBILITY;
    const pc = player ? shoulderCentre(player) : null;
    const found = poses.some((pose) => {
      if (pose === player || !hasShoulders(pose)) return false;
      if (!seen(pose[L_SHOULDER]) || !seen(pose[R_SHOULDER])) return false;
      if (widthOf(pose) < OTHER_MIN_SIZE * W) return false; // far behind
      const c = shoulderCentre(pose);
      if (offMark(pose) > OTHER_AREA_W) return false; // aside
      if (pc) return Math.hypot(c.x - pc.x, (c.y - pc.y) / aspect) >= OTHER_MIN_GAP_W * W;
      // With the player away, a body of their size may be them coming back (follow decides).
      return !isPlayerSize(pose, d);
    });
    if (found) {
      if (otherSince < 0) otherSince = t;
      otherLastAt = t;
      if (t - otherSince >= OTHER_ON_MS) otherPerson = true;
    } else if (t - otherLastAt >= OTHER_OFF_MS) {
      otherSince = -1;
      otherPerson = false;
    }
  }

  function sendStatus(p: Pending, s: CalibrationStatus) {
    const prev = p.lastSent;
    // Only on a new step or a visible progress change: the UI may set React state on each call.
    if (
      prev &&
      prev.step === s.step &&
      s.step !== 'done' &&
      Math.abs(prev.progress - s.progress) < CALIBRATION_STATUS_STEP
    )
      return;
    p.lastSent = s;
    if (p.silent) return;
    try {
      p.onStatus(s);
    } catch (err) {
      console.error('[pose] calibration onStatus failed', err); // a UI bug must not stop tracking
    }
  }

  function calibrate(
    m: PlayMode,
    onStatus: (s: CalibrationStatus) => void,
    silent = false,
  ): Promise<void> {
    cancel('Calibration restarted.');
    mode = m;
    detector = null;
    gesture = createGestureDetector();
    return new Promise<void>((resolve, reject) => {
      pending = {
        calibrator: createCalibrator(m, () => aspect),
        mode: m,
        onStatus,
        resolve,
        reject,
        lastSent: null,
        silent,
      };
    });
  }

  function cancel(reason: string) {
    if (!pending) return;
    const p = pending;
    pending = null;
    p.reject(new Error(reason));
  }

  function frame(poses: Point[][], t: number, videoAspect?: number) {
    if (videoAspect && Number.isFinite(videoAspect)) aspect = videoAspect;
    bodies = poses.length;
    const d = detector;
    if (d) {
      // Calibrated: follow that player and flag anyone else in the play area.
      player = follow(poses, t, d);
      if (player) {
        last = player;
        lastSeenAt = t;
      }
      updateOther(poses, t, d);
    } else {
      // Calibrating: the largest body nearest where the player was (or the frame centre).
      const i = poses.length > 1 ? pickBody(poses, lastCentre) : poses.length - 1;
      player = i >= 0 ? poses[i] : null;
    }
    if (player && player[L_SHOULDER] && player[R_SHOULDER]) {
      const s = mid(player[L_SHOULDER], player[R_SHOULDER]);
      lastCentre = { x: toPlayerX(s.x), y: s.y };
    }

    // Never calibrated and nobody asked (e.g. pose switched on mid-round): calibrate quietly in
    // the last mode so the input still works once the player stands still.
    if (!detector && !pending) calibrate(mode, () => {}, true).catch(() => {});

    if (pending) {
      const p = pending;
      const { status, result } = p.calibrator.update(player, t);
      sendStatus(p, status);
      if (result) {
        calibration = result;
        detector = createDetector(result, p.mode);
        pending = null;
        last = player;
        lastSeenAt = t;
        refind = null;
        otherPerson = false;
        otherSince = -1;
        p.resolve();
      }
      return;
    }
    if (!detector) return;
    const events = detector.update(player, t);
    // While someone else is in the play area the game is paused: their moves or the player's
    // reach nobody, and the X cannot fire.
    if (otherPerson) {
      gesture.update(player, t, detector.state, detector.readout);
      return;
    }
    for (const e of events) {
      recent.push(e);
      if (recent.length > RECENT_EVENTS) recent.shift();
      // A failing listener (e.g. a game bug) must not stop the others or detection.
      listeners.forEach((cb) => {
        try {
          cb(e);
        } catch (err) {
          console.error('[pose] onMove listener failed', err);
        }
      });
    }
    // The pause X, after the moves (it only reads the detector, so moves are unchanged).
    const g = gesture.update(player, t, detector.state, detector.readout);
    if (g) {
      gestureListeners.forEach((cb) => {
        try {
          cb(g);
        } catch (err) {
          console.error('[pose] onGesture listener failed', err);
        }
      });
    }
  }

  return {
    frame,
    calibrate: (m, onStatus) => calibrate(m, onStatus),
    cancel,
    getState: () =>
      !detector
        ? { ...NEUTRAL_STATE }
        : otherPerson
          ? { ...detector.state, tracking: false, otherPerson: true }
          : { ...detector.state, otherPerson: false },
    onMove(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    onGesture(cb) {
      gestureListeners.add(cb);
      return () => {
        gestureListeners.delete(cb);
      };
    },
    get gestureProgress() {
      return gesture.progress;
    },
    get player() {
      return player;
    },
    get mode() {
      return mode;
    },
    get calibration() {
      return calibration;
    },
    get calibrating() {
      return pending ? pending.lastSent : null;
    },
    get detector() {
      return detector;
    },
    get bodies() {
      return bodies;
    },
    get otherPerson() {
      return otherPerson;
    },
    recent,
  };
}
