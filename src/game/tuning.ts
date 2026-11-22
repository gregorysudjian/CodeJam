import type { MoveType } from '@/contracts';

// Every tunable number for the game lives here.

/* ── Judging (CONTRACTS.md collision rules) ── */
export const WINDOW_BEFORE_SEC = 0.35; // cleared if the move happens from t - 0.35 s ...
export const WINDOW_AFTER_SEC = 0.15; // ... to t + 0.15 s
export const HOLD_GRACE_SEC = 0.3; // a held beam / crate tolerates a gap this long
export const CUE_LEAD_SEC = 2.0; // 'cue' fires this long before a wave arrives
// Every resume (Esc or X, tracking back, the other person gone) counts 3-2-1 first, game time
// frozen ('resuming', then 'resumed'). Counted in real time; a frame longer than
// RESUME_MAX_DT_SEC (a stall, a hidden tab) counts as that long.
export const RESUME_COUNTDOWN_SEC = 3;
export const RESUME_MAX_DT_SEC = 0.25;
// Lives: each hit on a block, hurdle, beam or crate costs one ('lifeLost'); a missed orb doesn't.
// After a lost life, this much game time in which no other can go (one held beam, or a block and
// its orb, is one mistake). With none left the runner stumbles, OUT OF LIVES shows, and
// 'finished' (reason 'outOfLives') follows OUT_OF_LIVES_SEC of real time later.
export const LIVES = 3;
export const LIFE_GRACE_SEC = 1.5;
export const OUT_OF_LIVES_SEC = 1.5;
/**
 * Latency compensation: each object is drawn this far ahead of the judging clock, by the move
 * that clears it, so it visually reaches the runner this much before its judging time t. A
 * player who moves when it reaches the runner is then seen inside [t - 0.35, t + 0.15] despite
 * the webcam lag. Lags measured on A's recorded clips (movement onset to detector state):
 * jump 57-78 ms, squat 281-286, arms 235-306, sidestep 209-271, plus about 0.1 s of camera
 * and model latency. Lead = lag - 0.15 + 0.05 margin. The keyboard has no lag, so no lead.
 * Judging itself never changes (contract); latency.test.ts checks these numbers.
 */
export type LeadTable = Readonly<Record<MoveType, number>>;
/** The current lead table. A function, because the app can switch input mid-round (K). */
export type Leads = () => LeadTable;
export const VISUAL_LEAD_SEC: Record<'pose' | 'keyboard', LeadTable> = {
  pose: { jump: 0.1, sidestep: 0.25, squat: 0.3, armsUp: 0.3, reachLeft: 0.3, reachRight: 0.3 },
  keyboard: { jump: 0, sidestep: 0, squat: 0, armsUp: 0, reachLeft: 0, reachRight: 0 },
};
// A mid-round switch (K) blends the drawn leads at this many seconds of lead per second, so
// objects slow down for at most 0.6 s instead of jumping (timeline.ts createLeadBlend).
export const LEAD_BLEND_PER_SEC = 0.5;
/* ── Ghost runner (ghost.ts, ghostStore.ts) ── */
export const GHOST_HZ = 20; // recorded samples per second of game time
export const GHOST_MAX_SAMPLES = 15_000; // rounds last at most 600 s: 12,000 samples, plus margin
export const GHOST_MAX_STORED = 10; // levels with a stored ghost (most recent kept)
export const GHOST_COLOR = 0xbfefff; // see-through glass body
export const GHOST_OPACITY = 0.35;
export const GHOST_ACCENT = 0x22d3ee; // cyan visor, belt, hands, ring: never the player's lime
export const GHOST_ACCENT_OPACITY = 0.55;
export const GHOST_SCALE = 1.04; // in the same lane it wraps the player as a shell
export const BANNER_POS = { x: 0, y: 3.3, z: -5 }; // in front of the fixed camera, above the track
export const BANNER_WIDTH = 6.2; // world units
export const BANNER_POP_SEC = 0.35; // scale-in (none with reduced motion)
export const RACE_POS = { x: 0, y: 6.2, z: -6 }; // live "+2 VS GHOST" chip: top centre, above the horizon and the finish arch
export const RACE_WIDTH = 3.4; // world units: readable from 2 m
export const RACE_PULSE = 0.3; // the chip pops 30 % larger when the lead changes ...
export const RACE_PULSE_SEC = 0.45; // ... and settles over this long (none with reduced motion)

