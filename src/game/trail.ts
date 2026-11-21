import type { Lane, MoveType } from '@/contracts';
import type { Item } from './core';
import * as T from './tuning';

/**
 * Trail motes: a short line of small lights leading into the lane the next object wants (a
 * block's free lane, an orb's lane). Decoration and a "go here" hint at once: running through
 * them pops them, but they score nothing and are never judged. Pure, so it is unit-tested
 * (trail.test.ts).
 */
export interface Mote {
  d: number; // world distance on the judging clock (drawn ahead by `move`'s lead, like its object)
  lane: Lane;
  move: MoveType; // colour and lead of the object it leads to
}

export function planTrail(items: readonly Item[], distanceAt: (t: number) => number): Mote[] {
  const motes: Mote[] = [];
  let prevEnd = -Infinity; // distance where the previous wave's object ends
  let lastWave: Item['wave'] | null = null;
  for (const item of items) {
    if (item.wave === lastWave) continue; // one trail per wave
    lastWave = item.wave;
    const spawns = item.wave.spawns;
    const block = spawns.find((s) => s.kind === 'block');
    const orb = spawns.find((s) => s.kind === 'orb');
    const at = distanceAt(item.wave.t);
    let lane: Lane | null = null;
    let move: MoveType | null = null;
    if (block) {
      lane = ([-1, 0, 1] as const).find((l) => !block.lanes.includes(l)) ?? null;
      move = block.requires;
    } else if (orb) {
      lane = orb.lanes[0] ?? null;
      move = orb.requires;
    }
    if (lane !== null && move !== null) {
      for (let k = 0; k < T.TRAIL_MAX; k++) {
        const d = at - 2 - k * T.TRAIL_SPACING;
        if (d <= prevEnd + 3) break; // never overlap the object before
        motes.push({ d, lane, move });
      }
    }
    const hold = Math.max(0, ...spawns.map((s) => s.holdSec ?? 0));
    prevEnd = distanceAt(item.wave.t + hold);
  }
  return motes.sort((a, b) => a.d - b.d);
}
