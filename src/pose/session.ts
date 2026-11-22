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
  FOLLOW_SIZE_TOLERANCE,
  FOLLOW_MIN_STEP_W,
  OTHER_AREA_W,
  OTHER_MIN_GAP_W,
  OTHER_MIN_SIZE,
  OTHER_OFF_MS,
  OTHER_ON_MS,
  RECENT_EVENTS,
  REFIND_ALONE_SIZE_TOLERANCE,
  REFIND_AREA_W,
  REFIND_SIZE_TOLERANCE,
  REFIND_STILL_MS,
  REFIND_STILL_W,
  RIVAL_ALONE_MS,
  RIVAL_MEMORY_MS,
  RIVAL_WINDOW_MS,
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
 * The player's size within `tolerance`: shoulder width and, on the floor, torso length, against
 * the detector's current baselines (they follow the player).
 */
function isPlayerSize(
  pose: Point[],
  size: { W: number; T: number },
  mode: PlayMode,
  tolerance: number,
): boolean {
  if (!hasShoulders(pose) || !within(widthOf(pose) / size.W, tolerance)) return false;
  if (mode !== 'floor') return true;
  if (!pose[L_HIP] || !pose[R_HIP]) return false;
  const torso = Math.abs(mid(pose[L_HIP], pose[R_HIP]).y - shoulderCentre(pose).y);
  return within(torso / size.T, tolerance);
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
   * Someone else, remembered while in view (rivals): never followed, never taken as the player,
   * and they set otherPerson. On camera, two people side by side were reported one per frame,
   * alternating, then only the newcomer; without this memory the newcomer was followed.
   * A body becomes a rival only with proof of two people: seen in the same frame as the player,
   * or seen while the player was missing and then the player seen again elsewhere within
   * RIVAL_WINDOW_MS (one body cannot be in two places that fast). A missed follow frame of a lone
   * player never makes them a rival of themselves.
   */
  let rivals: { pose: Point[]; at: number; aloneSince: number }[] = [];
  let maybeRivals: { pose: Point[]; at: number }[] = [];
  const centreDist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, (a.y - b.y) / aspect);
  /** Is this body nearer (whole pose, same size) to rival r than to the player's last pose? */
  const isRival = (pose: Point[], r: { pose: Point[] }, prev: Point[] | null) =>
    within(widthOf(pose) / widthOf(r.pose), FOLLOW_SIZE_TOLERANCE) &&
    poseDistance(pose, r.pose, aspect) <= FOLLOW_MAX_STEP_W * widthOf(r.pose) &&
    !(prev && poseDistance(pose, prev, aspect) <= poseDistance(pose, r.pose, aspect));
  const rivalAt = (pose: Point[]) => rivals.find((r) => isRival(pose, r, last));

  /**
   * How far a body's shoulder centre is from the mark, in the calibrated shoulder width: the play
   * area stays where it was calibrated, even when the player steps closer and looks bigger.
   */
  const offMark = (pose: Point[]) =>
    calibration
      ? Math.abs(toPlayerX(shoulderCentre(pose).x) - calibration.centreX) / calibration.W
      : Infinity;

  const seen = (q: Point) => (q.visibility ?? 1) >= DETECTION.TRACKING_MIN_VISIBILITY;
  /** A body in the play area, big enough to be standing in it (not the crowd far behind). */
  const inArea = (pose: Point[], W: number) =>
    hasShoulders(pose) &&
    seen(pose[L_SHOULDER]) &&
    seen(pose[R_SHOULDER]) &&
    widthOf(pose) >= OTHER_MIN_SIZE * W &&
    offMark(pose) <= OTHER_AREA_W;

  /**
   * With the player away, may this body be them coming back? Their size, or, when it is alone in
   * the play area, roughly their size: players come back a step closer or further.
   */
  const mayBePlayer = (pose: Point[], poses: Point[][], d: Detector) => {
    const alone = poses.every((p) => p === pose || !inArea(p, d.readout.W));
    const tolerance = alone ? REFIND_ALONE_SIZE_TOLERANCE : REFIND_SIZE_TOLERANCE;
    // Their latest size, or their size on the mark at calibration (on camera: back a step closer,
    // the baselines grew; back on the mark, ×0.55 of those but ×0.83 of the calibration).
    return [d.readout, calibration ?? d.readout].some((size) =>
      isPlayerSize(pose, size, d.mode, tolerance),
    );
  };

  /**
   * The calibrated player among the bodies, or null. Never the largest or the newest body: the
   * one nearest the player's last pose; after a gap, only a body that may be the player
   * (mayBePlayer) standing still where they vanished or near the mark.
   */
  function follow(poses: Point[][], t: number, d: Detector): Point[] | null {
    const W = d.readout.W;
    const usable = poses.filter(hasShoulders);
    if (last && t - lastSeenAt <= FOLLOW_GAP_MS) {
      const prev = last;
      // In the last frame's own width: right after coming back a step closer, the baselines
      // still have the old size.
      const step = (FOLLOW_MAX_SPEED_W * (t - lastSeenAt)) / 1000;
      const reach = widthOf(prev) * Math.min(FOLLOW_MAX_STEP_W, Math.max(FOLLOW_MIN_STEP_W, step));
      let best: Point[] | null = null;
      let bestDist = reach;
      for (const pose of usable) {
        // Size against the last frame, not the calibration: a player who stands closer than at
        // calibration is still followed, someone much bigger or smaller never is.
        if (!within(widthOf(pose) / widthOf(prev), FOLLOW_SIZE_TOLERANCE)) continue;
        // Nearer where someone else was just seen than where the player was: that someone.
        // Or nearer a body seen while the player was missing than where the player was: not
        // settled yet (on camera, following one too early made the real player the rival).
        if ([...rivals, ...maybeRivals].some((r) => isRival(pose, r, prev))) continue;
        const dist = poseDistance(pose, prev, aspect);
        if (dist <= bestDist) {
          best = pose;
          bestDist = dist;
        }
      }
      return best;
    }
    // Found again where the player vanished or on the mark. The one nearest where they vanished
    // wins: a newcomer on the mark never beats the player standing where they were last seen
    // (on camera: someone walking in front of the player hides them, then stands on the mark).
    const lastC = last ? shoulderCentre(last) : null;
    const lastW = last ? widthOf(last) : W;
    let best: Point[] | null = null;
    let bestDist = Infinity;
    for (const pose of usable) {
      if (!mayBePlayer(pose, usable, d) || rivalAt(pose)) continue;
      const c = shoulderCentre(pose);
      const fromLast = lastC
        ? Math.hypot(c.x - lastC.x, (c.y - lastC.y) / aspect) / lastW
        : Infinity;
      if (fromLast > REFIND_AREA_W && offMark(pose) > REFIND_AREA_W) continue;
      if (fromLast < bestDist || !best) {
        best = pose;
        bestDist = fromLast;
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

  /** Updates the rivals with this frame's bodies; returns the ones that are rivals now. */
  function updateRivals(poses: Point[][], t: number, W: number): Set<Point[]> {
    // Someone else alone in the frame for RIVAL_ALONE_MS is forgotten: if the rival was the
    // player after all (a wrong call while two people were reported one per frame), they get
    // back in instead of staying "someone else" alone on the mark.
    const people = poses.filter((p) => hasShoulders(p) && widthOf(p) >= OTHER_MIN_SIZE * W);
    rivals = rivals.filter(
      (r) =>
        t - r.at <= RIVAL_MEMORY_MS && !(people.length === 1 && t - r.aloneSince >= RIVAL_ALONE_MS),
    );
    for (const r of rivals) if (people.length !== 1) r.aloneSince = Infinity;
    maybeRivals = maybeRivals.filter((m) => t - m.at <= RIVAL_WINDOW_MS);
    const pc = player ? shoulderCentre(player) : null;
    const apart = (pose: Point[]) =>
      !!pc && centreDist(shoulderCentre(pose), pc) >= OTHER_MIN_GAP_W * W;
    if (pc) {
      // The player seen again: bodies seen just before, elsewhere, were someone else.
      rivals.push(
        ...maybeRivals.filter((m) => apart(m.pose)).map((m) => ({ ...m, aloneSince: Infinity })),
      );
      maybeRivals = [];
    }
    const now = new Set<Point[]>();
    for (const pose of poses) {
      if (pose === player || !hasShoulders(pose) || widthOf(pose) < OTHER_MIN_SIZE * W) continue;
      const r = rivalAt(pose);
      if (r) {
        r.pose = pose;
        r.at = t;
        if (people.length === 1) r.aloneSince = Math.min(r.aloneSince, t);
        now.add(pose);
      } else if (apart(pose)) {
        rivals.push({ pose, at: t, aloneSince: Infinity });
        now.add(pose);
      } else if (!pc && t - lastSeenAt <= RIVAL_WINDOW_MS) {
        maybeRivals.push({ pose, at: t });
      }
    }
    return now;
  }

  /** Someone else in the play area: on after OTHER_ON_MS, off after OTHER_OFF_MS. */
  function updateOther(poses: Point[][], t: number, d: Detector, rivalsNow: Set<Point[]>) {
    const W = d.readout.W;
    const pc = player ? shoulderCentre(player) : null;
    // The player missing but not yet lost (someone walking in front of them): the flag may turn
    // on but not off, or it would drop for a few frames and the game would start a 3-2-1 for nothing.
    const missing = !player && d.state.tracking;
    const found = poses.some((pose) => {
      if (pose === player || !inArea(pose, W)) return false;
      if (pc) return centreDist(shoulderCentre(pose), pc) >= OTHER_MIN_GAP_W * W;
      if (rivalsNow.has(pose)) return true;
      // With the player away, a body that may be them coming back is not flagged (follow decides).
      return !missing && !mayBePlayer(pose, poses, d);
    });
    if (found) {
      if (otherSince < 0) otherSince = t;
      otherLastAt = t;
      if (t - otherSince >= OTHER_ON_MS) otherPerson = true;
    } else if (!missing && t - otherLastAt >= OTHER_OFF_MS) {
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
      updateOther(poses, t, d, updateRivals(poses, t, d.readout.W));
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
        rivals = [];
        maybeRivals = [];
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
