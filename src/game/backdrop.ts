import { ZONE_LOOK } from './look';
import type { ZoneLook } from './tuning';

/**
 * Which backdrop each level has, in one place. A level's scenery is one of the four built in
 * scene.ts (city towers and gates, the tunnel, the bridge, the finale's sunset city); its look is
 * the palette (sky, fog, floor, particles: look.ts ZONE_LOOK). Levels 4 and 5 reuse a scenery
 * at another time of day.
 *
 * A level's `video` (a path under public/) is its 30 s Higgsfield city clip (videoBackdrop.ts):
 * the runner runs inside it, on its street (scene.ts, look.ts VIDEO_BACKDROP). `horizon` is
 * where that street's vanishing point is in the clip, 0 top to 1 bottom, so it can be lined up
 * with the track's. This is the only file that has to change to choose a clip. Without one, or
 * if it fails to load, or with "Low graphics", the level shows its built-in scenery exactly.
 */
export type Scenery = 'city' | 'tunnel' | 'bridge' | 'finale';

export interface Backdrop {
  name: string;
  scenery: Scenery;
  look: ZoneLook;
  video?: string;
  /** The clip's vanishing point, 0 top to 1 bottom of the frame (default 0.5). */
  horizon?: number;
  /**
   * 'real': realistic mode on this level (human runner, real obstacles, no neon: look.ts REAL_MODE,
   * scene.ts, human.ts, props.ts). 'neon' (the default): today's look. A real level still falls
   * back to neon without its clip, with a missing asset, or in Low graphics.
   */
  style?: 'real' | 'neon';
}

/** True if level `index`'s style is 'real' (packages A, B and C read it through this). */
export function isReal(index: number): boolean {
  return backdropFor(index).style === 'real';
}

// Clips, 1280x720, 30 s, no sound. Levels 2, 3, 5: the Montreal Runner set made for the game (file
// names kept from the first set; sources in release montreal-runner-raw), realistic mode. Levels 1,
// 4, 6: release higgsfield-raw (g2-media) until the rest of the set arrives. Horizons measured.
export const LEVEL_BACKDROPS: readonly Backdrop[] = [
  {
    name: 'City',
    scenery: 'city',
    look: ZONE_LOOK.city,
    video: '/media/level-1-montreal.mp4',
    horizon: 0.52,
  },
  {
    name: 'Tunnel',
    scenery: 'tunnel',
    look: ZONE_LOOK.tunnel,
    video: '/media/level-2-london.mp4', // Montreal Runner: Rue Saint-Paul, Old Montreal
    horizon: 0.33,
    style: 'real',
  },
  {
    name: 'Bridge',
    scenery: 'bridge',
    look: ZONE_LOOK.bridge,
    video: '/media/level-3-paris.mp4', // Montreal Runner: Jacques Cartier Bridge deck
    horizon: 0.31,
    style: 'real',
  },
  {
    name: 'City at dawn',
    scenery: 'city',
    look: ZONE_LOOK.cityDawn,
    video: '/media/level-4-rome.mp4',
    horizon: 0.46,
  },
  {
    name: 'Bridge at night',
    scenery: 'bridge',
    look: ZONE_LOOK.bridgeNight,
    video: '/media/level-5-barcelona.mp4', // Montreal Runner: Old Port at blue hour
    horizon: 0.32,
    style: 'real',
  },
  {
    name: 'Finale',
    scenery: 'finale',
    look: ZONE_LOOK.finale,
    video: '/media/level-6-dubai.mp4',
    horizon: 0.63,
  },
];

/** The backdrop of level `index` (1-based); past the table, the last one. */
export function backdropFor(index: number): Backdrop {
  const i = Math.min(LEVEL_BACKDROPS.length, Math.max(1, Math.round(index))) - 1;
  return LEVEL_BACKDROPS[i]!;
}
