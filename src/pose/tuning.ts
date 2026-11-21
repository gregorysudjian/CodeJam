// Owner: A. Every tunable number for pose tracking lives here (AGENTS.md rule 10).

/** Assets served from public/ — never a CDN (AGENTS.md rule 11). */
export const WASM_PATH = '/mediapipe/wasm';
export const MODEL_PATH = '/models/pose_landmarker_lite.task';

/** Camera request. 640×480 keeps the model fast on weak laptops. */
export const VIDEO_WIDTH = 640;
export const VIDEO_HEIGHT = 480;

/** MediaPipe confidences (0 to 1). */
export const MIN_DETECTION_CONFIDENCE = 0.5;
export const MIN_PRESENCE_CONFIDENCE = 0.5;
export const MIN_TRACKING_CONFIDENCE = 0.5;

/**
 * Bodies MediaPipe looks for. With more than 1, pickBody keeps the player (largest, closest to
 * where the player was) and ignores people behind them. Costs FPS: measure before raising it.
 */
export const MAX_POSES = 1;
/** pickBody: score = shoulder width minus this × distance from the player's last position. */
export const PICK_DISTANCE_WEIGHT = 0.5;
/**
 * After calibration, a body whose shoulder width is off by more than this fraction from the
 * player's is someone else (e.g. a person behind the player after the player walks off).
 * A's clips vary by at most about ±30% (arms up, turning slightly).
 */
export const PICK_SIZE_TOLERANCE = 0.4;

/** Skeleton drawing. Landmarks below this visibility are drawn dimmed. */
export const DRAW_MIN_VISIBILITY = 0.5;
export const DRAW_LINE_WIDTH = 4;
export const DRAW_POINT_RADIUS = 4;

/** FPS counter window. */
export const FPS_WINDOW_MS = 1000;

/**
 * Frame watchdog: while the video is off the page, requestVideoFrameCallback stops firing; every
 * interval, if no frame was processed for the stale time, a frame is processed on the timer.
 */
export const WATCHDOG_INTERVAL_MS = 30;
export const WATCHDOG_STALE_MS = 100;

/** Debug overlay text refresh interval (not every frame). */
export const OVERLAY_REFRESH_MS = 150;
/** Moves the overlay lists. */
export const RECENT_EVENTS = 6;
/** Calibration progress is reported in steps of this size, not every frame. */
export const CALIBRATION_STATUS_STEP = 0.05;

/*
 * Calibration (docs/CONTRACTS.md): about 1.5 s of standing still records the centre, the
 * shoulder width W and the torso length T.
 */
export const CALIBRATION_HOLD_MS = 1500;
/** Holding still: the centre may wander this far (in T) and W/T change by this fraction. */
export const CALIBRATION_STILL_T = 0.1;
export const CALIBRATION_STILL_SCALE = 0.15;
/** Floor mode: too far when T is under this fraction of the frame height. */
export const CALIBRATION_MIN_T_FRAME = 0.15;
/** Treadmill mode: too far when W is under this fraction of the frame width. */
export const CALIBRATION_MIN_W_FRAME = 0.12;
/**
 * Floor calibration wants the head and feet in view (CONTRACTS.md). If the venue room is too small
 * to get the feet in frame, set false: then head and knees are enough (detection uses the hips).
 */
export const CALIBRATION_FEET_IN_VIEW = true;
/** A landmark counts as in frame inside this margin (fraction of the frame). */
export const CALIBRATION_EDGE_MARGIN = 0;
/** Visibility a landmark needs to count during calibration. */
export const CALIBRATION_MIN_VISIBILITY = 0.5;
/** Treadmill mode without visible hips: T estimated from W, in pixels (A's clips: T ≈ 1.5 W). */
export const TREADMILL_T_PER_W_PX = 1.5;

/** Recorder on the debug page: countdown before a clip, clip length, decimals in the JSON. */
export const RECORD_COUNTDOWN_MS = 3000;
export const RECORD_DURATION_MS = 8000;
export const RECORD_DECIMALS = 4;

/*
 * Move detection. Distances are fractions of the calibrated shoulder width W (x) or torso
 * length T (y), so they adapt to height and distance (docs/CONTRACTS.md). Values differ from
 * the contract's starting table where A's recorded clips showed why (src/pose/DECISIONS.md).
 *
 * This object is read live on every frame, so the debug overlay's sliders can change it.
 */
