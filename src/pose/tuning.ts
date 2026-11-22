// Owner: A. Every tunable number for pose tracking lives here (AGENTS.md rule 10).

/** Assets served from public/ — never a CDN (AGENTS.md rule 11). */
export const WASM_PATH = '/mediapipe/wasm';
export const MODEL_PATH = '/models/pose_landmarker_lite.task';

/** Camera request. 640×480 keeps the model fast on weak laptops. */
export const VIDEO_WIDTH = 640;
export const VIDEO_HEIGHT = 480;
/** Video width / height assumed until the camera reports its real size. */
export const DEFAULT_ASPECT = VIDEO_WIDTH / VIDEO_HEIGHT;

/** MediaPipe confidences (0 to 1). */
export const MIN_DETECTION_CONFIDENCE = 0.5;
export const MIN_PRESENCE_CONFIDENCE = 0.5;
export const MIN_TRACKING_CONFIDENCE = 0.5;

/**
 * Bodies MediaPipe looks for. 2, so a second person in the frame is reported next to the player
 * instead of replacing them (session.ts follows the player and flags the other one).
 */
export const MAX_POSES = 2;
/** pickBody (calibration only): score = shoulder width minus this × distance from the last position. */
export const PICK_DISTANCE_WEIGHT = 0.5;

/*
 * Following the player after calibration, and someone else in the frame (session.ts). Distances
 * are in the player's shoulder width W; positions are shoulder centres. The play area is fixed
 * where calibration put it: the calibrated centre, in the calibrated W.
 */
/**
 * Following: the player is the body nearest their last pose (nose, shoulders, hips), if it moved
 * at most this fast since (W per second). Recorded jumps peak at 8-10 W/s between two frames.
 */
export const FOLLOW_MAX_SPEED_W = 10;
/** ... never less than this (landmark jitter, a slow frame) ... */
export const FOLLOW_MIN_STEP_W = 0.4;
/**
 * ... and never more than this, however long the gap: a stranger walking in while the player
 * is missing must not be taken for them. Recorded moves cover at most 1.6 W in 100 ms.
 */
export const FOLLOW_MAX_STEP_W = 1.2;
/**
 * ... and its shoulder width within this fraction of the last frame's (x0.7-1.43). Recorded clips
 * change by at most x1.30 in 100 ms and x1.38 in 400 ms; on camera, a newcomer walking in front
 * of the player read x1.56 and was followed at the old x0.6-1.67.
 */
export const FOLLOW_SIZE_TOLERANCE = 0.3;
/** Following holds across a gap this long; after it the player must be found again (below). */
export const FOLLOW_GAP_MS = 400;
/**
 * Found again: a body standing still near the mark with the player's size (W and, on the floor,
 * torso T, each within this fraction) ...
 */
export const REFIND_SIZE_TOLERANCE = 0.25;
/**
 * ... or, alone in the play area, within this one (x0.6-1.67): a player coming back a step
 * closer (1.5 m -> 1 m: x1.5) or further (-> 2.1 m: x0.7). With someone else in the play area,
 * only the first. A body outside it on the mark is someone else.
 */
export const REFIND_ALONE_SIZE_TOLERANCE = 0.4;
/** Where to look: within this many W of where the player vanished, or of the calibrated centre. */
export const REFIND_AREA_W = 1;
/** Still: the shoulder centre stays within this many W ... */
export const REFIND_STILL_W = 0.3;
/** ... for this long. A person walking across never stops long enough. */
export const REFIND_STILL_MS = 400;
/**
 * Someone else in the play area: shoulder centre within this many W of the mark (the lanes plus
 * a body), and shoulder width at least this fraction of the player's. Smaller = far behind (the
 * expo crowd), never a pause.
 */
