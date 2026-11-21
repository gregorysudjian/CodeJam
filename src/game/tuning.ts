// Every tunable number for the game lives here.

/* ── Judging (CONTRACTS.md collision rules) ── */
export const WINDOW_BEFORE_SEC = 0.35; // cleared if the move happens from t - 0.35 s ...
export const WINDOW_AFTER_SEC = 0.15; // ... to t + 0.15 s
export const HOLD_GRACE_SEC = 0.3; // a held beam / crate tolerates a gap this long
export const CUE_LEAD_SEC = 2.0; // 'cue' fires this long before a wave arrives

/* ── Loop ── */
export const MAX_DT_SEC = 0.05; // clamp: a stall or background tab never skips a window
export const MAX_PIXEL_RATIO = 2;

/* ── Speed and distance (world units: 1 ≈ 1 m) ── */
export const SPEED_MIN = 12; // units per second at intensity 0
export const SPEED_MAX = 21; // units per second at intensity 1
export const SPEED_TABLE_STEP_SEC = 0.05; // resolution of the precomputed distance table
export const VIEW_DISTANCE = 95; // objects appear this far ahead
export const DESPAWN_BEHIND = 8; // and are recycled this far behind the player

/* ── Track ── */
export const LANE_WIDTH = 2.2;
export const TRACK_LENGTH = 220;
export const GRID_TILE = 4; // world units per floor grid square
export const DASH_SPACING = 6;
export const ARCH_SPACING = 26;
export const ARCH_COUNT = 6;
export const ARCH_HEIGHT = 4.4;
export const TOWER_COUNT = 48;
export const TOWER_PARALLAX = 0.6; // skyline scrolls slower than the track

/* ── Look ("Neon Arena", matches the UI) ── */
export const COLOR_BG = 0x07090d;
export const COLOR_FLOOR = 0x0b0f16;
export const COLOR_GRID = 0x1a2433;
export const COLOR_LIME = 0xc6ff3d;
export const COLOR_HIT = 0xff3b3b;
export const COLOR_BODY = 0x0d121a; // dark obstacle bodies; the neon edges carry the colour
export const MOVE_COLOR = {
  sidestep: 0x22d3ee,
  jump: 0xc6ff3d,
  squat: 0xffb020,
  armsUp: 0xff3dcb,
  reach: 0x8b5cf6,
} as const;
export const FOG_NEAR = 30;
export const FOG_FAR = 105;
export const BLOOM_ENABLED = true; // false = plain render, for weak laptops
export const BLOOM_STRENGTH = 0.55;
export const BLOOM_RADIUS = 0.2;
export const BLOOM_THRESHOLD = 1.0; // only colours boosted by NEON_BOOST pass it
export const NEON_BOOST = 1.7; // neon parts are drawn brighter than 1.0 (HDR) so they bloom
export const COLOR_TRACK = 0x101724;

/* ── Camera ── */
export const CAMERA_FOV = 62;
export const CAMERA_POS = { x: 0, y: 4.3, z: 7.4 };
export const CAMERA_LOOK = { x: 0, y: 0.6, z: -14 };
export const CAMERA_FOLLOW_X = 0.35; // fraction of the player's x the camera follows
export const SHAKE_AMPLITUDE = 0.22;
export const SHAKE_DECAY = 7; // per second

/* ── Player ── */
export const PLAYER_RADIUS = 0.36;
export const PLAYER_BODY_LENGTH = 0.85;
export const LANE_SLIDE_RATE = 14; // exponential approach per second
export const JUMP_HEIGHT = 1.5;
export const JUMP_VISUAL_SEC = 0.6;
export const CROUCH_SCALE = 0.58;
export const CROUCH_RATE = 18;
export const ARM_RATE = 16;
export const RUN_BOB_HZ = 2.6;
export const RUN_BOB_HEIGHT = 0.06;
export const HIT_FLASH_SEC = 0.35;

/* ── Obstacles ── */
export const BLOCK_HEIGHT = 1.9;
export const BLOCK_DEPTH = 0.9;
export const HURDLE_HEIGHT = 0.55;
export const BEAM_HEIGHT = 1.45; // underside of the overhead beam
export const BEAM_MIN_DEPTH = 0.35;
export const CRATE_HEIGHT = 2.3;
export const ORB_HEIGHT = 2.35;
export const ORB_RADIUS = 0.34;
export const TELEGRAPH_LENGTH = 5; // floor marker painted ahead of each object
export const SMASH_SEC = 0.7; // crate fragments / orb collect animation
export const BURST_SEC = 0.45;
export const BURST_POOL = 10;
export const POOL_WARM = 4; // views of each kind built up front