/* ── Timing grades and combo (feedback.ts) ── */
/**
 * A clear is graded by when its move was first seen, in game seconds from the object's time t
 * (the window is -0.35 to +0.15). The camera's lag makes the same on-time move land later on
 * the judging clock: with the leads above, a camera player who moves as the object reaches the
 * runner is seen about 0.1 s after t, a keyboard player at t. So the bands differ by input.
 * Before `perfectFrom`: GOOD (early); from `lateFrom`: LATE; in between: PERFECT.
 */
export const GRADE_BANDS: Record<'pose' | 'keyboard', { perfectFrom: number; lateFrom: number }> = {
  pose: { perfectFrom: -0.12, lateFrom: 0.125 },
  keyboard: { perfectFrom: -0.15, lateFrom: 0.07 },
};
export const COMBO_MILESTONES = [5, 10, 20] as const; // then every COMBO_MILESTONE_EVERY
export const COMBO_MILESTONE_EVERY = 10;
export const COMBO_SHOW_FROM = 2; // the combo counter under the runner shows from this streak
export const GRADE_SEC = 0.75; // the grade word beside the runner: pops, rises, fades
export const GRADE_RISE = 0.55; // world units it rises (none with reduced motion)
export const GRADE_POS = { side: 1.55, y: 1.75, z: 0.6 }; // beside the runner, over judged ground
export const GRADE_WIDTH = 2.3; // world units
export const COMBO_POS = { y: 0.32, z: 1.6 }; // on the floor just behind the runner
export const COMBO_WIDTH = 1.9;
// Top of the sky band, above the ghost race chip: never over the far end of the track, where
// new obstacles appear.
export const MILESTONE_POS = { x: 0, y: 7.4, z: -6 };
export const MILESTONE_WIDTH = 5.4;
export const MILESTONE_SEC = 1.3;
export const SHOCKWAVE_SEC = 0.55; // floor ring at a milestone
export const SHOCKWAVE_SCALE = 9;

/* Timing probe (?debug=timing, timing.ts): data for tuning VISUAL_LEAD_SEC with the camera. */
export const TIMING_PROBE_SEC = 1; // watch each object from t - 1 s to t + 1 s
export const TIMING_PROBE_FIRST_FRAME_SEC = 0.1; // satisfied this soon = the player did not move
export const TIMING_MAX_LEAD_SEC = 0.5; // never suggest more
export const STREAK_TIERS = [5, 10, 20] as const; // fever tiers, same steps as the multiplier

/* ── Loop ── */
export const MAX_DT_SEC = 0.05; // clamp: a stall or background tab never skips a window
export const MAX_PIXEL_RATIO = 2;
// Quality ladder (quality.ts): in auto mode, a round that runs under QUALITY_MIN_FPS over a
// QUALITY_WINDOW_SEC window (after QUALITY_SKIP_SEC of start-up) steps down one level.
// `?gfx=high|medium|low` fixes the level, `?gfx=2d` forces the fallback (also localStorage 'game.gfx').
export const QUALITY_MIN_FPS = 45;
// 1 s skip + 2 s window: a slow laptop steps down at 3 s, before the first object can arrive
// (the contract puts the first wave at 4 s or later), not in the middle of it.
export const QUALITY_WINDOW_SEC = 2;
export const QUALITY_SKIP_SEC = 1;
export const QUALITY_PANIC_FPS = 20; // below this, step down after QUALITY_PANIC_SEC, not a full window
export const QUALITY_PANIC_SEC = 0.5;
export const QUALITY_MAX_FRAME_SEC = 0.25; // a longer frame (hidden tab, hitch) counts as this long