export const DETECTION_DEFAULTS = Object.freeze({
  /** EMA weight of the newest frame (1 = no smoothing). */
  SMOOTHING_ALPHA: 0.5,

  /** Lane: hip centre offset from the calibrated centre (contract: 0.8 / 0.4). */
  LANE_ON_W: 0.55,
  LANE_OFF_W: 0.3,

  /** Jump: hip centre above standing height while moving up faster than this (T per second). */
  JUMP_ON_T: 0.15,
  JUMP_MIN_UP_SPEED_T: 1.0, // A's jumps rise 1.1–3.6 T/s (even at 40% dropped frames); a quick step back ~0.6
  /** The upward speed is measured over this window (ms). */
  JUMP_SPEED_WINDOW_MS: 150,
  AIRBORNE_MS: 450,
  JUMP_COOLDOWN_MS: 300,
  /**
   * For this long after a squat (or a pre-jump crouch) ends, a jump must rise higher, so standing
   * up, even onto the toes (≤ ~0.25 T), is not a jump but a crouch-and-jump (0.55–0.73 T) is.
   */
  JUMP_AFTER_SQUAT_MS: 400,
  JUMP_AFTER_SQUAT_ON_T: 0.45,

  /** Squat: hip centre below standing height. `ducking` turns on at once (beams need it). */
  SQUAT_ON_T: 0.3,
  SQUAT_OFF_T: 0.15,
  /** The squat event (a rep) needs this long below the line; pre-jump crouches last 0.13–0.3 s. */
  SQUAT_CONFIRM_MS: 250,

  /** Arms: wrist height above the nose, in T (contract: up above nose, down below shoulder). */
  ARM_UP_ABOVE_NOSE_T: 0.4,
  ARM_DOWN_ABOVE_NOSE_T: 0.05,
  /** One arm up must stay alone this long to count as a reach, not the start of armsUp. */
  ARM_SETTLE_MS: 250,

  /** Tracking: core landmarks below this visibility, or the centre outside the frame, = missing. */
  TRACKING_MIN_VISIBILITY: 0.5,
  TRACKING_LOST_MS: 500,
  TRACKING_REGAINED_MS: 300,

  /** Standing height, T and W drift toward the current value at this rate (per second) while idle. */
  BASELINE_DRIFT_PER_SEC: 0.3,
  /** The lane centre drifts slower, and only while in the centre lane. */
  CENTRE_DRIFT_PER_SEC: 0.1,
  /** Standing still = the centre stayed within this (T) for this long. Only then baselines drift. */
  IDLE_STILL_T: 0.05,
  IDLE_STILL_MS: 500,
  /** No drift beyond this distance from standing height (T): stepping 20% closer moves ~0.18 T. */
  IDLE_MAX_DROP_T: 0.25,
});

export type DetectionTuning = { -readonly [K in keyof typeof DETECTION_DEFAULTS]: number };

/** Live values. The debug sliders write here; everything else only reads. */
export const DETECTION: DetectionTuning = { ...DETECTION_DEFAULTS };

export function resetDetectionTuning(): void {
  Object.assign(DETECTION, DETECTION_DEFAULTS);
}

/** Sliders on the debug overlay: [key, min, max, step]. */
export const SLIDERS: [keyof DetectionTuning, number, number, number][] = [
  ['LANE_ON_W', 0.2, 1.2, 0.05],
  ['LANE_OFF_W', 0.1, 0.8, 0.05],
  ['JUMP_ON_T', 0.05, 0.5, 0.01],
  ['JUMP_MIN_UP_SPEED_T', 0, 3, 0.1],
  ['SQUAT_ON_T', 0.1, 0.8, 0.02],
  ['SQUAT_OFF_T', 0.05, 0.5, 0.01],
  ['ARM_UP_ABOVE_NOSE_T', 0, 1, 0.05],
  ['ARM_DOWN_ABOVE_NOSE_T', -0.5, 0.5, 0.05],
  ['ARM_SETTLE_MS', 0, 600, 25],
  ['SMOOTHING_ALPHA', 0.1, 1, 0.05],
];
