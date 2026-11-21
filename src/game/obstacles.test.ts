import { describe, expect, it } from 'vitest';
import type { ObstacleKind } from '@/contracts';
import * as LK from './look';
import { iconGrow, variantFor, VARIANTS } from './obstacles';
import * as T from './tuning';

describe('move icons', () => {
  it('keep their size up close and grow far away, so they stay readable', () => {
    expect(iconGrow(5)).toBe(1);
    expect(iconGrow(LK.ICON_GROW_FROM)).toBe(1);
    expect(iconGrow(LK.ICON_GROW_FROM * 1.5)).toBeCloseTo(1.5);
    expect(iconGrow(1000)).toBe(LK.ICON_GROW_MAX);
  });

  it('a far icon is at least as large on screen as one at ICON_GROW_FROM, up to the cap', () => {
    const onScreen = (d: number) => (T.ICON_SIZE * iconGrow(d)) / d;
    const near = onScreen(LK.ICON_GROW_FROM);
    for (const d of [20, 25, 30]) expect(onScreen(d)).toBeCloseTo(near);
  });
});

describe('obstacle looks', () => {
  it('are stable per object and use every look', () => {
    const kinds: ObstacleKind[] = ['block', 'hurdle', 'beam', 'crate', 'orb'];
    for (const kind of kinds) {
      const seen = new Set<number>();
      for (let t = 4; t < 60; t += 1.7) {
        const v = variantFor(t, kind);
        expect(v).toBe(variantFor(t, kind));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(VARIANTS);
        seen.add(v);
      }
      expect(seen.size).toBe(VARIANTS);
    }
  });
});

describe('zone colours never reuse a move colour beside the track', () => {
  it('tunnel and bridge scenery, and the finale gates', () => {
    const moves = Object.values(T.MOVE_COLOR) as number[];
    const { tunnel, bridge, finale } = LK.ZONE_LOOK;
    for (const c of [tunnel.accentA, tunnel.accentB, tunnel.arch, bridge.accentA, bridge.accentB])
      expect(moves).not.toContain(c);
    expect(moves).not.toContain(finale.arch);
  });
});
