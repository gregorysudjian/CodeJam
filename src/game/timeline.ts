import type { MoveType, Stage, Wave } from '@/contracts';
import {
  LEAD_BLEND_PER_SEC,
  LEVEL_SPEED_EASE_SEC,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_TABLE_STEP_SEC,
  type LeadTable,
  type Leads,
} from './tuning';

/** Speed for a wave intensity (0 to 1, clamped). */
export function speedFor(intensity: number): number {
  const k = Math.min(1, Math.max(0, intensity));
  return SPEED_MIN + (SPEED_MAX - SPEED_MIN) * k;
}

/** Intensity at game time `t`, linearly interpolated between waves. */
export function intensityAt(waves: readonly Wave[], t: number): number {
  if (waves.length === 0) return 0;
  const first = waves[0]!;
  const last = waves[waves.length - 1]!;
  if (t <= first.t) return first.intensity;
  if (t >= last.t) return last.intensity;
  let i = 1;
  while (waves[i]!.t < t) i++;
  const a = waves[i - 1]!;
  const b = waves[i]!;
  const span = b.t - a.t;
  return span <= 0 ? b.intensity : a.intensity + ((b.intensity - a.intensity) * (t - a.t)) / span;
}

/**
 * Distance travelled since t = 0, D(t) = ∫ speed. The floor scrolls by D(elapsed) and an
 * object due at wave.t sits D(wave.t) − D(elapsed) ahead, so objects and floor always move
 * together, even when the speed changes. With a constant speed this is exactly
 * speed × (wave.t − elapsed).
 */
export interface Track {
  distanceAt(t: number): number;
  speedAt(t: number): number;
}

/**
 * Intensity at game time `t` in a round of levels: each level's own (its waves share one), held
 * flat through the level and eased over LEVEL_SPEED_EASE_SEC from the previous level's at its
 * start, so the speed changes at the portal, not over the gap between two waves.
 */
export function levelIntensityAt(
  waves: readonly Wave[],
  stages: readonly Stage[],
  t: number,
): number {
  return levelIntensity(waves, stages)(t);
}

/** levelIntensityAt with the per-level intensities worked out once. */
export function levelIntensity(
  waves: readonly Wave[],
  stages: readonly Stage[],
): (t: number) => number {
  if (stages.length === 0) return (t) => intensityAt(waves, t);
  const own = stages.map((s) => waves.find((w) => w.t >= s.startSec && w.t < s.endSec)?.intensity);
  // A level without waves keeps the one before it (or the first level that has any).
  const first = own.find((x) => x !== undefined) ?? 0;
  const of = own.map((_, k) => {
    for (let j = k; j >= 0; j--) if (own[j] !== undefined) return own[j]!;
    return first;
  });
  return (t) => {
    let k = 0;
    while (k + 1 < stages.length && t >= stages[k + 1]!.startSec) k++;
    const into = t - stages[k]!.startSec;
    if (k === 0 || into >= LEVEL_SPEED_EASE_SEC) return of[k]!;
    const x = Math.max(0, into / LEVEL_SPEED_EASE_SEC);
    return of[k - 1]! + (of[k]! - of[k - 1]!) * x * x * (3 - 2 * x);
  };
}

/** `stages` (level.stages): speed per level (levelIntensityAt); without, between waves. */
export function createTrack(
  waves: readonly Wave[],
  durationSec: number,
  stages: readonly Stage[] = [],
): Track {
  const step = SPEED_TABLE_STEP_SEC;
  const lastWave = waves.length > 0 ? waves[waves.length - 1]!.t : 0;
  const end = Math.max(durationSec, lastWave) + 10; // margin for objects past the end
  const n = Math.ceil(end / step) + 1;
  const dist = new Float64Array(n);
  const intensity = levelIntensity(waves, stages);
  for (let i = 1; i < n; i++) {
    const mid = (i - 0.5) * step;
    dist[i] = dist[i - 1]! + speedFor(intensity(mid)) * step;
  }
  const speedAt = (t: number): number => speedFor(intensity(t));

  return {
    speedAt,
    distanceAt(t) {
      if (t <= 0) return t * speedAt(0);
      const x = t / step;
      const i = Math.floor(x);
      if (i >= n - 1) return dist[n - 1]! + (t - (n - 1) * step) * speedAt(t);
      return dist[i]! + (dist[i + 1]! - dist[i]!) * (x - i);
    },
  };
}

/**
 * The leads objects are drawn with (latency compensation), following the current table at a
 * limited rate. A mid-round input switch (K, step 2 of the demo fallback ladder) changes the
 * table by up to 0.3 s; applied at once, every object on screen would jump by up to 6 m.
 * Rate-limited, they briefly slow down (camera to keyboard) or speed up (back), never reverse.
 */
export interface LeadBlend {
  /** The blended table, updated in place by `step`. */
  readonly get: Leads;
  /** Moves each lead toward `target` by at most LEAD_BLEND_PER_SEC × dt seconds. */
  step(target: LeadTable, dt: number): void;
}

export function createLeadBlend(start: LeadTable): LeadBlend {
  const shown: Record<MoveType, number> = { ...start };
  return {
    get: () => shown,
    step(target, dt) {
      const max = LEAD_BLEND_PER_SEC * Math.max(0, dt);
      for (const m of Object.keys(shown) as MoveType[]) {
        shown[m] += Math.max(-max, Math.min(max, target[m] - shown[m]));
      }
    },
  };
}
