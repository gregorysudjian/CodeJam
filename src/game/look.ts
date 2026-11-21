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

/* ── Screen-space labels (view3d.ts, overlay.ts), kept clear of GameHud ── */
// GameHud's own boxes, in CSS pixels: plates in the top corners, the race bar, the move cue
// band (124 to about 214 px from the top), the camera preview bottom left (256 x 144 at 24 px).
// So the milestone and FINAL STRETCH banners go bottom centre, under the combo counter, and
// the ghost race chip bottom right. Heights are a share of the canvas height, within limits.
export const OVERLAY_DEPTH = 2; // world units in front of the camera
export const OVERLAY_MARGIN = 24; // px from the screen edge (GameHud uses 24 px too)
export const MILESTONE_H = { share: 0.065, min: 34, max: 72 }; // banner height, px
export const RACE_H = { share: 0.055, min: 30, max: 60 }; // race chip height, px

/* ── Ghost runner (player.ts, view3d.ts) ── */
// Silver glass with white accents: never the player's lime, and never a move colour (the old
// cyan was the blocks'), so it reads as a runner, not an obstacle.
export const GHOST_COLOR = 0xdfe7f2;
export const GHOST_ACCENT = 0xf4f7fb;
export const GHOST_OPACITY = 0.3;
export const GHOST_ACCENT_OPACITY = 0.5;
// "BEST" on the floor behind the ghost, like the player's combo counter; hidden when the ghost
// shares the player's lane (it wraps the player then, and the tag would read as the player's).
export const GHOST_TAG_WIDTH = 1.25;
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
} as const;
export const MUSIC_VOLUME = 0.35; // the beat, relative to AUDIO_VOLUME
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
export const ZONE_LOOK: Record<'city' | 'tunnel' | 'bridge' | 'finale', ZoneLook> = {
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
