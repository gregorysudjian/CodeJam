import { describe, expect, it } from 'vitest';
import { planZones, zoneIndexAt, zoneMix, zonePresence, ZONES, type ZoneMix } from './world';
import * as T from './tuning';

const speed = 15;
const plan45 = planZones(45, (t) => t * speed);
const mix = (): ZoneMix => ({ a: 0, b: 0, k: 0 });

describe('world zones', () => {
  it('goes city, tunnel, bridge, then the finale for the last 10 s', () => {
    const at = (t: number) => ZONES[zoneIndexAt(plan45, t * speed)];
    expect(at(-5)).toBe('city');
    expect(at(5)).toBe('city');
    expect(at(18)).toBe('tunnel');
    expect(at(30)).toBe('bridge');
    expect(at(45 - T.FINALE_SEC + 0.1)).toBe('finale');
    expect(at(60)).toBe('finale'); // the coast after the finish
  });

  it('keeps the order for any round length', () => {
    for (const dur of [10, 20, 45, 90, 180]) {
      const s = planZones(dur, (t) => t * speed).starts;
      for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThanOrEqual(s[i - 1]!);
    }
  });

  it('scenery rises out of the ground after a border and is full inside the zone', () => {
    const tunnel = 1;
    const start = plan45.starts[tunnel]!;
    expect(zonePresence(plan45, tunnel, start - 1)).toBe(0);
    expect(zonePresence(plan45, tunnel, start)).toBe(0);
    expect(zonePresence(plan45, tunnel, start + T.ZONE_RISE / 2)).toBeCloseTo(0.5);
    expect(zonePresence(plan45, tunnel, start + T.ZONE_RISE)).toBe(1);
    expect(zonePresence(plan45, 0, -1000)).toBe(1); // the city reaches back behind the start
  });

  it('blends colours smoothly across a border, never jumping', () => {
    const border = plan45.starts[2]!;
    const m = mix();
    zoneMix(plan45, border - T.ZONE_BLEND, m);
    let last = m.a + m.k;
    for (let d = border - T.ZONE_BLEND; d <= border + T.ZONE_BLEND; d += 0.5) {
      zoneMix(plan45, d, m);
      const pos = m.a + m.k; // position along the zone sequence
      expect(pos).toBeGreaterThanOrEqual(last - 1e-9);
      expect(pos - last).toBeLessThan(0.1); // no step larger than a tenth of a zone
      last = pos;
    }
    zoneMix(plan45, border, m);
    expect(m.a + m.k).toBeCloseTo(1.5); // halfway at the border
  });
});
