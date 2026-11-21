// Owner: A. Pure calibration: frames in, CalibrationStatus out, then the player's Calibration.
// docs/CONTRACTS.md: about 1.5 s of standing still records the centre, W and T.
import type { CalibrationStatus, PlayMode } from '@/contracts';
import {
  type Calibration,
  type Point,
  coreLandmarks,
  L_ANKLE,
  L_HIP,
  L_KNEE,
  measureBody,
  NOSE,
  R_ANKLE,
  R_HIP,
  R_KNEE,
} from './detect';
import {
  CALIBRATION_EDGE_MARGIN,
  CALIBRATION_FEET_IN_VIEW,
  CALIBRATION_HOLD_MS,
  CALIBRATION_MIN_T_FRAME,
  CALIBRATION_MIN_VISIBILITY,
  CALIBRATION_MIN_W_FRAME,
  CALIBRATION_STILL_SCALE,
  CALIBRATION_STILL_T,
  TREADMILL_T_PER_W_PX,
} from './tuning';

/** Text the UI shows as is. */
export const CALIBRATION_MESSAGES: Record<PlayMode, Record<CalibrationStatus['step'], string>> = {
  floor: {
    noBody: 'Step in front of the camera so it can see your whole body.',
    tooFar: 'Come a little closer to the camera.',
    tooClose: 'Step back until your head and feet are both in view.',
    holdStill: 'Stand tall with your arms down and hold still…',
    done: 'Calibrated. Get ready!',
  },
  treadmill: {
    noBody: 'Stand in front of the camera so it can see your head and shoulders.',
    tooFar: 'Come closer: about 1 to 1.5 m from the screen.',
    tooClose: 'Step back a little so your head and shoulders fit in view.',
    holdStill: 'Hold still for a moment…',
    done: 'Calibrated. Start jogging!',
  },
};

export interface CalibrationUpdate {
  status: CalibrationStatus;
  /** Set once, on the frame the status becomes 'done'. */
  result?: Calibration;
}

export interface Calibrator {
  update(pose: Point[] | null, t: number): CalibrationUpdate;
}

const visible = (p: Point | undefined) => !!p && (p.visibility ?? 1) >= CALIBRATION_MIN_VISIBILITY;
const inFrameY = (p: Point) => p.y >= CALIBRATION_EDGE_MARGIN && p.y <= 1 - CALIBRATION_EDGE_MARGIN;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};

/**
 * Measures the body for a mode. Treadmill mode prefers the real torso length but estimates it
 * from the shoulder width when the hips are not in view (close to the camera).
 * `aspect` is the video's width / height, to convert W (x units) into y units.
 */
export function measureForMode(pose: Point[], mode: PlayMode, aspect: number): Calibration {
  const m = measureBody(pose, mode);
  if (mode === 'treadmill') {
    const hips = [pose[L_HIP], pose[R_HIP]];
    if (!hips.every((h) => visible(h) && inFrameY(h))) {
      m.T = TREADMILL_T_PER_W_PX * m.W * aspect;
    }
  }
  return m;
}

/** `aspect`: the video's width / height, or a getter (the camera may not be running yet). */
export function createCalibrator(
  mode: PlayMode,
  aspect: number | (() => number) = 4 / 3,
  feetInView = CALIBRATION_FEET_IN_VIEW,
): Calibrator {
  const getAspect = typeof aspect === 'function' ? aspect : () => aspect;
  const msg = CALIBRATION_MESSAGES[mode];
  let holdStart = -1;
  let ref: Calibration | null = null;
  let samples: Calibration[] = [];
  let finished = false;

  const status = (step: CalibrationStatus['step'], progress = 0): CalibrationStatus => ({
    step,
    progress,
    message: msg[step],
  });
  const resetHold = () => {
    holdStart = -1;
    ref = null;
    samples = [];
  };

  function update(pose: Point[] | null, t: number): CalibrationUpdate {
    if (finished) return { status: status('done', 1) };
    if (!pose || !coreLandmarks(mode).every((i) => visible(pose[i]))) {
      resetHold();
      return { status: status('noBody') };
    }
    const m = measureForMode(pose, mode, getAspect());

    if (mode === 'floor') {
      if (m.T < CALIBRATION_MIN_T_FRAME) {
        resetHold();
        return { status: status('tooFar') };
      }
      // Head and feet in view (contract). In a small room, CALIBRATION_FEET_IN_VIEW = false
      // asks only for the knees: detection itself uses the hips.
      const ends = feetInView
        ? [pose[NOSE], pose[L_ANKLE], pose[R_ANKLE]]
        : [pose[NOSE], pose[L_KNEE], pose[R_KNEE]];
      if (!ends.every((p) => visible(p) && inFrameY(p))) {
        resetHold();
        return { status: status('tooClose') };
      }
    } else {
      if (m.W < CALIBRATION_MIN_W_FRAME) {
        resetHold();
        return { status: status('tooFar') };
      }
      const nose = pose[NOSE];
      if (!visible(nose) || !inFrameY(nose)) {
        resetHold();
        return { status: status('tooClose') };
      }
    }

    // Holding still: restart the hold whenever the body moves or changes size too much.
    const moved =
      ref &&
      (Math.hypot(m.centreX - ref.centreX, m.centreY - ref.centreY) > CALIBRATION_STILL_T * ref.T ||
        Math.abs(m.T / ref.T - 1) > CALIBRATION_STILL_SCALE ||
        Math.abs(m.W / ref.W - 1) > CALIBRATION_STILL_SCALE);
    if (!ref || moved) {
      holdStart = t;
      ref = m;
      samples = [];
    }
    samples.push(m);
    const progress = Math.min(1, (t - holdStart) / CALIBRATION_HOLD_MS);
    if (progress < 1) return { status: status('holdStill', progress) };

    finished = true;
    const result: Calibration = {
      centreX: median(samples.map((s) => s.centreX)),
      centreY: median(samples.map((s) => s.centreY)),
      W: median(samples.map((s) => s.W)),
      T: median(samples.map((s) => s.T)),
    };
    return { status: status('done', 1), result };
  }

  return { update };
}