/* ── Speed and distance (world units: 1 ≈ 1 m) ── */
export const SPEED_MIN = 12; // units per second at intensity 0
export const SPEED_MAX = 21; // units per second at intensity 1
export const SPEED_TABLE_STEP_SEC = 0.05; // resolution of the precomputed distance table
// At a level boundary (the portal) the speed eases to the new level's over this long.
export const LEVEL_SPEED_EASE_SEC = 1;
export const VIEW_DISTANCE = 95; // objects appear this far ahead
export const DESPAWN_BEHIND = 8; // and are recycled this far behind the player
export const COAST_DECAY = 1.4; // after the finish the world slows to a stop (per second)
export const FINISH_HEIGHT = 5.2; // finish arch
export const FINISH_FADE_START = 0.5; // the arch dissolves as it passes the runner (z ahead of it)...
export const FINISH_FADE_END = 4; // ...gone before it reaches the camera (z 7.4)

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

/* ── World zones (world.ts): the track travels through these, in order ── */
export const ZONE_TUNNEL_AT = 0.3; // fraction of the round
export const ZONE_BRIDGE_AT = 0.52;
export const FINALE_SEC = 10; // the last 10 s are the finale stretch
export const ZONE_BLEND = 30; // world units over which the colours change at a border
export const ZONE_RISE = 22; // scenery grows out of (or sinks into) the ground over this distance
export const TUNNEL_SEGMENT = 5; // world units per tunnel ring
export const TUNNEL_HALF_WIDTH = 6.2; // walls this far from the centre line
export const TUNNEL_HEIGHT = 7.2; // ceiling, above the camera
export const BRIDGE_PYLON_SPACING = 70;
export const BRIDGE_RAIL_SPACING = 3;
export const SKYLINE_COUNT = 40; // far skyline behind the bridge
export const SKYLINE_PARALLAX = 0.12;
export const PARTICLE_COUNT = 260; // drifting motes, sparks, stars, confetti by zone
export const PARTICLE_SIZE = 0.3; // world units
export const TRAIL_SPACING = 2.6; // trail motes leading into the next block's free lane or orb
export const TRAIL_MAX = 5; // per object
export const TRAIL_HEIGHT = 0.75;

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
/**
 * Each zone's colours. Backgrounds stay near black so the neon obstacles and the lime lanes
 * read the same everywhere; only the sky glow, the scenery lights and the particles change hue.
 * `rate`: particle speed relative to the track (sparks rush in the tunnel, stars barely move).
 */
export interface ZoneLook {
  bg: number;
  fogNear: number;
  fogFar: number;
  horizon: number; // colour of the glow at the vanishing point
  horizonGain: number;
  floor: number; // tint over the floor grid (white = as drawn)
  accentA: number; // tower caps, tunnel rings, bridge cables
  accentB: number;
  arch: number; // the gates the runner passes through
  particle: number;
  particleRate: number;
}
export const ZONE_LOOK: Record<'city' | 'tunnel' | 'bridge' | 'finale', ZoneLook> = {
  city: {
    bg: 0x07090d,
    fogNear: 30,
    fogFar: 105,
    horizon: 0xc6ff3d,
    horizonGain: 0.22,
    floor: 0xffffff,
    accentA: 0x22d3ee,
    accentB: 0xff3dcb,
    arch: 0xc6ff3d,
    particle: 0x7fe9ff,
    particleRate: 1.15,
  },
  tunnel: {
    bg: 0x090611,
    fogNear: 14,
    fogFar: 78,
    horizon: 0xfff1d6, // the light at the end of the tunnel
    horizonGain: 0.3,
    floor: 0xc9b8ff,
    accentA: 0xff3dcb,
    accentB: 0x8b5cf6,
    arch: 0xff3dcb,
    particle: 0xffb020,
    particleRate: 1.9,
  },
  bridge: {
    bg: 0x040b16,
    fogNear: 36,
    fogFar: 125,
    horizon: 0x22d3ee,
    horizonGain: 0.3,
    floor: 0x5a86b8, // the grid fades into dark water
    accentA: 0x22d3ee,
    accentB: 0xdfeeff, // railings: white, never lime beside the lime lane edges
    arch: 0x22d3ee,
    particle: 0xdff4ff,
    particleRate: 0.25,
  },
  finale: {
    bg: 0x10060f,
    fogNear: 30,
    fogFar: 110,
    horizon: 0xff6a3d, // sunset
    horizonGain: 0.34,
    floor: 0xffc9b0,
    accentA: 0xffd166,
    accentB: 0xff3dcb,
    arch: 0xffd166,
    particle: 0xffd166,
    particleRate: 1.3,
  },
};

