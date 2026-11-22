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
}

// Clips: release higgsfield-raw (sources in the g2-media commit), 1280x720, 30 s, no sound.
// Horizons measured on a frame 8 s in.
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
    video: '/media/level-2-london.mp4',
    horizon: 0.67,
  },
  {
    name: 'Bridge',
    scenery: 'bridge',
    look: ZONE_LOOK.bridge,
    video: '/media/level-3-paris.mp4',
    horizon: 0.33,
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
    video: '/media/level-5-barcelona.mp4',
    horizon: 0.56,
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
