import type { ZoneLook } from './tuning';

/**
 * Tunable numbers for the look, added while tuning.ts is being merged on the other laptop.
 * They belong in tuning.ts (AGENTS.md rule 10): move them there, and delete the old
 * ZONE_LOOK there, once that merge is in.
 */

/* ── Readability (obstacles.ts) ── */
// Move icons keep a minimum size on screen: from ICON_GROW_FROM away from the camera they grow
// with distance (up to ICON_GROW_MAX times), so a far object's icon stays readable from 2 m.
export const ICON_GROW_FROM = 16; // world units from the camera
export const ICON_GROW_MAX = 1.8; // more and a near icon starts to cover the object behind it
export const ICON_TEXTURE = 256; // pixels; drawn with thicker strokes than the 2D fallback
export const ICON_STROKE_BOOST = 3; // extra stroke width, in the 128-pixel glyph box
// The free lane of a block: bright chevrons painted on the floor, pointing ahead.
export const GUIDE_OPACITY = 0.75;
export const GUIDE_CHEVRONS = 3;
export const GRADE_GOOD_COLOR = 0xe6edf5; // white: never read as the cyan of a block beside it
// Words drawn in the world near the runner (view3d.ts), sized to read from the mark on a
// 1280x720 projector (checked on screenshots downscaled to a third). These replace
// tuning.ts GRADE_WIDTH (2.3: PERFECT was 22 px tall at 1366x768), GRADE_POS.side and
// COMBO_WIDTH (1.9) in the 3D view.
export const GRADE_WIDTH = 3.5; // world units
export const GRADE_SIDE = 1.95; // the word's centre from the runner: clear of its raised arms
export const COMBO_WIDTH = 2.5;

/* ── Screen-space labels (view3d.ts, overlay.ts), kept clear of GameHud ── */
// GameHud's own boxes, in CSS pixels: plates in the top corners, the race bar, the move cue
// band (124 to about 214 px from the top), the camera preview bottom left (256 x 144 at 24 px).
// So the milestone and FINAL STRETCH banners go bottom centre, under the combo counter, and
// the ghost race chip bottom right. Heights are a share of the canvas height, within limits.
export const OVERLAY_DEPTH = 2; // world units in front of the camera
export const OVERLAY_MARGIN = 24; // px from the screen edge (GameHud uses 24 px too)
export const OVERLAY_GAP = 16; // px kept between the banner and the race chip
// At a third of 1280x720 (a projector read from the mark) 0.065 and 0.055 left 9 px letters.
export const MILESTONE_H = { share: 0.095, min: 44, max: 104 }; // banner height, px
export const RACE_H = { share: 0.075, min: 38, max: 82 }; // race chip height, px

/* ── The finish (view3d.ts, scene.ts, overlay.ts) ── */
// The end banner (GHOST BEATEN, GHOST WINS, TIE, GHOST SAVED) is the punchline of the race. It
// is a screen-space label in the middle, under GameHud's plates (they end 220 px from the top),
// so the passing FINISH arch and the outro camera never hide it. Was 6.2 world units in the
// scene (about 30 px tall letters at 1366x768).
export const END_BANNER_H = { share: 0.15, min: 72, max: 160 }; // px
export const END_BANNER_Y = 0.42; // its centre, as a share of the height from the top
// After the finish the camera swings part way back along the intro's path (toward the runner's
// front, on the right) while the runner celebrates, within the app's 1.5 s before the results.
// None with reduced motion.
export const OUTRO_SEC = 1.3;
export const OUTRO_TO = 0.55; // intro progress it swings back to: 1 is the chase camera, 0 the front
// ...looking at this point above the runner (x follows it), so the runner stands centred and
// low in the frame, under the end banner.
export const OUTRO_LOOK = { y: 2.6, z: -0.5 };
// The FINISH arch's posts and floor line, times NEON_BOOST. At 0.7 they bloomed into a white
// glare that hid the runner as it crossed the line.
export const FINISH_GLOW = 0.4;

/* ── The 3-2-1 before a resume (view3d.ts) ── */
// The intro's label, from the chase camera: this much bigger (the intro's camera starts close
// to the runner), and at this height, between the runner's head and GameHud's cue band.
export const RESUME_COUNT = { scale: 2.4, y: 2.9 };