export const OTHER_AREA_W = 1.5;
export const OTHER_MIN_SIZE = 0.6;
/** A second pose this close to the player (shoulder centres, in W) is the same body twice. */
export const OTHER_MIN_GAP_W = 0.5;
/** otherPerson turns on after this long with someone else in the area, off after this long without. */
export const OTHER_ON_MS = 300;
export const OTHER_OFF_MS = 500;
/**
 * Someone else remembered (session.ts rivals): a body seen at least OTHER_MIN_GAP_W from the
 * player within this long of the player being seen is a second person (one body cannot be in two
 * places 3 frames apart). On camera, two people side by side were reported one per frame.
 */
export const RIVAL_WINDOW_MS = 100;
/** ... and is forgotten after this long out of view. It is never followed or taken as the player. */
export const RIVAL_MEMORY_MS = 500;

/** Skeleton drawing. Landmarks below this visibility are drawn dimmed. */
export const DRAW_MIN_VISIBILITY = 0.5;
export const DRAW_LINE_WIDTH = 4;
export const DRAW_POINT_RADIUS = 4;

/**
 * A gap between two frames with the body this long or longer (it was away) restarts smoothing,
 * and no speed or drift is measured across it. Shorter gaps (a visibility flicker) keep both.
 */
export const GAP_RESET_MS = 500;

/*
 * Pause gesture (gesture.ts): forearms crossed in an X in front of the chest, held. Distances in
 * the calibrated W (x) and T (y), like the moves.
 */
/** The wrists must be past each other by this much (hands just touching or clapping is not an X). */
export const GESTURE_CROSS_W = 0.08; // A's real X: 0.13–0.38 W
/**
 * Chest height: both wrists no higher than the nose (so it never overlaps arms up) and at most this
 * far below the shoulders (above the hips: arms hanging are not an X). A's real X sits at chin
 * height, 0.2–0.27 T above the shoulders.
 */
export const GESTURE_BELOW_SHOULDER_T = 0.7;
/** Both wrists within this distance of the body's centre line (in front of the chest). */
export const GESTURE_NEAR_CENTRE_W = 1.2;
/** Held this long, the X fires once; then the arms must uncross before it can fire again. */
export const GESTURE_HOLD_MS = 1000;
/** A break shorter than this (a flicker, a wobble) neither restarts the hold nor counts as uncrossed. */
export const GESTURE_GRACE_MS = 200;

/** FPS counter window. */
export const FPS_WINDOW_MS = 1000;

/**
 * Frame watchdog: while the video is off the page, requestVideoFrameCallback stops firing; every
 * interval, if no frame was processed for the stale time, a frame is processed on the timer.
 */
export const WATCHDOG_INTERVAL_MS = 30;
export const WATCHDOG_STALE_MS = 100;
/** No new camera frame for this long = the camera stalled; frames count as "no body" from then. */
export const CAMERA_STALL_MS = 1000;

/** Debug overlay text refresh interval (not every frame), and how long "Copied" shows. */
export const OVERLAY_REFRESH_MS = 150;
export const COPIED_LABEL_MS = 1500;
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
/** Treadmill: the shoulders may bob (jogging) this much; only W and T must hold still. */
export const CALIBRATION_STILL_T_TREADMILL = 0.4;
/** Floor mode: too far when T is under this fraction of the frame height. */
export const CALIBRATION_MIN_T_FRAME = 0.15;
/** Treadmill mode: too far when W is under this fraction of the frame width. */
export const CALIBRATION_MIN_W_FRAME = 0.12;
/**
 * Floor calibration: false = head to knees in view (about 1.5 m), true = head to feet (2–2.5 m).
 * Detection uses the hips, not the feet; players backing up to show their feet could not read the
 * screen any more, so the knees are enough.
 */
export const CALIBRATION_FEET_IN_VIEW = false;
/**
 * Floor calibration also needs a little room in the frame for the moves, in T: above the shoulders
 * so a crouch-and-jump still crosses its line (0.45 T) in view, and below the hips so a squat
 * crosses its line (0.3 T) in view. Deeper squats may take the hips to the bottom edge: detection
 * keeps tracking on the shoulders while ducking. In practice head and knees in view set the
 * distance. (1.0 T below the hips pushed A back to ~2 m; DECISIONS 42.)
 */
