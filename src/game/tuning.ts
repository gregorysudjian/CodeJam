import type { MoveType } from '@/contracts';

// Every tunable number for the game lives here.

/* ── Judging (CONTRACTS.md collision rules) ── */
export const WINDOW_BEFORE_SEC = 0.35; // cleared if the move happens from t - 0.35 s ...
export const WINDOW_AFTER_SEC = 0.15; // ... to t + 0.15 s
export const HOLD_GRACE_SEC = 0.3; // a held beam / crate tolerates a gap this long
export const CUE_LEAD_SEC = 2.0; // 'cue' fires this long before a wave arrives
/**
 * Latency compensation: each object is drawn this far ahead of the judging clock, by the move
 * that clears it, so it visually reaches the runner this much before its judging time t. A
 * player who moves when it reaches the runner is then seen inside [t - 0.35, t + 0.15] despite
 * the webcam lag. Lags measured on A's recorded clips (movement onset to detector state):
 * jump 57-78 ms, squat 281-286, arms 235-306, sidestep 209-271, plus about 0.1 s of camera
 * and model latency. Lead = lag - 0.15 + 0.05 margin. The keyboard has no lag, so no lead.
 * Judging itself never changes (contract); latency.test.ts checks these numbers.
 */
export const VISUAL_LEAD_SEC: Record<'pose' | 'keyboard', Readonly<Record<MoveType, number>>> = {
  pose: { jump: 0.1, sidestep: 0.25, squat: 0.3, armsUp: 0.3, reachLeft: 0.3, reachRight: 0.3 },
  keyboard: { jump: 0, sidestep: 0, squat: 0, armsUp: 0, reachLeft: 0, reachRight: 0 },
};
export const STREAK_TIERS = [5, 10, 20] as const; // fever tiers, same steps as the multiplier

/* ── Loop ── */
export const MAX_DT_SEC = 0.05; // clamp: a stall or background tab never skips a window
export const MAX_PIXEL_RATIO = 2;
// Quality ladder (quality.ts): in auto mode, a round that runs under QUALITY_MIN_FPS over a
// QUALITY_WINDOW_SEC window (after QUALITY_SKIP_SEC of start-up) steps down one level.
// `?gfx=high|medium|low` fixes the level, `?gfx=2d` forces the fallback (also localStorage 'game.gfx').
export const QUALITY_MIN_FPS = 45;
export const QUALITY_WINDOW_SEC = 3;
export const QUALITY_SKIP_SEC = 1;
export const QUALITY_PANIC_FPS = 20; // below this, step down after QUALITY_PANIC_SEC, not a full window
export const QUALITY_PANIC_SEC = 0.5;

/* ── Speed and distance (world units: 1 ≈ 1 m) ── */
export const SPEED_MIN = 12; // units per second at intensity 0
export const SPEED_MAX = 21; // units per second at intensity 1
export const SPEED_TABLE_STEP_SEC = 0.05; // resolution of the precomputed distance table
export const VIEW_DISTANCE = 95; // objects appear this far ahead
export const DESPAWN_BEHIND = 8; // and are recycled this far behind the player
export const COAST_DECAY = 1.4; // after the finish the world slows to a stop (per second)
export const FINISH_HEIGHT = 5.2; // finish arch

/* ── Track ── */
export const LANE_WIDTH = 2.2;
export const TRACK_LENGTH = 220;
export const GRID_TILE = 4; // world units per floor grid square
export const DASH_SPACING = 6;
export const ARCH_SPACING = 26;
export const ARCH_COUNT = 6;
export const ARCH_HEIGHT = 6.2; // above the camera, so the top bar never sweeps across the view
export const TOWER_COUNT = 48;
export const TOWER_PARALLAX = 0.6; // skyline scrolls slower than the track
export const SPEED_LINE_COUNT = 60;
export const SPEED_LINE_LENGTH = 2.6;
export const SPEED_LINE_SPAN = 70; // they recycle over this distance
export const SPEED_LINE_RATE = 1.8; // they move faster than the track

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
export const FOV_KICK_SPEED = 5; // degrees added at full speed
export const FOV_KICK_TIER = 1.5; // degrees added per streak tier
export const PAUSE_DIM = 0.55; // darkness of the paused scene

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
export const STUMBLE_SEC = 0.5;
export const AURA_OPACITY = 0.28; // hold feedback column around the runner
export const AURA_PULSE_HZ = 1.4; // red 'not holding' pulse; must stay well under 3

/* ── Obstacles ── */
export const BLOCK_HEIGHT = 1.9;
export const BLOCK_DEPTH = 0.9;
export const HURDLE_HEIGHT = 0.55;
export const BEAM_HEIGHT = 1.45; // underside of the overhead beam
export const BEAM_MIN_DEPTH = 0.35;
export const BEAM_RIB_SPACING = 2.5; // crossbars along a held beam
export const BEAM_MAX_RIBS = 16;
export const CRATE_HEIGHT = 2.3;
export const ORB_HEIGHT = 2.35;
export const ORB_RADIUS = 0.42;
export const TELEGRAPH_LENGTH = 5; // floor marker painted ahead of each object
export const SMASH_SEC = 0.7; // crate fragments / orb collect animation
export const BURST_SEC = 0.45;
export const COLLECT_SEC = 0.35; // an orb flies into the hand
export const COLLECT_PULL = 14; // how fast it homes in (per second)
export const ICON_SIZE = 1.5; // move icon above each object, world units
export const ICON_BRIGHTNESS = 1.6; // above 1 so it glows a little
export const BURST_POOL = 10;
export const POOL_WARM = 4; // views of each kind built up front

/* ── Sound ── */
export const AUDIO_VOLUME = 0.35;
export const AUDIO_BASE_HZ = 392; // G4; each move is a fixed interval above or below
export const SAW_VOLUME = 0.6; // move confirmations sit under the effects
export const SAW_MIN_GAP_SEC = 0.15;
export const AUDIO_CLOSE_DELAY_MS = 2000; // let the finish fanfare ring out after destroy()