/* ── Lives (view3d.ts, view2d.ts) ── */
// A lost life: one red flash over the whole canvas (single, well under the WCAG 3-a-second
// limit), then the runner flickers at GRACE_BLINK_HZ through the grace (none with reduced
// motion). Out of lives, the world stops OUT_STOP times faster than after a finish.
export const LIFE_FLASH = { peak: 0.35, reducedPeak: 0.2, sec: 0.5 };
export const GRACE_BLINK_HZ = 2.5;
export const OUT_STOP = 3;

/* ── Levels (view3d.ts, backdrop.ts for which backdrop each level has) ── */
// The portal at each level boundary: a ring the runner passes through (radius: the track's half
// width plus `margin`; its centre `lift` × radius up, so it stands on the floor), white neon (no
// move colour), with a faint veil in the next level's horizon colour. Crossing it: a white
// flash (`flash`, softer with reduced motion), the milestone shockwave, and "LEVEL n" big in
// the middle for LEVEL_LABEL_SEC (level 1 after the intro's GO).
export const PORTAL = {
  color: 0xf4f7fb,
  glow: 0.55, // 0.9 bloomed into a white glare around the whole track
  tube: 0.16,
  margin: 1.3,
  lift: 0.72,
  veil: 0.16,
  flash: 0.3,
  reducedFlash: 0.15,
  flashSec: 0.45,
};
export const LEVEL_LABEL_SEC = 1.8;
// A level's city clip (backdrop.ts `video`, videoBackdrop.ts) is darkened to `brightness` as
// seen on screen (scene.ts converts it to linear light, like the pause dimmer), so the neon
// track, runner and obstacles stay the brightest things on screen and the clip stays under the
// bloom threshold. Seen at 0.7, a bright daytime sky washed out GameHud's lime cue word ("JUMP").
// With a clip the runner runs inside it (scene.ts): the clip fills the screen, zoomed in up to
// `zoomMax` so its street's vanishing point (backdrop.ts `horizon`) sits on the track's
// (`trackHorizon` until the chase camera measures it); the grid floor, horizon glow, gates and
// side scenery are hidden, the track strip is a light tint (`trackOpacity`) on the clip's road,
// a soft contact shadow grounds the runner, and the clip shifts `parallax` (texture widths per
// world unit of camera sway) as the runner changes lane. It plays at `rateMin` on the slowest
// level up to 1x on the fastest, never faster: a 30 s clip lasts its 30 s level.
export const VIDEO_BACKDROP = {
  brightness: 0.62,
  zoomMax: 1.5,
  trackHorizon: 0.38,
  trackOpacity: 0.3,
  parallax: 0.012,
  rateMin: 0.8,
  fogNear: 1e4,
  fogFar: 2e4,
  shadowOpacity: 0.55,
  shadowSize: { x: 1.9, y: 1.3 },
  // A dark gradient over the top of the screen, `topShade` at the top edge fading to nothing at
  // `topShadeTo` (share of the height): GameHud's move cue sits on the clip's sky there, and
  // purple REACH over Paris's grey sky was unreadable without it.
  topShade: 0.7,
  topShadeTo: 0.36,
};

