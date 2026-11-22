import type { Stage } from '@/contracts';
import { backdropFor } from './backdrop';
import { ZONE_LOOK } from './look';
import * as T from './tuning';

/**
 * Where the track goes: neon city, a tunnel, a bridge over the water with the skyline behind it,
 * and the finale stretch for the last FINALE_SEC. Zones are fixed stretches of the track (world
 * distance), so a border comes toward the runner like any object. Pure, so it is unit-tested
 * (world.test.ts); scene.ts builds the scenery and blends the colours from these numbers.
 */
export const ZONES = ['city', 'tunnel', 'bridge', 'finale'] as const;
export type Zone = (typeof ZONES)[number];

/**
 * The track as segments, one after another: where each starts (world distance; the first at
 * -Infinity), which scenery it shows (an index into ZONES) and its palette.
 */
export interface ZonePlan {
  readonly starts: readonly number[];
  readonly scenery: readonly number[];
  readonly looks: readonly T.ZoneLook[];
}

/**
 * With `stages` (a round of levels): one segment per level, its backdrop from backdrop.ts.
 * Without: city, tunnel, bridge, then the finale for the last FINALE_SEC.
 */
export function planZones(
  durationSec: number,
  distanceAt: (t: number) => number,
  stages: readonly Stage[] = [],
): ZonePlan {
  if (stages.length > 1) {
    const backdrops = stages.map((s) => backdropFor(s.index));
    return {
      starts: [-Infinity, ...stages.slice(1).map((s) => distanceAt(s.startSec))],
      scenery: backdrops.map((b) => ZONES.indexOf(b.scenery)),
      looks: backdrops.map((b) => b.look),
    };
  }
  const tunnelT = T.ZONE_TUNNEL_AT * durationSec;
  const bridgeT = T.ZONE_BRIDGE_AT * durationSec;
  const finaleT = Math.max(bridgeT, durationSec - T.FINALE_SEC);
  return {
    starts: [-Infinity, distanceAt(tunnelT), distanceAt(bridgeT), distanceAt(finaleT)],
    scenery: [0, 1, 2, 3],
    looks: ZONES.map((z) => ZONE_LOOK[z]),
  };
}

/** True if any segment with scenery `kind` overlaps the world stretch [from, to). */
export function sceneryInView(plan: ZonePlan, kind: number, from: number, to: number): boolean {
  for (let i = 0; i < plan.starts.length; i++) {
    if (plan.scenery[i] !== kind) continue;
    const end = plan.starts[i + 1] ?? Infinity;
    if (plan.starts[i]! < to && end > from) return true;
  }
  return false;
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
 * How present scenery `kind` (an index into ZONES) is at distance `d`, 0 to 1: it grows over
 * ZONE_RISE after its stretch starts and shrinks over ZONE_RISE before it ends, so towers rise
 * out of the ground at a border instead of popping in. Back-to-back segments with the same
 * scenery (two levels in the city) are one stretch: nothing sinks and rises again between them.
 */
export function zonePresence(plan: ZonePlan, kind: number, d: number): number {
  const i = zoneIndexAt(plan, d);
  if (plan.scenery[i] !== kind) return 0;
  let a = i;
  while (a > 0 && plan.scenery[a - 1] === kind) a--;
  let b = i + 1;
  while (b < plan.starts.length && plan.scenery[b] === kind) b++;
  const start = plan.starts[a]!;
  const end = plan.starts[b] ?? Infinity;
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