/* ── Intro (intro.ts): 3, 2, 1 while the camera flies in, then GO and the clock starts ── */
export const INTRO_SEC = 3; // one second per number; `?intro=off` skips it
export const INTRO_FLY_SEC = 2.7; // the camera reaches the chase position just before GO
export const INTRO_GO_SEC = 0.7; // GO stays up this long into the round
export const INTRO_FROM = { angle: 2.5, radius: 4.6, height: 1.5 }; // in front of the runner, to the right
export const INTRO_LOOK_Y = 1.25; // the camera looks at the runner's chest at the start
export const COUNT_POS = { y: 3.1, z: -3 }; // the countdown number, above the runner
export const COUNT_WIDTH = 6; // the label canvas is wide; the digit itself is about 1 unit tall

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
export const PLAYER_RADIUS = 0.36; // 2D fallback runner width, ghost shell
export const LANE_SLIDE_RATE = 14; // exponential approach per second
export const JUMP_HEIGHT = 1.5;
export const JUMP_VISUAL_SEC = 0.6;
export const CROUCH_SCALE = 0.58; // 2D fallback only; the 3D runner squats or slides (runnerPose.ts)
export const CROUCH_RATE = 18;
export const ARM_RATE = 16;
/* Runner rig (runnerPose.ts, player.ts): limb lengths in world units, angles in radians. */
export const RIG = {
  hipSide: 0.13, // hip joints either side of the pelvis centre
  hipDrop: 0.05, // hip joints below the pelvis pivot
  thigh: 0.46,
  shin: 0.46,
  foot: 0.04, // sole below the ankle
  torso: 0.62, // pelvis pivot to the neck
  neck: 0.24, // neck to the centre of the head
  head: 0.22, // head radius
  shoulderSide: 0.32,
  upperArm: 0.3,
  foreArm: 0.3,
} as const;
export const RUN_BLEND_RATE = 6; // standing to running, per second
export const STRIDE_HZ_BASE = 1.25; // run cycles per second at speed 0 (two steps per cycle) ...
export const STRIDE_HZ_PER_SPEED = 0.055; // ... plus this per unit of speed (12 → 1.9 Hz, 21 → 2.4 Hz)
export const RUN_BOB = 0.07; // hip bounce per step
export const LEAN_PER_SPEED = 0.045; // sideways roll per unit/s of lane-change speed
export const LEAN_MAX = 0.42;
export const LAND_SEC = 0.22; // landing squash after a jump
export const LAND_SQUASH = 0.2; // body height lost at the deepest point of the landing
export const TAKEOFF_STRETCH = 0.12; // body stretched by this much as it leaves the floor
export const DUCK_RATE = 16; // into and out of the squat or slide, per second
export const SLIDE_RATE = 5; // squat (standing still) to slide (running), per second
export const MOVE_POP_SEC = 0.35; // the ground ring flashes when a move is detected
export const HIT_FLASH_SEC = 0.35;
export const STUMBLE_SEC = 0.5;
export const AURA_OPACITY = 0.28; // hold feedback column around the runner
export const AURA_PULSE_HZ = 1.4; // prompt and warn pulses; must stay well under 3
export const AURA_PROMPT_SCALE = 0.7; // the prompt is softer than the steady 'ok' glow

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
/** Height of each kind's move icon above the floor (orbs have none), world units. */
export const ICON_HEIGHT = {
  block: BLOCK_HEIGHT * 0.75, // in the free lane, between the walls
  hurdle: HURDLE_HEIGHT + 1.1,
  beam: BEAM_HEIGHT + 1.2,
  crate: CRATE_HEIGHT + 0.9,
} as const;
export const ICON_BRIGHTNESS = 1.6; // above 1 so it glows a little
export const BURST_POOL = 10;
export const POOL_WARM = 4; // views of each kind built up front