export const CALIBRATION_JUMP_ROOM_T = 0.5;
export const CALIBRATION_SQUAT_ROOM_T = 0.5;
/** A landmark counts as in frame inside this margin (fraction of the frame). */
export const CALIBRATION_EDGE_MARGIN = 0;
/** A problem shorter than this (a flicker) pauses the hold instead of restarting it. */
export const CALIBRATION_GRACE_MS = 250;
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
  AIRBORNE_MS: 450,
  JUMP_COOLDOWN_MS: 300,
  /**
   * For this long after a squat (or a pre-jump crouch) ends, a jump must rise higher, so standing
   * up, even onto the toes (≤ ~0.25 T), is not a jump but a crouch-and-jump (0.55–0.73 T) is.
   */
  JUMP_AFTER_SQUAT_MS: 400,
  JUMP_AFTER_SQUAT_ON_T: 0.45,
  /**
   * That higher line sits near the top of a crouch-and-jump, where the hips slow down: at 15 FPS
   * the frame past it can be slow (Greg: 0.66 T/s). So for it, a fast rise up to this long before
   * crossing counts too. Not for the normal line: rising onto the toes in a reach (~0.15 T) would
   * then be a jump.
   */
  JUMP_AFTER_SQUAT_SPEED_WINDOW_MS: 150,
  /**
   * While both arms are up (an overhead press or a held crate), a jump must rise this high: raising
   * both arms lifts the hip landmarks 0.10–0.16 T, right at JUMP_ON_T, and landmark noise then
   * fired false jumps (Patrick, greg/armsUp with ±1% noise). Real jumps start with the arms down
   * and peak at 0.49–0.70 T, so this never delays them.
   */
  JUMP_ARMS_UP_ON_T: 0.3,

  /** Squat: hip centre below standing height. `ducking` turns on at once (beams need it). */
  SQUAT_ON_T: 0.3,
  SQUAT_OFF_T: 0.15,
  /**
   * The squat event (a rep): held this long counts at once; a shorter squat (at least SQUAT_MIN_MS)
   * counts once the player is up, unless a jump follows within SQUAT_JUMP_GRACE_MS (a crouch).
   */
  SQUAT_HOLD_MS: 800,
  SQUAT_MIN_MS: 150,
  SQUAT_JUMP_GRACE_MS: 350,

  /** Arms: wrist height above the nose, in T (contract: up above nose, down below shoulder). */
  // Keep at 0.3: the game's pose latency leads (VISUAL_LEAD_SEC in src/game/tuning.ts) were tuned on
  // it. 0.4 would ignore hands resting on the head but adds ~70 ms of arm lag (DECISIONS.md 33).
  ARM_UP_ABOVE_NOSE_T: 0.3,
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

  /**
   * A distance change (a judge stepping closer or back; DECISIONS 44): W and T both off their
   * baselines by at least this fraction, the same way (T / W within RESCALE_SHAPE_TOL of W's ratio),
   * for RESCALE_CONFIRM_MS, re-baselines at once. Real moves never do this: in every clip T stays
   * ≤ 1.00 × while ducking, and normal play keeps W and T within 0.83–1.16 × with no arm up.
   */
  RESCALE_MIN: 0.2,
  RESCALE_SHAPE_TOL: 0.12,
  RESCALE_CONFIRM_MS: 300,
  /** ... without travelling sideways more than this (W) meanwhile (walking in or across is not a distance change). */
  RESCALE_MAX_SHIFT_W: 0.25,
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
  ['SQUAT_HOLD_MS', 200, 2000, 50],
  ['SQUAT_JUMP_GRACE_MS', 0, 800, 25],
  ['JUMP_AFTER_SQUAT_ON_T', 0.15, 1, 0.05],
  ['ARM_UP_ABOVE_NOSE_T', 0, 1, 0.05],
  ['ARM_DOWN_ABOVE_NOSE_T', -0.5, 0.5, 0.05],
  ['ARM_SETTLE_MS', 0, 600, 25],
  ['SMOOTHING_ALPHA', 0.1, 1, 0.05],
];
