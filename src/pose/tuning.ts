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

/** Skeleton drawing. Landmarks below this visibility are drawn dimmed. */
export const DRAW_MIN_VISIBILITY = 0.5;
export const DRAW_LINE_WIDTH = 4;
export const DRAW_POINT_RADIUS = 4;

/** FPS counter window. */
export const FPS_WINDOW_MS = 1000;

/*
 * Move detection. Distances are fractions of the calibrated shoulder width W (x) or
 * torso length T (y), so they adapt to height and distance (docs/CONTRACTS.md).
 * Values differ from the contract's starting table where A's recorded clips showed why.
 */

/** EMA weight of the newest frame (1 = no smoothing). */
export const SMOOTHING_ALPHA = 0.5;

/** Lane: hip centre offset from the calibrated centre. Contract starts at 0.8 / 0.4; A's left step was only 0.8 W. */
export const LANE_ON_W = 0.55;
export const LANE_OFF_W = 0.3;

/** Jump: hip centre above standing height, moving up faster than this (T per second). */
export const JUMP_ON_T = 0.15;
export const JUMP_MIN_UP_SPEED_T = 0.5;
export const AIRBORNE_MS = 450;
export const JUMP_COOLDOWN_MS = 300;
/** Ignore the rise for this long after a squat ends, so standing up is not a jump. */
export const JUMP_BLOCK_AFTER_SQUAT_MS = 400;

/** Squat: hip centre below standing height. */
export const SQUAT_ON_T = 0.3;
export const SQUAT_OFF_T = 0.15;

/**
 * Arms, measured as wrist height above the nose in T. Contract: up above the nose, down below
 * the shoulder; A's clips showed presses back only to shoulder height, so down is near the nose.
 */
export const ARM_UP_ABOVE_NOSE_T = 0.3;
export const ARM_DOWN_ABOVE_NOSE_T = 0.05;
/** One arm up must stay alone this long to count as a reach, not the start of armsUp. */
export const ARM_SETTLE_MS = 250;

/** Tracking: shoulders and hips below this visibility, or hips outside the frame, count as missing. */
export const TRACKING_MIN_VISIBILITY = 0.5;
export const TRACKING_LOST_MS = 500;
export const TRACKING_REGAINED_MS = 300;

/** Standing height and torso length drift toward the current value at this rate (per second) while idle. */
export const BASELINE_DRIFT_PER_SEC = 0.3;

/** Debug recorder: countdown before a clip, clip length, decimals kept in the JSON. */
export const RECORD_COUNTDOWN_MS = 3000;
export const RECORD_DURATION_MS = 8000;
export const RECORD_DECIMALS = 4;