/* ── Sound ── */
export const AUDIO_VOLUME = 0.35;
export const AUDIO_BASE_HZ = 392; // G4; each move is a fixed interval above or below
export const SAW_VOLUME = 0.6; // move confirmations sit under the effects
export const SAW_MIN_GAP_SEC = 0.15;
export const AUDIO_CLOSE_DELAY_MS = 2000; // let the finish fanfare ring out after destroy()
/* Music (music.ts): a synthesised beat under the effects. `?music=off` (or localStorage game.music) */
export const MUSIC_VOLUME = 0.35; // relative to AUDIO_VOLUME: under the effects, which carry the feedback
export const BPM_START = 118; // at the start of the round ...
export const BPM_END = 138; // ... rising steadily to the end
export const BPM_FINALE_BONUS = 6; // the finale stretch pushes it further
export const MUSIC_LOOKAHEAD_SEC = 0.15; // notes are scheduled this far ahead of the audio clock
export const MUSIC_FILTER_HZ = [1400, 2600, 5000, 9000] as const; // master low-pass by streak tier
export const MUSIC_DUCK_SEC = 0.35; // a hit muffles the music this long
export const MUSIC_FADE_SEC = 0.25; // pause, resume and finish fades

/* ── Realistic obstacles (props.ts, obstacles.ts), on levels with backdrop style 'real' ── */
// Gameplay is identical to the neon look: same hitboxes, sizes, positions and timing. Only the
// materials change (a lit texture, no glow, no neon edges) and a soft contact shadow is laid on
// the road under every grounded object, so nothing floats over the video.
export const REAL_PROPS = {
  /** Contact shadow: darkness at its centre (0 to 1), and how far it spreads past the footprint
   *  (world units on each side; along the track, the front and back). */
  shadowOpacity: 0.55,
  shadowSpread: 0.35,
  /** Just above the track strip (0.004) and under the floor markers (0.02). */
  shadowY: 0.012,
  /** Bodies (posts, frames) are painted steel; the neon bars are paint in the move colour. */
  steel: 0x5b636e,
  /** Floor markers become road paint: normal blending at this opacity, not light. */
  paintOpacity: 0.32,
  /** A hit: the texture and paint tinted red (multiplied), still lit. */
  hitTint: 0xff6a5a,
} as const;

/* ── Realistic road strip (realRoad.ts), on 'real' levels only ── */
// The clips' road moves 3-7x slower than the game, so objects slid over it. A road surface under
// the track scrolls at exactly the game's speed (the floor grid's units) and fades into the clip
// toward the vanishing point: objects and the runner sit on it; the clip keeps the street,
// buildings, sky and far road. Tinted to the clip's road (sampled from the video at each level).
export const REAL_ROAD = {
  width: 9.6, // across, centred on the track (3 lanes are 6.6)
  near: 9, // world z of the near end: behind the camera (7.4)
  far: -36, // world z of the far end: ~90% of the way up the screen to the horizon
  fade: 0.5, // the far share of the length that fades to nothing
  sideFade: 0.18, // each side's share of the width that fades out
  tile: 3, // world units per texture repeat (along and across)
  /** Which pattern per level; anything else is asphalt. */
  cobble: [2] as readonly number[],
  /** The video patch sampled for the road colour: share of the frame (bottom centre). */
  sample: { x0: 0.38, x1: 0.62, y0: 0.86, y1: 0.98 },
  resampleSec: [0.4, 1.5] as readonly number[], // after a level starts (the clip has switched)
  y: 0.002, // under the shadow catcher (0.003), the lane paint (0.006) and the contact shadows
} as const;
