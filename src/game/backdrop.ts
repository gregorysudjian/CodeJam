import { ZONE_LOOK } from './look';
import type { ZoneLook } from './tuning';

/**
 * Which backdrop each level has, in one place. A level's scenery is one of the four built in
 * scene.ts (city towers and gates, the tunnel, the bridge, the finale's sunset city); its look is
 * the palette (sky, fog, floor, particles: look.ts ZONE_LOOK). Levels 4 and 5 reuse a scenery
 * at another time of day.
 *
 * A level's `video` (a path under public/, e.g. '/media/level-1-old-port.mp4') is its 30 s
 * Montreal cinematic from Higgsfield, played darkened as the sky behind the track
 * (videoBackdrop.ts); this is the only file that has to change to choose it. Without one, or
 * if it fails to load, or with "Low graphics", the level shows its built-in scenery.
 */
export type Scenery = 'city' | 'tunnel' | 'bridge' | 'finale';

export interface Backdrop {
  name: string;
  scenery: Scenery;
  look: ZoneLook;
  video?: string;
}

export const LEVEL_BACKDROPS: readonly Backdrop[] = [
  { name: 'City', scenery: 'city', look: ZONE_LOOK.city },
  { name: 'Tunnel', scenery: 'tunnel', look: ZONE_LOOK.tunnel },
  { name: 'Bridge', scenery: 'bridge', look: ZONE_LOOK.bridge },
  { name: 'City at dawn', scenery: 'city', look: ZONE_LOOK.cityDawn },
  { name: 'Bridge at night', scenery: 'bridge', look: ZONE_LOOK.bridgeNight },
  { name: 'Finale', scenery: 'finale', look: ZONE_LOOK.finale },
];

/** The backdrop of level `index` (1-based); past the table, the last one. */
export function backdropFor(index: number): Backdrop {
  const i = Math.min(LEVEL_BACKDROPS.length, Math.max(1, Math.round(index))) - 1;
  return LEVEL_BACKDROPS[i]!;
}