/* ── Realistic mode (backdrop.ts style 'real'; scene.ts, view3d.ts) ── */
// On while a 'real' level's clip shows. No bloom, particles, speed lines or shockwave; the clip
// at `brightness` (VIDEO_BACKDROP's top shade stays for the HUD cue); lanes as faint solid
// white road paint (`paintOpacity`, `paintWidth` in world units). A level change into a real
// level is a white fade (`fadePeak` over `fadeSec`) instead of the neon portal. (Road speed and
// the straight intro/outro camera are package C steps b and c: videoBackdrop.ts, intro.ts.)
// Step d: per real level, the light the runner gets to match its clip: the sun's direction
// (`dir`, toward the light; +z is toward the camera, so front light puts the shadow ahead of the
// runner), colour and strength, the sky light (hemisphere) colour and strength, and how dark
// its shadow is on the road (`shadow`, the catcher's opacity). Key 0: any other real level.
// The shadow map is `shadowMap` px over a box `shadowBox` world units around the runner.
export interface RealLight {
  dir: { x: number; y: number; z: number };
  sunColor: number;
  sun: number;
  sky: number;
  skyIntensity: number;
  shadow: number;
}
export const REAL_MODE: {
  brightness: number;
  paintOpacity: number;
  paintWidth: number;
  fadePeak: number;
  fadeSec: number;
  shadowMap: number;
  shadowBox: number;
  light: Record<number, RealLight>;
} = {
  brightness: 0.95,
  paintOpacity: 0.2,
  paintWidth: 0.1,
  fadePeak: 0.85,
  fadeSec: 0.5,
  shadowMap: 1024,
  shadowBox: 4,
  light: {
    0: {
      dir: { x: 0.3, y: 1, z: 0.5 },
      sunColor: 0xffffff,
      sun: 1.4,
      sky: 0xc0ccdc,
      skyIntensity: 1.2,
      shadow: 0.35,
    },
    // Old Montreal, overcast: soft light from above, a faint shadow.
    2: {
      dir: { x: 0.2, y: 1, z: 0.5 },
      sunColor: 0xfff4e6,
      sun: 1.1,
      sky: 0xc9d3e0,
      skyIntensity: 1.4,
      shadow: 0.25,
    },
    // Jacques Cartier Bridge, sunny afternoon: sun high on the left, a crisper shadow.
    3: {
      dir: { x: -0.5, y: 1, z: 0.4 },
      sunColor: 0xfff1d6,
      sun: 2,
      sky: 0xbcd4f0,
      skyIntensity: 1.1,
      shadow: 0.45,
    },
    // Old Port at blue hour: warm street lamps overhead, cool sky, a soft shadow.
    5: {
      dir: { x: 0.1, y: 1, z: 0.7 },
      sunColor: 0xffd29a,
      sun: 0.9,
      sky: 0x6f86c9,
      skyIntensity: 1,
      shadow: 0.22,
    },
  },
};

/* ── Reduced motion (scene.ts) ── */
// A milestone brightens the lane lines and horizon; with prefers-reduced-motion, this much of it.
export const REDUCED_FLASH = 0.4;

/* ── Ghost runner (player.ts, view3d.ts) ── */
// Silver glass with white accents: never the player's lime, and never a move colour (the old
// cyan was the blocks'), so it reads as a runner, not an obstacle.
export const GHOST_COLOR = 0xdfe7f2;
export const GHOST_ACCENT = 0xf4f7fb;
export const GHOST_OPACITY = 0.3;
export const GHOST_ACCENT_OPACITY = 0.5;
// "BEST" on the floor behind the ghost, like the player's combo counter; hidden when the ghost
// shares the player's lane (it wraps the player then, and the tag would read as the player's).
export const GHOST_TAG_WIDTH = 1.8; // 1.25 was unreadable from the mark
export const GHOST_TAG = { y: 0.3, z: 1.6 };

/* ── Hits and smashes (obstacles.ts) ── */
// Crate pieces fly out to the sides and shrink away fast, so they never sweep across the
// camera or cover the runner's stumble (the hit feedback) or the next object.
export const SMASH_SHRINK_SEC = 0.32;
export const SMASH_SIDEWAYS = 1.8; // times the pieces' sideways speed
export const SMASH_LIFT = 0.55; // times their upward speed
// A move icon goes once its object is this far past the runner (a missed object's red icon
// would otherwise pass right by the camera).
export const ICON_HIDE_PAST = 1.2;
// A hit object or missed orb goes once it is this far past the runner: the hit has been shown
// there (red, shake, stumble); sweeping past the camera it would only hide the view.
export const MISSED_HIDE_PAST = 2;

