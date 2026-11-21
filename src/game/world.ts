import * as T from './tuning';

/**
 * Where the track goes: neon city, a tunnel, a bridge over the water with the skyline behind it,
 * and the finale stretch for the last FINALE_SEC. Zones are fixed stretches of the track (world
 * distance), so a border comes toward the runner like any object. Pure, so it is unit-tested
 * (world.test.ts); scene.ts builds the scenery and blends the colours from these numbers.
 */
export const ZONES = ['city', 'tunnel', 'bridge', 'finale'] as const;
export type Zone = (typeof ZONES)[number];

export interface ZonePlan {
  /** World distance at which each zone of ZONES starts; the city starts at -Infinity. */
  readonly starts: readonly number[];
}

export function planZones(durationSec: number, distanceAt: (t: number) => number): ZonePlan {
  const tunnelT = T.ZONE_TUNNEL_AT * durationSec;
  const bridgeT = T.ZONE_BRIDGE_AT * durationSec;
  const finaleT = Math.max(bridgeT, durationSec - T.FINALE_SEC);
  return { starts: [-Infinity, distanceAt(tunnelT), distanceAt(bridgeT), distanceAt(finaleT)] };
}

/** Index into ZONES of the zone at world distance `d`. */
export function zoneIndexAt(plan: ZonePlan, d: number): number {
  let i = 0;
  while (i + 1 < plan.starts.length && d >= plan.starts[i + 1]!) i++;
  return i;
}

const smooth = (k: number): number => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};

/**
 * How present zone `i`'s scenery is at distance `d`, 0 to 1: it grows over ZONE_RISE after the
 * zone starts and shrinks over ZONE_RISE before it ends, so towers rise out of the ground at a
 * border instead of popping in.
 */
export function zonePresence(plan: ZonePlan, i: number, d: number): number {
  const start = plan.starts[i] ?? Infinity;
  const end = plan.starts[i + 1] ?? Infinity;
  if (d < start || d >= end) return 0;
  return Math.min(smooth((d - start) / T.ZONE_RISE), smooth((end - d) / T.ZONE_RISE));
}

/** The colour mix at distance `d`: zone `a` blended toward zone `b` by `k` near a border. */
export interface ZoneMix {
  a: number;
  b: number;
  k: number;
}

export function zoneMix(plan: ZonePlan, d: number, out: ZoneMix): ZoneMix {
  const i = zoneIndexAt(plan, d);
  const half = T.ZONE_BLEND / 2;
  const next = plan.starts[i + 1];
  const start = plan.starts[i]!;
  if (next !== undefined && d > next - half) {
    out.a = i;
    out.b = i + 1;
    out.k = smooth((d - (next - half)) / T.ZONE_BLEND);
  } else if (i > 0 && d < start + half) {
    out.a = i - 1;
    out.b = i;
    out.k = smooth((d - (start - half)) / T.ZONE_BLEND);
  } else {
    out.a = out.b = i;
    out.k = 0;
  }
  return out;
}
