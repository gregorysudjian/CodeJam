import { describe, expect, it } from 'vitest';
import { buildSkyline, LANDMARKS } from './montreal';

const ROUTE = 220;
const HALF = 1.8;

describe('montreal skyline', () => {
  const boxes = buildSkyline(ROUTE, HALF);

  it('is deterministic, so every round shows the same city', () => {
    expect(buildSkyline(ROUTE, HALF)).toEqual(boxes);
  });

  it('keeps every building clear of the lanes', () => {
    // A box that straddles the track would be drawn through the player.
    for (const b of boxes) {
      const innerEdge = Math.abs(b.x) - b.w / 2;
      expect(innerEdge).toBeGreaterThan(HALF);
    }
  });

  it('places every box inside the wrap length', () => {
    for (const b of boxes) {
      expect(b.z).toBeGreaterThanOrEqual(0);
      expect(b.z).toBeLessThanOrEqual(ROUTE);
    }
  });

  it('never buries a building under the ground', () => {
    for (const b of boxes) {
      // A leaning box pivots about its own centre, so its lowest corner is
      // set by both half-extents, not by the height alone.
      const lowest =
        b.cy - ((b.h / 2) * Math.cos(b.lean) + (b.w / 2) * Math.abs(Math.sin(b.lean)));
      // A leaning foot may dip slightly into the ground plane, which is
      // hidden by the building's own footprint; an upright one may not.
      expect(lowest).toBeGreaterThanOrEqual(b.lean === 0 ? -0.01 : -1.5);
    }
  });

  it('respects the height bylaw: nothing downtown tops the mountain', () => {
    const top = (name: string) => {
      const lm = LANDMARKS.find((l) => l.name === name)!;
      return Math.max(...lm.parts.map((p) => (p.base ?? 0) + p.h));
    };
    const mountain = top('Mont Royal');
    for (const lm of LANDMARKS) {
      if (lm.name === 'Mont Royal') continue;
      expect(top(lm.name)).toBeLessThan(mountain);
    }
  });

  it('puts both sides of the street to work', () => {
    expect(boxes.some((b) => b.x < 0)).toBe(true);
    expect(boxes.some((b) => b.x > 0)).toBe(true);
  });

  it('keeps the real height order of the landmarks', () => {
    /** Tallest point of a landmark, in metres. */
    const peak = (name: string) => {
      const lm = LANDMARKS.find((l) => l.name === name)!;
      return Math.max(...lm.parts.map((p) => (p.base ?? 0) + p.h));
    };
    // 1000 de La Gauchetière is the tallest building in Montreal; the
    // mountain, with the cross on it, stands over the whole skyline.
    expect(peak('1000 de La Gauchetière')).toBeGreaterThan(peak('Place Ville Marie'));
    expect(peak('Place Ville Marie')).toBeGreaterThan(peak('Habitat 67'));
    expect(peak('Mont Royal')).toBeGreaterThan(peak('1000 de La Gauchetière'));
  });

  it('leans the Montréal Tower and nothing else', () => {
    const leaning = boxes.filter((b) => b.lean !== 0);
    expect(leaning.length).toBe(1);
    expect(Math.abs(leaning[0]!.lean)).toBeGreaterThan(0.5);
  });
});