/* ── Sound mix (audio.ts, music.ts) ── */
// Peak level of each effect, before the master volume (AUDIO_VOLUME). A limiter on the master
// bus keeps a pile-up (clear + orb + level-up + saw sounds + music in one frame) from clipping.
export const SFX = {
  cue: 0.25,
  cleared: 0.35,
  collected: 0.2,
  smash: 0.6,
  hit: 0.8,
  saw: 0.6, // times each saw sound's own level
  levelUp: 0.28,
  count: 0.35,
  go: 0.4,
  perfect: 0.12,
  finish: 0.35,
  outOfLives: 0.35, // with the beat stopped; never with the fanfare
} as const;
export const MUSIC_VOLUME = 0.35; // the beat, relative to AUDIO_VOLUME
// While Chrome keeps audio suspended (no gesture on the page yet), at most one resume attempt
// per this long; a key press or click resumes it at once (audio.ts).
export const AUDIO_WAKE_GAP_MS = 1000;
/** Peak level of each voice of the beat, before MUSIC_VOLUME. */
export const MUSIC_VOICES = {
  kick: 0.9,
  hat: 0.18,
  openHat: 0.16,
  clap: 0.45,
  snare: 0.35,
  bass: 0.32,
  arp: 0.045,
  stab: 0.05, // three at once (a chord)
} as const;
// Only a safety net: measured offline, the worst pile-up peaks at -7.4 dBFS without it. Chrome's
// compressor adds make-up gain as the threshold drops (-6 dB made the whole mix 3 dB louder),
// so it sits just under full scale and leaves the mix's loudness alone.
export const LIMITER = {
  thresholdDb: -1.5,
  kneeDb: 0,
  ratio: 20,
  attackSec: 0.002,
  releaseSec: 0.1,
};

/* ── Performance (scene.ts) ── */
// Bloom's blur runs at this fraction of its usual (already half) resolution. A soft glow
// barely changes; at a 2x pixel ratio its passes were most of the frame's pixel work.
export const BLOOM_SCALE = 0.5;

/**
 * Zone colours. Scenery never uses a move colour (cyan sidestep, lime jump, amber squat,
 * magenta arms up, violet reach) on or beside the track, so an obstacle is never confused with
 * the scenery around it. City towers far off to the sides keep their neon caps; the lime lanes
 * and city gates are the brand. Hues come from the sky glow and particles.
 */
export const ZONE_LOOK: Record<
  'city' | 'tunnel' | 'bridge' | 'finale' | 'cityDawn' | 'bridgeNight',
  ZoneLook
> = {
  // Level 4 (backdrop.ts): the city at dawn, a soft rose-and-gold sky and pale floor. The
  // magenta stays in the sky glow, far from the crates on the track.
  cityDawn: {
    bg: 0x1d1222, // a little lighter and warmer than the night levels: still dark under the track
    fogNear: 34,
    fogFar: 115,
    horizon: 0xffb38a,
    horizonGain: 0.55,
    floor: 0xffe4d6,
    accentA: 0xffd6a0, // far tower caps, warm
    accentB: 0xb9c7ff,
    arch: 0xffe9d6,
    particle: 0xffe0c2,
    particleRate: 0.9,
  },
  // Level 5: the bridge at night, deep indigo with a cold moonlit horizon and starry particles.
  bridgeNight: {
    bg: 0x02040c,
    fogNear: 30,
    fogFar: 120,
    horizon: 0x8aa8ff,
    horizonGain: 0.26,
    floor: 0x3e5a8c,
    accentA: 0x9fb4cc,
    accentB: 0xdfeeff,
    arch: 0xdfeeff,
    particle: 0xf2f6ff,
    particleRate: 0.6,
  },
  city: {
    bg: 0x07090d,
    fogNear: 30,
    fogFar: 105,
    horizon: 0xc6ff3d,
    horizonGain: 0.22,
    floor: 0xffffff,
    accentA: 0x22d3ee, // tower caps only, 16 m or more from the track
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
    floor: 0xc9c2e0,
    accentA: 0x6d7f9e, // wall light strips: dim steel
    accentB: 0x9aa8bd, // rings: steel, quieter than the obstacles
    arch: 0x9aa8bd,
    particle: 0xfff1d6,
    particleRate: 1.9,
  },
  bridge: {
    bg: 0x040b16,
    fogNear: 36,
    fogFar: 125,
    horizon: 0x22d3ee,
    horizonGain: 0.3,
    floor: 0x5a86b8, // the grid fades into dark water
    accentA: 0x9fb4cc, // pylon strips and cables: steel, not the blocks' cyan
    accentB: 0xdfeeff, // railings: white, never lime beside the lime lane edges
    arch: 0xdfeeff,
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
    accentA: 0xffe9c7, // far tower caps
    accentB: 0xffd9e8,
    arch: 0xfff2e0, // warm white gates, not the beams' amber
    particle: 0xffe9c7,
    particleRate: 1.3,
  },
};
