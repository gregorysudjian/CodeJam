// Owner: A. The camera-free core of the pose input: per frame, pick the player among the bodies,
// then either calibrate or detect moves. Pure (no DOM), so the whole calibrate() → moves flow is
// tested on recorded clips. engine.ts feeds it camera frames.
import type { CalibrationStatus, InputState, MoveEvent, PlayMode } from '@/contracts';
import { type Calibrator, createCalibrator } from './calibration';
import {
  type Calibration,
  createDetector,
  type Detector,
  L_SHOULDER,
  mid,
  pickBody,
  type Point,
  R_SHOULDER,
  toPlayerX,
} from './detect';
import { createGestureDetector, type Gesture } from './gesture';
import { CALIBRATION_STATUS_STEP, PICK_SIZE_TOLERANCE, RECENT_EVENTS } from './tuning';

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
}

/** True when a body's shoulder width is within PICK_SIZE_TOLERANCE of the player's. */
export function isPlayerSized(pose: Point[], playerW: number): boolean {
  const ls = pose[L_SHOULDER];
  const rs = pose[R_SHOULDER];
  if (!ls || !rs || playerW <= 0) return false;
  const ratio = Math.abs(ls.x - rs.x) / playerW;
  return ratio > 1 - PICK_SIZE_TOLERANCE && ratio < 1 / (1 - PICK_SIZE_TOLERANCE);
}

export function createSession(): Session {
  let mode: PlayMode = 'floor';
  let aspect = 4 / 3;
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
    // Once calibrated, someone much bigger or smaller than the player is not the player: drop them
    // first, then pick the largest, nearest of the rest.
    const d = detector;
    const candidates = d ? poses.filter((pose) => isPlayerSized(pose, d.readout.W)) : poses;
    const i = candidates.length > 1 ? pickBody(candidates, lastCentre) : candidates.length - 1;
    player = i >= 0 ? candidates[i] : null;
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
        p.resolve();
      }
      return;
    }
    if (!detector) return;
    for (const e of detector.update(player, t)) {
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
    getState: () => (detector ? { ...detector.state } : { ...NEUTRAL_STATE }),
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
    recent,
  };
}
