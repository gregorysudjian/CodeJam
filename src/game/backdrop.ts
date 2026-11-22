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
  /** The clip's vanishing point across, 0 left to 1 right (default 0.5; real levels line it up). */
  vanishX?: number;
  /**
   * ?dev=align: one point on each road edge (curb or deck edge) in the clip, x and y from 0 to 1;
   * drawn with the vanishing point as the clip's two road edges.
   */
  edges?: { left: readonly [number, number]; right: readonly [number, number] };
  /**
   * 'real': realistic mode on this level (human runner, real obstacles, no neon: look.ts REAL_MODE,
   * scene.ts, human.ts, props.ts). 'neon' (the default): today's look. A real level still falls
   * back to neon without its clip, with a missing asset, or in Low graphics.
   */
  style?: 'real' | 'neon';
}

/**
 * The street videos (and with them realistic mode) play only when switched on: `?video=on` or
 * localStorage `game.video` = 'on'. Off by default since Sunday 9 AM: smoothness and input latency
 * come first, and the neon game without videos is the one that played smoothly. `?video=off` forces
 * them off. Outside a browser (tests) the videos count as on, so realistic mode stays tested.
 */
export const VIDEOS_ON: boolean = (() => {
  if (typeof window === 'undefined') return true;
  try {
    const v =
      new URLSearchParams(window.location.search).get('video') ??
      window.localStorage.getItem('game.video');
    return v === 'on' || v === '1';
  } catch {
    return false;
  }
})();

/** True if level `index` plays realistic (its style is 'real' and the videos are on). */
export function isReal(index: number): boolean {
  return VIDEOS_ON && backdropFor(index).style === 'real';
}

// The Montreal Runner clips (1280x720, 30 s, no sound; sources in release montreal-runner-raw;
// file names kept from the first set). All six levels are real: the three finished clips play
// twice until clips for 1, 4 and 6 arrive. Every real level uses the same camera (look.ts
// REAL_MODE.camera); each clip is fitted to it by its measured vanishing point (horizon, vanishX)
// and checked against its measured road edges with ?dev=align.
const OLD_TOWN = {
  video: '/media/level-2-london.mp4', // Rue Saint-Paul, Old Montreal (cobblestones)
  horizon: 0.34,
  vanishX: 0.5,
  edges: { left: [0, 0.535], right: [1, 0.549] },
  style: 'real',
} as const;
const BRIDGE = {
  video: '/media/level-3-paris.mp4', // Jacques Cartier Bridge deck
  horizon: 0.32,
  vanishX: 0.5,
  edges: { left: [0, 0.597], right: [1, 0.604] },
  style: 'real',
} as const;
const BLUE_HOUR = {
  video: '/media/level-5-barcelona.mp4', // Old Port at blue hour, the Clock Tower
  horizon: 0.33,
  vanishX: 0.5,
  edges: { left: [0, 0.59], right: [1, 0.611] },
  style: 'real',
} as const;

// `scenery` and `look` are the neon fallback (no clip, Low graphics): the same per level as before.
export const LEVEL_BACKDROPS: readonly Backdrop[] = [
  { name: 'City', scenery: 'city', look: ZONE_LOOK.city, ...OLD_TOWN },
  { name: 'Tunnel', scenery: 'tunnel', look: ZONE_LOOK.tunnel, ...BRIDGE },
  { name: 'Bridge', scenery: 'bridge', look: ZONE_LOOK.bridge, ...BLUE_HOUR },
  { name: 'City at dawn', scenery: 'city', look: ZONE_LOOK.cityDawn, ...OLD_TOWN },
  { name: 'Bridge at night', scenery: 'bridge', look: ZONE_LOOK.bridgeNight, ...BRIDGE },
  { name: 'Finale', scenery: 'finale', look: ZONE_LOOK.finale, ...BLUE_HOUR },
];
/** The backdrop of level `index` (1-based); past the table, the last one. */
export function backdropFor(index: number): Backdrop {
  const i = Math.min(LEVEL_BACKDROPS.length, Math.max(1, Math.round(index))) - 1;
  return LEVEL_BACKDROPS[i]!;
}
