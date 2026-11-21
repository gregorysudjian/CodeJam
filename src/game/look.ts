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
