import { describe, expect, it } from 'vitest';
import type { Spawn, Wave } from '@/contracts';
import { createJudge } from './judge';
import type { Item } from './core';
import { planTrail } from './trail';
import * as T from './tuning';

const items = (waves: Wave[]): Item[] =>
  waves.flatMap((wave) =>
    wave.spawns.map((spawn) => ({ wave, spawn, judge: createJudge(spawn, wave.t, 'floor') })),
  );
const block: Spawn = { kind: 'block', lanes: [0, 1], requires: 'sidestep' };
const orb: Spawn = { kind: 'orb', lanes: [1], requires: 'reachRight' };
const beam: Spawn = { kind: 'beam', lanes: [-1, 0, 1], requires: 'squat', holdSec: 2 };
const at = (t: number) => t * 15;

describe('trail motes', () => {
  it('lead into the free lane of a block, before it', () => {
    const motes = planTrail(items([{ t: 4, intensity: 0, spawns: [block] }]), at);
    expect(motes).toHaveLength(T.TRAIL_MAX);
    for (const m of motes) {
      expect(m.lane).toBe(-1);
      expect(m.move).toBe('sidestep');
      expect(m.d).toBeLessThan(at(4));
    }
  });

  it('lead into an orb lane; a block-and-orb combo gets one trail', () => {
    expect(planTrail(items([{ t: 4, intensity: 0, spawns: [orb] }]), at)[0]!.lane).toBe(1);
    const combo = planTrail(
      items([{ t: 4, intensity: 0, spawns: [block, { ...orb, lanes: [-1] }] }]),
      at,
    );
    expect(combo).toHaveLength(T.TRAIL_MAX);
  });

  it('never overlap the object before, even a long held beam', () => {
    const waves: Wave[] = [
      { t: 4, intensity: 0, spawns: [beam] },
      { t: 6.6, intensity: 0, spawns: [block] }, // 0.6 s after the hold ends: 9 m of gap
    ];
    const motes = planTrail(items(waves), at);
    const beamEnd = at(4 + 2);
    expect(motes.length).toBeGreaterThan(0);
    expect(motes.length).toBeLessThan(T.TRAIL_MAX);
    for (const m of motes) expect(m.d).toBeGreaterThan(beamEnd + 3);
  });

  it('full-width objects get none', () => {
    expect(planTrail(items([{ t: 4, intensity: 0, spawns: [beam] }]), at)).toEqual([]);
  });
});
