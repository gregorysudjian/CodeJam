import { describe, expect, it } from 'vitest';
import { bpmFor, layersFor, notesAt, PROGRESSION, type Layers } from './music';
import * as T from './tuning';

const none: Layers = { claps: false, hats16: false, arp: false, stabs: false, fill: false };
const voices = (step: number, layers: Layers) => notesAt(step, layers).map((n) => n.voice);

describe('music plan', () => {
  it('speeds up steadily over the round, and more in the finale', () => {
    const at = (progress: number, finale = false) => bpmFor({ progress, tier: 0, finale });
    expect(at(0)).toBe(T.BPM_START);
    expect(at(1)).toBe(T.BPM_END);
    expect(at(0.5)).toBeGreaterThan(at(0.25));
    expect(at(0.9, true)).toBe(at(0.9) + T.BPM_FINALE_BONUS);
    expect(at(2)).toBe(T.BPM_END); // clamped
  });

  it('adds layers as the streak climbs; the finale has them all', () => {
    expect(layersFor({ progress: 0, tier: 0, finale: false })).toEqual(none);
    expect(layersFor({ progress: 0, tier: 1, finale: false }).claps).toBe(true);
    expect(layersFor({ progress: 0, tier: 1, finale: false }).arp).toBe(false);
    expect(layersFor({ progress: 0, tier: 2, finale: false }).arp).toBe(true);
    expect(layersFor({ progress: 0, tier: 3, finale: false }).stabs).toBe(true);
    expect(layersFor({ progress: 0, tier: 0, finale: true })).toEqual({
      claps: true,
      hats16: true,
      arp: true,
      stabs: true,
      fill: true,
    });
  });

  it('four on the floor with offbeat hats at the base level', () => {
    const kicks: number[] = [];
    const hats: number[] = [];
    for (let s = 0; s < 16; s++) {
      if (voices(s, none).includes('kick')) kicks.push(s);
      if (voices(s, none).includes('hat')) hats.push(s);
    }
    expect(kicks).toEqual([0, 4, 8, 12]);
    expect(hats).toEqual([2, 6, 10, 14]);
    expect(voices(4, none)).not.toContain('clap');
  });

  it('claps on 2 and 4 from tier 1, a snare fill only in the finale phrase end', () => {
    const t1 = layersFor({ progress: 0, tier: 1, finale: false });
    expect(voices(4, t1)).toContain('clap');
    expect(voices(12, t1)).toContain('clap');
    const fin = layersFor({ progress: 0.9, tier: 0, finale: true });
    expect(voices(3 * 16 + 13, fin)).toContain('snare'); // bar 4 of the phrase, last beat
    expect(voices(13, fin)).not.toContain('snare');
  });

  it('the bass follows the chord progression bar by bar', () => {
    for (let bar = 0; bar < 8; bar++) {
      const bass = notesAt(bar * 16, none).find((n) => n.voice === 'bass');
      expect(bass?.semi).toBe(PROGRESSION[bar % 4]);
    }
  });
});
